import { describe, expect, it } from "vitest";
import {
  bestWindowLevenshtein,
  buildFts4MatchQuery,
  buildLikePatterns,
  combinedSimilarity,
  DEFAULT_SIMILARITY_FLOOR,
  jaccardSimilarity,
  normalizedLevenshtein,
  rerank,
  tokenize,
  tokenizeAndFilter,
} from "../src/spec/fuzzy.js";

describe("fuzzy.ts - tokenization", () => {
  it("tokenizes text into lowercase words", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  it("strips punctuation and digits", () => {
    expect(tokenize("can't do 42 things!")).toEqual(["can", "t", "do", "things"]);
  });

  it("handles empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles special characters only", () => {
    expect(tokenize("!@#$%")).toEqual([]);
  });
});

describe("fuzzy.ts - tokenizeAndFilter", () => {
  it("removes stopwords", () => {
    const result = tokenizeAndFilter("the credential is valid");
    expect(result).toEqual(["credential", "valid"]);
  });

  it("deduplicates tokens", () => {
    const result = tokenizeAndFilter("credential credential credential");
    expect(result).toEqual(["credential"]);
  });

  it("returns empty array when all words are stopwords", () => {
    const result = tokenizeAndFilter("the is a an");
    expect(result).toEqual([]);
  });

  it("preserves order of first occurrence", () => {
    const result = tokenizeAndFilter("revocation status credential");
    expect(result).toEqual(["revocation", "status", "credential"]);
  });
});

describe("fuzzy.ts - buildFts4MatchQuery", () => {
  it("builds OR/prefix query from tokens", () => {
    const query = buildFts4MatchQuery(["credential", "revocation"]);
    expect(query).toBe("credential* OR revocation*");
  });

  it("handles single token", () => {
    const query = buildFts4MatchQuery(["credential"]);
    expect(query).toBe("credential*");
  });

  it("returns null for empty tokens", () => {
    expect(buildFts4MatchQuery([])).toBeNull();
  });
});

describe("fuzzy.ts - buildLikePatterns", () => {
  it("wraps each token with wildcards", () => {
    const patterns = buildLikePatterns(["credential", "revoke"]);
    expect(patterns).toEqual(["%credential%", "%revoke%"]);
  });

  it("returns empty array for no tokens", () => {
    expect(buildLikePatterns([])).toEqual([]);
  });
});

describe("fuzzy.ts - jaccardSimilarity", () => {
  it("returns 1 for identical token sets", () => {
    expect(jaccardSimilarity(["a", "b"], ["a", "b"])).toBe(1);
  });

  it("returns 0 for disjoint token sets", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 1 for two empty sets", () => {
    expect(jaccardSimilarity([], [])).toBe(1);
  });

  it("returns 0 when one set is empty", () => {
    expect(jaccardSimilarity(["a"], [])).toBe(0);
  });

  it("computes correct partial overlap", () => {
    // {a, b, c} ∩ {b, c, d} = {b, c} → 2/4 = 0.5
    expect(jaccardSimilarity(["a", "b", "c"], ["b", "c", "d"])).toBe(0.5);
  });
});

describe("fuzzy.ts - normalizedLevenshtein", () => {
  it("returns 1 for identical strings", () => {
    expect(normalizedLevenshtein("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different strings of same length", () => {
    // "abc" vs "xyz" → distance 3, maxLen 3 → 1 - 3/3 = 0
    expect(normalizedLevenshtein("abc", "xyz")).toBe(0);
  });

  it("returns 1 for two empty strings", () => {
    expect(normalizedLevenshtein("", "")).toBe(1);
  });

  it("handles one empty string", () => {
    expect(normalizedLevenshtein("abc", "")).toBe(0);
  });

  it("returns a value between 0 and 1 for similar strings", () => {
    const score = normalizedLevenshtein("revoke", "revocation");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("fuzzy.ts - bestWindowLevenshtein", () => {
  it("finds exact substring match", () => {
    const score = bestWindowLevenshtein("credential", "the credential must be valid");
    expect(score).toBe(1);
  });

  it("returns 1 for identical strings", () => {
    expect(bestWindowLevenshtein("hello", "hello")).toBe(1);
  });

  it("finds best match in a longer candidate", () => {
    const score = bestWindowLevenshtein("revoke", "revocation of credentials");
    expect(score).toBeGreaterThan(0.5);
  });
});

describe("fuzzy.ts - combinedSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(combinedSimilarity("hello world", "hello world")).toBe(1);
  });

  it("returns > 0 for related phrasing", () => {
    const score = combinedSimilarity(
      "credential revocation",
      "the revocation of a credential is required",
    );
    expect(score).toBeGreaterThan(0);
  });

  it("returns low score for unrelated content", () => {
    const score = combinedSimilarity("credential revocation", "the weather is sunny today");
    expect(score).toBeLessThan(DEFAULT_SIMILARITY_FLOOR);
  });
});

describe("fuzzy.ts - rerank", () => {
  const candidates = [
    { text: "the weather is sunny today" },
    { text: "credential revocation status checking" },
    { text: "revoke a credential immediately" },
    { text: "completely unrelated pizza recipe" },
  ];

  it("filters out candidates below similarity floor", () => {
    const results = rerank("credential revocation", candidates, (c) => c.text);
    // Unrelated candidates should be filtered out
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(DEFAULT_SIMILARITY_FLOOR);
    }
  });

  it("sorts by descending score", () => {
    const results = rerank("credential revocation", candidates, (c) => c.text);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("returns empty array when no candidates pass the floor", () => {
    const results = rerank("xyz quantum physics", candidates, (c) => c.text);
    expect(results).toEqual([]);
  });

  it("respects custom similarity floor", () => {
    const results = rerank("credential revocation", candidates, (c) => c.text, 0.9);
    // With a very high floor, most candidates should be filtered
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("exact match scores highest", () => {
    const exactCandidates = [
      { text: "something about credentials" },
      { text: "credential revocation" },
      { text: "revocation process for credentials" },
    ];
    const results = rerank("credential revocation", exactCandidates, (c) => c.text);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.text).toBe("credential revocation");
    expect(results[0].score).toBe(1);
  });
});
