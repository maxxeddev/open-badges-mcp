import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2019 from "ajv/dist/2019.js";
import addFormats from "ajv-formats";
import { resolveSnapshotPath } from "../config.js";
import type { ValidationError } from "./types.js";

let ajv: Ajv2019 | null = null;

function getAjv(): Ajv2019 {
  if (ajv) return ajv;

  ajv = new Ajv2019({ allErrors: true, verbose: true, strict: false });
  addFormats(ajv);

  const snapshotDir = resolveSnapshotPath();
  const achievementSchema = JSON.parse(
    readFileSync(join(snapshotDir, "achievement-credential.schema.json"), "utf-8"),
  );
  const endorsementSchema = JSON.parse(
    readFileSync(join(snapshotDir, "endorsement-credential.schema.json"), "utf-8"),
  );

  ajv.addSchema(achievementSchema, "AchievementCredential");
  ajv.addSchema(endorsementSchema, "EndorsementCredential");

  return ajv;
}

export function validateSchema(doc: Record<string, unknown>): ValidationError[] {
  const validator = getAjv();

  // Determine schema based on document type field
  const typeField = doc.type;
  const types = Array.isArray(typeField) ? typeField : [typeField];
  const schemaName = types.includes("EndorsementCredential")
    ? "EndorsementCredential"
    : "AchievementCredential";

  const validate = validator.getSchema(schemaName);
  if (!validate) {
    return [{ path: "", message: "Schema not found", severity: "error" }];
  }

  const valid = validate(doc);
  if (valid) return [];

  return (validate.errors ?? []).map((err) => ({
    path: err.instancePath || "/",
    message: err.message ?? "Validation error",
    severity: "error" as const,
  }));
}
