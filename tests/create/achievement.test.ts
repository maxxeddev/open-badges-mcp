import { describe, expect, it } from "vitest";
import { createAchievementCredential } from "../../src/create/achievement.js";
import { CreateAchievementCredentialInput } from "../../src/create/types.js";
import { validateJsonLd } from "../../src/validate/jsonld.js";
import { validateSchema } from "../../src/validate/schema.js";

const MINIMAL_INPUT = {
  issuer: {
    name: "Example University",
  },
  achievement: {
    name: "Introduction to Computer Science",
    description: "Awarded for successful completion of the introductory CS course.",
    criteria: {
      narrative: "Complete all assignments and pass the final exam with 70% or higher.",
    },
  },
  recipient: {},
};

const FULL_INPUT = {
  id: "https://example.org/credentials/42",
  issuer: {
    id: "https://example.org/issuers/1",
    name: "Example University",
    url: "https://example.org",
    email: "badges@example.org",
    description: "A prestigious institution",
    image: "https://example.org/logo.png",
  },
  achievement: {
    id: "https://example.org/achievements/cs101",
    name: "Introduction to Computer Science",
    description: "Awarded for successful completion of the introductory CS course.",
    criteria: {
      narrative: "Complete all assignments and pass the final exam with 70% or higher.",
    },
    achievementType: "Course",
    image: "https://example.org/badges/cs101.png",
    tag: ["computer-science", "introductory"],
  },
  recipient: {
    id: "did:example:student123",
    identifier: {
      identityType: "emailAddress",
      identityHash: "sha256$abc123",
      hashed: true,
      salt: "deadsea",
    },
  },
  awardedDate: "2025-03-15",
  validFrom: "2025-03-15T10:30:00+02:00",
  evidence: [
    {
      id: "https://example.org/evidence/1",
      name: "Final Project",
      description: "Student's final project submission",
      narrative: "Built a web application demonstrating key CS concepts.",
      genre: "Portfolio",
    },
  ],
  image: {
    id: "https://example.org/badges/cs101-badge.png",
    caption: "CS101 Badge",
  },
};

describe("createAchievementCredential", () => {
  it("returns ok: true with minimal valid input", async () => {
    const result = await createAchievementCredential(MINIMAL_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.credential["@context"]).toBeInstanceOf(Array);
    expect(result.credential.type).toContain("VerifiableCredential");
    expect(result.credential.type).toContain("AchievementCredential");
    expect(result.credential.id).toMatch(/^urn:uuid:/);
    expect(result.validation.ok).toBe(true);
    expect(result.synthesized.length).toBeGreaterThan(0);
  });

  it("returns ok: true with all optional fields populated", async () => {
    const result = await createAchievementCredential(FULL_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.credential.id).toBe("https://example.org/credentials/42");
    const issuer = result.credential.issuer as Record<string, unknown>;
    expect(issuer.id).toBe("https://example.org/issuers/1");
    expect(issuer.name).toBe("Example University");
    expect(result.credential.evidence).toBeInstanceOf(Array);
  });

  it("synthesizes urn:uuid for issuer.id when omitted", async () => {
    const result = await createAchievementCredential(MINIMAL_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const issuer = result.credential.issuer as Record<string, unknown>;
    expect(issuer.id).toMatch(/^urn:uuid:/);

    const synthRecord = result.synthesized.find((s) => s.path === "issuer.id");
    expect(synthRecord).toBeDefined();
    expect(synthRecord?.reason).toContain("Generated id");
  });

  it("derives type array from vocab subClassOf chain", async () => {
    const result = await createAchievementCredential(MINIMAL_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const types = result.credential.type as string[];
    expect(types).toContain("VerifiableCredential");
    expect(types).toContain("AchievementCredential");
    // AchievementCredential should come after VerifiableCredential
    expect(types.indexOf("VerifiableCredential")).toBeLessThan(
      types.indexOf("AchievementCredential"),
    );
  });

  it("wraps image string as Image object", async () => {
    const input = {
      ...MINIMAL_INPUT,
      image: "https://example.org/badge.png",
    };
    const result = await createAchievementCredential(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const image = result.credential.image as Record<string, unknown>;
    expect(image.id).toBe("https://example.org/badge.png");
    expect(image.type).toBe("Image");

    const synthRecord = result.synthesized.find((s) => s.path === "image");
    expect(synthRecord).toBeDefined();
    expect(synthRecord?.reason).toContain("Wrapped string URL");
  });

  it("normalizes date-only awardedDate to ISO-8601 UTC", async () => {
    const input = {
      ...MINIMAL_INPUT,
      awardedDate: "2025-03-15",
    };
    const result = await createAchievementCredential(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.credential.awardedDate).toBe("2025-03-15T00:00:00Z");
  });

  it("injects type: Evidence on each evidence entry", async () => {
    const input = {
      ...MINIMAL_INPUT,
      evidence: [{ name: "My Work", narrative: "I did the thing and it was great." }],
    };
    const result = await createAchievementCredential(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const evidence = result.credential.evidence as Record<string, unknown>[];
    expect(evidence[0].type).toEqual(["Evidence"]);
  });

  it("round-trip: credential passes validateSchema and validateJsonLd", async () => {
    const result = await createAchievementCredential(FULL_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const schemaErrors = validateSchema(result.credential as Record<string, unknown>);
    const hardSchemaErrors = schemaErrors.filter((e) => e.severity === "error");
    expect(hardSchemaErrors).toEqual([]);

    const { errors: jsonldErrors } = await validateJsonLd(
      result.credential as Record<string, unknown>,
    );
    const hardJsonldErrors = jsonldErrors.filter((e) => e.severity === "error");
    expect(hardJsonldErrors).toEqual([]);
  });

  it("rejects input missing required fields via zod parse", () => {
    const invalidInput = {
      issuer: { name: "Test" },
      achievement: {
        // missing name and description
        criteria: { narrative: "something" },
      },
      recipient: {},
    };

    expect(() => CreateAchievementCredentialInput.parse(invalidInput)).toThrow();
  });
});
