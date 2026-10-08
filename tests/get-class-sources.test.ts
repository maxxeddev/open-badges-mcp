import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_class.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 5: get_class sources contain class-specific anchor
 *
 * For any valid class name in the Vocab_Store, the `sources` array in the
 * `get_class` response SHALL contain at least one entry whose `url` ends with
 * `#<className>` and whose `anchor` field equals the class name.
 *
 * **Validates: Requirements 7.6**
 */

describe("Property 5: get_class sources contain class-specific anchor", () => {
  const vocab = getVocab();
  const classNames = Array.from(vocab.classesByName.keys());

  it.each(classNames)(
    "sources for class '%s' contain an entry with URL ending in #<className> and anchor equal to class name",
    async (className) => {
      const result = await handler({ name: className });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sources).toBeDefined();
      expect(Array.isArray(parsed.sources)).toBe(true);

      const matchingSource = parsed.sources.find(
        (s: { url: string; anchor: string }) =>
          s.url.endsWith(`#${className}`) && s.anchor === className,
      );

      expect(matchingSource).toBeDefined();
    },
  );
});
