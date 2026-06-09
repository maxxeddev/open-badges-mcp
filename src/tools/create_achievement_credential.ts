import { createAchievementCredential } from "../create/achievement.js";
import { CreateAchievementCredentialInput } from "../create/types.js";
import { detectUnrecognizedFields } from "../create/unrecognized.js";

export const name = "create_achievement_credential";
export const description =
  "Build a structurally-correct unsigned OB3 AchievementCredential from substantive content. The agent supplies issuer, achievement, recipient, and optional fields; the tool synthesizes JSON-LD context, type arrays, IDs, and date normalization, then validates the result. Returns the credential, any warnings about recommended-but-omitted fields, and a list of what was synthesized.";

export const inputSchema = CreateAchievementCredentialInput.shape;

export async function handler(input: unknown) {
  // 1. Preserve the raw input BEFORE zod parsing so unrecognized fields are still visible
  const rawInput = input;

  // 2. Parse with zod (strips unknown keys)
  const parsed = CreateAchievementCredentialInput.parse(input);

  // 3. Detect unrecognized fields from the raw input
  const unrecognizedWarnings = detectUnrecognizedFields(rawInput);

  // 4. Build the credential (applyRichTier is invoked internally)
  const result = await createAchievementCredential(parsed);

  // 5. Surface unrecognized-field warnings alongside the builder's existing warnings
  result.warnings.push(...unrecognizedWarnings);

  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
