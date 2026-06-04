import type { ActivePath, GenerationConfig, TypeGraph } from "./types.js";

/**
 * TraversalEngine walks the TypeGraph from a root class, bounded by maxDepth,
 * and returns an ActivePath recording the ordered nodes and edges visited.
 *
 * Termination is guaranteed by the maxDepth bound alone. Cyclic and
 * self-referential edges (Profile.parentOrg, EndorsementCredential.endorsement)
 * are traversed as normal edges and stop expanding when depth reaches maxDepth.
 *
 * Requirements: 2.4, 2.5, 3.1, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class TraversalEngine {
  private readonly graph: TypeGraph;
  private readonly maxDepth: number;

  constructor(graph: TypeGraph, config: Pick<GenerationConfig, "maxDepth">) {
    this.graph = graph;
    // Default maxDepth to 3 if not provided (Req 2.2)
    this.maxDepth = config.maxDepth ?? 3;
  }

  /**
   * Traverse the TypeGraph starting from rootClassName (or graph.rootClass if
   * omitted) and return an ActivePath with ordered nodes and edges arrays.
   *
   * maxDepth === 0: emit root only, no outgoing edges expanded (Req 2.4, 4.4).
   */
  traverse(rootClassName?: string): ActivePath {
    const startClass = rootClassName ?? this.graph.rootClass;

    const activePath: ActivePath = {
      nodes: [],
      edges: [],
    };

    const startNode = this.graph.nodes.get(startClass);
    if (!startNode) {
      // If the root class doesn't exist in the graph, return a path with just
      // the requested class name so callers can handle the missing node case.
      activePath.nodes.push(startClass);
      return activePath;
    }

    this._traverse(startNode.name, 0, activePath);

    return activePath;
  }

  /**
   * Internal recursive traversal.
   *
   * @param nodeName  - name of the current node to visit
   * @param depth     - current traversal depth (root is 0)
   * @param activePath - accumulator for the result
   */
  private _traverse(
    nodeName: string,
    depth: number,
    activePath: ActivePath,
  ): void {
    const node = this.graph.nodes.get(nodeName);
    if (!node) {
      // Unknown node referenced by an edge — record its name and stop.
      activePath.nodes.push(nodeName);
      return;
    }

    // Record this node on the active path (Req 4.1 — cycles are normal visits).
    activePath.nodes.push(node.name);

    // Stop expanding edges when we've reached maxDepth (Req 2.5, 4.2, 4.4).
    if (depth >= this.maxDepth) {
      return;
    }

    for (const edge of node.properties.values()) {
      const target = this.graph.nodes.get(edge.targetClass);
      if (!target) {
        // Referenced class not in graph — skip this edge.
        continue;
      }

      // Record the edge.
      activePath.edges.push({
        from: node.name,
        to: target.name,
        propertyName: edge.propertyName,
      });

      // Cyclic edges are traversed normally; depth bound guarantees termination (Req 4.1, 4.2, 4.3).
      this._traverse(target.name, depth + 1, activePath);
    }
  }
}
