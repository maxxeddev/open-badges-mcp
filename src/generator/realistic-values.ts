/**
 * Realistic value generator for the credential synthesizer.
 *
 * Dispatches from (ownerClass, propertyName, schema context) to realistic
 * faker-generated values. Used when `contentMode === "realistic"`.
 *
 * Dispatch priority (highest to lowest):
 *   1. Class+property context (hand-routed)
 *   2. Schema.org curie via structured range
 *   3. DID and identity values
 *   4. JWS proofs (keep existing stub)
 *   5. xsd datatype fallback
 *   6. Last-resort: UUID (matches current behavior)
 */

import type { Faker } from "@faker-js/faker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RealisticContext = {
  ownerClass: string;
  propertyName: string;
  schema: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Class+property dispatch table
// ---------------------------------------------------------------------------

type ContextualGenerator = (faker: Faker) => unknown;

const CLASS_PROPERTY_DISPATCH: Record<string, Record<string, ContextualGenerator>> = {
  Achievement: {
    name: (faker) => faker.company.catchPhrase(),
    description: (faker) => faker.lorem.sentences(3),
    achievementType: (faker) =>
      faker.helpers.arrayElement([
        "Achievement",
        "Badge",
        "Certificate",
        "Diploma",
        "Course",
        "Award",
        "License",
        "Membership",
        "Micro-credential",
        "Certification",
      ]),
    fieldOfStudy: (faker) =>
      faker.helpers.arrayElement([
        "Computer Science",
        "Mathematics",
        "Engineering",
        "Education",
        "Business",
        "Linguistics",
        "Design",
        "Data Science",
      ]),
    humanCode: (faker) => faker.string.alphanumeric(6).toUpperCase(),
    tag: (faker) =>
      faker.helpers.arrayElement([
        "typescript",
        "verifiable-credentials",
        "open-badges",
        "json-ld",
        "did",
        "education",
        "credentialing",
      ]),
  },
  AchievementCredential: {
    name: (faker) => faker.company.catchPhrase(),
    id: (faker) => `urn:uuid:${faker.string.uuid()}`,
  },
  EndorsementCredential: {
    name: (faker) => `Endorsement: ${faker.company.catchPhrase()}`,
    id: (faker) => `urn:uuid:${faker.string.uuid()}`,
  },
  Evidence: {
    name: (faker) =>
      faker.helpers.arrayElement([
        "Final Project Submission",
        "Capstone Repository",
        "Course Portfolio",
        "Practical Examination",
        "Peer Review",
      ]),
    description: (faker) => faker.lorem.sentences(2),
  },
  Profile: {
    name: (faker) => faker.company.name(),
    description: (faker) => `${faker.company.catchPhrase()}. ${faker.lorem.sentence()}`,
    id: (faker) => `did:web:${faker.internet.domainName()}`,
  },
  ResultDescription: {
    name: (faker) =>
      faker.helpers.arrayElement(["Score", "Letter Grade", "Mastery Level", "Pass/Fail"]),
  },
  RubricCriterionLevel: {
    name: (faker) =>
      faker.helpers.arrayElement(["Exemplary", "Proficient", "Developing", "Beginning"]),
  },
  AchievementSubject: {
    id: (faker) => `did:example:${faker.string.alphanumeric(20)}`,
  },
  EndorsementSubject: {
    id: (faker) => `did:example:${faker.string.alphanumeric(20)}`,
  },
  Result: {
    status: (faker) =>
      faker.helpers.arrayElement(["Completed", "Enrolled", "InProgress", "OnHold", "Withdrew"]),
  },
  IdentityObject: {
    identityType: (faker) =>
      faker.helpers.arrayElement([
        "sourcedId",
        "systemId",
        "productId",
        "userName",
        "accountId",
        "emailAddress",
        "nationalIdentityNumber",
        "identifier",
      ]),
    identityHash: (faker) =>
      `sha256$${faker.string.hexadecimal({ length: 64, prefix: "", casing: "lower" })}`,
  },
  Proof: {
    verificationMethod: (faker) => `did:key:z${faker.string.alphanumeric(43)}`,
  },
};

// Wildcard property dispatch (applies to any class)
const WILDCARD_PROPERTY_DISPATCH: Record<string, ContextualGenerator> = {
  narrative: (faker) => faker.lorem.paragraphs(2, "\n\n"),
  image: (faker) => `https://picsum.photos/seed/${faker.string.uuid()}/400/400`,
  dateOfBirth: (faker) =>
    faker.date.birthdate({ min: 18, max: 70, mode: "age" }).toISOString().slice(0, 10),
};

// ---------------------------------------------------------------------------
// Schema.org curie dispatch
// ---------------------------------------------------------------------------

