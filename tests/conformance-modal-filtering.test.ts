import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findConformanceRequirements } from "../src/spec/index.js";

/**
 * Property 23: find_conformance_requirements modal filtering
 *
 * For any call with `modal` parameter, all results have matching `modal` field.
 *
 * **Validates: Requirements 21.5**
 */

describe("Property 23: find_conformance_requirements modal filtering", () => {
  // Known topics likely to produce results in the conformance table
  const topics = [
    "credential",
    "achievement",
    "issuer",
    "verification",
    "profile",
    "endorsement",
    "evidence",
    "type",
    "name",
    "recipient",
    "badge",
    "alignment",
    "criteria",
    "result",
    "identity",
  ];

  const modalValues = ["MUST", "SHOULD", "MAY"] as const;

  const topicArb = fc.constantFrom(...topics);
  const modalArb = fc.constantFrom(...modalValues);

  it("all results have modal field matching the modal filter parameter", async () => {
    await fc.assert(
      fc.asyncProperty(topicArb, modalArb, async (topic, modal) => {
        const results = await findConformanceRequirements(topic, modal);

        for (const result of results) {
          expect(result.modal).toBe(modal);
        }
      }),
      { numRuns: 50 },
    );
  });
});
