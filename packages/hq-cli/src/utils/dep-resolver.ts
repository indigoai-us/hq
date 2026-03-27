/**
 * Dependency resolver — topological sort for hq package installs (US-011)
 *
 * Uses Kahn's algorithm (BFS topological sort) to determine install order
 * for a package and its transitive dependencies. Detects cycles and throws
 * CyclicDependencyError with the cycle path for display.
 */

// ─── Errors ──────────────────────────────────────────────────────────────────

export class CyclicDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
  }
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve install order for packageName and its dependencies.
 * Returns packages in install order (deps first), excluding already-installed ones.
 * rootPackage itself is NOT included in the output — the caller installs it directly.
 *
 * @param rootPackage   - the package being installed
 * @param fetchDeps     - async callback: given a package name, returns its required package names
 * @param checkInstalled - async callback: given a package name, returns true if already installed
 */
export async function resolveDependencies(
  rootPackage: string,
  fetchDeps: (name: string) => Promise<string[]>,
  checkInstalled: (name: string) => Promise<boolean>
): Promise<string[]> {
  // ── Step 1: BFS-expand the full dependency graph ─────────────────────────
  // adjacency[A] = [B, C] means A depends on B and C (A → B, A → C edges)
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  const visited = new Set<string>();
  const queue: string[] = [rootPackage];
  visited.add(rootPackage);

  while (queue.length > 0) {
    const node = queue.shift()!;
    const deps = await fetchDeps(node);
    adjacency.set(node, deps);

    if (!inDegree.has(node)) {
      inDegree.set(node, 0);
    }

    for (const dep of deps) {
      // Increment in-degree of `node` for each dep pointing to it
      // (Kahn's: edges go dep → node, meaning dep must come before node)
      inDegree.set(node, (inDegree.get(node) ?? 0) + 1);

      if (!inDegree.has(dep)) {
        inDegree.set(dep, 0);
      }

      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  // ── Step 2: Kahn's algorithm ──────────────────────────────────────────────
  // Build reverse adjacency: if A depends on B, then B has an outgoing edge to A
  // (once B is processed, A's in-degree decreases)
  const reverseAdj = new Map<string, string[]>();
  for (const [node, deps] of adjacency.entries()) {
    for (const dep of deps) {
      if (!reverseAdj.has(dep)) reverseAdj.set(dep, []);
      reverseAdj.get(dep)!.push(node);
    }
  }

  const topoOrder: string[] = [];
  const processQueue: string[] = [];

  // Seed with all nodes that have in-degree 0 (no unresolved deps)
  for (const [node, degree] of inDegree.entries()) {
    if (degree === 0) processQueue.push(node);
  }

  while (processQueue.length > 0) {
    const node = processQueue.shift()!;
    topoOrder.push(node);

    for (const dependent of reverseAdj.get(node) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        processQueue.push(dependent);
      }
    }
  }

  // ── Step 3: Cycle detection ───────────────────────────────────────────────
  if (topoOrder.length < inDegree.size) {
    // Find a node still stuck (in-degree > 0) — it's part of a cycle
    const cycleNode = [...inDegree.entries()].find(([, d]) => d > 0)?.[0];
    if (cycleNode !== undefined) {
      const cycle = traceCycle(cycleNode, adjacency);
      throw new CyclicDependencyError(cycle);
    }
  }

  // ── Step 4: Filter result ─────────────────────────────────────────────────
  // topoOrder includes rootPackage itself. Remove it — caller installs it.
  // Also remove already-installed packages.
  const result: string[] = [];
  for (const node of topoOrder) {
    if (node === rootPackage) continue;
    const alreadyInstalled = await checkInstalled(node);
    if (!alreadyInstalled) {
      result.push(node);
    }
  }

  return result;
}

// ─── Cycle tracer ─────────────────────────────────────────────────────────────

/**
 * Given a node known to be in a cycle, trace it to build a cycle path.
 * Returns an array like ['A', 'B', 'A'] representing the cycle.
 */
function traceCycle(
  start: string,
  adjacency: Map<string, string[]>
): string[] {
  const path: string[] = [];
  const onStack = new Set<string>();

  function dfs(node: string): boolean {
    path.push(node);
    onStack.add(node);

    for (const dep of adjacency.get(node) ?? []) {
      if (!onStack.has(dep)) {
        if (dfs(dep)) return true;
      } else {
        // Found the cycle — trace back to the repeated node
        const cycleStart = path.indexOf(dep);
        const cycle = path.slice(cycleStart);
        cycle.push(dep); // close the loop: A → B → A
        // Replace current path content with the cycle
        path.length = 0;
        path.push(...cycle);
        return true;
      }
    }

    path.pop();
    onStack.delete(node);
    return false;
  }

  dfs(start);
  return path;
}
