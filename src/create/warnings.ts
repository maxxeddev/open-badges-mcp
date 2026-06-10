import type { CreateAchievementCredentialInputT, Warning } from "./types.js";
import { WARNING_VALID_UNTIL_BEFORE_VALID_FROM } from "./types.js";

/**
 * Normalizes a date string to ISO-8601 with Z suffix for comparison purposes.
 * Duplicated from achievement.ts to avoid circular imports.
 */
function normalizeDateForComparison(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return `${input}T00:00:00Z`;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return input;
  }
  return parsed.toISOString().replace(/\.000Z$/, "Z");
}

/**
 * Runs heuristic checks on the input and produces warnings for
 * recommended-but-omitted fields or suspicious values.
 */
export function checkWarnings(input: CreateAchievementCredentialInputT): Warning[] {
  const warnings: Warning[] = [];

  // evidence_omitted
  if (!input.evidence || input.evidence.length === 0) {
    warnings.push({
      code: "evidence_omitted",
      message:
        "AchievementCredentials commonly include evidence linking to the learner's work. Consider supplying `evidence[]`.",
      param: "evidence",
    });
  }

  // issuer_id_format
  if (input.issuer.id) {
    const id = input.issuer.id;
    const isUrl = id.startsWith("http://") || id.startsWith("https://");
    const isDid = /^did:[a-z0-9]+:.+/.test(id);
    if (!isUrl && !isDid) {
      warnings.push({
        code: "issuer_id_format",
        message: `issuer.id \`${id}\` doesn't look like an HTTPS URL or a DID. Wallets and verifiers may reject this credential.`,
        param: "issuer.id",
      });
    }
  }

  // awarded_date_future
  if (input.awardedDate) {
    const parsed = Date.parse(input.awardedDate);
    if (!Number.isNaN(parsed) && parsed > Date.now()) {
      warnings.push({
        code: "awarded_date_future",
        message: `awardedDate \`${input.awardedDate}\` is in the future. Was this intentional?`,
        param: "awardedDate",
      });
    }
  }

  // image_no_caption
  if (input.image && typeof input.image === "object" && !input.image.caption) {
    warnings.push({
      code: "image_no_caption",
      message: "Image has no caption. Captions improve accessibility.",
      param: "image",
    });
  }

  // recipient_unidentifiable
  if (!input.recipient.id && !input.recipient.identifier) {
    warnings.push({
      code: "recipient_unidentifiable",
      message:
        "Recipient has neither `id` nor `identifier`. The credential will be unable to be verified against any subject.",
      param: "recipient",
    });
  }

  // criteria_narrative_short
  if ("narrative" in input.achievement.criteria) {
    const narrative = (input.achievement.criteria as { narrative: string }).narrative;
    if (narrative.length < 20) {
      warnings.push({
        code: "criteria_narrative_short",
        message: "Criteria narrative is very short. Consider expanding for clarity.",
        param: "achievement.criteria.narrative",
      });
    }
  }

  return warnings;
}

/**
 * Checks whether the normalized `validUntil` is earlier than the normalized `validFrom`.
 * Returns a warning array (empty if no issue, or a single warning if validUntil precedes validFrom).
 *
 * This function is designed to be called from the builder's assembly flow after dates
 * have been resolved (validFrom may be synthesized if not supplied).
 */
export function checkValidUntilCoherency(
  validUntil: string | undefined,
  validFrom: string | undefined,
): Warning[] {
  if (!validUntil || !validFrom) {
    return [];
  }

  const normalizedUntil = normalizeDateForComparison(validUntil);
  const normalizedFrom = normalizeDateForComparison(validFrom);

  const untilMs = Date.parse(normalizedUntil);
  const fromMs = Date.parse(normalizedFrom);

  // If either date is unparseable, skip the check — schema validation will catch it
  if (Number.isNaN(untilMs) || Number.isNaN(fromMs)) {
    return [];
  }

  if (untilMs < fromMs) {
    return [
      {
        code: WARNING_VALID_UNTIL_BEFORE_VALID_FROM,
        message: `validUntil \`${validUntil}\` is earlier than validFrom \`${validFrom}\`. The credential would be expired before it starts.`,
        param: "validUntil",
      },
    ];
  }

  return [];
}
