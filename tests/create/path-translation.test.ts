import { describe, expect, it } from "vitest";
import { translatePath } from "../../src/create/path-translation.js";

describe("translatePath", () => {
  it("translates /issuer/id → issuer.id", () => {
    expect(translatePath("/issuer/id")).toBe("issuer.id");
  });

  it("translates /issuer/name → issuer.name", () => {
    expect(translatePath("/issuer/name")).toBe("issuer.name");
  });

  it("translates /issuer/url → issuer.url", () => {
    expect(translatePath("/issuer/url")).toBe("issuer.url");
  });

  it("translates /credentialSubject/id → recipient.id", () => {
    expect(translatePath("/credentialSubject/id")).toBe("recipient.id");
  });

  it("translates /credentialSubject/identifier → recipient.identifier", () => {
    expect(translatePath("/credentialSubject/identifier")).toBe("recipient.identifier");
  });

  it("translates /credentialSubject/achievement/name → achievement.name", () => {
    expect(translatePath("/credentialSubject/achievement/name")).toBe("achievement.name");
  });

  it("translates /credentialSubject/achievement/description → achievement.description", () => {
    expect(translatePath("/credentialSubject/achievement/description")).toBe(
      "achievement.description",
    );
  });

  it("translates /credentialSubject/achievement/criteria → achievement.criteria", () => {
    expect(translatePath("/credentialSubject/achievement/criteria")).toBe("achievement.criteria");
  });

  it("translates /awardedDate → awardedDate", () => {
    expect(translatePath("/awardedDate")).toBe("awardedDate");
  });

  it("translates /validFrom → validFrom", () => {
    expect(translatePath("/validFrom")).toBe("validFrom");
  });

  it("translates /id → id", () => {
    expect(translatePath("/id")).toBe("id");
  });

  it("translates /image → image", () => {
    expect(translatePath("/image")).toBe("image");
  });

  // Indexed paths
  it("translates /evidence/0/name → evidence[0].name", () => {
    expect(translatePath("/evidence/0/name")).toBe("evidence[0].name");
  });

  it("translates /evidence/2/description → evidence[2].description", () => {
    expect(translatePath("/evidence/2/description")).toBe("evidence[2].description");
  });

  it("translates /evidence/0 (no sub-field) → evidence[0]", () => {
    expect(translatePath("/evidence/0")).toBe("evidence[0]");
  });

  // Unknown paths pass through
  it("returns unknown path as-is", () => {
    expect(translatePath("/some/unknown/path")).toBe("/some/unknown/path");
  });

  it("translates nested credentialSubject achievement sub-paths", () => {
    expect(translatePath("/credentialSubject/achievement/criteria/narrative")).toBe(
      "achievement.criteria.narrative",
    );
  });
});
