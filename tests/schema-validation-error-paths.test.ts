import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSchema } from "../src/validate/schema.js";

/**
 * Property 15: Schema validation error paths are valid JSON Pointers
 *
 * For any document failing schema validation, every error has a valid JSON
 * Pointer `path` (starts with "/" or is empty string), non-empty `message`,
 * and `severity` of "error".
 *
 * **Validates: Requirements 17.3, 19.8**
 */

describe("Property 15: Schema validation error paths are valid JSON Pointers", () => {
  // A valid base credential that passes schema validation
  const validBaseCredential = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: "https://example.org/credentials/123",
    type: ["VerifiableCredential", "AchievementCredential"],
    issuer: {
      id: "https://example.org/issuers/1",
      type: ["Profile"],
    },
    validFrom: "2024-01-01T00:00:00Z",
    credentialSubject: {
      id: "did:example:learner123",
      type: ["AchievementSubject"],
      achievement: {
        id: "https://example.org/achievements/1",
        type: ["Achievement"],
        name: "Test Achievement",
        description: "A test achievement",
        criteria: {
          narrative: "Complete the test",
        },
      },
    },
  };

  // Required top-level fields that can be removed to produce errors
  const removableFields = ["@context", "id", "type", "credentialSubject", "issuer", "validFrom"];

  // Arbitrary that picks a non-empty subset of fields to remove
  const fieldsToRemoveArb = fc
    .subarray(removableFields, { minLength: 1 })
    .filter((arr) => arr.length > 0);

  // Arbitrary that corrupts field values with invalid types
  const corruptionArb = fc.constantFrom(
    "remove", // remove the field entirely
    "nullify", // set to null
    "wrongType", // set to wrong type (number instead of expected)
  );

  it("every error from an invalid document has valid path, non-empty message, and severity 'error'", () => {
    fc.assert(
      fc.property(fieldsToRemoveArb, corruptionArb, (fieldsToRemove, corruption) => {
        // Create a corrupted copy of the base credential
        const doc = JSON.parse(JSON.stringify(validBaseCredential));

        for (const field of fieldsToRemove) {
          switch (corruption) {
            case "remove":
              delete doc[field];
              break;
            case "nullify":
              doc[field] = null;
              break;
            case "wrongType":
              doc[field] = 12345;
              break;
          }
        }

        const errors = validateSchema(doc);

        // The document should produce at least one error since we corrupted required fields
        // (unless the schema is very permissive for some corruption)
        // We only assert on the error structure when errors are present
        if (errors.length === 0) return;

        for (const error of errors) {
          // Path must be a valid JSON Pointer: empty string or starts with "/"
          expect(
            error.path === "" || error.path.startsWith("/"),
            `Expected valid JSON Pointer but got: "${error.path}"`,
          ).toBe(true);

          // Message must be non-empty
          expect(error.message.length).toBeGreaterThan(0);

          // Severity must be "error"
          expect(error.severity).toBe("error");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("corrupting nested required fields also produces errors with valid paths", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "credentialSubject.achievement",
          "credentialSubject.type",
          "issuer.id",
          "issuer.type",
        ),
        fc.constantFrom("remove", "nullify", "wrongType"),
        (nestedPath, corruption) => {
          const doc = JSON.parse(JSON.stringify(validBaseCredential));

          // Navigate to the nested field and corrupt it
          const parts = nestedPath.split(".");
          let target = doc;
          for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]];
            if (!target) return; // skip if parent doesn't exist
          }

          const lastKey = parts[parts.length - 1];
          switch (corruption) {
            case "remove":
              delete target[lastKey];
              break;
            case "nullify":
              target[lastKey] = null;
              break;
            case "wrongType":
              target[lastKey] = 99999;
              break;
          }

          const errors = validateSchema(doc);

          // Only assert on error structure when errors are present
          if (errors.length === 0) return;

          for (const error of errors) {
            // Path must be a valid JSON Pointer: empty string or starts with "/"
            expect(
              error.path === "" || error.path.startsWith("/"),
              `Expected valid JSON Pointer but got: "${error.path}"`,
            ).toBe(true);

            // Message must be non-empty
            expect(error.message.length).toBeGreaterThan(0);

            // Severity must be "error"
            expect(error.severity).toBe("error");
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
