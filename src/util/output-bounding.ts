import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getBaseDataDir } from "../config.js";

/**
 * Output_Bounding_Utility — shared module that caps response size and provides
 * continuation/pagination or summary-plus-drill-down access to large results.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6
 */

export type BoundConfig = { maxBytes: number };

export type BoundResult<T> =
  | { bounded: false; payload: T }
  | {
      bounded: true;
      payload: unknown; // first portion or summary
      continuationToken?: string; // opaque cursor for next portion
      summary?: string; // when results are summarized rather than paged
      omitted: { count?: number; bytes?: number };
      file?: { path: string }; // last-resort only (R11.6)
    };

/** Internal token structure encoded as base64 JSON */
interface ContinuationTokenPayload {
  offset: number;
  total: number;
  hash: string;
}

/**
 * Compute a stable hash of the full item list for token validation.
 * Uses SHA-256 over the JSON serialization.
 */
function computeArrayHash<T>(items: T[]): string {
  const serialized = JSON.stringify(items);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

/**
 * Measure the UTF-8 byte length of a JSON-serialized value.
 */
function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf-8");
}

/**
 * Encode a continuation token as an opaque base64 string.
 */
function encodeToken(payload: ContinuationTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

/**
 * Decode and validate a continuation token. Returns null if invalid.
 */
function decodeToken(token: string): ContinuationTokenPayload | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.offset === "number" &&
      typeof parsed.total === "number" &&
      typeof parsed.hash === "string"
    ) {
      return parsed as ContinuationTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the sandbox-reachable file path for last-resort file writes (R11.6).
 */
function resolveSandboxPath(filename: string): string {
  const sandboxDir = join(getBaseDataDir(), "sandbox");
  mkdirSync(sandboxDir, { recursive: true });
  return join(sandboxDir, filename);
}

/**
 * Bound an array of items to fit within the configured maxBytes.
 *
 * For list-shaped results, emits as many leading items as fit under the cap and
 * returns an opaque continuationToken encoding the next offset. Supplying that
 * token returns the next portion starting after the encoded position.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.5
 */
export function boundArray<T>(items: T[], cfg: BoundConfig, cursor?: string): BoundResult<T[]> {
  const totalBytes = jsonByteLength(items);

  // If the entire array fits, return unbounded
  if (!cursor && totalBytes <= cfg.maxBytes) {
    return { bounded: false, payload: items };
  }

  const hash = computeArrayHash(items);
  let startOffset = 0;

  // If a cursor is supplied, validate and extract offset
  if (cursor) {
    const tokenPayload = decodeToken(cursor);
    if (!tokenPayload) {
      throw new Error("Invalid continuation token: unable to decode");
    }
    if (tokenPayload.hash !== hash) {
      throw new Error(
        "Stale continuation token: the result set has changed since the token was issued",
      );
    }
    if (tokenPayload.total !== items.length) {
      throw new Error("Stale continuation token: total item count has changed");
    }
    startOffset = tokenPayload.offset;
    if (startOffset >= items.length) {
      // Already past the end — return empty bounded result
      return {
        bounded: true,
        payload: [],
        omitted: { count: 0, bytes: 0 },
      };
    }
  }

  // Find how many items from startOffset fit within the byte cap
  const portion: T[] = [];
  let currentBytes = 0;
  // Account for the array wrapper overhead: `[]` is 2 bytes, each separator `,` is 1 byte
  const arrayWrapperBytes = 2; // `[` and `]`
  currentBytes += arrayWrapperBytes;

  for (let i = startOffset; i < items.length; i++) {
    const itemBytes = jsonByteLength(items[i]);
    const separatorBytes = portion.length > 0 ? 1 : 0; // comma separator
    const candidateBytes = currentBytes + separatorBytes + itemBytes;

    if (candidateBytes > cfg.maxBytes) {
      break;
    }
    portion.push(items[i]);
    currentBytes = candidateBytes;
  }

  // If no items fit at all, handle single-item-too-large case
  if (portion.length === 0 && startOffset < items.length) {
    // Last resort: write the oversized item to a file (R11.6)
    const itemToWrite = items[startOffset];
    const filename = `bounded-item-${Date.now()}-${startOffset}.json`;
    const filePath = resolveSandboxPath(filename);
    const content = JSON.stringify(itemToWrite, null, 2);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf-8");

    const nextOffset = startOffset + 1;
    const hasMore = nextOffset < items.length;

    return {
      bounded: true,
      payload: [],
      continuationToken: hasMore
        ? encodeToken({ offset: nextOffset, total: items.length, hash })
        : undefined,
      omitted: {
        count: items.length - startOffset,
        bytes: jsonByteLength(items.slice(startOffset)),
      },
      file: { path: filePath },
    };
  }

  const endOffset = startOffset + portion.length;
  const remainingCount = items.length - endOffset;
  const hasMore = endOffset < items.length;

  return {
    bounded: true,
    payload: portion,
    continuationToken: hasMore
      ? encodeToken({ offset: endOffset, total: items.length, hash })
      : undefined,
    omitted: {
      count: remainingCount,
      bytes: remainingCount > 0 ? jsonByteLength(items.slice(endOffset)) : 0,
    },
  };
}

/**
 * Bound an indivisible document to fit within the configured maxBytes.
 *
 * For a single large credential document, returns a summary (top-level keys,
 * coverage, sizes) plus a continuation/drill-down handle rather than truncating
 * the JSON into invalid output.
 *
 * Requirements: 11.1, 11.5, 11.6
 */
export function boundDocument(doc: unknown, cfg: BoundConfig): BoundResult<unknown> {
  const totalBytes = jsonByteLength(doc);

  // If the document fits, return unbounded
  if (totalBytes <= cfg.maxBytes) {
    return { bounded: false, payload: doc };
  }

  // Build a summary of the document structure
  const summary = buildDocumentSummary(doc, totalBytes);
  const summaryBytes = jsonByteLength(summary);

  // If the summary itself fits under the cap, return summary (R11.5: avoid files)
  if (summaryBytes <= cfg.maxBytes) {
    return {
      bounded: true,
      payload: summary,
      summary: `Document exceeds size cap (${totalBytes} bytes > ${cfg.maxBytes} bytes). Summary provided with top-level structure.`,
      omitted: { bytes: totalBytes },
    };
  }

  // Last resort: summary doesn't fit either — write to sandbox file (R11.6)
  const filename = `bounded-doc-${Date.now()}.json`;
  const filePath = resolveSandboxPath(filename);
  const content = JSON.stringify(doc, null, 2);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");

  return {
    bounded: true,
    payload: { _note: "Document written to file", path: filePath },
    summary: `Document exceeds size cap (${totalBytes} bytes > ${cfg.maxBytes} bytes). Written to sandbox file.`,
    omitted: { bytes: totalBytes },
    file: { path: filePath },
  };
}

/**
 * Build a structural summary of a document showing top-level keys, types, and sizes.
 */
function buildDocumentSummary(doc: unknown, totalBytes: number): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    _type: "document_summary",
    totalBytes,
  };

  if (doc === null || doc === undefined) {
    summary.value = doc;
    return summary;
  }

  if (typeof doc !== "object") {
    summary.valueType = typeof doc;
    return summary;
  }

  if (Array.isArray(doc)) {
    summary.valueType = "array";
    summary.length = doc.length;
    summary.elementSizes = doc.map((item) => jsonByteLength(item));
    return summary;
  }

  // Object: enumerate top-level keys with their types and sizes
  const keys = Object.keys(doc);
  summary.keyCount = keys.length;
  summary.keys = keys.map((key) => {
    const value = (doc as Record<string, unknown>)[key];
    const entry: Record<string, unknown> = {
      key,
      type: Array.isArray(value) ? "array" : typeof value,
      bytes: jsonByteLength(value),
    };
    if (Array.isArray(value)) {
      entry.length = value.length;
    }
    return entry;
  });

  return summary;
}
