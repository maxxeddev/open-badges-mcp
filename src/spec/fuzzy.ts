/**
 * Fuzzy matching utilities for conformance requirement lookup.
 *
 * Provides tokenization, stopword filtering, FTS4 query construction,
 * LIKE fallback, and lexical re-ranking (Jaccard + normalized Levenshtein).
 * Designed to work with sql.js/FTS4 (no FTS5 features required).
 */

// --- Stopwords ---

/**
 * Common English stopwords to filter from search queries.
 * Kept minimal to avoid removing semantically important spec terms.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "of",
  "in",
  "to",
  "for",
  "with",
  "on",
  "at",
  "by",
  "from",
  "as",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "and",
  "but",
  "or",
  "nor",
  "not",
  "so",
  "yet",
  "both",
  "either",
  "neither",
  "each",
  "every",
  "all",
  "any",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "just",
  "because",
  "if",
  "when",
  "where",
  "how",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "they",
  "them",
  "we",
  "you",
  "i",
  "me",
  "my",
  "your",
  "his",
  "her",
  "our",
  "their",
  "about",
]);

// --- Tokenization ---

/**
 * Tokenize a string into lowercase alphabetic words.
 * Strips punctuation and digits, splits on whitespace/non-alpha boundaries.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Tokenize and remove stopwords from the input text.
 * Returns unique tokens in appearance order.
 */
export function tokenizeAndFilter(text: string): string[] {
  const tokens = tokenize(text);
  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const t of tokens) {
    if (!STOPWORDS.has(t) && !seen.has(t)) {
      seen.add(t);
      filtered.push(t);
    }
  }
  return filtered;
}

// --- FTS4 Query Construction ---

/**
 * Build an FTS4 MATCH query from filtered tokens.
 * Each token is OR'd and gets prefix matching (token*) so
 * "revoke" matches "revocation".
 *
 * Returns null if no usable tokens remain after filtering.
 */
export function buildFts4MatchQuery(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  // FTS4 OR query with prefix matching on each token
  return tokens.map((t) => `${t}*`).join(" OR ");
}

/**
 * Build a set of SQL LIKE patterns for fallback per-token scanning.
 * Each pattern wraps the token with wildcards: %token%
 */
export function buildLikePatterns(tokens: string[]): string[] {
  return tokens.map((t) => `%${t}%`);
}

// --- Similarity Scoring ---

/**
 * Compute Jaccard similarity between two sets of tokens.
 * Returns a value between 0 and 1.
 */
export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute the normalized Levenshtein distance between two strings.
 * Returns a similarity value between 0 (completely different) and 1 (identical).
 */
export function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Standard Levenshtein distance using a two-row DP approach.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows for space efficiency
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Compute the best-window normalized Levenshtein similarity.
 * Slides a window of `topic.length` characters over `candidate` and returns
 * the best (highest) normalized Levenshtein score found.
 * This captures partial matches where the topic text appears within a longer sentence.
 */
export function bestWindowLevenshtein(topic: string, candidate: string): number {
  const topicLower = topic.toLowerCase();
  const candidateLower = candidate.toLowerCase();

  if (candidateLower.length <= topicLower.length) {
    return normalizedLevenshtein(topicLower, candidateLower);
  }

  const windowSize = topicLower.length;
  let bestScore = 0;

  // Slide window and find the best matching substring
  for (let i = 0; i <= candidateLower.length - windowSize; i++) {
    const window = candidateLower.slice(i, i + windowSize);
    const score = normalizedLevenshtein(topicLower, window);
    if (score > bestScore) {
      bestScore = score;
    }
    // Early exit on perfect match
    if (bestScore === 1) return 1;
  }

  return bestScore;
}

/**
 * Compute a combined similarity score for a candidate sentence against the topic.
 * Combines Jaccard token overlap (weighted 0.6) with best-window normalized
 * Levenshtein (weighted 0.4) for a balanced relevance signal.
 */
export function combinedSimilarity(topic: string, candidate: string): number {
  const topicTokens = tokenize(topic);
  const candidateTokens = tokenize(candidate);

  const jaccard = jaccardSimilarity(topicTokens, candidateTokens);
  const levenshtein = bestWindowLevenshtein(topic, candidate);

  return 0.6 * jaccard + 0.4 * levenshtein;
}

// --- Re-ranking ---

/** Default similarity floor below which candidates are discarded */
export const DEFAULT_SIMILARITY_FLOOR = 0.15;

export interface ScoredCandidate<T> {
  item: T;
  score: number;
}

/**
 * Re-rank a list of candidate items by their similarity to the topic.
 * Applies a similarity floor and returns candidates sorted by descending score.
 *
 * @param topic - The search topic
 * @param candidates - Array of candidate items
 * @param getText - Function to extract the text to compare from each candidate
 * @param similarityFloor - Minimum score to include (defaults to DEFAULT_SIMILARITY_FLOOR)
 * @returns Candidates above the floor, sorted by descending score
 */
export function rerank<T>(
  topic: string,
  candidates: T[],
  getText: (item: T) => string,
  similarityFloor: number = DEFAULT_SIMILARITY_FLOOR,
): ScoredCandidate<T>[] {
  const scored: ScoredCandidate<T>[] = [];

  for (const item of candidates) {
    const text = getText(item);
    const score = combinedSimilarity(topic, text);
    if (score >= similarityFloor) {
      scored.push({ item, score });
    }
  }

  // Sort by descending score (most relevant first)
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
