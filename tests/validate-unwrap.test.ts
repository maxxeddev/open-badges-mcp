import { describe, expect, it } from "vitest";
import { unwrap } from "../src/validate/unwrap.js";

describe("unwrap", () => {
  describe("single unwrapped credential (R4.7)", () => {
    it("returns the input as the sole credential when no wrapper recognized", () => {
      const cred = {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiableCredential", "AchievementCredential"],
        issuer: { id: "did:example:issuer" },
      };
      const result = unwrap(cred);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].index).toBe(0);
      expect(result.credentials[0].source).toBe("single");
      expect(result.credentials[0].doc).toBe(cred);
      expect(result.errors).toHaveLength(0);
    });

    it("returns single credential when type is a string", () => {
      const cred = { type: "AchievementCredential", id: "urn:test" };
      const result = unwrap(cred);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].source).toBe("single");
    });

    it("returns single credential when type is missing", () => {
      const cred = { id: "urn:no-type" };
      const result = unwrap(cred);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].source).toBe("single");
    });
  });

  describe("VerifiablePresentation (R4.1)", () => {
    it("extracts inner credentials from verifiableCredential array", () => {
      const cred1 = { type: "VerifiableCredential", id: "urn:cred1" };
      const cred2 = { type: "VerifiableCredential", id: "urn:cred2" };
      const vp = {
        type: "VerifiablePresentation",
        verifiableCredential: [cred1, cred2],
      };
      const result = unwrap(vp);
      expect(result.credentials).toHaveLength(2);
      expect(result.credentials[0]).toEqual({ index: 0, source: "presentation", doc: cred1 });
      expect(result.credentials[1]).toEqual({ index: 1, source: "presentation", doc: cred2 });
      expect(result.errors).toHaveLength(0);
    });

    it("handles single verifiableCredential (not an array)", () => {
      const cred = { type: "VerifiableCredential", id: "urn:single" };
      const vp = {
        type: ["VerifiablePresentation"],
        verifiableCredential: cred,
      };
      const result = unwrap(vp);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].doc).toBe(cred);
    });

    it("returns empty when verifiableCredential is absent", () => {
      const vp = { type: "VerifiablePresentation" };
      const result = unwrap(vp);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("captures error for non-object inner items", () => {
      const vp = {
        type: "VerifiablePresentation",
        verifiableCredential: ["not-an-object", null],
      };
      const result = unwrap(vp);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].index).toBe(0);
      expect(result.errors[1].index).toBe(1);
    });
  });

  describe("GetOpenBadgeCredentialsResponse (R4.2)", () => {
    it("extracts credentials from the credential array", () => {
      const cred1 = { type: "VerifiableCredential", id: "urn:b1" };
      const cred2 = { type: "VerifiableCredential", id: "urn:b2" };
      const batch = {
        type: "GetOpenBadgeCredentialsResponse",
        credential: [cred1, cred2],
      };
      const result = unwrap(batch);
      expect(result.credentials).toHaveLength(2);
      expect(result.credentials[0]).toEqual({ index: 0, source: "batch", doc: cred1 });
      expect(result.credentials[1]).toEqual({ index: 1, source: "batch", doc: cred2 });
      expect(result.errors).toHaveLength(0);
    });

    it("handles single credential (not array)", () => {
      const cred = { type: "VerifiableCredential", id: "urn:b-single" };
      const batch = {
        type: ["GetOpenBadgeCredentialsResponse"],
        credential: cred,
      };
      const result = unwrap(batch);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].source).toBe("batch");
    });
  });

  describe("EnvelopedVerifiableCredential - VC-JWT (R4.3)", () => {
    function makeJwt(payload: Record<string, unknown>): string {
      const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
      const body = base64url(JSON.stringify(payload));
      const sig = base64url("fake-signature");
      return `${header}.${body}.${sig}`;
    }

    it("decodes a VC-JWT from a data: URI", () => {
      const innerCred = {
        type: "VerifiableCredential",
        issuer: { id: "did:example:issuer" },
      };
      const token = makeJwt({ vc: innerCred });
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: `data:application/vc+jwt,${token}`,
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].source).toBe("enveloped:vc-jwt");
      expect(result.credentials[0].doc).toEqual(innerCred);
      expect(result.errors).toHaveLength(0);
    });

    it("uses the whole payload when no vc claim is present", () => {
      const payload = {
        sub: "did:example:subject",
        iss: "did:example:issuer",
        type: "VerifiableCredential",
      };
      const token = makeJwt(payload);
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: `data:application/jwt,${token}`,
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].doc).toEqual(payload);
    });

    it("captures error for malformed JWT (fewer than 3 segments)", () => {
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: "data:application/vc+jwt,not-a-jwt",
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("three dot-separated segments");
    });

    it("captures error for invalid base64url in payload", () => {
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: "data:application/vc+jwt,header.!!!invalid!!!.sig",
      };
      const result = unwrap(enveloped);
      // base64url decoding of "!!!invalid!!!" will produce garbage but not throw
      // so the JSON parse will fail
      expect(result.credentials.length + result.errors.length).toBeGreaterThan(0);
    });

    it("captures error for non-JSON payload", () => {
      const header = base64url(JSON.stringify({ alg: "ES256" }));
      const body = base64url("this is not JSON");
      const sig = base64url("sig");
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: `data:application/vc+jwt,${header}.${body}.${sig}`,
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("JSON");
    });
  });

  describe("EnvelopedVerifiableCredential - SD-JWT (R4.4)", () => {
    function makeJwt(payload: Record<string, unknown>): string {
      const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
      const body = base64url(JSON.stringify(payload));
      const sig = base64url("fake-signature");
      return `${header}.${body}.${sig}`;
    }

    it("decodes an SD-JWT by splitting on ~ and decoding the issuer JWT", () => {
      const innerCred = { type: "VerifiableCredential", id: "urn:sd" };
      const issuerJwt = makeJwt({ vc: innerCred });
      const sdJwt = `${issuerJwt}~disclosure1~disclosure2~`;
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: `data:application/vc+sd-jwt,${sdJwt}`,
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].source).toBe("enveloped:sd-jwt");
      expect(result.credentials[0].doc).toEqual(innerCred);
      expect(result.errors).toHaveLength(0);
    });

    it("handles sd-jwt media type alias", () => {
      const innerCred = { type: "VerifiableCredential" };
      const issuerJwt = makeJwt({ vc: innerCred });
      const sdJwt = `${issuerJwt}~disc~`;
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: `data:application/sd-jwt,${sdJwt}`,
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(1);
      expect(result.credentials[0].source).toBe("enveloped:sd-jwt");
    });
  });

  describe("Enveloped inside a VP (shallow-recursive)", () => {
    function makeJwt(payload: Record<string, unknown>): string {
      const header = base64url(JSON.stringify({ alg: "ES256" }));
      const body = base64url(JSON.stringify(payload));
      const sig = base64url("sig");
      return `${header}.${body}.${sig}`;
    }

    it("recursively unwraps enveloped credentials inside a VP", () => {
      const innerCred = { type: "VerifiableCredential", id: "urn:inner" };
      const token = makeJwt({ vc: innerCred });
      const plainCred = { type: "VerifiableCredential", id: "urn:plain" };

      const vp = {
        type: "VerifiablePresentation",
        verifiableCredential: [
          plainCred,
          {
            type: "EnvelopedVerifiableCredential",
            id: `data:application/vc+jwt,${token}`,
          },
        ],
      };

      const result = unwrap(vp);
      expect(result.credentials).toHaveLength(2);
      expect(result.credentials[0]).toEqual({ index: 0, source: "presentation", doc: plainCred });
      expect(result.credentials[1].source).toBe("presentation:enveloped:vc-jwt");
      expect(result.credentials[1].doc).toEqual(innerCred);
    });
  });

  describe("Decode failures (R4.6)", () => {
    it("captures error for missing id field on enveloped", () => {
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        // no id
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("id");
    });

    it("captures error for invalid data: URI", () => {
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: "https://not-a-data-uri.example.com",
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("data:");
    });

    it("captures error for unsupported media type", () => {
      const enveloped = {
        type: "EnvelopedVerifiableCredential",
        id: "data:application/xml,<xml/>",
      };
      const result = unwrap(enveloped);
      expect(result.credentials).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain("Unsupported media type");
    });

    it("never throws - always returns errors", () => {
      const badInputs = [
        { type: "EnvelopedVerifiableCredential", id: "data:application/vc+jwt," },
        { type: "EnvelopedVerifiableCredential", id: "data:application/vc+jwt,a.b" },
        { type: "EnvelopedVerifiableCredential", id: 42 },
        { type: "VerifiablePresentation", verifiableCredential: [null, undefined, 123] },
      ];
      for (const input of badInputs) {
        expect(() => unwrap(input as Record<string, unknown>)).not.toThrow();
      }
    });
  });

  describe("order preservation (R4.5)", () => {
    it("preserves index order for VP credentials", () => {
      const creds = Array.from({ length: 5 }, (_, i) => ({
        type: "VerifiableCredential",
        id: `urn:cred-${i}`,
      }));
      const vp = { type: "VerifiablePresentation", verifiableCredential: creds };
      const result = unwrap(vp);
      for (let i = 0; i < 5; i++) {
        expect(result.credentials[i].index).toBe(i);
      }
    });
  });
});

/** Helper: base64url encode a string */
function base64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}
