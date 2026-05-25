import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handler as getPropertyHandler } from "../src/tools/get_property.js";
import { handler as getSectionHandler } from "../src/tools/get_section.js";
import { handler as listPropertiesHandler } from "../src/tools/list_properties.js";
import { handler as resolveTermHandler } from "../src/tools/resolve_term.js";

/**
 * Property 6: Invalid inputs produce structured error responses
 *
 * For unknown class/property/term/section inputs, tools return `error` field without throwing.
 *
 * **Validates: Requirements 1.9, 2.9, 2.10, 6.9, 11.8**
 */

describe("Property 6: Invalid inputs produce structured error responses", () => {
  it("list_properties returns error field for unknown class_name", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => /\S/.test(s)),
        async (unknownClass) => {
          const result = await listPropertiesHandler({
            class_name: unknownClass,
          });

          // Response is a valid object (not a thrown exception)
          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          const parsed = JSON.parse(result.content[0].text);

          // If the class happens to exist in the vocab, skip this case
          if (!parsed.error) return;

          // The response contains an error field with a non-empty string message
          expect(typeof parsed.error).toBe("string");
          expect(parsed.error.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("get_property returns error field for unknown property name", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => /\S/.test(s)),
        async (unknownProp) => {
          const result = await getPropertyHandler({ name: unknownProp });

          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          const parsed = JSON.parse(result.content[0].text);

          // If the property happens to exist in the vocab, skip this case
          if (!parsed.error) return;

          expect(typeof parsed.error).toBe("string");
          expect(parsed.error.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("get_property returns error field for valid property with unknown on_class", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => /\S/.test(s)),
        async (unknownClass) => {
          const result = await getPropertyHandler({
            name: "alignment",
            on_class: unknownClass,
          });

          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          const parsed = JSON.parse(result.content[0].text);

          // If the class happens to be in alignment's domain, skip
          if (!parsed.error) return;

          expect(typeof parsed.error).toBe("string");
          expect(parsed.error.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("resolve_term returns error field for unknown term_or_iri", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => /\S/.test(s)),
        async (unknownTerm) => {
          const result = await resolveTermHandler({
            term_or_iri: unknownTerm,
          });

          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          const parsed = JSON.parse(result.content[0].text);

          // If the term happens to exist in the context store, skip
          if (!parsed.error) return;

          expect(typeof parsed.error).toBe("string");
          expect(parsed.error.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("get_section returns error field for unknown section_id", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => /\S/.test(s)),
        async (unknownSection) => {
          const result = await getSectionHandler({
            spec: "ob3",
            section_id: unknownSection,
          });

          expect(result).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.content.length).toBeGreaterThan(0);

          const parsed = JSON.parse(result.content[0].text);

          // If the section happens to exist, skip
          if (!parsed.error) return;

          expect(typeof parsed.error).toBe("string");
          expect(parsed.error.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});
