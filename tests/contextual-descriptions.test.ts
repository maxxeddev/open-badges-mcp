import { describe, expect, it } from "vitest";
import { handler } from "../src/tools/get_class.js";
import { getVocab } from "../src/vocab/index.js";

/**
 * Property 4: Contextual property descriptions differ across union-domain classes
 *
 * For any property that has a union domain with distinct per-class descriptions
 * for classes A and B, calling `get_class(A)` and `get_class(B)` SHALL return
 * different `description` values for that property.
 *
 * **Validates: Requirements 7.5**
 */

describe("Property 4: Contextual property descriptions differ across union-domain classes", () => {
  it("finds at least one property with union domain and per-class descriptions", () => {
    const vocab = getVocab();
    const propsWithContextualDescs = findPropertiesWithContextualDescriptions(vocab);

    expect(propsWithContextualDescs.length).toBeGreaterThan(0);
  });

  it("get_class returns different descriptions for properties with per-class descriptions", async () => {
    const vocab = getVocab();
    const propsWithContextualDescs = findPropertiesWithContextualDescriptions(vocab);

    for (const { propertyName, classA, classB } of propsWithContextualDescs) {
      const resultA = await handler({ name: classA });
      const resultB = await handler({ name: classB });

      const parsedA = JSON.parse(resultA.content[0].text);
      const parsedB = JSON.parse(resultB.content[0].text);

      const propOnA = parsedA.properties.find((p: { name: string }) => p.name === propertyName);
      const propOnB = parsedB.properties.find((p: { name: string }) => p.name === propertyName);

      expect(propOnA, `Property "${propertyName}" not found on class "${classA}"`).toBeDefined();
      expect(propOnB, `Property "${propertyName}" not found on class "${classB}"`).toBeDefined();

      expect(
        propOnA.description,
        `Property "${propertyName}" should have different descriptions on "${classA}" vs "${classB}"`,
      ).not.toBe(propOnB.description);
    }
  });

  it("'name' property has different descriptions on Achievement vs AchievementCredential", async () => {
    const resultAchievement = await handler({ name: "Achievement" });
    const resultCredential = await handler({ name: "AchievementCredential" });

    const parsedAchievement = JSON.parse(resultAchievement.content[0].text);
    const parsedCredential = JSON.parse(resultCredential.content[0].text);

    const nameOnAchievement = parsedAchievement.properties.find(
      (p: { name: string }) => p.name === "name",
    );
    const nameOnCredential = parsedCredential.properties.find(
      (p: { name: string }) => p.name === "name",
    );

    expect(nameOnAchievement).toBeDefined();
    expect(nameOnCredential).toBeDefined();
    expect(nameOnAchievement.description).not.toBe(nameOnCredential.description);
  });
});

/**
 * Finds properties that have union domains with at least 2 domain entries
 * that have non-empty AND distinct per-class descriptions.
 */
function findPropertiesWithContextualDescriptions(
  vocab: ReturnType<typeof getVocab>,
): Array<{ propertyName: string; classA: string; classB: string }> {
  const results: Array<{ propertyName: string; classA: string; classB: string }> = [];

  for (const prop of vocab.propertiesByName.values()) {
    // Find domain entries with non-empty per-class descriptions
    const entriesWithDesc = prop.domain.filter((d) => d.description.length > 0);

    if (entriesWithDesc.length < 2) continue;

    // Find a pair with actually different descriptions
    for (let i = 0; i < entriesWithDesc.length - 1; i++) {
      for (let j = i + 1; j < entriesWithDesc.length; j++) {
        if (entriesWithDesc[i].description !== entriesWithDesc[j].description) {
          results.push({
            propertyName: prop.name,
            classA: entriesWithDesc[i].className,
            classB: entriesWithDesc[j].className,
          });
          break;
        }
      }
      if (results.length > 0 && results[results.length - 1].propertyName === prop.name) {
        break;
      }
    }
  }

  return results;
}
