import { randomUUID } from "node:crypto";
import { loadSources, sourcesByKind } from "../sources.js";
import { validateJsonLd } from "../validate/jsonld.js";
import { validateSchema } from "../validate/schema.js";
import { getClassRecord } from "../vocab/index.js";
import { translatePath } from "./path-translation.js";
import type {
  CreateAchievementCredentialInputT,
  CreateAchievementCredentialOutput,
  SynthesisRecord,
  ValidationError,
  Warning,
} from "./types.js";
import { checkWarnings } from "./warnings.js";

/**
 * Derives the type array for a class by walking the vocab subClassOf chain.
 * Returns the chain from most general to most specific.
 */
function deriveTypeArray(className: string): string[] {
  const types: string[] = [];
  const visited = new Set<string>();
  const record = getClassRecord(className);
  if (!record) return [className];

  // Walk upward through subClassOf
  function walk(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const rec = getClassRecord(name);
    if (rec && rec.subClassOf.length > 0) {
      for (const parent of rec.subClassOf) {
        walk(parent);
      }
    }
    types.push(name);
  }

  walk(className);
  return types;
}

/**
 * Normalizes a date string to ISO-8601 with Z suffix.
 * If date-only (YYYY-MM-DD), expands to midnight UTC.
 * If already has timezone info, re-serializes as UTC.
 */
function normalizeDate(input: string): string {
  // Date-only pattern
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return `${input}T00:00:00Z`;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    // Cannot parse — return as-is, validation will catch it
    return input;
  }
  return parsed.toISOString().replace(/\.000Z$/, "Z");
}

/**
 * Builds a structurally-correct unsigned OB3 AchievementCredential
 * from substantive content provided by an AI agent.
 */
