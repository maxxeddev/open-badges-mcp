import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as cheerio from "cheerio";
import { Parser, Store } from "n3";
import initSqlJs from "sql.js";
import { CredentialGraphGenerator } from "./generator/index.js";

const VERSION = "3.0.3";

const SOURCES = [
  {
    url: "https://purl.imsglobal.org/spec/vc/ob/vocab.ttl",
    filename: "vocab.ttl",
  },
  {
    url: "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    filename: "context.json",
  },
  {
    url: "https://www.imsglobal.org/spec/ob/v3p0/",
    filename: "ob3-spec.html",
  },
  {
    url: "https://www.w3.org/TR/vc-data-model-2.0/",
    filename: "vc-spec.html",
  },
  {
    url: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
    filename: "achievement-credential.schema.json",
  },
  {
    url: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_endorsementcredential_schema.json",
    filename: "endorsement-credential.schema.json",
  },
];

// ─── Arg Parsing ────────────────────────────────────────────────────────────

export function resolveDataDir(override?: string): string {
  if (override) return override;
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "mcp-ob-ts", "data");
  return join(homedir(), ".mcp-ob-ts", "data");
}

export type GenerateCLIArgs = {
  subcommand: "generate-credential";
  maxDepth?: number;
  mode?: "minimal" | "full";
  seed?: number;
  includeMermaid: boolean;
  outputFile?: string;
  rootClass?: string;
};

export type ParsedArgs =
  | { subcommand: undefined; init: boolean; dataDir?: string }
  | ({ subcommand: "generate-credential" } & GenerateCLIArgs & { init: boolean; dataDir?: string });

function parseArgs(argv: string[]): ParsedArgs {
  const init = argv.includes("--init");
  const dataDirIdx = argv.indexOf("--data-dir");
  const dataDir = dataDirIdx !== -1 ? argv[dataDirIdx + 1] : undefined;

  if (argv[0] === "generate-credential") {
    const maxDepthIdx = argv.indexOf("--max-depth");
    const maxDepthRaw = maxDepthIdx !== -1 ? argv[maxDepthIdx + 1] : undefined;
    const maxDepth = maxDepthRaw !== undefined ? Number.parseInt(maxDepthRaw, 10) : undefined;

    const modeIdx = argv.indexOf("--mode");
    const modeRaw = modeIdx !== -1 ? argv[modeIdx + 1] : undefined;
    const mode: "minimal" | "full" | undefined =
      modeRaw === "minimal" || modeRaw === "full" ? modeRaw : undefined;

    const seedIdx = argv.indexOf("--seed");
    const seedRaw = seedIdx !== -1 ? argv[seedIdx + 1] : undefined;
    const seed = seedRaw !== undefined ? Number.parseInt(seedRaw, 10) : undefined;

    const includeMermaid = argv.includes("--include-mermaid");

    const outputFileIdx = argv.indexOf("--output-file");
    const outputFile = outputFileIdx !== -1 ? argv[outputFileIdx + 1] : undefined;

    const rootClassIdx = argv.indexOf("--root-class");
    const rootClass = rootClassIdx !== -1 ? argv[rootClassIdx + 1] : undefined;

    return {
      subcommand: "generate-credential",
      maxDepth,
      mode,
      seed,
      includeMermaid,
      outputFile,
      rootClass,
      init,
      dataDir,
    };
  }

  return { subcommand: undefined, init, dataDir };
}

// ─── Download ───────────────────────────────────────────────────────────────

