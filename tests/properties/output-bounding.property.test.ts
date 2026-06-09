/**
 * Property-based tests for the Output_Bounding_Utility pagination round-trip.
 * Uses fast-check to verify that oversized results are flagged and remain fully
 * reachable through continuation tokens.
 *
 * **Validates: Requirements 8.2, 8.3, 11.2, 11.3**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BoundConfig } from "../../src/util/output-bounding.js";
import { boundArray, boundDocument } from "../../src/util/output-bounding.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Measure the UTF-8 byte length of a JSON-serialized value (mirrors the
 * implementation's own measurement).
 */
function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf-8");
}

/**
 * Collect all portions from a bounded result by following continuation tokens.
 * Returns the concatenated items across all pages.
 */
function collectAllPortions<T>(items: T[], cfg: BoundConfig): T[] {
  const collected: T[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = boundArray(items, cfg, cursor);

    if (!result.bounded) {
      // Shouldn't happen for oversized inputs, but handle gracefully
      collected.push(...(result.payload as T[]));
      break;
    }

    const portion = result.payload as T[];
    collected.push(...portion);

    if (!result.continuationToken) {
      // No more pages
      break;
    }
    cursor = result.continuationToken;
  }

  return collected;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate an arbitrary array of objects with sufficient size to exceed a
 * small maxBytes cap, ensuring the result is always bounded.
 */
const oversizedArrayArb = fc
  .tuple(
    // Array length: at least 5 items so there's guaranteed pagination
    fc.integer({ min: 5, max: 50 }),
    // Item content size: each item has a data field of variable length
    fc.integer({ min: 10, max: 100 }),
  )
  .chain(([length, contentSize]) =>
    fc.tuple(
      fc.array(
        fc.record({
          id: fc.integer({ min: 0, max: 10000 }),
          data: fc.string({ minLength: contentSize, maxLength: contentSize + 20 }),
        }),
        { minLength: length, maxLength: length },
      ),
      // maxBytes is chosen to be smaller than the total serialized array but
      // large enough to fit at least one item (item overhead ~contentSize + ~30 for JSON)
      fc.constant(contentSize + 80),
    ),
  );

// ---------------------------------------------------------------------------
// Property 25: Oversized results are flagged and remain fully reachable
//              through continuation
//
// For any array whose JSON serialization exceeds a given maxBytes:
//   1. The first call to boundArray returns bounded === true (R8.3)
//   2. Concatenating all portions via continuation tokens reconstructs the
//      full original array (R11.2, R11.3)
//   3. A stale token from a modified array throws (token validation)
//
// Feature: ob3-tooling-improvements, Property 25: Oversized results are flagged and remain fully reachable through continuation
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 25: Oversized results are flagged and remain fully reachable through continuation", () => {
  it("bounded === true is always set when array exceeds maxBytes", () => {
    fc.assert(
      fc.property(oversizedArrayArb, ([items, maxBytes]) => {
        const totalBytes = jsonByteLength(items);
        const cfg: BoundConfig = { maxBytes };

        // Only test cases where the array genuinely exceeds the cap
        fc.pre(totalBytes > maxBytes);

        const result = boundArray(items, cfg);

        // R8.3: the bounded flag must be true
        expect(result.bounded).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("concatenating all continuation portions reconstructs the full original array", () => {
    fc.assert(
      fc.property(oversizedArrayArb, ([items, maxBytes]) => {
        const totalBytes = jsonByteLength(items);
        const cfg: BoundConfig = { maxBytes };

        // Only test cases where the array genuinely exceeds the cap
        fc.pre(totalBytes > maxBytes);

        // R11.2, R11.3: follow all continuation tokens to reconstruct the array
        const collected = collectAllPortions(items, cfg);

        // The reconstructed array must equal the original
        expect(collected).toEqual(items);
        expect(collected.length).toBe(items.length);
      }),
      { numRuns: 100 },
    );
  });

  it("stale continuation tokens from modified arrays throw", () => {
    fc.assert(
      fc.property(
        oversizedArrayArb,
        fc.integer({ min: 0, max: 10000 }),
        ([items, maxBytes], extraId) => {
          const totalBytes = jsonByteLength(items);
          const cfg: BoundConfig = { maxBytes };

          // Only test cases where the array genuinely exceeds the cap
          fc.pre(totalBytes > maxBytes);

          // Get a valid token from the first call
          const first = boundArray(items, cfg);
          if (!first.bounded || !first.continuationToken) return;

          // Modify the array to invalidate the token
          const modifiedItems = [
            ...items,
            { id: extraId + 99999, data: "extra-item-to-invalidate-hash" },
          ];

          // Using the old token with the modified array should throw
          expect(() => boundArray(modifiedItems, cfg, first.continuationToken!)).toThrow(
            /Stale continuation token/,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("each page's portion is non-empty (except final page remainder)", () => {
    fc.assert(
      fc.property(oversizedArrayArb, ([items, maxBytes]) => {
        const totalBytes = jsonByteLength(items);
        const cfg: BoundConfig = { maxBytes };

        fc.pre(totalBytes > maxBytes);

        let cursor: string | undefined;
        let pageCount = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = boundArray(items, cfg, cursor);

          if (!result.bounded) break;

          const portion = result.payload as unknown[];
          pageCount++;

          // Every page with a continuation token must have at least one item
          // (the final page may be empty only if offset was at the end)
          if (result.continuationToken) {
            expect(
              portion.length,
              `Page ${pageCount} with a continuation token should be non-empty`,
            ).toBeGreaterThan(0);
          }

          if (!result.continuationToken) break;
          cursor = result.continuationToken;
        }

        // There must be at least 2 pages for an oversized array
        expect(pageCount).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 26: Reachable bounded results are not written to file
//
// While a bounded result remains accessible through continuation or summary
// access, the utility never writes to disk (R11.5).
//
// For boundArray: when bounding produces a continuation token (meaning the
// remaining items are reachable via pagination), the file field must never
// be present in the result.
//
// For boundDocument: when the document's summary fits within maxBytes, the
// file field must never be present in the result.
//
// Feature: ob3-tooling-improvements, Property 26: Reachable bounded results are not written to file
// ---------------------------------------------------------------------------

describe("Feature: ob3-tooling-improvements, Property 26: Reachable bounded results are not written to file", () => {
  /**
   * **Validates: Requirements 11.5**
   *
   * For boundArray: generate arrays where bounding produces continuation
   * tokens (results are reachable through pagination). Assert that the
   * `file` field is never set in the BoundResult.
   */
  it("boundArray never sets file when results are reachable via continuation tokens", () => {
    // Generate arrays with items small enough to fit individually within
    // the maxBytes cap, so continuation tokens are produced (not file fallback).
    const reachableArrayArb = fc
      .tuple(fc.integer({ min: 3, max: 40 }), fc.integer({ min: 5, max: 50 }))
      .chain(([length, contentSize]) =>
        fc.tuple(
          fc.array(
            fc.record({
              id: fc.integer({ min: 0, max: 10000 }),
              label: fc.string({ minLength: contentSize, maxLength: contentSize + 10 }),
            }),
            { minLength: length, maxLength: length },
          ),
          // maxBytes large enough to fit at least one item but not the whole array.
          // Each item is roughly contentSize + ~30 bytes for JSON overhead.
          // Setting maxBytes to ~2x the item size ensures individual items fit,
          // so continuation tokens are used instead of file writes.
          fc.constant((contentSize + 50) * 2),
        ),
      );

    fc.assert(
      fc.property(reachableArrayArb, ([items, maxBytes]) => {
        const totalBytes = jsonByteLength(items);
        const cfg: BoundConfig = { maxBytes };

        // Precondition: array must exceed the cap (so bounding occurs)
        fc.pre(totalBytes > maxBytes);

        // Follow all continuation pages and assert no page ever sets `file`
        let cursor: string | undefined;
        let pagesWithToken = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = boundArray(items, cfg, cursor);

          if (!result.bounded) break;

          // When a continuation token is present, results are reachable —
          // the file field must not be set (R11.5)
          if (result.continuationToken) {
            pagesWithToken++;
            expect(
              result.file,
              "file must not be set when results are reachable via continuation",
            ).toBeUndefined();
          }

          if (!result.continuationToken) break;
          cursor = result.continuationToken;
        }

        // There must be at least one page with a continuation token
        expect(pagesWithToken).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 11.5**
   *
   * For boundDocument: when the document exceeds maxBytes but its summary
   * fits within maxBytes, the result should not contain a file field because
   * the content is accessible through the summary.
   */
  it("boundDocument never sets file when summary fits within maxBytes", () => {
    // Generate documents whose serialization exceeds a small cap, but whose
    // structural summary (keys + types + sizes metadata) fits within a larger
    // cap. This ensures bounding happens via summary, not file write.
    //
    // Strategy: create an object with many keys of large string values.
    // Set maxBytes between the summary size and the document size.
    const summaryFitsArb = fc
      .tuple(fc.integer({ min: 4, max: 8 }), fc.integer({ min: 100, max: 300 }))
      .chain(([keyCount, valueSize]) =>
        fc.tuple(
          // Build an object with N keys, each having a value of roughly valueSize bytes
          fc.record(
            Object.fromEntries(
              Array.from({ length: keyCount }, (_, i) => [
                `key${i}`,
                fc.string({ minLength: valueSize, maxLength: valueSize + 20 }),
              ]),
            ),
          ),
          fc.constant(keyCount),
          fc.constant(valueSize),
        ),
      );

    fc.assert(
      fc.property(summaryFitsArb, ([doc, keyCount]) => {
        const docBytes = jsonByteLength(doc);

        // Set maxBytes to a value smaller than the document but large enough
        // for the summary. The summary for an object with N keys contains
        // metadata (~100 bytes per key + fixed overhead), so a cap of
        // ~200 * keyCount should accommodate the summary while being smaller
        // than the full document.
        const maxBytes = Math.min(200 * keyCount, docBytes - 1);

        // Precondition: maxBytes must be positive and less than doc size
        fc.pre(maxBytes > 50);
        fc.pre(docBytes > maxBytes);

        const cfg: BoundConfig = { maxBytes };
        const result = boundDocument(doc, cfg);

        // If the result is bounded and has a summary (meaning summary access
        // makes the content reachable), no file should be written (R11.5)
        if (result.bounded && result.summary) {
          expect(
            result.file,
            "file must not be set when summary provides access to bounded content",
          ).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 11.5**
   *
   * Across all continuation pages of a bounded array, if every page
   * successfully returns items (no zero-item pages requiring file fallback),
   * then no page should have a file field set.
   */
  it("no file field across all reachable continuation pages", () => {
    // Use the oversized array arbitrary from Property 25 but with items that
    // individually fit within the cap (ensuring continuation, not file fallback)
    const paginatableArb = fc
      .tuple(fc.integer({ min: 5, max: 30 }), fc.integer({ min: 10, max: 40 }))
      .chain(([length, contentSize]) =>
        fc.tuple(
          fc.array(
            fc.record({
              id: fc.integer({ min: 0, max: 9999 }),
              value: fc.string({ minLength: contentSize, maxLength: contentSize + 5 }),
            }),
            { minLength: length, maxLength: length },
          ),
          // maxBytes is set so individual items fit but not the whole array
          fc.constant((contentSize + 40) * 3),
        ),
      );

    fc.assert(
      fc.property(paginatableArb, ([items, maxBytes]) => {
        const totalBytes = jsonByteLength(items);
        const cfg: BoundConfig = { maxBytes };

        fc.pre(totalBytes > maxBytes);

        // Iterate all pages and assert no file field appears anywhere
        let cursor: string | undefined;
        const allPages: Array<{ bounded: boolean; file?: unknown }> = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = boundArray(items, cfg, cursor);

          if (!result.bounded) break;

          allPages.push(result);

          // R11.5: while results are reachable through continuation, no file
          if (result.continuationToken) {
            expect(
              result.file,
              `Page ${allPages.length} must not write to file while continuation is available`,
            ).toBeUndefined();
          }

          if (!result.continuationToken) break;
          cursor = result.continuationToken;
        }

        // Ensure we actually paginated
        expect(allPages.length).toBeGreaterThanOrEqual(2);
      }),
      { numRuns: 100 },
    );
  });
});