export async function createAchievementCredential(
  input: CreateAchievementCredentialInputT,
): Promise<CreateAchievementCredentialOutput> {
  const synthesized: SynthesisRecord[] = [];

  // Get the OB3 context URL from sources
  const contextSource = sourcesByKind("json-ld-context").find((s) => s.spec === "ob3");
  const ob3ContextUrl =
    contextSource?.url ?? "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";

  // 1. @context
  const context = ["https://www.w3.org/ns/credentials/v2", ob3ContextUrl];
  synthesized.push({
    path: "@context",
    reason: "Required JSON-LD context for OB3",
  });

  // 2. type — derive from vocab subClassOf chain
  const typeArray = deriveTypeArray("AchievementCredential");
  synthesized.push({
    path: "type",
    reason: "Derived from vocab subClassOf chain",
  });

  // 3. id at top level
  let credentialId: string;
  if (input.id) {
    credentialId = input.id;
  } else {
    credentialId = `urn:uuid:${randomUUID()}`;
    synthesized.push({
      path: "id",
      reason: "Generated UUID URN because no id was supplied",
    });
  }

  // 4. Build issuer
  let issuerId: string;
  if (input.issuer.id) {
    issuerId = input.issuer.id;
  } else {
    issuerId = `urn:uuid:${randomUUID()}`;
    synthesized.push({
      path: "issuer.id",
      reason:
        "Generated id because none was supplied. Production credentials should use a stable DID or HTTPS URL for the issuer.",
    });
  }

  synthesized.push({
    path: "issuer.type",
    reason: "Required type for Profile",
  });

  const issuer: Record<string, unknown> = {
    id: issuerId,
    type: ["Profile"],
    name: input.issuer.name,
  };
  if (input.issuer.url) issuer.url = input.issuer.url;
  if (input.issuer.email) issuer.email = input.issuer.email;
  if (input.issuer.description) issuer.description = input.issuer.description;
  if (input.issuer.image) {
    issuer.image = { id: input.issuer.image, type: "Image" };
  }

  // 5. Build achievement
  synthesized.push({
    path: "credentialSubject.achievement.type",
    reason: "Required type for nested Achievement",
  });

  const achievement: Record<string, unknown> = {
    id: input.achievement.id ?? `urn:uuid:${randomUUID()}`,
    type: ["Achievement"],
    name: input.achievement.name,
    description: input.achievement.description,
    criteria: input.achievement.criteria,
  };
  if (!input.achievement.id) {
    synthesized.push({
      path: "credentialSubject.achievement.id",
      reason: "Generated UUID URN because no achievement id was supplied",
    });
  }
  if (input.achievement.achievementType) {
    achievement.achievementType = input.achievement.achievementType;
  }
  if (input.achievement.image) {
    achievement.image = { id: input.achievement.image, type: "Image" };
  }
  if (input.achievement.tag) {
    achievement.tag = input.achievement.tag;
  }

  // 6. Build credentialSubject
  synthesized.push({
    path: "credentialSubject.type",
    reason: "Required type for AchievementSubject",
  });

  const credentialSubject: Record<string, unknown> = {
    type: ["AchievementSubject"],
    achievement,
  };
  if (input.recipient.id) {
    credentialSubject.id = input.recipient.id;
  }
  if (input.recipient.identifier) {
    credentialSubject.identifier = {
      type: "IdentityObject",
      ...input.recipient.identifier,
    };
    synthesized.push({
      path: "credentialSubject.identifier.type",
      reason: "Required type for IdentityObject",
    });
  }

  // 7. Build evidence
  let evidence: Record<string, unknown>[] | undefined;
  if (input.evidence && input.evidence.length > 0) {
    evidence = input.evidence.map((e, i) => {
      synthesized.push({
        path: `evidence[${i}].type`,
        reason: "Required type for Evidence",
      });
      const entry: Record<string, unknown> = { type: ["Evidence"] };
      if (e.id) entry.id = e.id;
      if (e.name) entry.name = e.name;
      if (e.description) entry.description = e.description;
      if (e.narrative) entry.narrative = e.narrative;
      if (e.genre) entry.genre = e.genre;
      return entry;
    });
  }

  // 8. Handle dates
  let awardedDate: string | undefined;
  if (input.awardedDate) {
    awardedDate = normalizeDate(input.awardedDate);
    if (awardedDate !== input.awardedDate) {
      synthesized.push({
        path: "awardedDate",
        reason: "Normalized to ISO-8601 UTC",
      });
    }
  }

  let validFrom: string;
  if (input.validFrom) {
    validFrom = normalizeDate(input.validFrom);
    if (validFrom !== input.validFrom) {
      synthesized.push({
        path: "validFrom",
        reason: "Normalized to ISO-8601 UTC",
      });
    }
  } else {
    // validFrom is required by the OB3 schema — synthesize as current time
    validFrom = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    synthesized.push({
      path: "validFrom",
      reason: "Required by OB3 schema; set to current UTC time because none was supplied",
    });
  }

  // 9. Handle image
  let image: Record<string, unknown> | undefined;
  if (input.image) {
    if (typeof input.image === "string") {
      image = { id: input.image, type: "Image" };
      synthesized.push({
        path: "image",
        reason: "Wrapped string URL as Image object per OB3 schema",
      });
    } else {
      image = { id: input.image.id, type: "Image" };
      if (input.image.caption) {
        image.caption = input.image.caption;
      }
      synthesized.push({
        path: "image.type",
        reason: "Required type for Image",
      });
    }
  }

  // Assemble the credential
  const credential: Record<string, unknown> = {
    "@context": context,
    id: credentialId,
    type: typeArray,
    issuer,
    credentialSubject,
  };

  credential.validFrom = validFrom;
  if (awardedDate) credential.awardedDate = awardedDate;
  if (evidence) credential.evidence = evidence;
  if (image) credential.image = image;

  // Run warnings on the input
  const warnings: Warning[] = checkWarnings(input);

  // Validate the assembled credential
  const schemaErrors = validateSchema(credential);
  const { errors: jsonldErrors } = await validateJsonLd(credential);

  const allErrors = [...schemaErrors, ...jsonldErrors];
  const translatedErrors: ValidationError[] = allErrors.map((e) => ({
    param: translatePath(e.path),
    message: e.message,
    severity: e.severity,
  }));

  const hasHardErrors = translatedErrors.some((e) => e.severity === "error");

  if (hasHardErrors) {
    return {
      ok: false,
      errors: translatedErrors,
      warnings,
      synthesized,
    };
  }

  // Get version from sources
  const sources = loadSources();
  const version =
    sources.sources.find((s) => s.spec === "ob3" && s.kind === "vocab-ttl")?.version ?? "3.0.3";

  return {
    ok: true,
    credential,
    validation: { ok: true, errors: [] },
    warnings,
    synthesized,
    version,
    sources: [
      {
        url: "https://www.imsglobal.org/spec/ob/v3p0/",
        anchor: "AchievementCredential",
      },
    ],
  };
}
