import * as cheerio from "cheerio";
import { Parser, Store } from "n3";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import initSqlJs from "sql.js";
import { sourcesByKind } from "../src/sources.js";

const SNAPSHOT_DIR = join("data", "snapshots", "3.0.3");
const DB_PATH = join("data", "index.db");

interface Section {
  spec: string;
  sectionId: string;
  parentId: string | null;
  title: string;
  anchor: string;
  body: string;
  version: string;
}

interface Example {
  spec: string;
  exampleId: string;
  sectionId: string;
  title: string;
  code: string;
  classesUsed: string[];
  version: string;
}

interface ConformanceRequirement {
  spec: string;
  sectionId: string;
  anchor: string;
  sentence: string;
  modal: "MUST" | "SHOULD" | "MAY";
  topicTags: string[];
}

/**
 * Load vocab class and property names from vocab.ttl for topic_tags extraction.
 */
function loadVocabTerms(): Set<string> {
  const ttlPath = join(SNAPSHOT_DIR, "vocab.ttl");
  const ttlContent = readFileSync(ttlPath, "utf-8");

  const store = new Store();
  const parser = new Parser();
  store.addQuads(parser.parse(ttlContent));

  const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  const OWL = "http://www.w3.org/2002/07/owl#";
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

  const terms = new Set<string>();

  // Collect class names
  const classQuads = [
    ...store.getQuads(null, `${RDF}type`, `${OWL}Class`, null),
    ...store.getQuads(null, `${RDF}type`, `${RDFS}Class`, null),
  ];
  for (const quad of classQuads) {
    const iri = quad.subject.value;
    const name = iri.includes("#")
      ? iri.slice(iri.lastIndexOf("#") + 1)
      : iri.slice(iri.lastIndexOf("/") + 1);
    if (name) terms.add(name);
  }

  // Collect property names
  const propQuads = [
    ...store.getQuads(null, `${RDF}type`, `${OWL}DatatypeProperty`, null),
    ...store.getQuads(null, `${RDF}type`, `${OWL}ObjectProperty`, null),
    ...store.getQuads(null, `${RDF}type`, `${RDF}Property`, null),
  ];
  for (const quad of propQuads) {
    const iri = quad.subject.value;
    const name = iri.includes("#")
      ? iri.slice(iri.lastIndexOf("#") + 1)
      : iri.slice(iri.lastIndexOf("/") + 1);
    if (name) terms.add(name);
  }

  return terms;
}

/**
 * Regex to match RFC 2119 modal verbs (case-sensitive, uppercase).
 */
const MODAL_REGEX = /\b(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY|REQUIRED|OPTIONAL)\b/;

/**
 * Normalize an RFC 2119 modal verb to one of MUST, SHOULD, or MAY.
 */
function normalizeModal(raw: string): "MUST" | "SHOULD" | "MAY" {
  if (raw === "MUST" || raw === "MUST NOT" || raw === "REQUIRED") return "MUST";
  if (raw === "SHOULD" || raw === "SHOULD NOT") return "SHOULD";
  return "MAY";
}

/**
 * Extract conformance requirements from parsed sections.
 * Splits section bodies into sentences, matches RFC 2119 modal verbs,
 * and tags with vocab terms found in each sentence.
 */
function extractConformanceRequirements(
  sections: Section[],
  vocabTerms: Set<string>,
): ConformanceRequirement[] {
  const requirements: ConformanceRequirement[] = [];

  for (const section of sections) {
    if (!section.body) continue;

    // Split body into sentences (split on period/exclamation/question followed by whitespace or end)
    const sentences = section.body.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      const match = trimmed.match(MODAL_REGEX);
      if (!match) continue;

      const modal = normalizeModal(match[1]);
      const topicTags = Array.from(vocabTerms).filter((term) => trimmed.includes(term));

      requirements.push({
        spec: section.spec,
        sectionId: section.sectionId,
        anchor: section.anchor,
        sentence: trimmed,
        modal,
        topicTags,
      });
    }
  }

  return requirements;
}

/**
 * Parse sections from spec HTML using cheerio.
 * Walks <section> elements and captures IDs, titles, parent relationships, and body text.
 */
function parseSections(html: string, spec: string, version: string): Section[] {
  const $ = cheerio.load(html);
  const sections: Section[] = [];

  $("section[id]").each((_, el) => {
    const $section = $(el);
    const sectionId = $section.attr("id") ?? "";
    if (!sectionId) return;

    // Extract title from first heading child (h1-h6)
    const title = $section
      .find(
        "> div.header-wrapper h1, > div.header-wrapper h2, > div.header-wrapper h3, > div.header-wrapper h4, > div.header-wrapper h5, > div.header-wrapper h6, > h1, > h2, > h3, > h4, > h5, > h6",
      )
      .first()
      .text()
      .replace(/^\d+(\.\d+)*\s*/, "") // Remove section numbers like "1.2.3 "
      .trim();

    // Find parent section
    const parentSection = $section.parent().closest("section[id]");
    const parentId = parentSection.length ? (parentSection.attr("id") ?? null) : null;

    // Get body text excluding child sections
    const $clone = $section.clone();
    $clone.find("section").remove();
    const body = $clone.text().replace(/\s+/g, " ").trim();

    if (body.length > 0 || title.length > 0) {
      sections.push({
        spec,
        sectionId,
        parentId,
        title: title || sectionId,
        anchor: sectionId,
        body,
        version,
      });
    }
  });

  return sections;
}

