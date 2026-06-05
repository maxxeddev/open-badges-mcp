import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSnapshotPath } from "../../src/config.js";
import { discriminatorFor } from "../../src/generator/credential-synthesizer.js";

function collectByKey(obj: unknown, key: string, acc: Set<string> = new Set()): Set<string> {
  if (obj === null || typeof obj !== "object") return acc;
  if (Array.isArray(obj)) {
    for (const item of obj) collectByKey(item, key, acc);
    return acc;
  }
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k === key && typeof o[k] === "string") acc.add(o[k] as string);
    else collectByKey(o[k], key, acc);
  }
  return acc;
}

function hasDiscriminator(fragment: Record<string, unknown>): boolean {
  return discriminatorFor(fragment) !== undefined;
}

const schemaFiles = ["achievement-credential.schema.json", "endorsement-credential.schema.json"];

describe("Value generator coverage vs OB3 schemas", () => {
  for (const file of schemaFiles) {
    describe(file, () => {
      const path = join(resolveSnapshotPath(), file);
      const schema = JSON.parse(readFileSync(path, "utf-8"));

      it("every distinct pattern resolves to a value generator", () => {
        const patterns = collectByKey(schema, "pattern");
        const unresolved: string[] = [];
        for (const pattern of patterns) {
          const fragment = { type: "string", pattern };
          if (!hasDiscriminator(fragment)) unresolved.push(pattern);
        }
        expect(
          unresolved,
          `Patterns without a value generator:\n  ${unresolved.join("\n  ")}`,
        ).toEqual([]);
      });

      it("every distinct format resolves to a value generator", () => {
        const formats = collectByKey(schema, "format");
        const unresolved: string[] = [];
        for (const format of formats) {
          const fragment = { type: "string", format };
          if (!hasDiscriminator(fragment)) unresolved.push(format);
        }
        expect(unresolved, `Formats without a value generator: ${unresolved.join(", ")}`).toEqual(
          [],
        );
      });
    });
  }
});
