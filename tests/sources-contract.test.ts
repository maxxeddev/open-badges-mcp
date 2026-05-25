import { describe, expect, it } from "vitest";
import { handler as getClassHandler } from "../src/tools/get_class.js";
import { handler as listClassesHandler } from "../src/tools/list_classes.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 8: Sources array contract for spec-data tools
 *
 * For any tool response from a tool other than `ping`, the response SHALL
 * contain a `sources` array where each entry has a `url` (string) and
 * `anchor` (string) field.
 *
 * **Validates: Requirements 9.1, 9.2**
 */

describe("Property 8: Sources array contract for spec-data tools", () => {
  describe("list_classes sources contract", () => {
    it("response contains a non-empty sources array", async () => {
      const result = await listClassesHandler();
      const parsed = JSON.parse(result.content[0].text);

      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBeGreaterThan(0);
    });

    it("each source entry has url (non-empty string) and anchor (non-empty string)", async () => {
      const result = await listClassesHandler();
      const parsed = JSON.parse(result.content[0].text);

      for (const source of parsed.sources) {
        expect(typeof source.url).toBe("string");
        expect(source.url.length).toBeGreaterThan(0);
        expect(typeof source.anchor).toBe("string");
        expect(source.anchor.length).toBeGreaterThan(0);
      }
    });
  });

  describe("get_class sources contract", () => {
    it("response for a valid class contains a non-empty sources array", async () => {
      const result = await getClassHandler({ name: "AchievementCredential" });
      const parsed = JSON.parse(result.content[0].text);

      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBeGreaterThan(0);
    });

    it("each source entry has url (non-empty string) and anchor (non-empty string)", async () => {
      const result = await getClassHandler({ name: "AchievementCredential" });
      const parsed = JSON.parse(result.content[0].text);

      for (const source of parsed.sources) {
        expect(typeof source.url).toBe("string");
        expect(source.url.length).toBeGreaterThan(0);
        expect(typeof source.anchor).toBe("string");
        expect(source.anchor.length).toBeGreaterThan(0);
      }
    });

    const vocab = getVocab();
    const classNames = Array.from(vocab.classesByName.keys());

    it.each(
      classNames,
    )("class '%s' response contains sources with url and anchor fields", async (className) => {
      const result = await getClassHandler({ name: className });
      const parsed = JSON.parse(result.content[0].text);

      expect(Array.isArray(parsed.sources)).toBe(true);
      expect(parsed.sources.length).toBeGreaterThan(0);

      for (const source of parsed.sources) {
        expect(typeof source.url).toBe("string");
        expect(source.url.length).toBeGreaterThan(0);
        expect(typeof source.anchor).toBe("string");
        expect(source.anchor.length).toBeGreaterThan(0);
      }
    });
  });
});
