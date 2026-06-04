import { describe, expect, it } from "vitest";
import { TraversalEngine } from "../../src/generator/traversal-engine.js";
import type { GraphEdge, GraphNode, TypeGraph } from "../../src/generator/types.js";

// ---------------------------------------------------------------------------
// Helper: build a TypeGraph from a lightweight descriptor
// ---------------------------------------------------------------------------

type EdgeDescriptor = {
  prop: string;
  target: string;
  isRequired?: boolean;
  isArray?: boolean;
};

type NodeDescriptor = {
  name: string;
  edges?: EdgeDescriptor[];
};

function makeGraph(
  nodes: NodeDescriptor[],
  rootClass?: string,
): TypeGraph {
  const map = new Map<string, GraphNode>();

  for (const nd of nodes) {
    const properties = new Map<string, GraphEdge>();

    for (const ed of nd.edges ?? []) {
      const isRequired = ed.isRequired ?? false;
      const isArray = ed.isArray ?? false;
      properties.set(ed.prop, {
        propertyName: ed.prop,
        targetClass: ed.target,
        cardinality: {
          minOccurs: isRequired ? 1 : 0,
          maxOccurs: isArray ? "unbounded" : 1,
        },
        isRequired,
        isArray,
      });
    }

    map.set(nd.name, {
      name: nd.name,
      properties,
      rawSchema: {},
    });
  }

  return {
    nodes: map,
    rootClass: rootClass ?? nodes[0]?.name ?? "Root",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TraversalEngine", () => {
  // 1. Depth-0: only root emitted, no edges
  describe("depth-0", () => {
    it("emits only the root node and no edges when maxDepth is 0", () => {
      const graph = makeGraph([
        { name: "Root", edges: [{ prop: "child", target: "Child" }] },
        { name: "Child" },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 0 });
      const result = engine.traverse("Root");

      expect(result.nodes).toEqual(["Root"]);
      expect(result.edges).toEqual([]);
    });
  });

  // 2. Depth-1: root and one level of children
  describe("depth-1", () => {
    it("visits root and its direct children at maxDepth 1", () => {
      const graph = makeGraph([
        { name: "Root", edges: [{ prop: "child", target: "Child" }] },
        { name: "Child" },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 1 });
      const result = engine.traverse("Root");

      expect(result.nodes).toContain("Root");
      expect(result.nodes).toContain("Child");
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toEqual({
        from: "Root",
        to: "Child",
        propertyName: "child",
      });
    });
  });

  // 3. Cyclic termination: Profile → Profile via parentOrg
  describe("cyclic termination", () => {
    it("terminates for self-referential cycle (Profile.parentOrg → Profile) at maxDepth 2", () => {
      const graph = makeGraph([
        {
          name: "Profile",
          edges: [{ prop: "parentOrg", target: "Profile" }],
        },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 2 });

      // Must not hang or throw
      const result = engine.traverse("Profile");

      // Nodes array must be bounded (maxDepth 2 means at most 3 visits: depth 0,1,2)
      expect(result.nodes.length).toBeLessThanOrEqual(3);
      expect(result.nodes.every((n) => n === "Profile")).toBe(true);
    });

    it("terminates for mutual cycle (A → B → A) at maxDepth 3", () => {
      const graph = makeGraph([
        { name: "A", edges: [{ prop: "b", target: "B" }] },
        { name: "B", edges: [{ prop: "a", target: "A" }] },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 3 });
      const result = engine.traverse("A");

      // depth 0→A, 1→B, 2→A, 3→B  — at depth 3 we stop expanding
      expect(result.nodes.length).toBeLessThanOrEqual(4);
    });
  });

  // 4. Required edge at depth boundary — no edges emitted at depth 0
  describe("required edge at depth boundary", () => {
    it("emits no edges when maxDepth is 0 even if an edge is required", () => {
      const graph = makeGraph([
        {
          name: "Root",
          edges: [
            { prop: "requiredChild", target: "Required", isRequired: true },
            { prop: "optionalChild", target: "Optional", isRequired: false },
          ],
        },
        { name: "Required" },
        { name: "Optional" },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 0 });
      const result = engine.traverse("Root");

      // depth >= maxDepth stops expansion entirely; synthesizer handles required fields
      expect(result.nodes).toEqual(["Root"]);
      expect(result.edges).toEqual([]);
    });
  });

  // 5. Multi-level traversal: Root→A→B at maxDepth 2
  describe("multiple depths", () => {
    it("visits all three nodes in a Root→A→B chain at maxDepth 2", () => {
      const graph = makeGraph([
        { name: "Root", edges: [{ prop: "a", target: "A" }] },
        { name: "A", edges: [{ prop: "b", target: "B" }] },
        { name: "B" },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 2 });
      const result = engine.traverse("Root");

      expect(result.nodes).toContain("Root");
      expect(result.nodes).toContain("A");
      expect(result.nodes).toContain("B");
      expect(result.edges).toHaveLength(2);
    });

    it("does not visit the third level in a Root→A→B chain at maxDepth 1", () => {
      const graph = makeGraph([
        { name: "Root", edges: [{ prop: "a", target: "A" }] },
        { name: "A", edges: [{ prop: "b", target: "B" }] },
        { name: "B" },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 1 });
      const result = engine.traverse("Root");

      expect(result.nodes).toContain("Root");
      expect(result.nodes).toContain("A");
      expect(result.nodes).not.toContain("B");
    });
  });

  // 6. Missing node: edge targets a class not in the graph
  describe("missing node handling", () => {
    it("skips edges whose target class is not in the graph without throwing", () => {
      const graph = makeGraph([
        {
          name: "Root",
          edges: [{ prop: "ghost", target: "DoesNotExist" }],
        },
      ]);

      const engine = new TraversalEngine(graph, { maxDepth: 2 });

      // Must not throw
      const result = engine.traverse("Root");

      expect(result.nodes).toContain("Root");
      // The missing target should NOT appear in nodes (edge is skipped)
      expect(result.nodes).not.toContain("DoesNotExist");
      // No edges recorded either
      expect(result.edges).toEqual([]);
    });

    it("returns a path with just the root name when the root class is missing from the graph", () => {
      const graph = makeGraph([{ name: "Other" }]);

      const engine = new TraversalEngine(graph, { maxDepth: 2 });
      const result = engine.traverse("Missing");

      expect(result.nodes).toEqual(["Missing"]);
      expect(result.edges).toEqual([]);
    });
  });

  // 7. Default rootClass fallback
  describe("default root", () => {
    it("uses graph.rootClass when no root argument is provided", () => {
      const graph = makeGraph(
        [
          { name: "Root", edges: [{ prop: "child", target: "Child" }] },
          { name: "Child" },
        ],
        "Root",
      );

      const engine = new TraversalEngine(graph, { maxDepth: 1 });
      const result = engine.traverse(); // no argument

      expect(result.nodes).toContain("Root");
      expect(result.nodes).toContain("Child");
    });
  });
});
