import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getBaseDataDir } from "./config.js";

export const SourceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["vocab-ttl", "json-ld-context", "html-spec", "json-schema"]),
  spec: z.string().min(1),
  version: z.string().min(1),
  parser: z.string().optional(),
  url: z.string().url(),
  dest: z.string().min(1),
});

export const SourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.array(SourceSchema).min(1),
});

export type Source = z.infer<typeof SourceSchema>;
export type SourcesFile = z.infer<typeof SourcesFileSchema>;

let cached: SourcesFile | null = null;

export function loadSources(): SourcesFile {
  if (cached) return cached;
  const path = join(getBaseDataDir(), "sources.json");
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  cached = SourcesFileSchema.parse(raw);
  return cached;
}

export function sourcesByKind(kind: Source["kind"]): Source[] {
  return loadSources().sources.filter((s) => s.kind === kind);
}
