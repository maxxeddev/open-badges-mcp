import { z } from "zod";

export const CreateAchievementCredentialInput = z.object({
  issuer: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    url: z.string().url().optional(),
    email: z.string().email().optional(),
    description: z.string().optional(),
    image: z.string().url().optional(),
  }),
  achievement: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    criteria: z.union([z.object({ narrative: z.string().min(1) }), z.object({ id: z.string() })]),
    achievementType: z.string().optional(),
    image: z.string().url().optional(),
    tag: z.array(z.string()).optional(),
  }),
  recipient: z.object({
    id: z.string().optional(),
    identifier: z
      .object({
        identityType: z.string(),
        identityHash: z.string(),
        hashed: z.boolean(),
        salt: z.string().optional(),
      })
      .optional(),
  }),
  awardedDate: z.string().optional(),
  validFrom: z.string().optional(),
  evidence: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        narrative: z.string().optional(),
        genre: z.string().optional(),
      }),
    )
    .optional(),
  image: z
    .union([z.string().url(), z.object({ id: z.string().url(), caption: z.string().optional() })])
    .optional(),
  id: z.string().optional(),
});

export type CreateAchievementCredentialInputT = z.infer<typeof CreateAchievementCredentialInput>;

export type SynthesisRecord = { path: string; reason: string };

export type Warning = { code: string; message: string; param?: string };

export type ValidationError = {
  param: string;
  message: string;
  severity: "error" | "warning";
};

export type CreateAchievementCredentialOutput =
  | {
      ok: true;
      credential: Record<string, unknown>;
      validation: { ok: true; errors: [] };
      warnings: Warning[];
      synthesized: SynthesisRecord[];
      version: string;
      sources: Array<{ url: string; anchor: string }>;
    }
  | {
      ok: false;
      errors: ValidationError[];
      warnings: Warning[];
      synthesized: SynthesisRecord[];
    };
