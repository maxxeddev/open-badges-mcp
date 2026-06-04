import type { ActivePath } from "./types.js";

/**
 * Sanitize a class name to a valid Mermaid node ID.
 * Strips all non-alphanumeric characters, keeping only [a-zA-Z0-9].
 */
function sanitize(className: string): string {
  return className.replace(/[^a-zA-Z0-9]/g, "");
}

/**
 * Converts an ActivePath into a Mermaid `flowchart TD` diagram.
 *
 * Algorithm:
 * 1. Deduplicate nodes by distinct class name.
 * 2. Assign each distinct class a stable node ID via sanitize(className).
 * 3. Emit one `NodeId[ClassName]` line per distinct class.
 * 4. Collect distinct (from, to, propertyName) triples from activePath.edges.
 * 5. Emit one `FromId -->|propertyName| ToId` line per distinct triple.
 * 6. If no edges (single-node path), emit only the node lines.
 */
export class MermaidRenderer {
  render(activePath: ActivePath): string {
    // Step 1 & 2: deduplicate nodes and assign stable sanitized IDs
    const distinctClasses: string[] = [];
    const seen = new Set<string>();
    for (const className of activePath.nodes) {
      if (!seen.has(className)) {
        seen.add(className);
        distinctClasses.push(className);
      }
    }

    // Step 3: build node declaration lines
    const nodeLines = distinctClasses.map(
      (className) => `  ${sanitize(className)}[${className}]`,
    );

    // Step 4 & 5: collect distinct (from, to, propertyName) triples
    const edgeLines: string[] = [];
    const seenEdges = new Set<string>();
    for (const edge of activePath.edges) {
      const key = `${edge.from}|${edge.to}|${edge.propertyName}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        const fromId = sanitize(edge.from);
        const toId = sanitize(edge.to);
        edgeLines.push(`  ${fromId} -->|${edge.propertyName}| ${toId}`);
      }
    }

    // Step 6: combine — if no edges, emit only nodes
    const lines = ["flowchart TD", ...nodeLines, ...edgeLines];
    return lines.join("\n");
  }
}
