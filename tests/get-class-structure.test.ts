import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_class.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 3: get_class returns complete structured record for valid names
 *
 * For any class name that exists in the Vocab_Store, calling `get_class` SHALL
 * return an object containing `description` (string), `subClassOf` (string array),
 * and `properties` (array), where each property entry contains `name` (string),
 * `range` (string), and `description` (string) fields.
 *
 * **Validates: Requirements 7.3, 7.4**
 */

describe("Property 3: get_class returns complete structured record for valid names", () => {
  const vocab = getVocab();
  const classNames = Array.from(vocab.classesByName.keys());

  it.each(classNames)("class '%s' response contains description (string)", async (className) => {
    const result = await handler({ name: className });
    const parsed = JSON.parse(result.content[0].text);

    expect(typeof parsed.description).toBe("string");
  });

  it.each(classNames)("class '%s' response contains subClassOf (array)", async (className) => {
    const result = await handler({ name: className });
    const parsed = JSON.parse(result.content[0].text);

    expect(Array.isArray(parsed.subClassOf)).toBe(true);
  });

  it.each(classNames)("class '%s' response contains properties (array)", async (className) => {
    const result = await handler({ name: className });
    const parsed = JSON.parse(result.content[0].text);

    expect(Array.isArray(parsed.properties)).toBe(true);
  });

  it.each(
    classNames,
  )("class '%s' each property has name (string), range (object), description (string)", async (className) => {
    const result = await handler({ name: className });
    const parsed = JSON.parse(result.content[0].text);

    for (const prop of parsed.properties) {
      expect(typeof prop.name).toBe("string");
      expect(prop.name.length).toBeGreaterThan(0);
      expect(typeof prop.range).toBe("object");
      expect(prop.range).toHaveProperty("kind");
      expect(typeof prop.description).toBe("string");
    }
  });

  it.each(classNames)("class '%s' response contains version (string)", async (className) => {
    const result = await handler({ name: className });
    const parsed = JSON.parse(result.content[0].text);

    expect(typeof parsed.version).toBe("string");
    expect(parsed.version.length).toBeGreaterThan(0);
  });

  it.each(classNames)("class '%s' response contains sources (array)", async (className) => {
    const result = await handler({ name: className });
    const parsed = JSON.parse(result.content[0].text);

    expect(Array.isArray(parsed.sources)).toBe(true);
    expect(parsed.sources.length).toBeGreaterThan(0);
  });
});