const SCHEMA_ORG_DISPATCH: Record<string, ContextualGenerator> = {
  "schema:email": (faker) => faker.internet.email(),
  "schema:familyName": (faker) => faker.person.lastName(),
  "schema:givenName": (faker) => faker.person.firstName(),
  "schema:additionalName": (faker) => faker.person.middleName(),
  "schema:streetAddress": (faker) => faker.location.streetAddress(),
  "schema:addressLocality": (faker) => faker.location.city(),
  "schema:addressRegion": (faker) => faker.location.state(),
  "schema:addressCountry": (faker) => faker.location.country(),
  "schema:postalCode": (faker) => faker.location.zipCode(),
  "schema:postOfficeBoxNumber": (faker) => `PO Box ${faker.number.int({ min: 100, max: 9999 })}`,
  "schema:telephone": (faker) => faker.phone.number(),
  "schema:phone": (faker) => faker.phone.number(),
  "schema:inLanguage": (faker) =>
    faker.helpers.arrayElement(["en", "en-US", "es", "fr", "de", "ja", "zh-Hans"]),
  "schema:honorificPrefix": (faker) =>
    faker.helpers.arrayElement(["Dr.", "Prof.", "Mr.", "Ms.", "Mx."]),
  "schema:honorificSuffix": (faker) =>
    faker.helpers.arrayElement(["PhD", "MD", "Esq.", "Jr.", "Sr.", "III"]),
  "schema:url": (faker) => faker.internet.url(),
  "schema:value": (faker) => faker.number.float({ min: 0, max: 100, fractionDigits: 2 }).toString(),
};

// ---------------------------------------------------------------------------
// XSD datatype fallback
// ---------------------------------------------------------------------------

const XSD_DISPATCH: Record<string, ContextualGenerator> = {
  "xsd:dateTime": (faker) => faker.date.recent({ days: 365 }).toISOString(),
  "xsd:date": (faker) => faker.date.recent({ days: 365 }).toISOString().slice(0, 10),
  "xsd:boolean": (faker) => faker.datatype.boolean(),
  "xsd:float": (faker) => faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
  "xsd:decimal": (faker) => faker.number.float({ min: 0, max: 100, fractionDigits: 2 }),
  "xsd:integer": (faker) => faker.number.int({ min: 0, max: 1000 }),
  "xsd:string": (faker) => faker.lorem.sentence(),
  "xsd:anyURI": (faker) => faker.internet.url(),
};

// ---------------------------------------------------------------------------
// Main dispatch function
// ---------------------------------------------------------------------------

/**
 * Generate a realistic value for a property given its context.
 *
 * @param ownerClass   - The OB3 class that owns this property (e.g. "Achievement")
 * @param propertyName - The property name (e.g. "name", "description")
 * @param schema       - The raw JSON Schema fragment for additional heuristics
 * @param faker        - A seeded Faker instance
 * @returns A realistic value, or `undefined` if no realistic mapping exists
 *          (caller should fall back to UUID-based generation)
 */
export function generateRealistic(
  ownerClass: string,
  propertyName: string,
  schema: Record<string, unknown>,
  faker: Faker,
): unknown | undefined {
  // 1. Class+property context dispatch
  const classDispatch = CLASS_PROPERTY_DISPATCH[ownerClass];
  if (classDispatch?.[propertyName]) {
    return classDispatch[propertyName](faker);
  }

  // Wildcard property dispatch
  if (WILDCARD_PROPERTY_DISPATCH[propertyName]) {
    return WILDCARD_PROPERTY_DISPATCH[propertyName](faker);
  }

  // 2. Schema.org curie via $comment or description hints
  const comment = typeof schema.$comment === "string" ? schema.$comment : "";
  const description = typeof schema.description === "string" ? schema.description : "";
  const contextHint = comment || description;

  for (const [curie, generator] of Object.entries(SCHEMA_ORG_DISPATCH)) {
    const term = curie.split(":")[1];
    // Match property name against schema.org term (case-insensitive)
    if (propertyName.toLowerCase() === term.toLowerCase()) {
      return generator(faker);
    }
    // Match $comment or description containing the curie
    if (contextHint.includes(curie)) {
      return generator(faker);
    }
  }

  // 3. DID and identity values for `id` properties
  if (propertyName === "id") {
    // Generic id: URN UUID
    return `urn:uuid:${faker.string.uuid()}`;
  }

  // 4. JWS proofs — detect via pattern
  if (
    typeof schema.pattern === "string" &&
    (schema.pattern.includes("CompactJws") ||
      schema.pattern === "^[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]*\\.[a-zA-Z0-9_-]+$")
  ) {
    return "eyJhbGciOiJFZERTQSJ9.e30.signature";
  }
  if (typeof schema.$comment === "string" && schema.$comment.includes("CompactJws")) {
    return "eyJhbGciOiJFZERTQSJ9.e30.signature";
  }

  // 5. xsd datatype fallback via format
  if (typeof schema.format === "string") {
    switch (schema.format) {
      case "uri":
        return `https://picsum.photos/seed/${faker.string.uuid()}/400/400`;
      case "date-time":
        return XSD_DISPATCH["xsd:dateTime"](faker);
      case "date":
        return XSD_DISPATCH["xsd:date"](faker);
    }
  }

  // xsd type fallback
  if (typeof schema.type === "string") {
    switch (schema.type) {
      case "boolean":
        return XSD_DISPATCH["xsd:boolean"](faker);
      case "number":
        return XSD_DISPATCH["xsd:float"](faker);
      case "integer":
        return XSD_DISPATCH["xsd:integer"](faker);
    }
  }

  // 6. Last resort — return undefined so the caller falls back to UUID
  return undefined;
}
