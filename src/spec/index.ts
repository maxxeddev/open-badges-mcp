import { getDatabase } from "./db.js";
import { buildFts4MatchQuery, buildLikePatterns, rerank, tokenizeAndFilter } from "./fuzzy.js";
import type {
  ConformanceRequirement,
  Example,
  Section,
  SectionSearchResult,
  SectionTocEntry,
} from "./types.js";

const BASE_URLS: Record<string, string> = {
  ob3: "https://www.imsglobal.org/spec/ob/v3p0/",
  vc: "https://www.w3.org/TR/vc-data-model-2.0/",
};

function buildUrl(spec: string, anchor: string): string {
  const base = BASE_URLS[spec] ?? BASE_URLS.ob3;
  return `${base}#${anchor}`;
}

/**
 * Truncate text to at most maxTokens whitespace-delimited tokens.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxTokens) return text;
  return `${words.slice(0, maxTokens).join(" ")}…`;
}

/**
 * Search spec prose using FTS4 MATCH.
 * Results are ordered by FTS4's internal ranking (docid order for relevance).
 */
export async function searchSpec(
  query: string,
  spec?: "ob3" | "vc",
  limit = 10,
): Promise<SectionSearchResult[]> {
  const db = await getDatabase();

  // FTS4 MATCH query — join back to sections for metadata
  const specFilter = spec ? "AND s.spec = ?" : "";
  const sql = `
    SELECT s.spec, s.section_id, s.title, s.anchor, s.body
    FROM sections_fts fts
    JOIN sections s ON s.rowid = fts.rowid
    WHERE sections_fts MATCH ? ${specFilter}
    LIMIT ?
  `;

  const params: Array<string | number> = [query];
  if (spec) params.push(spec);
  params.push(limit);

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: SectionSearchResult[] = [];
  let rank = 1;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      spec: row.spec as string,
      sectionId: row.section_id as string,
      title: row.title as string,
      anchor: row.anchor as string,
      excerpt: truncateToTokens(row.body as string, 300),
      url: buildUrl(row.spec as string, row.anchor as string),
      rank: rank++,
    });
  }
  stmt.free();

  return results;
}

/**
 * Get a single section by spec and section_id.
 * Returns the section with breadcrumbs (parent chain) and optionally children.
 */
export async function getSection(
  spec: string,
  sectionId: string,
  full = false,
): Promise<(Section & { breadcrumbs: string[]; children?: Section[] }) | null> {
  const db = await getDatabase();

  // Fetch the target section
  const stmt = db.prepare("SELECT * FROM sections WHERE spec = ? AND section_id = ?");
  stmt.bind([spec, sectionId]);

  if (!stmt.step()) {
    stmt.free();
    return null;
  }

  const row = stmt.getAsObject();
  stmt.free();

  const section: Section = {
    spec: row.spec as string,
    sectionId: row.section_id as string,
    parentId: (row.parent_id as string) || null,
    title: row.title as string,
    anchor: row.anchor as string,
    body: row.body as string,
    version: row.version as string,
  };

  // Build breadcrumbs by walking parent chain
  const breadcrumbs: string[] = [];
  let currentParentId = section.parentId;
  while (currentParentId) {
    const parentStmt = db.prepare(
      "SELECT title, parent_id FROM sections WHERE spec = ? AND section_id = ?",
    );
    parentStmt.bind([spec, currentParentId]);
    if (parentStmt.step()) {
      const parentRow = parentStmt.getAsObject();
      breadcrumbs.unshift(parentRow.title as string);
      currentParentId = (parentRow.parent_id as string) || null;
    } else {
      currentParentId = null;
    }
    parentStmt.free();
  }

  const result: Section & { breadcrumbs: string[]; children?: Section[] } = {
    ...section,
    breadcrumbs,
  };

  // If full mode, fetch all child sections
  if (full) {
    const children = await getChildSections(db, spec, sectionId);
    result.children = children;
  }

  return result;
}

