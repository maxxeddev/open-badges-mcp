import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSnapshotPath } from "../config.js";
import type { ContextStore } from "./types.js";

export function loadContext(version?: string): ContextStore {
  const snapshotDir = resolveSnapshotPath(version);
  const raw = JSON.parse(readFileSync(join(snapshotDir, "context.json"), "utf-8"));

  const contextBody = raw["@context"];
  const termToIri = new Map<string, string>();
  const iriToTerm = new Map<string, string>();

  // Walk the context breadth-first. Most OB3 properties are not declared at the
  // top level — they live inside type-scoped `@context` blocks (`achievement`
  // under AchievementSubject, `criteria` under Achievement, and so on). Reading
  // only the top level leaves the majority of the vocabulary unresolvable.
  //
  // Breadth-first ordering makes shallower definitions win, so a top-level term
  // stays canonical and is never shadowed by a same-named scoped term.
  const queue: Record<string, unknown>[] = [contextBody];

  while (queue.length > 0) {
    const body = queue.shift() as Record<string, unknown>;

    for (const [key, value] of Object.entries(body)) {
      if (key.startsWith("@")) continue; // skip @version, @protected, etc.

      const scoped = scopedContextOf(value);
      if (scoped) queue.push(scoped);

      const iri = extractIri(value);
      if (!iri) continue;

      if (!termToIri.has(key)) termToIri.set(key, iri);
      // A term and a class can share an IRI (`criteria` -> #Criteria), so this
      // map is many-to-one. First writer wins, keeping the top-level term as the
      // canonical label for the IRI.
      if (!iriToTerm.has(iri)) iriToTerm.set(iri, key);
    }
  }

  return {
    termToIri,
    iriToTerm,
    rawContext: raw,
    version: version ?? "latest",
  };
}

/** The IRI a context entry points at, whether written as a bare string or an `@id` object. */
function extractIri(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const id = (value as Record<string, unknown>)["@id"];
    if (typeof id === "string") return id;
  }
  return null;
}

/** The type-scoped `@context` block hanging off a context entry, if it has one. */
function scopedContextOf(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  const scoped = (value as Record<string, unknown>)["@context"];
  if (scoped !== null && typeof scoped === "object" && !Array.isArray(scoped)) {
    return scoped as Record<string, unknown>;
  }
  return null;
}
