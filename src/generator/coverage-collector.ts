import type { ActivePath, CoverageReport, TypeGraph } from "./types.js";

/**
 * Accumulates exercised classes, properties, and edges across a generation run
 * and computes coverage percentages against the reachable TypeGraph.
 *
 * Implements Requirements 9.1, 9.2, 9.3, 9.4, 9.5.
 */
export class CoverageCollector {
  private exercisedClasses = new Set<string>();
  private exercisedProperties = new Set<string>();
  private exercisedEdges = new Set<string>(); // "from→to→propertyName" key

  /**
   * Record the classes, properties, and edges from a single ActivePath.
   * Accumulates across multiple calls for multi-credential runs (Req 9.1–9.3).
   */
  record(activePath: ActivePath): void {
    for (const className of activePath.nodes) {
      this.exercisedClasses.add(className);
    }

    for (const edge of activePath.edges) {
      this.exercisedProperties.add(edge.propertyName);
      const edgeKey = `${edge.from}→${edge.to}→${edge.propertyName}`;
      this.exercisedEdges.add(edgeKey);
    }
  }

  /**
   * Compute a CoverageReport against the reachable TypeGraph.
   *
   * Totals:
   * - classes: reachableGraph.nodes.size
   * - properties: distinct property names across all nodes
   * - edges: total GraphEdge entries across all nodes (sum of all node.properties.size)
   *
   * If any total is 0, report count: 0, percentage: 0 (Req 9.5).
   * Percentages: Math.min(100, Math.round((exercised / total) * 100 * 100) / 100) (Req 9.4).
   */
  report(reachableGraph: TypeGraph): CoverageReport {
    // Compute totals from the reachable TypeGraph
    const totalClasses = reachableGraph.nodes.size;

    // Distinct property names across all nodes
    const allPropertyNames = new Set<string>();
    let totalEdges = 0;
    for (const node of reachableGraph.nodes.values()) {
      for (const propertyName of node.properties.keys()) {
        allPropertyNames.add(propertyName);
      }
      totalEdges += node.properties.size;
    }
    const totalProperties = allPropertyNames.size;

    return {
      exercisedClasses: buildCategoryReport(
        this.exercisedClasses.size,
        totalClasses,
      ),
      exercisedProperties: buildCategoryReport(
        this.exercisedProperties.size,
        totalProperties,
      ),
      exercisedEdges: buildCategoryReport(
        this.exercisedEdges.size,
        totalEdges,
      ),
    };
  }
}

/**
 * Build a single coverage category entry.
 * If total is 0, return count: 0, percentage: 0 (Req 9.5).
 */
function buildCategoryReport(
  count: number,
  total: number,
): { count: number; total: number; percentage: number } {
  if (total === 0) {
    return { count: 0, total: 0, percentage: 0 };
  }
  const percentage = Math.min(
    100,
    Math.round((count / total) * 100 * 100) / 100,
  );
  return { count, total, percentage };
}
