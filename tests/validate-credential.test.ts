import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/validate_credential.js";

/**
 * A known-good OB3 AchievementCredential fixture.
 * Includes all required fields per the OB3 JSON Schema:
 * @context, id, type, credentialSubject (with type + achievement), issuer, validFrom
 */
const VALID_CREDENTIAL = {
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
  ],
  id: "https://example.org/credentials/123",
  type: ["VerifiableCredential", "AchievementCredential"],
  issuer: {
    id: "https://example.org/issuers/1",
    type: "Profile",
    name: "Example Issuer",
  },
  validFrom: "2024-01-01T00:00:00Z",
  credentialSubject: {
    type: "AchievementSubject",
    achievement: {
      id: "https://example.org/achievements/1",
      type: "Achievement",
      name: "Test Achievement",
      description: "An achievement awarded for completing the test.",
      criteria: {
        narrative: "Completed the test.",
      },
    },
  },
};

describe("validate_credential tool", () => {
  it("returns ok: true for a known-good OB3 credential (schema mode)", async () => {
    const result = await handler({ json: VALID_CREDENTIAL, mode: "schema" });

    expect(result).toHaveProperty("content");
    expect(result.content).toHaveLength(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it("returns structured errors with JSON Pointer paths for credential missing credentialSubject.achievement", async () => {
    const invalidCredential = {
      ...VALID_CREDENTIAL,
      credentialSubject: {
        type: "AchievementSubject",
        // achievement field is intentionally missing
      },
    };

    const result = await handler({ json: invalidCredential, mode: "schema" });

    expect(result).toHaveProperty("content");
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ok).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);

    // Verify errors have the expected structure
    for (const error of parsed.errors) {
      expect(error).toHaveProperty("path");
      expect(error).toHaveProperty("message");
      expect(error).toHaveProperty("severity", "error");
      // path should be a JSON Pointer string (starts with "/" or is "/")
      expect(error.path).toMatch(/^\//);
    }

    // At least one error should reference the credentialSubject path
    const hasCredentialSubjectError = parsed.errors.some((e: { path: string }) =>
      e.path.includes("credentialSubject"),
    );
    expect(hasCredentialSubjectError).toBe(true);
  });

  it("returns parse error for invalid JSON string input", async () => {
    const result = await handler({ json: "not valid json {{{" });

    expect(result).toHaveProperty("content");
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatchObject({
      path: "",
      message: "Invalid JSON input",
      severity: "error",
    });
  });
});
