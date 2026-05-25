import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_class.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 6: Unknown class names produce error responses
 *
 * For any string that does not match a key in the `classesByName` map,
 * calling `get_class` SHALL return a response containing an `error` field
 * with a message indicating the class was not found.
 *
 * **Validates: Requirements 7.8**
 */

describe("Property 6: Unknown class names produce error responses", () => {
  const unknownNames = [
    "NonExistentClass",
    "FooBar",
    "achievement", // lowercase — class names are case-sensitive
    "",
    "123Invalid",
    "AchievementCredential_typo",
  ];

  for (const name of unknownNames) {
    it(`returns error for unknown class name: "${name}"`, async () => {
      const result = await handler({ name });
      const parsed = JSON.parse(result.content[0].text);

      // Must contain an error field
      expect(parsed).toHaveProperty("error");
      expect(typeof parsed.error).toBe("string");
      expect(parsed.error.length).toBeGreaterThan(0);

      // Must NOT contain success-response fields
      expect(parsed).not.toHaveProperty("properties");
      expect(parsed).not.toHaveProperty("subClassOf");
      expect(parsed).not.toHaveProperty("description");
      expect(parsed).not.toHaveProperty("version");
      expect(parsed).not.toHaveProperty("sources");
    });
  }

  it("confirms unknown names are truly absent from classesByName", () => {
    const vocab = getVocab();
    for (const name of unknownNames) {
      expect(vocab.classesByName.has(name)).toBe(false);
    }
  });
});
