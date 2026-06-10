import { deriveTypeArray, normalizeDate } from "./achievement.js";
import type { CreateAchievementCredentialInputT, SynthesisRecord } from "./types.js";

/**
 * Known OB3 type discriminators for rich-tier objects.
 * Mirrors the CLASS_TYPE_VALUES knowledge from the generator's credential-synthesizer,
 * restricted to the classes relevant to rich-tier fields.
 */
const RICH_TIER_TYPE_MAP: Record<string, string | string[]> = {
  Result: ["Result"],
  Alignment: ["Alignment"],
  Related: ["Related"],
  EndorsementCredential: ["VerifiableCredential", "EndorsementCredential"],
};

/**
 * Ensures an agent-supplied object carries the required OB3 `type` discriminator.
 * If the object already has a `type`, it is left untouched (agent stays in control).
 * Otherwise, the correct type is set and a SynthesisRecord is pushed.
 *
 * @param obj The agent-supplied object (mutated only if `type` is missing)
 * @param className The OB3 class name to derive the type for
 * @param path The JSON path for the SynthesisRecord
 * @param synthesized The synthesis records list to push to
 */
function ensureType(
  obj: Record<string, unknown>,
  className: string,
  path: string,
  synthesized: SynthesisRecord[],
): void {
  if (obj.type != null) return;

  // Use the known map first; fall back to deriveTypeArray for extensibility
  const typeValue = RICH_TIER_TYPE_MAP[className] ?? deriveTypeArray(className);
  obj.type = typeValue;
  synthesized.push({
    path: `${path}.type`,
    reason: `Required OB3 type discriminator for ${className}`,
  });
}

/**
 * Applies rich-tier field mapping to an assembled credential.
 *
 * Places:
 * - `result`, `source` → credentialSubject
 * - `alignment`, `related` → achievement object (inside credentialSubject)
 * - `proof`, `credentialStatus`, `endorsement`, `termsOfUse`, `refreshService`,
 *   `credentialSchema`, `validUntil` → top level
 *
 * Synthesizes required OB3 `type` discriminators on objects that lack them.
 * Normalizes `validUntil` to ISO-8601 UTC.
 * Agent-supplied sub-objects are passed through verbatim (only `type` is ever added).
 */
export function applyRichTier(
  credential: Record<string, unknown>,
  input: CreateAchievementCredentialInputT,
  synthesized: SynthesisRecord[],
): void {
  const credentialSubject = credential.credentialSubject as Record<string, unknown>;
  const achievement = credentialSubject.achievement as Record<string, unknown>;

  // --- Subject-level fields ---

  if (input.result && input.result.length > 0) {
    const results = input.result.map((r, i) => {
      ensureType(r, "Result", `credentialSubject.result[${i}]`, synthesized);
      return r;
    });
    credentialSubject.result = results;
  }

  if (input.source) {
    credentialSubject.source = input.source;
  }

  // --- Achievement-level fields ---

  if (input.achievement.alignment && input.achievement.alignment.length > 0) {
    const alignments = input.achievement.alignment.map((a, i) => {
      ensureType(a, "Alignment", `credentialSubject.achievement.alignment[${i}]`, synthesized);
      return a;
    });
    achievement.alignment = alignments;
  }

  if (input.achievement.related && input.achievement.related.length > 0) {
    const related = input.achievement.related.map((r, i) => {
      ensureType(r, "Related", `credentialSubject.achievement.related[${i}]`, synthesized);
      return r;
    });
    achievement.related = related;
  }

  // --- Top-level VC fields (passed through verbatim) ---

  if (input.proof !== undefined) {
    credential.proof = input.proof;
  }

  if (input.credentialStatus !== undefined) {
    credential.credentialStatus = input.credentialStatus;
  }

  if (input.endorsement && input.endorsement.length > 0) {
    const endorsements = input.endorsement.map((e, i) => {
      ensureType(e, "EndorsementCredential", `endorsement[${i}]`, synthesized);
      return e;
    });
    credential.endorsement = endorsements;
  }

  if (input.termsOfUse !== undefined) {
    credential.termsOfUse = input.termsOfUse;
  }

  if (input.refreshService !== undefined) {
    credential.refreshService = input.refreshService;
  }

  if (input.credentialSchema !== undefined) {
    credential.credentialSchema = input.credentialSchema;
  }

  // --- validUntil normalization ---

  if (input.validUntil) {
    const normalized = normalizeDate(input.validUntil);
    credential.validUntil = normalized;
    if (normalized !== input.validUntil) {
      synthesized.push({
        path: "validUntil",
        reason: "Normalized to ISO-8601 UTC",
      });
    }
  }
}
