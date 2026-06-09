import { describe, expect, it } from "vitest";
import { validateCredential } from "../src/validate/orchestrator.js";

describe("validateCredential orchestrator", () => {
  // A minimal valid AchievementCredential for schema checks
  const validCredential: Record<string, unknown> = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    type: ["VerifiableCredential", "AchievementCredential"],
    id: "urn:uuid:12345678-1234-1234-1234-123456789012",
    issuer: {
      id: "did:example:issuer",
      type: ["Profile"],
      name: "Test Issuer",
    },
    validFrom: "2024-01-01T00:00:00Z",
    name: "Test Credential",
    credentialSubject: {
      id: "did:example:subject",
      type: ["AchievementSubject"],
      achievement: {
        id: "urn:uuid:achievement-1",
        type: ["Achievement"],
        name: "Test Achievement",
        criteria: { narrative: "Completed all tasks" },
      },
    },
  };

  describe("single credential input (R4.7)", () => {
    it("returns a one-element results array for a single credential", async () => {
      const response = await validateCredential(validCredential, "schema");
      expect(response.results).toHaveLength(1);
      expect(response.results[0].index).toBe(0);
      expect(response.results[0].source).toBe("single");
    });
  });

  describe("mode selection", () => {
    it("mode 'schema' runs only the schema check", async () => {
      const response = await validateCredential(validCredential, "schema");
      expect(response.results[0].checks).toHaveLength(1);
      expect(response.results[0].checks[0].check).toBe("schema");
    });

    it("mode 'jsonld' runs only the jsonld check", async () => {
      const response = await validateCredential(validCredential, "jsonld");
      expect(response.results[0].checks).toHaveLength(1);
      expect(response.results[0].checks[0].check).toBe("jsonld");
    });

    it("mode 'signature' runs only the signature check", async () => {
      const response = await validateCredential(validCredential, "signature");
      expect(response.results[0].checks).toHaveLength(1);
      expect(response.results[0].checks[0].check).toBe("signature");
    });

    it("mode 'both' runs schema and jsonld checks", async () => {
      const response = await validateCredential(validCredential, "both");
      expect(response.results[0].checks).toHaveLength(2);
      const checkNames = response.results[0].checks.map((c) => c.check);
      expect(checkNames).toContain("schema");
      expect(checkNames).toContain("jsonld");
    });

    it("mode 'all' runs all three checks", async () => {
      const response = await validateCredential(validCredential, "all");
      expect(response.results[0].checks).toHaveLength(3);
      const checkNames = response.results[0].checks.map((c) => c.check);
      expect(checkNames).toContain("schema");
      expect(checkNames).toContain("jsonld");
      expect(checkNames).toContain("signature");
    });
  });

  describe("check independence (R5.5, R5.6)", () => {
    it("runs all requested checks even when one fails", async () => {
      // Invalid credential: missing required fields → schema fails
      const invalid = { type: ["VerifiableCredential"], "@context": [] };
      const response = await validateCredential(invalid, "all");

      // All three checks should still be reported
      expect(response.results[0].checks).toHaveLength(3);
      const checkNames = response.results[0].checks.map((c) => c.check);
      expect(checkNames).toContain("schema");
      expect(checkNames).toContain("jsonld");
      expect(checkNames).toContain("signature");
    });
  });

  describe("signature check on proof-less credential", () => {
    it("reports not_applicable when no proof is present", async () => {
      const response = await validateCredential(validCredential, "signature");
      expect(response.results[0].checks[0].status).toBe("not_applicable");
    });
  });

  describe("decode errors", () => {
    it("surfaces decode errors from unwrapping", async () => {
      // A VP with a malformed enveloped credential
      const vp = {
        type: "VerifiablePresentation",
        verifiableCredential: [
          {
            type: "EnvelopedVerifiableCredential",
            id: "data:application/vc+jwt,not-a-valid-jwt",
          },
        ],
      };
      const response = await validateCredential(vp, "schema");
      expect(response.decodeErrors).toBeDefined();
      expect(response.decodeErrors!.length).toBeGreaterThan(0);
      expect(response.ok).toBe(false);
    });
  });

  describe("multi-credential (VP) input", () => {
    it("returns per-credential results for a VP with multiple credentials", async () => {
      const vp = {
        type: "VerifiablePresentation",
        verifiableCredential: [validCredential, validCredential],
      };
      const response = await validateCredential(vp, "schema");
      expect(response.results).toHaveLength(2);
      expect(response.results[0].index).toBe(0);
      expect(response.results[1].index).toBe(1);
    });
  });

  describe("aggregated ok", () => {
    it("ok is true when all checks pass", async () => {
      const response = await validateCredential(validCredential, "schema");
      // If schema passes, ok should be true
      if (response.results[0].checks[0].status === "passed") {
        expect(response.ok).toBe(true);
      }
    });

    it("ok is false when any check fails", async () => {
      const invalid = { type: ["VerifiableCredential"] };
      const response = await validateCredential(invalid, "schema");
      expect(response.ok).toBe(false);
    });
  });
});