/**
 * Split a section body into chunks of approximately maxTokens whitespace-delimited tokens.
 * Returns array of chunks.
 */
function chunkBody(body: string, maxTokens = 800): string[] {
  const words = body.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= maxTokens) {
    return [body];
  }

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxTokens) {
    chunks.push(words.slice(i, i + maxTokens).join(" "));
  }
  return chunks;
}

/**
 * Recursively walk an object and collect class names from @type/type fields.
 * Strips IRI prefixes to get local names (e.g., "https://example.org/ns#Achievement" → "Achievement").
 */
function walkForTypes(node: unknown, classes: Set<string>): void {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) {
      walkForTypes(item, classes);
    }
    return;
  }

  const obj = node as Record<string, unknown>;
  const typeVal = obj["@type"] ?? obj.type;
  if (typeVal) {
    const types = Array.isArray(typeVal) ? typeVal : [typeVal];
    for (const t of types) {
      if (typeof t === "string") {
        // Strip IRI prefixes: take everything after the last # or /
        classes.add(t.replace(/.*[#/]/, ""));
      }
    }
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walkForTypes(item, classes);
      }
    } else if (typeof value === "object" && value !== null) {
      walkForTypes(value, classes);
    }
  }
}

/**
 * Extract class names from a parsed JSON-LD document by walking @type/type values recursively.
 */
function extractClassNames(doc: unknown): string[] {
  const classes = new Set<string>();
  walkForTypes(doc, classes);
  return Array.from(classes);
}

/**
 * Extract JSON-LD examples from spec HTML.
 * Walks <pre> and <code> blocks, attempts JSON parse, and detects JSON-LD
 * by presence of @context, @type, or type fields.
 */
