import { describe, expect, it } from "vitest";
import type { CreateAchievementCredentialInputT } from "../../src/create/types.js";
import { checkWarnings } from "../../src/create/warnings.js";

const HAPPY_INPUT: CreateAchievementCredentialInputT = {
  issuer: {
    id: "https://example.org/issuers/1",
    name: "Example University",
  },
  achievement: {
    name: "CS101",
    description: "Completed the course successfully.",
    criteria: {
      narrative: "Complete all assignments and pass the final exam with at least 70%.",
    },
  },
  recipient: {
    id: "did:example:student123",
  },
  evidence: [
    {
      name: "Final Project",
      narrative: "Built a web application demonstrating key CS concepts.",
    },
  ],
};

describe("checkWarnings", () => {
  it("returns no warnings on a fully-populated happy path", () => {
    const warnings = checkWarnings(HAPPY_INPUT);
    expect(warnings).toEqual([]);
  });

  it("fires evidence_omitted when evidence is missing", () => {
    const input = { ...HAPPY_INPUT, evidence: undefined };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "evidence_omitted");
    expect(found).toBeDefined();
    expect(found?.param).toBe("evidence");
  });

  it("fires evidence_omitted when evidence is empty array", () => {
    const input = { ...HAPPY_INPUT, evidence: [] };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "evidence_omitted");
    expect(found).toBeDefined();
  });

  it("fires issuer_id_format for non-URL non-DID issuer.id", () => {
    const input = {
      ...HAPPY_INPUT,
      issuer: { ...HAPPY_INPUT.issuer, id: "not-a-url-or-did" },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "issuer_id_format");
    expect(found).toBeDefined();
    expect(found?.param).toBe("issuer.id");
    expect(found?.message).toContain("not-a-url-or-did");
  });

  it("does not fire issuer_id_format for https URL", () => {
    const input = {
      ...HAPPY_INPUT,
      issuer: { ...HAPPY_INPUT.issuer, id: "https://example.org/issuer" },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "issuer_id_format");
    expect(found).toBeUndefined();
  });

  it("does not fire issuer_id_format for DID", () => {
    const input = {
      ...HAPPY_INPUT,
      issuer: { ...HAPPY_INPUT.issuer, id: "did:web:example.org" },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "issuer_id_format");
    expect(found).toBeUndefined();
  });

  it("fires awarded_date_future when date is in the future", () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const input = { ...HAPPY_INPUT, awardedDate: futureDate };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "awarded_date_future");
    expect(found).toBeDefined();
    expect(found?.param).toBe("awardedDate");
  });

  it("does not fire awarded_date_future for a past date", () => {
    const input = { ...HAPPY_INPUT, awardedDate: "2020-01-01T00:00:00Z" };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "awarded_date_future");
    expect(found).toBeUndefined();
  });

  it("fires image_no_caption when image object lacks caption", () => {
    const input = {
      ...HAPPY_INPUT,
      image: { id: "https://example.org/img.png" },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "image_no_caption");
    expect(found).toBeDefined();
    expect(found?.param).toBe("image");
  });

  it("does not fire image_no_caption when image is a string", () => {
    const input = { ...HAPPY_INPUT, image: "https://example.org/img.png" };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "image_no_caption");
    expect(found).toBeUndefined();
  });

  it("fires recipient_unidentifiable when no id or identifier", () => {
    const input = { ...HAPPY_INPUT, recipient: {} };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "recipient_unidentifiable");
    expect(found).toBeDefined();
    expect(found?.param).toBe("recipient");
  });

  it("does not fire recipient_unidentifiable when id is present", () => {
    const input = {
      ...HAPPY_INPUT,
      recipient: { id: "did:example:student123" },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "recipient_unidentifiable");
    expect(found).toBeUndefined();
  });

  it("fires criteria_narrative_short for short narrative", () => {
    const input = {
      ...HAPPY_INPUT,
      achievement: {
        ...HAPPY_INPUT.achievement,
        criteria: { narrative: "Short" },
      },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "criteria_narrative_short");
    expect(found).toBeDefined();
    expect(found?.param).toBe("achievement.criteria.narrative");
  });

  it("does not fire criteria_narrative_short for long narrative", () => {
    const input = {
      ...HAPPY_INPUT,
      achievement: {
        ...HAPPY_INPUT.achievement,
        criteria: {
          narrative: "This is a sufficiently long criteria narrative.",
        },
      },
    };
    const warnings = checkWarnings(input);

    const found = warnings.find((w) => w.code === "criteria_narrative_short");
    expect(found).toBeUndefined();
  });

  it("multiple warnings stack correctly", () => {
    const input: CreateAchievementCredentialInputT = {
      issuer: {
        id: "bad-id",
        name: "Test",
      },
      achievement: {
        name: "Test",
        description: "A test achievement for unit tests.",
        criteria: { narrative: "Short" },
      },
      recipient: {},
    };
    const warnings = checkWarnings(input);

    const codes = warnings.map((w) => w.code);
    expect(codes).toContain("evidence_omitted");
    expect(codes).toContain("issuer_id_format");
    expect(codes).toContain("recipient_unidentifiable");
    expect(codes).toContain("criteria_narrative_short");
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });
});
