import { describe, expect, it } from "vitest";
import { getClassRecord } from "../src/vocab/index.js";

/**
 * Integration tests for vocab assertions.
 *
 * These tests verify specific integration assertions against the real OB3 vocab.ttl
 * to ensure the vocabulary loader and contextual description resolution work correctly.
 *
 * Validates: Requirements 12.2, 12.3, 12.4, 12.5
 */

describe("Vocab integration assertions", () => {
  it("AchievementCredential.subClassOf includes VerifiableCredential", () => {
    const record = getClassRecord("AchievementCredential");
    expect(record).not.toBeNull();
    expect(record!.subClassOf).toContain("VerifiableCredential");
  });

  it("AchievementCredential properties include expected names", () => {
    const record = getClassRecord("AchievementCredential");
    expect(record).not.toBeNull();

    const propertyNames = record!.properties.map((p) => p.name);

    const expectedProperties = [
      "name",
      "description",
      "image",
      "awardedDate",
      "credentialSubject",
      "endorsement",
      "endorsementJwt",
      "evidence",
    ];

    for (const expected of expectedProperties) {
      expect(
        propertyNames,
        `Expected AchievementCredential to have property "${expected}"`,
      ).toContain(expected);
    }
  });

  it("name property description on AchievementCredential differs from Achievement", () => {
    const achievementCredential = getClassRecord("AchievementCredential");
    const achievement = getClassRecord("Achievement");

    expect(achievementCredential).not.toBeNull();
    expect(achievement).not.toBeNull();

    const acNameProp = achievementCredential!.properties.find((p) => p.name === "name");
    const aNameProp = achievement!.properties.find((p) => p.name === "name");

    expect(acNameProp, "AchievementCredential should have a 'name' property").toBeDefined();
    expect(aNameProp, "Achievement should have a 'name' property").toBeDefined();

    expect(
      acNameProp!.description,
      "name property descriptions should differ between AchievementCredential and Achievement",
    ).not.toBe(aNameProp!.description);
  });
});
