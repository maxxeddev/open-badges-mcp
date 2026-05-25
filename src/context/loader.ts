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

  for (const [key, value] of Object.entries(contextBody)) {
    if (key.startsWith("@")) continue; // skip @version, @protected, etc.
    const iri =
      typeof value === "string" ? value : ((value as Record<string, string>)["@id"] ?? null);
    if (!iri) continue;
    termToIri.set(key, iri);
    iriToTerm.set(iri, key);
  }

  return {
    termToIri,
    iriToTerm,
    rawContext: raw,
    version: version ?? "latest",
  };
}
