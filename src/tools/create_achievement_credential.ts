import { createAchievementCredential } from "../create/achievement.js";
import { CreateAchievementCredentialInput } from "../create/types.js";

export const name = "create_achievement_credential";
export const description =
  "Build a structurally-correct unsigned OB3 AchievementCredential from substantive content. The agent supplies issuer, achievement, recipient, and optional fields; the tool synthesizes JSON-LD context, type arrays, IDs, and date normalization, then validates the result. Returns the credential, any warnings about recommended-but-omitted fields, and a list of what was synthesized.";

export const inputSchema = CreateAchievementCredentialInput.shape;

export async function handler(input: unknown) {
  const parsed = CreateAchievementCredentialInput.parse(input);
  const result = await createAchievementCredential(parsed);
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
