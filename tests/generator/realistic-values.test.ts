/**
 * Unit tests for the realistic value generator dispatch.
 */

import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";
import { generateRealistic } from "../../src/generator/realistic-values.js";

describe("generateRealistic", () => {
  beforeEach(() => {
    faker.seed(42);
  });

  // --- Class+property context dispatch ---

  it("(Achievement, name) returns a non-UUID string", () => {
    const value = generateRealistic("Achievement", "name", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect(value as string).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect((value as string).length).toBeGreaterThan(3);
  });

  it("(AchievementCredential, name) returns a catchphrase-shaped string", () => {
    const value = generateRealistic("AchievementCredential", "name", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect((value as string).length).toBeGreaterThan(3);
  });

  it("(EndorsementCredential, name) starts with 'Endorsement:'", () => {
    const value = generateRealistic("EndorsementCredential", "name", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^Endorsement: /);
  });

  it("(Profile, name) returns a company-name-shaped string", () => {
    const value = generateRealistic("Profile", "name", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect((value as string).length).toBeGreaterThan(2);
    // Should not be a UUID
    expect(value as string).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("(Evidence, name) returns one of the predefined values", () => {
    const value = generateRealistic("Evidence", "name", { type: "string" }, faker);
    expect([
      "Final Project Submission",
      "Capstone Repository",
      "Course Portfolio",
      "Practical Examination",
      "Peer Review",
    ]).toContain(value);
  });

  it("(ResultDescription, name) returns one of Score/Letter Grade/Mastery Level/Pass-Fail", () => {
    const value = generateRealistic("ResultDescription", "name", { type: "string" }, faker);
    expect(["Score", "Letter Grade", "Mastery Level", "Pass/Fail"]).toContain(value);
  });

  it("(RubricCriterionLevel, name) returns one of the level names", () => {
    const value = generateRealistic("RubricCriterionLevel", "name", { type: "string" }, faker);
    expect(["Exemplary", "Proficient", "Developing", "Beginning"]).toContain(value);
  });

  it("(Achievement, description) returns multi-sentence text", () => {
    const value = generateRealistic("Achievement", "description", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect((value as string).length).toBeGreaterThan(20);
    // Should have at least 2 sentences (has period followed by space)
    expect(value as string).toMatch(/\.\s/);
  });

  // --- Schema.org curie dispatch via property name matching ---

  it("email property produces a valid-looking email", () => {
    const value = generateRealistic("Profile", "email", { type: "string", format: "email" }, faker);
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^[^@]+@[^@]+\.[a-z]{2,}/i);
  });

  it("familyName property produces a non-empty alphabetic string", () => {
    const value = generateRealistic("Profile", "familyName", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect((value as string).length).toBeGreaterThan(0);
  });

  it("givenName property produces a non-empty string", () => {
    const value = generateRealistic("Profile", "givenName", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect((value as string).length).toBeGreaterThan(0);
  });

  // --- Image ---

  it("(*, image) returns a picsum.photos URL", () => {
    const value = generateRealistic(
      "Achievement",
      "image",
      { type: "string", format: "uri" },
      faker,
    );
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^https:\/\/picsum\.photos\/seed\/.+\/400\/400$/);
  });

  // --- DID generation ---

  it("(AchievementCredential, id) returns urn:uuid:...", () => {
    const value = generateRealistic(
      "AchievementCredential",
      "id",
      { type: "string", format: "uri" },
      faker,
    );
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^urn:uuid:[0-9a-f-]+$/);
  });

  it("(Profile, id) returns did:web:...", () => {
    const value = generateRealistic("Profile", "id", { type: "string", format: "uri" }, faker);
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^did:web:/);
  });

  it("(AchievementSubject, id) returns did:example:...", () => {
    const value = generateRealistic(
      "AchievementSubject",
      "id",
      { type: "string", format: "uri" },
      faker,
    );
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^did:example:[a-zA-Z0-9]+$/);
  });

  it("(Proof, verificationMethod) returns did:key:z...", () => {
    const value = generateRealistic(
      "Proof",
      "verificationMethod",
      { type: "string", format: "uri" },
      faker,
    );
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^did:key:z[a-zA-Z0-9]+$/);
  });

  // --- IdentityObject ---

  it("(IdentityObject, identityHash) returns sha256$...", () => {
    const value = generateRealistic("IdentityObject", "identityHash", { type: "string" }, faker);
    expect(value).toBeTypeOf("string");
    expect(value as string).toMatch(/^sha256\$[0-9a-f]{64}$/);
  });

  // --- Seeded determinism ---

  it("same seed produces the same value twice", () => {
    faker.seed(123);
    const value1 = generateRealistic("Achievement", "name", { type: "string" }, faker);
    faker.seed(123);
    const value2 = generateRealistic("Achievement", "name", { type: "string" }, faker);
    expect(value1).toBe(value2);
  });

  // --- JWS pattern ---

  it("CompactJws pattern returns the stub signature", () => {
    const schema = {
      type: "string",
      pattern: "^[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]*\\.[a-zA-Z0-9_-]+$",
    };
    const value = generateRealistic("Proof", "jws", schema, faker);
    expect(value).toBe("eyJhbGciOiJFZERTQSJ9.e30.signature");
  });

  // --- Fallback ---

  it("unknown class/property with no format returns undefined (falls back to UUID)", () => {
    const value = generateRealistic("UnknownClass", "unknownProp", { type: "string" }, faker);
    // For a generic string with no context hints, realistic-values returns undefined
    // so the caller can fall back to the UUID generator
    expect(value).toBeUndefined();
  });

  // --- Boolean via xsd type fallback ---

  it("boolean type returns a boolean value", () => {
    const value = generateRealistic("SomeClass", "someBool", { type: "boolean" }, faker);
    expect(value).toBeTypeOf("boolean");
  });

  // --- Number via xsd type fallback ---

  it("number type returns a number value", () => {
    const value = generateRealistic("SomeClass", "someNum", { type: "number" }, faker);
    expect(value).toBeTypeOf("number");
  });
});