function extractExamples(html: string, spec: string, version: string): Example[] {
  const $ = cheerio.load(html);
  const examples: Example[] = [];
  let exampleIdx = 0;

  // Track already-processed text to avoid duplicates (a <code> inside a <pre> would be processed twice)
  const seen = new Set<string>();

  $("pre, code").each((_, el) => {
    const $el = $(el);

    // If this is a <code> inside a <pre>, skip it — we'll get it from the <pre>
    if (el.tagName === "code" && $el.parent().is("pre")) {
      return;
    }

    const text = $el.text().trim();
    if (!text || text.length < 5) return;

    // Avoid duplicates
    if (seen.has(text)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not valid JSON — skip
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

    const obj = parsed as Record<string, unknown>;
    // Detect JSON-LD by presence of @context, @type, or type
    if (!obj["@context"] && !obj["@type"] && !obj.type) return;

    seen.add(text);

    const classesUsed = extractClassNames(parsed);
    const sectionId = $el.closest("section[id]").attr("id") ?? "";

    // Try to find a title from figcaption or .title in the closest figure/div.example container
    let title = "";
    const $container = $el.closest("figure, div.example, .example");
    if ($container.length) {
      title = $container
        .find("figcaption, .example-title, .title")
        .first()
        .text()
        .replace(/^:\s*/, "")
        .trim();
    }
    if (!title) {
      title = `Example ${exampleIdx + 1}`;
    }

    examples.push({
      spec,
      exampleId: `${spec}-ex-${exampleIdx++}`,
      sectionId,
      title,
      code: text,
      classesUsed,
      version,
    });
  });

  return examples;
}

async function main() {
  console.log("Initializing sql.js...");
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create sections table
  db.run(`
    CREATE TABLE sections (
      spec        TEXT NOT NULL,
      section_id  TEXT NOT NULL,
      parent_id   TEXT,
      title       TEXT NOT NULL,
      anchor      TEXT NOT NULL,
      body        TEXT NOT NULL,
      version     TEXT NOT NULL,
      PRIMARY KEY (spec, section_id)
    )
  `);

  // Create FTS virtual table over title and body columns
  // Note: Using fts4 with content= sync since the standard sql.js WASM build
  // includes FTS3/FTS4 but not FTS5. FTS4 supports the same MATCH syntax and
  // ranking via matchinfo()/rank.
  db.run(`
    CREATE VIRTUAL TABLE sections_fts USING fts4(
      title, body,
      content='sections'
    )
  `);

  // Create examples table
  db.run(`
    CREATE TABLE examples (
      spec         TEXT NOT NULL,
      example_id   TEXT NOT NULL,
      section_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      code         TEXT NOT NULL,
      classes_used TEXT NOT NULL,
      version      TEXT NOT NULL,
      PRIMARY KEY (spec, example_id)
    )
  `);

  // Create conformance table
  db.run(`
    CREATE TABLE conformance (
      spec        TEXT NOT NULL,
      section_id  TEXT NOT NULL,
      anchor      TEXT NOT NULL,
      sentence    TEXT NOT NULL,
      modal       TEXT NOT NULL,
      topic_tags  TEXT NOT NULL,
      PRIMARY KEY (spec, section_id, sentence)
    )
  `);

  // Create FTS virtual table for conformance sentence search
  db.run(`
    CREATE VIRTUAL TABLE conformance_fts USING fts4(
      sentence,
      content='conformance'
    )
  `);

  // Process spec files
  const specFiles = sourcesByKind("html-spec").map((s) => ({
    filename: s.dest,
    spec: s.spec,
    version: s.version,
  }));

  // Load vocab terms for topic_tags extraction
  console.log("Loading vocab terms for conformance tagging...");
  const vocabTerms = loadVocabTerms();
  console.log(`  Loaded ${vocabTerms.size} vocab terms`);

  let totalSections = 0;
  let totalRows = 0;
  let totalExamples = 0;
  let totalConformance = 0;

  for (const { filename, spec, version } of specFiles) {
    console.log(`Parsing ${filename}...`);
    const html = readFileSync(join(SNAPSHOT_DIR, filename), "utf-8");
    const sections = parseSections(html, spec, version);
    console.log(`  Found ${sections.length} sections in ${filename}`);
    totalSections += sections.length;

    for (const section of sections) {
      const chunks = chunkBody(section.body);

      if (chunks.length === 1) {
        // Single chunk — use original section_id
        db.run(
          `INSERT OR REPLACE INTO sections (spec, section_id, parent_id, title, anchor, body, version)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            section.spec,
            section.sectionId,
            section.parentId,
            section.title,
            section.anchor,
            section.body,
            section.version,
          ],
        );
        totalRows++;
      } else {
        // Multiple chunks — first chunk keeps the original section_id so
        // child sections can still reference it as parent_id.
        // Additional chunks get a __chunk_N suffix.
        for (let i = 0; i < chunks.length; i++) {
          const chunkId = i === 0 ? section.sectionId : `${section.sectionId}__chunk_${i + 1}`;
          db.run(
            `INSERT OR REPLACE INTO sections (spec, section_id, parent_id, title, anchor, body, version)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              section.spec,
              chunkId,
              section.parentId,
              section.title,
              section.anchor,
              chunks[i],
              section.version,
            ],
          );
          totalRows++;
        }
      }
    }

    // Extract JSON-LD examples
    const examples = extractExamples(html, spec, version);
    console.log(`  Found ${examples.length} JSON-LD examples in ${filename}`);
    totalExamples += examples.length;

    for (const example of examples) {
      db.run(
        `INSERT OR REPLACE INTO examples (spec, example_id, section_id, title, code, classes_used, version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          example.spec,
          example.exampleId,
          example.sectionId,
          example.title,
          example.code,
          JSON.stringify(example.classesUsed),
          example.version,
        ],
      );
    }

    // Pass 3: Extract conformance requirements from section bodies
    const conformanceReqs = extractConformanceRequirements(sections, vocabTerms);
    console.log(`  Found ${conformanceReqs.length} conformance requirements in ${filename}`);
    totalConformance += conformanceReqs.length;

    for (const req of conformanceReqs) {
      db.run(
        `INSERT OR REPLACE INTO conformance (spec, section_id, anchor, sentence, modal, topic_tags)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.spec,
          req.sectionId,
          req.anchor,
          req.sentence,
          req.modal,
          JSON.stringify(req.topicTags),
        ],
      );
    }
  }

  // Populate FTS index
  console.log("Building FTS index...");
  db.run(`
    INSERT INTO sections_fts(rowid, title, body)
    SELECT rowid, title, body FROM sections
  `);

  // Populate conformance FTS index
  console.log("Building conformance FTS index...");
  db.run(`
    INSERT INTO conformance_fts(rowid, sentence)
    SELECT rowid, sentence FROM conformance
  `);

  // Write database to disk
  const data = db.export();
  const buffer = Buffer.from(data);
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, buffer);

  console.log(
    `Done. Wrote ${totalRows} rows (from ${totalSections} sections), ${totalExamples} examples, and ${totalConformance} conformance requirements to ${DB_PATH}`,
  );
  console.log(`Database size: ${(buffer.length / 1024).toFixed(1)} KB`);

  db.close();
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
