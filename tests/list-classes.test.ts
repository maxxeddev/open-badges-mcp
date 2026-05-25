import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/list_classes.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 2: list_classes returns complete structured entries
 *
 * For any Vocab_Store containing N classes, calling `list_classes` SHALL return
 * exactly N entries, and each entry SHALL contain non-undefined `name` (string),
 * `description` (string), and `subClassOf` (string array) fields.
 *
 * **Validates: Requirements 6.2, 6.3**
 */

describe("Property 2: list_classes returns complete structured entries", () => {
  it("returns a count equal to classesByName.size", async () => {
    const result = await handler();
    const parsed = JSON.parse(result.content[0].text);
    const vocab = getVocab();

    expect(parsed.classes.length).toBe(vocab.classesByName.size);
  });

  it("each entry has a non-empty string name", async () => {
    const result = await handler();
    const parsed = JSON.parse(result.content[0].text);

    for (const entry of parsed.classes) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
    }
  });

  it("each entry has a string description (not undefined)", async () => {
    const result = await handler();
    const parsed = JSON.parse(result.content[0].text);

    for (const entry of parsed.classes) {
      expect(typeof entry.description).toBe("string");
    }
  });

  it("each entry has subClassOf as an array", async () => {
    const result = await handler();
    const parsed = JSON.parse(result.content[0].text);

    for (const entry of parsed.classes) {
      expect(Array.isArray(entry.subClassOf)).toBe(true);
    }
  });
});
