import { beforeEach, describe, expect, it } from "vitest";
import { CoverageCollector } from "../../src/generator/coverage-collector.js";
import type { ActivePath, TypeGraph } from "../../src/generator/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a minimal TypeGraph fixture with a known structure:
 *
 *   AchievementCredential  --credentialSubject-->  AchievementSubject
 *   AchievementSubject     --achievement-->        Achievement
 *   Achievement            (no outgoing edges)
 *
 * Classes: 3, distinct property names: 2, total edges: 2
 */
function buildSmallGraph(): TypeGraph {
  const makeNode = (name: string, edges: Array<{ prop: string; target: string }>) => ({
    name,
    properties: new Map(
      edges.map(({ prop, target }) => [
        prop,
        {
          propertyName: prop,
          targetClass: target,
          cardinality: { minOccurs: 1 as const, maxOccurs: 1 as const },
          isRequired: true,
          isArray: false,
        },
      ]),
    ),
    rawSchema: {},
  });

  const nodes = new Map([
    [
      "AchievementCredential",
      makeNode("AchievementCredential", [
        { prop: "credentialSubject", target: "AchievementSubject" },
      ]),
    ],
    [
      "AchievementSubject",
      makeNode("AchievementSubject", [{ prop: "achievement", target: "Achievement" }]),
    ],
    ["Achievement", makeNode("Achievement", [])],
  ]);

  return { nodes, rootClass: "AchievementCredential" };
}

/** An empty graph: no nodes at all. */
function buildEmptyGraph(): TypeGraph {
  return { nodes: new Map(), rootClass: "AchievementCredential" };
}

/**
 * A graph where every node shares the same property name across multiple nodes,
 * so distinct property count differs from total edge count.
 *
 *   A --name--> B
 *   B --name--> C
 *
 * Classes: 3, distinct property names: 1, total edges: 2
 */
function buildSharedPropertyGraph(): TypeGraph {
  const makeNode = (name: string, edges: Array<{ prop: string; target: string }>) => ({
    name,
    properties: new Map(
      edges.map(({ prop, target }) => [
        prop,
        {
          propertyName: prop,
          targetClass: target,
          cardinality: { minOccurs: 1 as const, maxOccurs: 1 as const },
          isRequired: true,
          isArray: false,
        },
      ]),
    ),
    rawSchema: {},
  });

  const nodes = new Map([
    ["A", makeNode("A", [{ prop: "name", target: "B" }])],
    ["B", makeNode("B", [{ prop: "name", target: "C" }])],
    ["C", makeNode("C", [])],
  ]);

  return { nodes, rootClass: "A" };
}

