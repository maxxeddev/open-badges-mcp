/**
 * Unit tests for class-targeting module.
 *
 * Tests: validation, closure computation, path filtering, and coverage reporting.
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { describe, expect, it } from "vitest";
import {
  computeTargetedCoverage,
  computeTargetingClosure,
  filterActivePathToAllowed,
  isClassAllowed,
  validateTargetClasses,
} from "../../src/generator/class-targeting.js";
import type { ActivePath, GraphEdge, GraphNode, TypeGraph } from "../../src/generator/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEdge(
  propertyName: string,
  targetClass: string,
  isRequired = false,
  isArray = false,
): GraphEdge {
  return {
    propertyName,
    targetClass,
    cardinality: {
      minOccurs: isRequired ? 1 : 0,
      maxOccurs: isArray ? "unbounded" : 1,
    },
    isRequired,
    isArray,
  };
}

function makeNode(name: string, edges: Array<[string, string, boolean?]> = []): GraphNode {
  const properties = new Map<string, GraphEdge>();
  for (const [propName, targetClass, isRequired] of edges) {
    properties.set(propName, makeEdge(propName, targetClass, isRequired ?? false));
  }
  return { name, properties, rawSchema: {} };
}

/**
 * Builds a simple test graph:
 *
 *   Root --required--> A --optional--> C
 *     |                |
 *     +--optional--> B +--optional--> D
 *
 * Root has a required edge to A and an optional edge to B.
 * A has optional edges to C and D.
 */
function buildTestGraph(): TypeGraph {
  const nodes = new Map<string, GraphNode>();

  nodes.set(
    "Root",
    makeNode("Root", [
      ["a", "A", true], // required
      ["b", "B", false], // optional
    ]),
  );
  nodes.set(
    "A",
    makeNode("A", [
      ["c", "C", false], // optional
      ["d", "D", false], // optional
    ]),
  );
  nodes.set("B", makeNode("B", []));
  nodes.set("C", makeNode("C", []));
  nodes.set("D", makeNode("D", []));

  return { nodes, rootClass: "Root" };
}

// ---------------------------------------------------------------------------
// validateTargetClasses
// ---------------------------------------------------------------------------

describe("validateTargetClasses", () => {
  const graph = buildTestGraph();

  it("returns null when all target classes exist in the graph", () => {
    expect(validateTargetClasses(["A", "B"], graph)).toBeNull();
  });

  it("returns null for an empty target list", () => {
    expect(validateTargetClasses([], graph)).toBeNull();
  });

  it("returns a GeneratorError naming the unknown class", () => {
    const result = validateTargetClasses(["A", "Unknown"], graph);
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(false);
    expect(result!.error).toContain("Unknown");
    expect(result!.path).toEqual(["Unknown"]);
  });

  it("reports the first unknown class when multiple are unknown", () => {
    const result = validateTargetClasses(["Missing1", "Missing2"], graph);
    expect(result).not.toBeNull();
    expect(result!.error).toContain("Missing1");
  });
});

// ---------------------------------------------------------------------------
// computeTargetingClosure
// ---------------------------------------------------------------------------

