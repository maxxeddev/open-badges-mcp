import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_examples.js";

/**
 * Unit tests for get_examples tool
 *
 * **Validates: Requirements 25.10**
 */

describe("get_examples unit tests", () => {
  it("returns at least one example for AchievementCredential", async () => {
    const result = await handler({ class_or_topic: "AchievementCredential" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.examples).toBeDefined();
    expect(Array.isArray(parsed.examples)).toBe(true);
    expect(parsed.examples.length).toBeGreaterThanOrEqual(1);
  });

  it("each example includes full JSON-LD code that parses as JSON", async () => {
    const result = await handler({ class_or_topic: "AchievementCredential" });
    const parsed = JSON.parse(result.content[0].text);

    for (const example of parsed.examples) {
      expect(example.code).toBeDefined();
      expect(typeof example.code).toBe("string");
      expect(example.code.length).toBeGreaterThan(0);

      // Code should parse as valid JSON
      const jsonParsed = JSON.parse(example.code);
      expect(jsonParsed).toBeDefined();
    }
  });

  it("each example includes a section anchor", async () => {
    const result = await handler({ class_or_topic: "AchievementCredential" });
    const parsed = JSON.parse(result.content[0].text);

    for (const example of parsed.examples) {
      expect(example.anchor).toBeDefined();
      expect(typeof example.anchor).toBe("string");
      expect(example.anchor.length).toBeGreaterThan(0);
    }
  });

  it("response includes a sources array with url and anchor", async () => {
    const result = await handler({ class_or_topic: "AchievementCredential" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.sources).toBeDefined();
    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(parsed.sources.length).toBeGreaterThan(0);

    for (const source of parsed.sources) {
      expect(source).toHaveProperty("url");
      expect(source).toHaveProperty("anchor");
      expect(typeof source.url).toBe("string");
      expect(typeof source.anchor).toBe("string");
      expect(source.url.length).toBeGreaterThan(0);
      expect(source.anchor.length).toBeGreaterThan(0);
    }
  });
});
