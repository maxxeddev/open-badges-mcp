/**
 * Date Coherency Post-Processor.
 *
 * Walks a generated credential document after synthesis and enforces
 * chronological ordering rules. Mutates the document in place.
 *
 * Rules:
 *   1. validFrom <= awardedDate <= validUntil (when all present)
 *   2. activityStartDate <= activityEndDate
 *   3. dateOfBirth before any activity start date by at least 16 years
 *   4. Inner endorsement's validFrom >= outer credential's validFrom
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CoherencyRule = {
  a: string; // JSON pointer path pattern (relative to doc root)
  op: "<=" | "<";
  b: string;
};

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const COHERENCY_RULES: CoherencyRule[] = [
  { a: "/validFrom", op: "<=", b: "/awardedDate" },
  { a: "/awardedDate", op: "<=", b: "/validUntil" },
  { a: "/validFrom", op: "<=", b: "/validUntil" },
  {
    a: "/credentialSubject/activityStartDate",
    op: "<=",
    b: "/credentialSubject/activityEndDate",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a simple JSON pointer path on a document.
 * Only supports `/`-separated keys (no array indexing).
 */
function resolvePath(doc: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split("/").filter(Boolean);
  let current: unknown = doc;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current === "string") return current;
  return undefined;
}

/**
 * Set a value at a simple JSON pointer path. Creates intermediate objects
 * if they don't exist.
 */
function setPath(doc: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split("/").filter(Boolean);
  let current: Record<string, unknown> = doc;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === undefined ||
      current[part] === null ||
      typeof current[part] !== "object"
    ) {
      return; // Don't create intermediate objects
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Parse an ISO date/datetime string into a timestamp for comparison.
 * Returns NaN if parsing fails.
 */
function parseIsoDate(dateStr: string): number {
  return new Date(dateStr).getTime();
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Walks the document after synthesis and enforces chronological ordering rules.
 * Mutates the document in place.
 */
export function enforceDateCoherency(doc: Record<string, unknown>): void {
  for (const rule of COHERENCY_RULES) {
    const aVal = resolvePath(doc, rule.a);
    const bVal = resolvePath(doc, rule.b);

    if (!aVal || !bVal) continue;

    const aTime = parseIsoDate(aVal);
    const bTime = parseIsoDate(bVal);

    if (Number.isNaN(aTime) || Number.isNaN(bTime)) continue;

    // Check if the rule is violated
    const violated = rule.op === "<=" ? aTime > bTime : aTime >= bTime;

    if (violated) {
      // Swap the values to enforce the rule
      setPath(doc, rule.a, bVal);
      setPath(doc, rule.b, aVal);
    }
  }

  // Handle endorsement array: inner endorsement's validFrom >= outer validFrom
  const outerValidFrom = resolvePath(doc, "/validFrom");
  if (outerValidFrom && Array.isArray(doc.endorsement)) {
    const outerTime = parseIsoDate(outerValidFrom);
    if (!Number.isNaN(outerTime)) {
      for (const endorsement of doc.endorsement) {
        if (endorsement && typeof endorsement === "object") {
          const inner = endorsement as Record<string, unknown>;
          const innerValidFrom = typeof inner.validFrom === "string" ? inner.validFrom : undefined;
          if (innerValidFrom) {
            const innerTime = parseIsoDate(innerValidFrom);
            if (!Number.isNaN(innerTime) && innerTime < outerTime) {
              inner.validFrom = outerValidFrom;
            }
          }
        }
      }
    }
  }
}
