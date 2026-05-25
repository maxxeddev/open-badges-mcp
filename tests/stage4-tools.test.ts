import { describe, expect, it } from "vitest";
import { handler as getPropertyHandler } from "../src/tools/get_property.js";
import { handler as listPropertiesHandler } from "../src/tools/list_properties.js";

/**
 * Unit tests for Stage 4 tools: get_property and list_properties
 *
 * **Validates: Requirements 25.1, 25.2, 25.3**
 */

describe("get_property unit tests", () => {
  describe('get_property("alignment") returns 4 domain entries with distinct descriptions', () => {
    it("returns exactly 4 domain entries", async () => {
      const result = await getPropertyHandler({ name: "alignment" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).not.toHaveProperty("error");
      expect(parsed.domain).toHaveLength(4);
    });

    it("domain entries cover Achievement, Result, ResultDescription, and RubricCriterionLevel", async () => {
      const result = await getPropertyHandler({ name: "alignment" });
      const parsed = JSON.parse(result.content[0].text);

      const classNames = parsed.domain.map((d: { className: string }) => d.className);
      expect(classNames).toContain("Achievement");
      expect(classNames).toContain("Result");
      expect(classNames).toContain("ResultDescription");
      expect(classNames).toContain("RubricCriterionLevel");
    });

    it("each domain entry has a distinct description", async () => {
      const result = await getPropertyHandler({ name: "alignment" });
      const parsed = JSON.parse(result.content[0].text);

      const descriptions = parsed.domain.map((d: { description: string }) => d.description);
      const uniqueDescriptions = new Set(descriptions);
      expect(uniqueDescriptions.size).toBe(4);
    });
  });

  describe('get_property("alignment", "Result") returns one entry with Result-specific description', () => {
    it("returns exactly one domain entry", async () => {
      const result = await getPropertyHandler({
        name: "alignment",
        on_class: "Result",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).not.toHaveProperty("error");
      expect(parsed.domain).toHaveLength(1);
    });

    it("the domain entry is for class Result", async () => {
      const result = await getPropertyHandler({
        name: "alignment",
        on_class: "Result",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.domain[0].className).toBe("Result");
    });

    it("the description is Result-specific (differs from generic)", async () => {
      const allResult = await getPropertyHandler({ name: "alignment" });
      const allParsed = JSON.parse(allResult.content[0].text);

      const filteredResult = await getPropertyHandler({
        name: "alignment",
        on_class: "Result",
      });
      const filteredParsed = JSON.parse(filteredResult.content[0].text);

      // The Result-specific description should match the one from the full domain list
      const resultEntry = allParsed.domain.find(
        (d: { className: string }) => d.className === "Result",
      );
      expect(filteredParsed.domain[0].description).toBe(resultEntry.description);
      // And it should be a non-empty string
      expect(filteredParsed.domain[0].description.length).toBeGreaterThan(0);
    });
  });

  describe("get_property error handling", () => {
    it("returns error for unknown property name", async () => {
      const result = await getPropertyHandler({ name: "nonExistentProperty" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
    });

    it("returns error for valid property but invalid on_class", async () => {
      const result = await getPropertyHandler({
        name: "alignment",
        on_class: "NonExistentClass",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not in the domain");
    });
  });
});

describe("list_properties unit tests", () => {
  describe('list_properties("Profile") includes address, parentOrg, email', () => {
    it("returns a properties array", async () => {
      const result = await listPropertiesHandler({ class_name: "Profile" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).not.toHaveProperty("error");
      expect(Array.isArray(parsed.properties)).toBe(true);
      expect(parsed.properties.length).toBeGreaterThan(0);
    });

    it("includes address property", async () => {
      const result = await listPropertiesHandler({ class_name: "Profile" });
      const parsed = JSON.parse(result.content[0].text);

      const names = parsed.properties.map((p: { name: string }) => p.name);
      expect(names).toContain("address");
    });

    it("includes parentOrg property", async () => {
      const result = await listPropertiesHandler({ class_name: "Profile" });
      const parsed = JSON.parse(result.content[0].text);

      const names = parsed.properties.map((p: { name: string }) => p.name);
      expect(names).toContain("parentOrg");
    });

    it("includes email property", async () => {
      const result = await listPropertiesHandler({ class_name: "Profile" });
      const parsed = JSON.parse(result.content[0].text);

      const names = parsed.properties.map((p: { name: string }) => p.name);
      expect(names).toContain("email");
    });
  });

  describe("list_properties error handling", () => {
    it("returns error for unknown class name", async () => {
      const result = await listPropertiesHandler({
        class_name: "NonExistentClass",
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
    });

    it("returns error for empty class name", async () => {
      const result = await listPropertiesHandler({ class_name: "" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
    });

    it("returns error for case-sensitive mismatch", async () => {
      const result = await listPropertiesHandler({ class_name: "profile" });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveProperty("error");
    });
  });
});