/**
 * Recursively fetch child sections for a given parent.
 */
async function getChildSections(
  db: Awaited<ReturnType<typeof getDatabase>>,
  spec: string,
  parentId: string,
): Promise<Section[]> {
  const stmt = db.prepare("SELECT * FROM sections WHERE spec = ? AND parent_id = ?");
  stmt.bind([spec, parentId]);

  const children: Section[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    children.push({
      spec: row.spec as string,
      sectionId: row.section_id as string,
      parentId: (row.parent_id as string) || null,
      title: row.title as string,
      anchor: row.anchor as string,
      body: row.body as string,
      version: row.version as string,
    });
  }
  stmt.free();

  return children;
}

/**
 * List all sections for a spec as a nested TOC tree.
 */
export async function listSections(spec: string): Promise<SectionTocEntry[]> {
  const db = await getDatabase();

  const stmt = db.prepare("SELECT section_id, title, parent_id FROM sections WHERE spec = ?");
  stmt.bind([spec]);

  const entries: Array<{
    sectionId: string;
    title: string;
    parentId: string | null;
  }> = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    entries.push({
      sectionId: row.section_id as string,
      title: row.title as string,
      parentId: (row.parent_id as string) || null,
    });
  }
  stmt.free();

  // Build tree from flat list
  const entryMap = new Map<string, SectionTocEntry>();
  for (const entry of entries) {
    entryMap.set(entry.sectionId, {
      sectionId: entry.sectionId,
      title: entry.title,
      children: [],
    });
  }

  const roots: SectionTocEntry[] = [];
  for (const entry of entries) {
    const node = entryMap.get(entry.sectionId)!;
    if (entry.parentId && entryMap.has(entry.parentId)) {
      entryMap.get(entry.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Get examples by class name or topic.
 * First tries exact class match in classes_used, then falls back to FTS.
 */
export async function getExamples(classOrTopic: string, limit = 5): Promise<Example[]> {
  const db = await getDatabase();

  // Check if examples table exists (it may not be created yet — Stage 8)
  const tableCheck = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='examples'",
  );
  if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
    return [];
  }

  // First try: exact class match in classes_used JSON array
  // classes_used is stored as a JSON array string, e.g. '["AchievementCredential","VerifiableCredential"]'
  const classStmt = db.prepare(`SELECT * FROM examples WHERE classes_used LIKE ? LIMIT ?`);
  classStmt.bind([`%"${classOrTopic}"%`, limit]);

  const results: Example[] = [];
  while (classStmt.step()) {
    const row = classStmt.getAsObject();
    results.push({
      spec: row.spec as string,
      exampleId: row.example_id as string,
      sectionId: row.section_id as string,
      title: row.title as string,
      code: row.code as string,
      classesUsed: JSON.parse(row.classes_used as string),
      version: row.version as string,
    });
  }
  classStmt.free();

  if (results.length > 0) return results;

  // Fallback: FTS over example titles (if examples_fts exists) or LIKE search
  const fallbackStmt = db.prepare(
    `SELECT * FROM examples WHERE title LIKE ? OR code LIKE ? LIMIT ?`,
  );
  fallbackStmt.bind([`%${classOrTopic}%`, `%${classOrTopic}%`, limit]);

  while (fallbackStmt.step()) {
    const row = fallbackStmt.getAsObject();
    results.push({
      spec: row.spec as string,
      exampleId: row.example_id as string,
      sectionId: row.section_id as string,
      title: row.title as string,
      code: row.code as string,
      classesUsed: JSON.parse(row.classes_used as string),
      version: row.version as string,
    });
  }
  fallbackStmt.free();

  return results;
}

/**
 * Find conformance requirements by topic, optionally filtered by modal verb.
 * Uses fuzzy matching with FTS4 query expansion and lexical re-ranking.
 * Results are ordered by descending relevance score.
 */
export async function findConformanceRequirements(
  topic: string,
  modal?: "MUST" | "SHOULD" | "MAY",
): Promise<ConformanceRequirement[]> {
  const db = await getDatabase();

  // Check if conformance table exists (it may not be created yet)
  const tableCheck = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='conformance'",
  );
  if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
    return [];
  }

  // Tokenize and filter the topic for fuzzy matching
  const tokens = tokenizeAndFilter(topic);

  // Check if conformance_fts exists
  const ftsCheck = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='conformance_fts'",
  );
  const hasFts = ftsCheck.length > 0 && ftsCheck[0].values.length > 0;

  // Step 1: Fetch candidates using FTS4 MATCH or LIKE fallback
  let candidates: ConformanceRequirement[] = [];

  if (hasFts && tokens.length > 0) {
    const matchQuery = buildFts4MatchQuery(tokens);
    if (matchQuery) {
      // Run the FTS4 OR/prefix MATCH query (no modal filter here — applied orthogonally later)
      const sql = `
        SELECT c.spec, c.section_id, c.anchor, c.sentence, c.modal, c.topic_tags
        FROM conformance_fts fts
        JOIN conformance c ON c.rowid = fts.rowid
        WHERE conformance_fts MATCH ?
      `;
      const stmt = db.prepare(sql);
      stmt.bind([matchQuery]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        candidates.push({
          spec: row.spec as string,
          sectionId: row.section_id as string,
          anchor: row.anchor as string,
          sentence: row.sentence as string,
          modal: row.modal as "MUST" | "SHOULD" | "MAY",
          topicTags: JSON.parse(row.topic_tags as string),
        });
      }
      stmt.free();
    }
  }

  // If FTS4 returned no results (or no FTS table), fall back to per-token LIKE scan
  if (candidates.length === 0 && tokens.length > 0) {
    const likePatterns = buildLikePatterns(tokens);
    // Build a WHERE clause that ORs all LIKE patterns
    const likeClauses = likePatterns.map(() => "sentence LIKE ?").join(" OR ");
    const sql = `
      SELECT spec, section_id, anchor, sentence, modal, topic_tags
      FROM conformance
      WHERE ${likeClauses}
    `;
    const stmt = db.prepare(sql);
    stmt.bind(likePatterns);

    while (stmt.step()) {
      const row = stmt.getAsObject();
      candidates.push({
        spec: row.spec as string,
        sectionId: row.section_id as string,
        anchor: row.anchor as string,
        sentence: row.sentence as string,
        modal: row.modal as "MUST" | "SHOULD" | "MAY",
        topicTags: JSON.parse(row.topic_tags as string),
      });
    }
    stmt.free();
  }

  // If tokens were empty (all stopwords), try raw topic as LIKE fallback
  if (candidates.length === 0 && tokens.length === 0) {
    const sql = `
      SELECT spec, section_id, anchor, sentence, modal, topic_tags
      FROM conformance
      WHERE sentence LIKE ?
    `;
    const stmt = db.prepare(sql);
    stmt.bind([`%${topic}%`]);

    while (stmt.step()) {
      const row = stmt.getAsObject();
      candidates.push({
        spec: row.spec as string,
        sectionId: row.section_id as string,
        anchor: row.anchor as string,
        sentence: row.sentence as string,
        modal: row.modal as "MUST" | "SHOULD" | "MAY",
        topicTags: JSON.parse(row.topic_tags as string),
      });
    }
    stmt.free();
  }

  // Step 2: Apply modal filter orthogonally (post-filter on candidates)
  if (modal) {
    candidates = candidates.filter((c) => c.modal === modal);
  }

  // Step 3: Re-rank candidates by combined similarity and apply similarity floor
  const ranked = rerank(topic, candidates, (c) => c.sentence);

  // Return results ordered by descending relevance score
  return ranked.map((r) => r.item);
}
