/**
 * Class-subset targeting for the Credential Generator.
 *
 * When `targetClasses` is specified in GenerationConfig, this module:
 * 1. Validates each target name against the TypeGraph (R6.2)
 * 2. Computes the required closure — targets plus schema-required classes
 *    plus classes on any path from root to a target (R6.1)
 * 3. Provides an allowed-set that restricts traversal/synthesis (R6.1)
 * 4. Reports which of the requested targets were exercised (R6.3)
 *
 * When targetClasses is absent, no filtering is applied (R6.4).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import type { ActivePath, GeneratorError, TypeGraph } from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of computing the class targeting closure.
 * Contains the set of allowed classes for traversal.
 */
export type TargetingResult = { ok: true; allowedClasses: Set<string> } | GeneratorError;

/**
 * Coverage extension for targeted generation.
 */
export type TargetedCoverage = {
  requested: string[];
  exercised: string[];
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that every name in `targetClasses` exists in the TypeGraph.
 * Returns a GeneratorError naming the first unknown class if any is absent (R6.2).
 */
export function validateTargetClasses(
  targetClasses: string[],
  graph: TypeGraph,
): GeneratorError | null {
  for (const className of targetClasses) {
    if (!graph.nodes.has(className)) {
      return {
        ok: false,
        error: `Unknown target class: ${className}`,
        path: [className],
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Closure computation
// ---------------------------------------------------------------------------

/**
 * Compute the required closure for class-subset targeting.
 *
 * The closure includes:
 * - All classes in `targetClasses`
 * - All classes on any required (schema-mandated) path from the root
 * - All classes on any path from root to a target class (including optional
 *   edges that lead toward a target)
 *
 * This ensures the generated credential:
 * 1. Still satisfies OB3 schema (required edges are always included)
 * 2. Includes the targeted classes and everything needed to reach them
 *
 * @param targetClasses - The requested target class names (already validated)
 * @param graph - The fully built TypeGraph
 * @returns A TargetingResult with the allowed class set on success
 */
export function computeTargetingClosure(
  targetClasses: string[],
  graph: TypeGraph,
): TargetingResult {
  // Validate targets first
  const validationError = validateTargetClasses(targetClasses, graph);
  if (validationError) {
    return validationError;
  }

  const keep = new Set<string>();

  // Always include the root class
  keep.add(graph.rootClass);

  // Step 1: Collect all classes on required paths from root (schema-mandated).
  // These must always be included so the result validates.
  collectRequiredClasses(graph.rootClass, graph, keep);

  // Step 2: For each target, find a path from the root to the target and
  // include all classes along that path.
  for (const target of targetClasses) {
    const path = findPathToTarget(graph.rootClass, target, graph);
    if (path) {
      for (const className of path) {
        keep.add(className);
      }
    }
    // Always include the target itself
    keep.add(target);
  }

  return { ok: true, allowedClasses: keep };
}

/**
 * Recursively collect all classes reachable via required edges from a given node.
 * These are schema-mandated and must always be populated.
 */
function collectRequiredClasses(
  className: string,
  graph: TypeGraph,
  result: Set<string>,
  visited?: Set<string>,
): void {
  const seen = visited ?? new Set<string>();
  if (seen.has(className)) return;
  seen.add(className);

  const node = graph.nodes.get(className);
  if (!node) return;

  for (const edge of node.properties.values()) {
    if (edge.isRequired) {
      result.add(edge.targetClass);
      collectRequiredClasses(edge.targetClass, graph, result, seen);
    }
  }
}

/**
 * Find a path from `start` to `target` in the TypeGraph using BFS.
 * Returns the ordered list of class names on the path (inclusive of start and target),
 * or null if no path exists.
 */
function findPathToTarget(start: string, target: string, graph: TypeGraph): string[] | null {
  if (start === target) return [start];

  // BFS to find shortest path
  const queue: Array<{ node: string; path: string[] }> = [{ node: start, path: [start] }];
  const visited = new Set<string>([start]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = graph.nodes.get(current.node);
    if (!node) continue;

    for (const edge of node.properties.values()) {
      if (visited.has(edge.targetClass)) continue;
      visited.add(edge.targetClass);

      const newPath = [...current.path, edge.targetClass];

      if (edge.targetClass === target) {
        return newPath;
      }

      queue.push({ node: edge.targetClass, path: newPath });
    }
  }

  // No path found (target is isolated or unreachable)
  return null;
}

// ---------------------------------------------------------------------------
// Traversal filtering
// ---------------------------------------------------------------------------

/**
 * Filter an ActivePath to include only nodes and edges within the allowed set.
 * This is used when the traversal engine has already produced a full path and
 * we need to restrict it to the targeting closure.
 */
export function filterActivePathToAllowed(
  activePath: ActivePath,
  allowedClasses: Set<string>,
): ActivePath {
  return {
    nodes: activePath.nodes.filter((n) => allowedClasses.has(n)),
    edges: activePath.edges.filter((e) => allowedClasses.has(e.from) && allowedClasses.has(e.to)),
  };
}

/**
 * Determine whether a class should be traversed given the allowed set.
 * Used by the traversal engine to skip classes not in the targeting closure.
 */
export function isClassAllowed(
  className: string,
  allowedClasses: Set<string> | undefined,
): boolean {
  // When no targeting is active, all classes are allowed (R6.4)
  if (!allowedClasses) return true;
  return allowedClasses.has(className);
}

// ---------------------------------------------------------------------------
// Coverage reporting
// ---------------------------------------------------------------------------

/**
 * Compute the targeted classes coverage by intersecting the requested targets
 * with the actually exercised classes from the active path (R6.3).
 */
export function computeTargetedCoverage(
  targetClasses: string[],
  activePath: ActivePath,
): TargetedCoverage {
  const exercisedSet = new Set(activePath.nodes);
  const exercised = targetClasses.filter((t) => exercisedSet.has(t));

  return {
    requested: [...targetClasses],
    exercised,
  };
}
