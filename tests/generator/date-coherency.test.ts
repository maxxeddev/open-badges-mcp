/**
 * Unit tests for the date coherency post-processor.
 */

import { describe, expect, it } from "vitest";
import { enforceDateCoherency } from "../../src/generator/date-coherency.js";

describe("enforceDateCoherency", () => {
  it("swaps validFrom and awardedDate when validFrom > awardedDate", () => {
    const doc: Record<string, unknown> = {
      validFrom: "2024-06-01T00:00:00Z",
      awardedDate: "2024-01-01T00:00:00Z",
    };
    enforceDateCoherency(doc);
    expect(doc.validFrom).toBe("2024-01-01T00:00:00Z");
    expect(doc.awardedDate).toBe("2024-06-01T00:00:00Z");
  });

  it("leaves already-ordered dates unchanged", () => {
    const doc: Record<string, unknown> = {
      validFrom: "2024-01-01T00:00:00Z",
      awardedDate: "2024-06-01T00:00:00Z",
      validUntil: "2025-01-01T00:00:00Z",
    };
    enforceDateCoherency(doc);
    expect(doc.validFrom).toBe("2024-01-01T00:00:00Z");
    expect(doc.awardedDate).toBe("2024-06-01T00:00:00Z");
    expect(doc.validUntil).toBe("2025-01-01T00:00:00Z");
  });

  it("does not error when dates are missing", () => {
    const doc: Record<string, unknown> = {
      validFrom: "2024-01-01T00:00:00Z",
    };
    expect(() => enforceDateCoherency(doc)).not.toThrow();
    expect(doc.validFrom).toBe("2024-01-01T00:00:00Z");
  });

  it("does not error on empty document", () => {
    const doc: Record<string, unknown> = {};
    expect(() => enforceDateCoherency(doc)).not.toThrow();
  });

  it("enforces validFrom <= validUntil", () => {
    const doc: Record<string, unknown> = {
      validFrom: "2025-12-01T00:00:00Z",
      validUntil: "2024-01-01T00:00:00Z",
    };
    enforceDateCoherency(doc);
    expect(doc.validFrom).toBe("2024-01-01T00:00:00Z");
    expect(doc.validUntil).toBe("2025-12-01T00:00:00Z");
  });

  it("enforces activityStartDate <= activityEndDate in credentialSubject", () => {
    const doc: Record<string, unknown> = {
      credentialSubject: {
        activityStartDate: "2024-12-01T00:00:00Z",
        activityEndDate: "2024-01-01T00:00:00Z",
      },
    };
    enforceDateCoherency(doc);
    const subject = doc.credentialSubject as Record<string, unknown>;
    expect(subject.activityStartDate).toBe("2024-01-01T00:00:00Z");
    expect(subject.activityEndDate).toBe("2024-12-01T00:00:00Z");
  });

  it("enforces inner endorsement validFrom >= outer validFrom", () => {
    const doc: Record<string, unknown> = {
      validFrom: "2024-06-01T00:00:00Z",
      endorsement: [{ validFrom: "2024-01-01T00:00:00Z" }, { validFrom: "2024-08-01T00:00:00Z" }],
    };
    enforceDateCoherency(doc);
    const endorsements = doc.endorsement as Array<Record<string, unknown>>;
    // First endorsement's validFrom was before outer, should be corrected
    expect(endorsements[0].validFrom).toBe("2024-06-01T00:00:00Z");
    // Second endorsement's validFrom was already after outer, unchanged
    expect(endorsements[1].validFrom).toBe("2024-08-01T00:00:00Z");
  });

  it("round-trip determinism: same input produces same output", () => {
    const makeDoc = () => ({
      validFrom: "2024-06-01T00:00:00Z",
      awardedDate: "2024-01-01T00:00:00Z",
      validUntil: "2025-01-01T00:00:00Z",
    });

    const doc1 = makeDoc();
    const doc2 = makeDoc();
    enforceDateCoherency(doc1);
    enforceDateCoherency(doc2);
    expect(doc1).toEqual(doc2);
  });

  it("handles date-only strings correctly", () => {
    const doc: Record<string, unknown> = {
      validFrom: "2024-12-01",
      awardedDate: "2024-01-01",
    };
    enforceDateCoherency(doc);
    expect(doc.validFrom).toBe("2024-01-01");
    expect(doc.awardedDate).toBe("2024-12-01");
  });

  it("ignores non-date string values gracefully", () => {
    const doc: Record<string, unknown> = {
      validFrom: "not-a-date",
      awardedDate: "2024-01-01T00:00:00Z",
    };
    // Should not throw or modify values when parsing fails
    expect(() => enforceDateCoherency(doc)).not.toThrow();
    expect(doc.validFrom).toBe("not-a-date");
    expect(doc.awardedDate).toBe("2024-01-01T00:00:00Z");
  });
});
