import { describe, expect, it } from "vitest";
import type { BoundConfig } from "../src/util/output-bounding.js";
import { boundArray, boundDocument } from "../src/util/output-bounding.js";

describe("Output_Bounding_Utility", () => {
  describe("boundArray", () => {
    it("returns unbounded when items fit within maxBytes", () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const cfg: BoundConfig = { maxBytes: 1024 };
      const result = boundArray(items, cfg);
      expect(result.bounded).toBe(false);
      if (!result.bounded) {
        expect(result.payload).toEqual(items);
      }
    });

    it("returns bounded with continuation token when items exceed maxBytes", () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i} with some extra text to increase size`,
      }));
      const cfg: BoundConfig = { maxBytes: 200 };
      const result = boundArray(items, cfg);
      expect(result.bounded).toBe(true);
      if (result.bounded) {
        expect(Array.isArray(result.payload)).toBe(true);
        expect((result.payload as unknown[]).length).toBeLessThan(items.length);
        expect((result.payload as unknown[]).length).toBeGreaterThan(0);
        expect(result.continuationToken).toBeDefined();
        expect(result.omitted.count).toBeGreaterThan(0);
      }
    });

    it("continuation token returns the next portion", () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        data: "x".repeat(20),
      }));
      // Set maxBytes so only a few items fit
      const cfg: BoundConfig = { maxBytes: 120 };
      const first = boundArray(items, cfg);
      expect(first.bounded).toBe(true);
      if (!first.bounded) return;

      expect(first.continuationToken).toBeDefined();
      const second = boundArray(items, cfg, first.continuationToken!);
      expect(second.bounded).toBe(true);
      if (!second.bounded) return;

      // Collect all portions
      const allItems: unknown[] = [...(first.payload as unknown[])];
      let token = first.continuationToken;
      while (token) {
        const next = boundArray(items, cfg, token);
        if (!next.bounded) break;
        allItems.push(...(next.payload as unknown[]));
        token = next.continuationToken;
      }
      // All items should be collected across pages
      expect(allItems.length).toBe(items.length);
      expect(allItems).toEqual(items);
    });

    it("throws on invalid continuation token", () => {
      const items = [{ id: 1 }];
      const cfg: BoundConfig = { maxBytes: 1024 };
      expect(() => boundArray(items, cfg, "not-valid-base64!!!")).toThrow(
        /Invalid continuation token/,
      );
    });

    it("throws on stale continuation token (hash mismatch)", () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const cfg: BoundConfig = { maxBytes: 30 };
      const first = boundArray(items, cfg);
      if (!first.bounded || !first.continuationToken) return;

      // Modify the items to create a hash mismatch
      const differentItems = [{ id: 99 }, { id: 100 }, { id: 101 }];
      expect(() => boundArray(differentItems, cfg, first.continuationToken!)).toThrow(
        /Stale continuation token/,
      );
    });

    it("measures UTF-8 byte length correctly for multibyte characters", () => {
      // Emoji and multi-byte chars take more bytes than characters
      const items = [{ text: "🎓🏆" }]; // Each emoji is 4 bytes
      const serialized = JSON.stringify(items);
      const byteLength = Buffer.byteLength(serialized, "utf-8");

      // If maxBytes is large enough for the serialization, should be unbounded
      const cfg: BoundConfig = { maxBytes: byteLength };
      const result = boundArray(items, cfg);
      expect(result.bounded).toBe(false);

      // If maxBytes is one byte less, should be bounded
      const cfgSmall: BoundConfig = { maxBytes: byteLength - 1 };
      const resultSmall = boundArray(items, cfgSmall);
      expect(resultSmall.bounded).toBe(true);
    });

    it("handles empty array", () => {
      const cfg: BoundConfig = { maxBytes: 100 };
      const result = boundArray([], cfg);
      expect(result.bounded).toBe(false);
      if (!result.bounded) {
        expect(result.payload).toEqual([]);
      }
    });
  });

  describe("boundDocument", () => {
    it("returns unbounded when document fits within maxBytes", () => {
      const doc = { id: "cred-1", type: "AchievementCredential" };
      const cfg: BoundConfig = { maxBytes: 1024 };
      const result = boundDocument(doc, cfg);
      expect(result.bounded).toBe(false);
      if (!result.bounded) {
        expect(result.payload).toEqual(doc);
      }
    });

    it("returns summary when document exceeds maxBytes", () => {
      const doc = {
        id: "cred-1",
        type: "AchievementCredential",
        credentialSubject: {
          id: "did:example:123",
          achievement: { name: "x".repeat(500) },
        },
        proof: { proofValue: "y".repeat(500) },
      };
      // maxBytes large enough that the summary fits, but the doc doesn't
      const cfg: BoundConfig = { maxBytes: 500 };
      const result = boundDocument(doc, cfg);
      expect(result.bounded).toBe(true);
      if (result.bounded) {
        expect(result.summary).toBeDefined();
        expect(result.summary).toContain("exceeds size cap");
        expect(result.omitted?.bytes).toBeGreaterThan(0);
        // Payload should be a summary object, not the original doc
        expect((result.payload as Record<string, unknown>)._type).toBe("document_summary");
      }
    });

    it("writes to sandbox file as last resort when summary exceeds maxBytes", () => {
      // Create a document with many keys so even the summary is large
      const doc: Record<string, unknown> = {};
      for (let i = 0; i < 200; i++) {
        doc[`key_${i}_${"a".repeat(50)}`] = "v".repeat(100);
      }
      // Set maxBytes extremely small so even the summary can't fit
      const cfg: BoundConfig = { maxBytes: 50 };
      const result = boundDocument(doc, cfg);
      expect(result.bounded).toBe(true);
      if (result.bounded) {
        expect(result.file).toBeDefined();
        expect(result.file?.path).toContain("sandbox");
        expect(result.file?.path).toContain("bounded-doc-");
      }
    });

    it("handles null document", () => {
      const cfg: BoundConfig = { maxBytes: 100 };
      const result = boundDocument(null, cfg);
      expect(result.bounded).toBe(false);
      if (!result.bounded) {
        expect(result.payload).toBeNull();
      }
    });

    it("handles array document", () => {
      const doc = [1, 2, 3];
      const cfg: BoundConfig = { maxBytes: 100 };
      const result = boundDocument(doc, cfg);
      expect(result.bounded).toBe(false);
      if (!result.bounded) {
        expect(result.payload).toEqual([1, 2, 3]);
      }
    });
  });
});