/** A graph with 4 classes and 4 distinct edges for easy percentage checks. */
function buildFourNodeGraph(): TypeGraph {
  const makeNode = (name: string, edges: Array<{ prop: string; target: string }>) => ({
    name,
    properties: new Map(
      edges.map(({ prop, target }) => [
        prop,
        {
          propertyName: prop,
          targetClass: target,
          cardinality: { minOccurs: 1 as const, maxOccurs: 1 as const },
          isRequired: true,
          isArray: false,
        },
      ]),
    ),
    rawSchema: {},
  });

  // A→B, A→C, B→D, C→D  (4 classes, 4 edges, 4 distinct prop names)
  const nodes = new Map([
    [
      "A",
      makeNode("A", [
        { prop: "propB", target: "B" },
        { prop: "propC", target: "C" },
      ]),
    ],
    ["B", makeNode("B", [{ prop: "propD1", target: "D" }])],
    ["C", makeNode("C", [{ prop: "propD2", target: "D" }])],
    ["D", makeNode("D", [])],
  ]);

  return { nodes, rootClass: "A" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CoverageCollector", () => {
  let collector: CoverageCollector;

  beforeEach(() => {
    collector = new CoverageCollector();
  });

  // ── Test 1: Zero total ───────────────────────────────────────────────────

  describe("zero-total graph", () => {
    it("reports count: 0, total: 0, percentage: 0 for all three categories", () => {
      const report = collector.report(buildEmptyGraph());

      expect(report.exercisedClasses).toEqual({ count: 0, total: 0, percentage: 0 });
      expect(report.exercisedProperties).toEqual({ count: 0, total: 0, percentage: 0 });
      expect(report.exercisedEdges).toEqual({ count: 0, total: 0, percentage: 0 });
    });

    it("still reports zeros even after recording a path, when graph has no nodes", () => {
      const path: ActivePath = {
        nodes: ["AchievementCredential"],
        edges: [],
      };
      collector.record(path);

      const report = collector.report(buildEmptyGraph());
      expect(report.exercisedClasses).toEqual({ count: 0, total: 0, percentage: 0 });
    });
  });

  // ── Test 2: Single path recorded ────────────────────────────────────────

  describe("single path recorded", () => {
    it("counts exactly the nodes and edges in the recorded path", () => {
      const path: ActivePath = {
        nodes: ["AchievementCredential", "AchievementSubject", "Achievement"],
        edges: [
          {
            from: "AchievementCredential",
            to: "AchievementSubject",
            propertyName: "credentialSubject",
          },
          { from: "AchievementSubject", to: "Achievement", propertyName: "achievement" },
        ],
      };
      collector.record(path);

      const graph = buildSmallGraph(); // 3 classes, 2 distinct props, 2 total edges
      const report = collector.report(graph);

      expect(report.exercisedClasses.count).toBe(3);
      expect(report.exercisedClasses.total).toBe(3);

      expect(report.exercisedEdges.count).toBe(2);
      expect(report.exercisedEdges.total).toBe(2);
    });
  });

  // ── Test 3: Multiple paths accumulate (union, no double-counting) ────────

  describe("multiple paths accumulate", () => {
    it("takes the union of exercised items without double-counting overlapping nodes", () => {
      const graph = buildFourNodeGraph(); // 4 classes, 4 distinct props, 4 total edges

      // Path 1: A → B → D  (visits A, B, D; uses propB, propD1)
      const path1: ActivePath = {
        nodes: ["A", "B", "D"],
        edges: [
          { from: "A", to: "B", propertyName: "propB" },
          { from: "B", to: "D", propertyName: "propD1" },
        ],
      };

      // Path 2: A → C → D  (revisits A and D; adds C; uses propC, propD2)
      const path2: ActivePath = {
        nodes: ["A", "C", "D"],
        edges: [
          { from: "A", to: "C", propertyName: "propC" },
          { from: "C", to: "D", propertyName: "propD2" },
        ],
      };

      collector.record(path1);
      collector.record(path2);

      const report = collector.report(graph);

      // Union of {A,B,D} ∪ {A,C,D} = {A,B,C,D} = 4
      expect(report.exercisedClasses.count).toBe(4);
      expect(report.exercisedClasses.total).toBe(4);

      // Union of 4 distinct edges = 4
      expect(report.exercisedEdges.count).toBe(4);
      expect(report.exercisedEdges.total).toBe(4);
    });

    it("does not double-count when the same node appears in two paths", () => {
      const graph = buildSmallGraph(); // 3 classes

      const path1: ActivePath = {
        nodes: ["AchievementCredential", "AchievementSubject"],
        edges: [
          {
            from: "AchievementCredential",
            to: "AchievementSubject",
            propertyName: "credentialSubject",
          },
        ],
      };

      // path2 repeats AchievementCredential and AchievementSubject
      const path2: ActivePath = {
        nodes: ["AchievementCredential", "AchievementSubject", "Achievement"],
        edges: [
          {
            from: "AchievementCredential",
            to: "AchievementSubject",
            propertyName: "credentialSubject",
          },
          { from: "AchievementSubject", to: "Achievement", propertyName: "achievement" },
        ],
      };

      collector.record(path1);
      collector.record(path2);

      const report = collector.report(graph);
      // Still 3 unique classes, not 5
      expect(report.exercisedClasses.count).toBe(3);
    });
  });

  // ── Test 4: Percentage calculation ──────────────────────────────────────

  describe("percentage calculation", () => {
    it("reports 50% when 2 of 4 total classes are exercised", () => {
      const graph = buildFourNodeGraph(); // 4 classes

      const path: ActivePath = {
        nodes: ["A", "B"],
        edges: [{ from: "A", to: "B", propertyName: "propB" }],
      };
      collector.record(path);

      const report = collector.report(graph);

      expect(report.exercisedClasses.count).toBe(2);
      expect(report.exercisedClasses.total).toBe(4);
      expect(report.exercisedClasses.percentage).toBe(50);
    });
  });

  // ── Test 5: Percentage capped at 100 ────────────────────────────────────

  describe("percentage capped at 100", () => {
    it("caps at 100 even when exercised count exceeds total", () => {
      /**
       * We manufacture an over-exercised scenario by recording nodes that are
       * NOT present in the graph used for reporting (a smaller graph).
       *
       * Graph has only 1 class (total = 1).
       * Path visits 5 distinct class names.
       * Without the cap, percentage would be 500%; with the cap it must be 100.
       */
      const tinyGraph: TypeGraph = {
        nodes: new Map([
          [
            "OnlyClass",
            {
              name: "OnlyClass",
              properties: new Map(),
              rawSchema: {},
            },
          ],
        ]),
        rootClass: "OnlyClass",
      };

      const path: ActivePath = {
        nodes: ["OnlyClass", "Extra1", "Extra2", "Extra3", "Extra4"],
        edges: [],
      };
      collector.record(path);

      const report = collector.report(tinyGraph);

      // count is exercised (5) but total is 1; percentage must be capped at 100
      expect(report.exercisedClasses.percentage).toBe(100);
      expect(report.exercisedClasses.percentage).toBeLessThanOrEqual(100);
    });
  });

  // ── Test 6: Edge key format ──────────────────────────────────────────────

  describe("edge key format", () => {
    it('counts edges correctly using "from→to→propertyName" uniqueness', () => {
      const graph = buildSmallGraph(); // 2 total edges

      // Record two edges with same from/to but different property names
      // These should be counted as distinct edges
      const path1: ActivePath = {
        nodes: ["AchievementCredential", "AchievementSubject"],
        edges: [
          {
            from: "AchievementCredential",
            to: "AchievementSubject",
            propertyName: "credentialSubject",
          },
        ],
      };

      // Same from/to pair but with a different property name — distinct edge key
      const path2: ActivePath = {
        nodes: ["AchievementCredential", "AchievementSubject"],
        edges: [
          {
            from: "AchievementCredential",
            to: "AchievementSubject",
            propertyName: "credentialSubject",
          },
          {
            from: "AchievementSubject",
            to: "Achievement",
            propertyName: "achievement",
          },
        ],
      };

      collector.record(path1);
      collector.record(path2);

      const report = collector.report(graph);

      // "AchievementCredential→AchievementSubject→credentialSubject" recorded twice → counted once
      // "AchievementSubject→Achievement→achievement" recorded once
      // Total distinct exercised edges = 2
      expect(report.exercisedEdges.count).toBe(2);
    });

    it("treats same (from, to) pair with different propertyName as distinct edges", () => {
      /**
       * Graph: Node X has two properties to Node Y with different names.
       * Classes: X, Y  (2)
       * Total edges: 2
       * Distinct property names: 2
       */
      const twoEdgeGraph: TypeGraph = {
        nodes: new Map([
          [
            "X",
            {
              name: "X",
              properties: new Map([
                [
                  "propA",
                  {
                    propertyName: "propA",
                    targetClass: "Y",
                    cardinality: { minOccurs: 1 as const, maxOccurs: 1 as const },
                    isRequired: true,
                    isArray: false,
                  },
                ],
                [
                  "propB",
                  {
                    propertyName: "propB",
                    targetClass: "Y",
                    cardinality: { minOccurs: 1 as const, maxOccurs: 1 as const },
                    isRequired: true,
                    isArray: false,
                  },
                ],
              ]),
              rawSchema: {},
            },
          ],
          [
            "Y",
            {
              name: "Y",
              properties: new Map(),
              rawSchema: {},
            },
          ],
        ]),
        rootClass: "X",
      };

      const path: ActivePath = {
        nodes: ["X", "Y"],
        edges: [
          { from: "X", to: "Y", propertyName: "propA" },
          { from: "X", to: "Y", propertyName: "propB" },
        ],
      };
      collector.record(path);

      const report = collector.report(twoEdgeGraph);

      // Both edges exercised: "X→Y→propA" and "X→Y→propB"
      expect(report.exercisedEdges.count).toBe(2);
      expect(report.exercisedEdges.total).toBe(2);
      expect(report.exercisedEdges.percentage).toBe(100);
    });
  });

  // ── Test 7: Two decimal precision ───────────────────────────────────────

  describe("two decimal precision", () => {
    it("rounds percentage to two decimal places (1/3 ≈ 33.33)", () => {
      /**
       * Build a graph with 3 classes and exercise exactly 1 of them.
       * 1/3 * 100 = 33.333… → rounded to 33.33
       */
      const threeClassGraph: TypeGraph = {
        nodes: new Map([
          ["ClassA", { name: "ClassA", properties: new Map(), rawSchema: {} }],
          ["ClassB", { name: "ClassB", properties: new Map(), rawSchema: {} }],
          ["ClassC", { name: "ClassC", properties: new Map(), rawSchema: {} }],
        ]),
        rootClass: "ClassA",
      };

      const path: ActivePath = {
        nodes: ["ClassA"],
        edges: [],
      };
      collector.record(path);

      const report = collector.report(threeClassGraph);

      expect(report.exercisedClasses.count).toBe(1);
      expect(report.exercisedClasses.total).toBe(3);
      expect(report.exercisedClasses.percentage).toBe(33.33);
    });

    it("rounds 2/3 to 66.67", () => {
      const threeClassGraph: TypeGraph = {
        nodes: new Map([
          ["ClassA", { name: "ClassA", properties: new Map(), rawSchema: {} }],
          ["ClassB", { name: "ClassB", properties: new Map(), rawSchema: {} }],
          ["ClassC", { name: "ClassC", properties: new Map(), rawSchema: {} }],
        ]),
        rootClass: "ClassA",
      };

      const path: ActivePath = {
        nodes: ["ClassA", "ClassB"],
        edges: [],
      };
      collector.record(path);

      const report = collector.report(threeClassGraph);

      expect(report.exercisedClasses.percentage).toBe(66.67);
    });
  });

  // ── Properties vs edges distinction ─────────────────────────────────────

  describe("properties vs edges distinction", () => {
    it("counts distinct property names (not total edges) for exercisedProperties", () => {
      /**
       * sharedPropertyGraph: A →name→ B, B →name→ C
       * total distinct property names = 1
       * total edges = 2
       *
       * After recording a path through all nodes with the "name" property twice,
       * exercisedProperties.count should be 1 (not 2).
       */
      const graph = buildSharedPropertyGraph();

      const path: ActivePath = {
        nodes: ["A", "B", "C"],
        edges: [
          { from: "A", to: "B", propertyName: "name" },
          { from: "B", to: "C", propertyName: "name" },
        ],
      };
      collector.record(path);

      const report = collector.report(graph);

      expect(report.exercisedProperties.count).toBe(1);
      expect(report.exercisedProperties.total).toBe(1);
      expect(report.exercisedEdges.count).toBe(2);
      expect(report.exercisedEdges.total).toBe(2);
    });
  });
});
