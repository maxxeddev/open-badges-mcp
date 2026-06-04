import type { CreateAchievementCredentialInputT, Warning } from "./types.js";

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
