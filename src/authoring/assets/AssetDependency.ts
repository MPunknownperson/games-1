/**
 * Dependency relationships between assets, e.g. Character depends on
 * an animation asset, a weapon asset, and a skill asset.
 *
 * Provides shape validation, target checks, a deterministic dependency graph,
 * and cycle detection. Dependencies describe load/authoring order only; they
 * are not gameplay relationships.
 */
import {
  ASSET_ID_PATTERN,
  TYPE_LABEL_PATTERN,
  compareStrings,
  errorDraft,
  findDuplicates,
  warningDraft,
  type IssueDraft,
} from "./AssetTypes";

export interface AssetDependency {
  /** Id of the asset this one depends on. */
  targetId: string;
  /** Machine-readable kind label, e.g. "animation", "weapon", "skill". */
  dependencyType: string;
}

/** Adjacency list over asset ids. Nodes and edge lists are sorted. */
export interface DependencyGraph {
  nodes: string[];
  edges: Record<string, string[]>;
}

/** Minimal shape needed to build a graph. Any AssetDefinition satisfies it. */
export interface DependencySource {
  metadata: { id: string };
  dependencies: AssetDependency[];
}

export function createAssetDependency(targetId: string, dependencyType: string): AssetDependency {
  return { targetId, dependencyType };
}

/** Deterministic order: by targetId, then dependencyType. Returns a new array. */
export function sortDependencies(dependencies: AssetDependency[]): AssetDependency[] {
  return [...dependencies].sort(
    (a, b) =>
      compareStrings(a.targetId, b.targetId) ||
      compareStrings(a.dependencyType, b.dependencyType),
  );
}

/** Shape-only validation of one dependency. */
export function validateAssetDependency(dep: AssetDependency, path: string): IssueDraft[] {
  const issues: IssueDraft[] = [];
  if (!ASSET_ID_PATTERN.test(dep.targetId)) {
    issues.push(errorDraft("INVALID_DEPENDENCY_ID", `${path}.targetId`, `Dependency target "${dep.targetId}" is not a valid asset identifier.`));
  }
  if (!TYPE_LABEL_PATTERN.test(dep.dependencyType)) {
    issues.push(errorDraft("INVALID_DEPENDENCY_TYPE", `${path}.dependencyType`, `Dependency type "${dep.dependencyType}" must be a lowercase label.`));
  }
  return issues;
}

/**
 * Checks every dependency of one asset: shape, that the target exists (via the
 * `exists` lookup), and duplicate declarations.
 */
export function checkDependencyTargets(
  dependencies: AssetDependency[],
  exists: (id: string) => boolean,
): IssueDraft[] {
  const issues: IssueDraft[] = [];
  dependencies.forEach((dep, i) => {
    const path = `dependencies[${i}]`;
    issues.push(...validateAssetDependency(dep, path));
    if (!exists(dep.targetId)) {
      issues.push(errorDraft("INVALID_DEPENDENCY", `${path}.targetId`, `Dependency target "${dep.targetId}" does not exist.`));
    }
  });
  for (const key of findDuplicates(dependencies.map((d) => `${d.dependencyType}:${d.targetId}`))) {
    issues.push(warningDraft("DUPLICATE_DEPENDENCY", "dependencies", `Dependency "${key}" is declared more than once.`));
  }
  return issues;
}

/**
 * Builds a graph with one node per asset id. Edges point from each asset to the
 * ids it depends on. Duplicate ids have their edges merged. Targets that do not
 * exist are kept as edges so the validator can report them.
 */
export function buildDependencyGraph(sources: DependencySource[]): DependencyGraph {
  const edgeSets = new Map<string, Set<string>>();
  for (const source of sources) {
    const set = edgeSets.get(source.metadata.id) ?? new Set<string>();
    for (const dep of source.dependencies) set.add(dep.targetId);
    edgeSets.set(source.metadata.id, set);
  }
  const nodes = [...edgeSets.keys()].sort(compareStrings);
  const edges: Record<string, string[]> = {};
  for (const node of nodes) {
    edges[node] = [...(edgeSets.get(node) ?? [])].sort(compareStrings);
  }
  return { nodes, edges };
}

function recordCycle(stack: string[], start: string, cycles: string[][], seen: Set<string>): void {
  const cycle = [...stack.slice(stack.indexOf(start)), start];
  const key = cycle.join(" -> ");
  if (!seen.has(key)) {
    seen.add(key);
    cycles.push(cycle);
  }
}

/**
 * Finds dependency cycles with a depth-first search that visits nodes and edges
 * in sorted order. Each cycle is returned as a closed path, e.g. ["a","b","a"].
 */
export function detectDependencyCycles(graph: DependencyGraph): string[][] {
  const state = new Map<string, "active" | "done">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const seen = new Set<string>();

  const visit = (node: string): void => {
    state.set(node, "active");
    stack.push(node);
    for (const next of graph.edges[node] ?? []) {
      const current = state.get(next);
      if (current === "active") recordCycle(stack, next, cycles, seen);
      else if (current === undefined) visit(next);
    }
    stack.pop();
    state.set(node, "done");
  };

  for (const node of graph.nodes) {
    if (!state.has(node)) visit(node);
  }
  return cycles;
}
