import { describe, expect, it } from "vitest";
import { MermaidRenderer } from "../../src/generator/mermaid-renderer.js";
import type { ActivePath } from "../../src/generator/types.js";

describe("MermaidRenderer", () => {
  const renderer = new MermaidRenderer();

  describe("output format", () => {
    it("output string starts with 'flowchart TD'", () => {
      const path: ActivePath = {
        nodes: ["AchievementCredential"],
        edges: [],
      };
      const result = renderer.render(path);
      expect(result.startsWith("flowchart TD")).toBe(true);
    });
  });

  describe("single-node path", () => {
    it("produces one node declaration and no edge arrows", () => {
      const path: ActivePath = {
        nodes: ["AchievementCredential"],
        edges: [],
      };
      const result = renderer.render(path);

      expect(result).toContain("AchievementCredential[AchievementCredential]");
      expect(result).not.toContain("-->");
    });
  });

  describe("multi-node path", () => {
    it("produces node declarations and arrow lines for each edge", () => {
      const path: ActivePath = {
        nodes: ["A", "B"],
        edges: [{ from: "A", to: "B", propertyName: "child" }],
      };
      const result = renderer.render(path);

      expect(result).toContain("A[A]");
      expect(result).toContain("B[B]");
      expect(result).toContain("A -->|child| B");
    });
  });

  describe("deduplication", () => {
    it("deduplicates repeated (from, to, propertyName) triples to one arrow each", () => {
      const path: ActivePath = {
        nodes: ["A", "B", "A", "B"],
        edges: [
          { from: "A", to: "B", propertyName: "child" },
          { from: "A", to: "B", propertyName: "child" },
          { from: "A", to: "B", propertyName: "child" },
        ],
      };
      const result = renderer.render(path);

      // Count occurrences of the arrow line — should appear exactly once
      const arrowMatches = result.match(/A -->|child| B/g);
      // Split by lines and count exact arrow lines
      const lines = result.split("\n");
      const arrowLines = lines.filter((l) => l.trim() === "A -->|child| B");
      expect(arrowLines).toHaveLength(1);
    });

    it("deduplicates repeated node names to one node declaration each", () => {
      const path: ActivePath = {
        nodes: ["Profile", "Profile", "Profile"],
        edges: [],
      };
      const result = renderer.render(path);

      const nodeLines = result
        .split("\n")
        .filter((l) => l.trim() === "Profile[Profile]");
      expect(nodeLines).toHaveLength(1);
    });

    it("preserves distinct triples: two different properties between same nodes produce two arrow lines", () => {
      const path: ActivePath = {
        nodes: ["A", "B"],
        edges: [
          { from: "A", to: "B", propertyName: "child" },
          { from: "A", to: "B", propertyName: "parent" },
        ],
      };
      const result = renderer.render(path);
      const lines = result.split("\n");

      const childArrow = lines.filter((l) => l.trim() === "A -->|child| B");
      const parentArrow = lines.filter((l) => l.trim() === "A -->|parent| B");

      expect(childArrow).toHaveLength(1);
      expect(parentArrow).toHaveLength(1);
    });
  });

  describe("node ID sanitization", () => {
    it("strips hyphens so node IDs contain only alphanumeric characters", () => {
      const path: ActivePath = {
        nodes: ["Some-Class"],
        edges: [],
      };
      const result = renderer.render(path);

      // The node ID (before the bracket) must be alphanumeric-only
      expect(result).toContain("SomeClass[Some-Class]");
      // The raw hyphenated name should not appear as a node ID
      const lines = result.split("\n");
      const nodeLineWithHyphenId = lines.filter((l) =>
        /^\s+Some-Class\[/.test(l),
      );
      expect(nodeLineWithHyphenId).toHaveLength(0);
    });

    it("uses sanitized IDs in arrow lines when class names contain non-alphanumeric chars", () => {
      const path: ActivePath = {
        nodes: ["From-Node", "To.Node"],
        edges: [{ from: "From-Node", to: "To.Node", propertyName: "link" }],
      };
      const result = renderer.render(path);

      expect(result).toContain("FromNode[From-Node]");
      expect(result).toContain("ToNode[To.Node]");
      expect(result).toContain("FromNode -->|link| ToNode");
    });
  });
});