describe("computeTargetingClosure", () => {
  const graph = buildTestGraph();

  it("returns error for unknown target class", () => {
    const result = computeTargetingClosure(["Unknown"], graph);
    expect(result.ok).toBe(false);
  });

  it("always includes the root class", () => {
    const result = computeTargetingClosure(["B"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("Root")).toBe(true);
    }
  });

  it("always includes classes reachable via required edges", () => {
    // Root --required--> A, so A must always be in the closure
    const result = computeTargetingClosure(["B"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("A")).toBe(true);
    }
  });

  it("includes the target class itself", () => {
    const result = computeTargetingClosure(["C"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("C")).toBe(true);
    }
  });

  it("includes classes on the path from root to target", () => {
    // Path from Root to C: Root -> A -> C
    const result = computeTargetingClosure(["C"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("Root")).toBe(true);
      expect(result.allowedClasses.has("A")).toBe(true);
      expect(result.allowedClasses.has("C")).toBe(true);
    }
  });

  it("excludes unrelated optional classes not on a path to a target", () => {
    // Targeting only C — B and D are not on the path and not required
    const result = computeTargetingClosure(["C"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("B")).toBe(false);
      expect(result.allowedClasses.has("D")).toBe(false);
    }
  });

  it("handles multiple targets by unioning their paths", () => {
    const result = computeTargetingClosure(["B", "D"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      // B is directly reachable from Root
      expect(result.allowedClasses.has("B")).toBe(true);
      // D is reachable through A
      expect(result.allowedClasses.has("A")).toBe(true);
      expect(result.allowedClasses.has("D")).toBe(true);
    }
  });

  it("handles targeting the root class itself", () => {
    const result = computeTargetingClosure(["Root"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("Root")).toBe(true);
      // Required classes are still included
      expect(result.allowedClasses.has("A")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// filterActivePathToAllowed
// ---------------------------------------------------------------------------

describe("filterActivePathToAllowed", () => {
  it("retains only nodes and edges within the allowed set", () => {
    const activePath: ActivePath = {
      nodes: ["Root", "A", "B", "C"],
      edges: [
        { from: "Root", to: "A", propertyName: "a" },
        { from: "Root", to: "B", propertyName: "b" },
        { from: "A", to: "C", propertyName: "c" },
      ],
    };
    const allowed = new Set(["Root", "A", "C"]);

    const filtered = filterActivePathToAllowed(activePath, allowed);

    expect(filtered.nodes).toEqual(["Root", "A", "C"]);
    expect(filtered.edges).toEqual([
      { from: "Root", to: "A", propertyName: "a" },
      { from: "A", to: "C", propertyName: "c" },
    ]);
  });

  it("returns empty path when no nodes are allowed", () => {
    const activePath: ActivePath = {
      nodes: ["X", "Y"],
      edges: [{ from: "X", to: "Y", propertyName: "p" }],
    };
    const allowed = new Set(["Z"]);

    const filtered = filterActivePathToAllowed(activePath, allowed);

    expect(filtered.nodes).toEqual([]);
    expect(filtered.edges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isClassAllowed
// ---------------------------------------------------------------------------

describe("isClassAllowed", () => {
  it("returns true when no allowed set is provided (R6.4 fallback)", () => {
    expect(isClassAllowed("Anything", undefined)).toBe(true);
  });

  it("returns true when the class is in the allowed set", () => {
    const allowed = new Set(["A", "B"]);
    expect(isClassAllowed("A", allowed)).toBe(true);
  });

  it("returns false when the class is not in the allowed set", () => {
    const allowed = new Set(["A", "B"]);
    expect(isClassAllowed("C", allowed)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeTargetedCoverage
// ---------------------------------------------------------------------------

describe("computeTargetedCoverage", () => {
  it("reports exercised targets as intersection of targets and active path nodes", () => {
    const activePath: ActivePath = {
      nodes: ["Root", "A", "C"],
      edges: [],
    };

    const coverage = computeTargetedCoverage(["A", "B", "C"], activePath);

    expect(coverage.requested).toEqual(["A", "B", "C"]);
    expect(coverage.exercised).toEqual(["A", "C"]);
  });

  it("reports empty exercised when no targets appear in the path", () => {
    const activePath: ActivePath = {
      nodes: ["Root"],
      edges: [],
    };

    const coverage = computeTargetedCoverage(["X", "Y"], activePath);

    expect(coverage.requested).toEqual(["X", "Y"]);
    expect(coverage.exercised).toEqual([]);
  });

  it("reports all exercised when all targets appear in the path", () => {
    const activePath: ActivePath = {
      nodes: ["Root", "A", "B"],
      edges: [],
    };

    const coverage = computeTargetedCoverage(["A", "B"], activePath);

    expect(coverage.requested).toEqual(["A", "B"]);
    expect(coverage.exercised).toEqual(["A", "B"]);
  });

  it("handles an empty target list", () => {
    const activePath: ActivePath = {
      nodes: ["Root", "A"],
      edges: [],
    };

    const coverage = computeTargetedCoverage([], activePath);

    expect(coverage.requested).toEqual([]);
    expect(coverage.exercised).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: closure + real TypeGraph
// ---------------------------------------------------------------------------

describe("computeTargetingClosure with cycles", () => {
  it("handles cyclic graphs without infinite loops", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("Root", makeNode("Root", [["a", "A", true]]));
    nodes.set("A", makeNode("A", [["root", "Root", false]])); // cycle back
    const graph: TypeGraph = { nodes, rootClass: "Root" };

    const result = computeTargetingClosure(["A"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("Root")).toBe(true);
      expect(result.allowedClasses.has("A")).toBe(true);
    }
  });

  it("handles deeply nested required chains", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("Root", makeNode("Root", [["a", "A", true]]));
    nodes.set("A", makeNode("A", [["b", "B", true]]));
    nodes.set("B", makeNode("B", [["c", "C", false]]));
    nodes.set("C", makeNode("C", []));
    const graph: TypeGraph = { nodes, rootClass: "Root" };

    // Targeting C: path is Root -> A -> B -> C, and Root -> A -> B is required
    const result = computeTargetingClosure(["C"], graph);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.allowedClasses.has("Root")).toBe(true);
      expect(result.allowedClasses.has("A")).toBe(true);
      expect(result.allowedClasses.has("B")).toBe(true);
      expect(result.allowedClasses.has("C")).toBe(true);
    }
  });
});