async function downloadData(dataDir: string): Promise<void> {
  const snapshotDir = join(dataDir, "snapshots", VERSION);
  mkdirSync(snapshotDir, { recursive: true });

  for (const source of SOURCES) {
    console.error(`[mcp-ob-ts] Downloading ${source.filename}...`);
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.url}: HTTP ${response.status}`);
    }
    const content = await response.text();
    writeFileSync(join(snapshotDir, source.filename), content, "utf-8");
  }

  const manifest = {
    version: VERSION,
    fetchDate: new Date().toISOString(),
    sources: SOURCES.map((s) => ({ url: s.url, filename: s.filename })),
  };
  writeFileSync(join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.error("[mcp-ob-ts] Download complete.");
}

// ─── Ingestion ──────────────────────────────────────────────────────────────

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

function loadVocabTerms(snapshotDir: string): Set<string> {
  const ttlPath = join(snapshotDir, "vocab.ttl");
  const ttlContent = readFileSync(ttlPath, "utf-8");

  const store = new Store();
  const parser = new Parser();
  store.addQuads(parser.parse(ttlContent));

  const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  const OWL = "http://www.w3.org/2002/07/owl#";
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

  const terms = new Set<string>();

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

const MODAL_REGEX = /\b(MUST NOT|MUST|SHOULD NOT|SHOULD|MAY|REQUIRED|OPTIONAL)\b/;

function normalizeModal(raw: string): "MUST" | "SHOULD" | "MAY" {
  if (raw === "MUST" || raw === "MUST NOT" || raw === "REQUIRED") return "MUST";
  if (raw === "SHOULD" || raw === "SHOULD NOT") return "SHOULD";
  return "MAY";
}

function extractConformanceRequirements(
  sections: Section[],
  vocabTerms: Set<string>,
): ConformanceRequirement[] {
  const requirements: ConformanceRequirement[] = [];

  for (const section of sections) {
    if (!section.body) continue;
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

function parseSections(html: string, spec: string, version: string): Section[] {
  const $ = cheerio.load(html);
  const sections: Section[] = [];

  $("section[id]").each((_, el) => {
    const $section = $(el);
    const sectionId = $section.attr("id") ?? "";
    if (!sectionId) return;

    const title = $section
      .find(
        "> div.header-wrapper h1, > div.header-wrapper h2, > div.header-wrapper h3, > div.header-wrapper h4, > div.header-wrapper h5, > div.header-wrapper h6, > h1, > h2, > h3, > h4, > h5, > h6",
      )
      .first()
      .text()
      .replace(/^\d+(\.\d+)*\s*/, "")
      .trim();

    const parentSection = $section.parent().closest("section[id]");
    const parentId = parentSection.length ? (parentSection.attr("id") ?? null) : null;

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

function extractClassNames(doc: unknown): string[] {
  const classes = new Set<string>();
  walkForTypes(doc, classes);
  return Array.from(classes);
}

function extractExamples(html: string, spec: string, version: string): Example[] {
  const $ = cheerio.load(html);
  const examples: Example[] = [];
  let exampleIdx = 0;
  const seen = new Set<string>();

  $("pre, code").each((_, el) => {
    const $el = $(el);
    if (el.tagName === "code" && $el.parent().is("pre")) {
      return;
    }

    const text = $el.text().trim();
    if (!text || text.length < 5) return;
    if (seen.has(text)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

    const obj = parsed as Record<string, unknown>;
    if (!obj["@context"] && !obj["@type"] && !obj.type) return;

    seen.add(text);

    const classesUsed = extractClassNames(parsed);
    const sectionId = $el.closest("section[id]").attr("id") ?? "";

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

async function ingestData(dataDir: string): Promise<void> {
  console.error("[mcp-ob-ts] Ingesting spec data...");

  const snapshotDir = join(dataDir, "snapshots", VERSION);
  const dbPath = join(dataDir, "index.db");

  const SQL = await initSqlJs();
  const db = new SQL.Database();

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

  db.run(`
    CREATE VIRTUAL TABLE sections_fts USING fts4(
      title, body,
      content='sections'
    )
  `);

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

  db.run(`
    CREATE VIRTUAL TABLE conformance_fts USING fts4(
      sentence,
      content='conformance'
    )
  `);

  const specFiles: Array<{ filename: string; spec: string }> = [
    { filename: "ob3-spec.html", spec: "ob3" },
    { filename: "vc-spec.html", spec: "vc" },
  ];

  console.error("[mcp-ob-ts] Loading vocab terms...");
  const vocabTerms = loadVocabTerms(snapshotDir);

  for (const { filename, spec } of specFiles) {
    console.error(`[mcp-ob-ts] Parsing ${filename}...`);
    const html = readFileSync(join(snapshotDir, filename), "utf-8");
    const sections = parseSections(html, spec, VERSION);

    for (const section of sections) {
      const chunks = chunkBody(section.body);

      if (chunks.length === 1) {
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
      } else {
        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `${section.sectionId}__chunk_${i + 1}`;
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
        }
      }
    }

    const examples = extractExamples(html, spec, VERSION);
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

    const conformanceReqs = extractConformanceRequirements(sections, vocabTerms);
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

  db.run(`
    INSERT INTO sections_fts(rowid, title, body)
    SELECT rowid, title, body FROM sections
  `);

  db.run(`
    INSERT INTO conformance_fts(rowid, sentence)
    SELECT rowid, sentence FROM conformance
  `);

  const data = db.export();
  const buffer = Buffer.from(data);
  mkdirSync(dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, buffer);
  db.close();

  console.error("[mcp-ob-ts] Ingestion complete.");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = resolveDataDir(args.dataDir);

  // ─── generate-credential subcommand (Req 11.8, 11.9) ─────────────────────
  if (args.subcommand === "generate-credential") {
    // Validate --max-depth: must be a valid integer when supplied
    if (args.maxDepth !== undefined && Number.isNaN(args.maxDepth)) {
      process.stderr.write("Error: --max-depth must be a valid integer in the range 0–10\n");
      process.exit(1);
    }

    const generator = new CredentialGraphGenerator();
    let result: Awaited<ReturnType<typeof generator.generate>>;
    try {
      result = await generator.generate({
        maxDepth: args.maxDepth,
        mode: args.mode,
        seed: args.seed,
        includeMermaid: args.includeMermaid,
        rootClass: args.rootClass,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    }

    // Check for GeneratorError (ok: false)
    if ("ok" in result && result.ok === false) {
      process.stderr.write(`Error: ${result.error}\n`);
      process.exit(1);
    }

    // Success — write JSON output
    const json = JSON.stringify(result, null, 2);

    if (args.outputFile) {
      try {
        mkdirSync(dirname(args.outputFile), { recursive: true });
        writeFileSync(args.outputFile, json, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: failed to write output file: ${message}\n`);
        process.exit(1);
      }
    } else {
      process.stdout.write(`${json}\n`);
    }

    process.exit(0);
  }
  // ──────────────────────────────────────────────────────────────────────────

  const needsInit = args.init || !existsSync(join(dataDir, "index.db"));

  if (needsInit) {
    console.error("[mcp-ob-ts] Initializing data (first run)...");
    try {
      await downloadData(dataDir);
      await ingestData(dataDir);
      console.error("[mcp-ob-ts] Initialization complete.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      console.error(`[mcp-ob-ts] Init failed: ${message}`);
      process.exit(1);
    }
  }

  // Set data dir for config resolution, then start server
  process.env.MCP_OB_DATA_DIR = dataDir;
  await import("./server.js");
}

main();
