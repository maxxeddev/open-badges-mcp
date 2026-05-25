import { describe, expect, it } from "vitest";
import { handler as crossReferenceHandler } from "../src/tools/cross_reference.js";
import { handler as findConformanceHandler } from "../src/tools/find_conformance_requirements.js";
import { handler as getContextHandler } from "../src/tools/get_context.js";
import { handler as getExamplesHandler } from "../src/tools/get_examples.js";
import { handler as getPropertyHandler } from "../src/tools/get_property.js";
import { handler as getSectionHandler } from "../src/tools/get_section.js";
import { handler as listPropertiesHandler } from "../src/tools/list_properties.js";
import { handler as listSectionsHandler } from "../src/tools/list_sections.js";
import { handler as resolveTermHandler } from "../src/tools/resolve_term.js";
import { handler as searchSpecHandler } from "../src/tools/search_spec.js";

/**
 * Property 7: Sources array contract
 *
 * For any successful tool response (except `ping`), the response contains a
 * `sources` array where each entry has `url` (string) and `anchor` (string) fields.
 *
 * **Validates: Requirements 1.7, 2.7, 5.5, 6.7, 10.9, 11.6, 12.5, 13.5, 15.7, 21.7**
 */

interface SourceEntry {
  url: string;
  anchor: string;
}

function assertSourcesArray(parsed: Record<string, unknown>): void {
  expect(parsed.sources).toBeDefined();
  expect(Array.isArray(parsed.sources)).toBe(true);

  const sources = parsed.sources as SourceEntry[];
  expect(sources.length).toBeGreaterThan(0);

  for (const source of sources) {
    expect(typeof source.url).toBe("string");
    expect(source.url.length).toBeGreaterThan(0);
    expect(typeof source.anchor).toBe("string");
    expect(source.anchor.length).toBeGreaterThan(0);
  }
}

describe("Property 7: Sources array contract", () => {
  it("list_properties (class_name: 'Profile') returns sources with url and anchor", async () => {
    const result = await listPropertiesHandler({ class_name: "Profile" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("get_property (name: 'alignment') returns sources with url and anchor", async () => {
    const result = await getPropertyHandler({ name: "alignment" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("get_context ({}) returns sources with url and anchor", async () => {
    const result = await getContextHandler({});
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("resolve_term (term_or_iri: 'Achievement') returns sources with url and anchor", async () => {
    const result = await resolveTermHandler({ term_or_iri: "Achievement" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("search_spec (query: 'credential') returns sources with url and anchor", async () => {
    const result = await searchSpecHandler({ query: "credential" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("get_section (spec: 'ob3', section_id: 'abstract') returns sources with url and anchor", async () => {
    const result = await getSectionHandler({ spec: "ob3", section_id: "abstract" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("list_sections (spec: 'ob3') returns sources with url and anchor", async () => {
    const result = await listSectionsHandler({ spec: "ob3" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("cross_reference (term: 'Achievement') returns sources with url and anchor", async () => {
    const result = await crossReferenceHandler({ term: "Achievement" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("get_examples (class_or_topic: 'AchievementCredential') returns sources with url and anchor", async () => {
    const result = await getExamplesHandler({ class_or_topic: "AchievementCredential" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });

  it("find_conformance_requirements (topic: 'credential') returns sources with url and anchor", async () => {
    const result = await findConformanceHandler({ topic: "credential" });
    const parsed = JSON.parse(result.content[0].text);
    assertSourcesArray(parsed);
  });
});
