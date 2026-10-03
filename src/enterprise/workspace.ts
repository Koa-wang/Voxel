import { access, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';

export interface WorkspacePackage {
  name: string;
  dir: string;
  pkg: Record<string, unknown>;
  dependencies: Record<string, string>;
}

export interface WorkspaceInfo {
  root: string;
  packages: WorkspacePackage[];
  graph: Map<string, string[]>;
  order: string[];
  cycles: string[][];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal YAML list parser for `pnpm-workspace.yaml` — only extracts the
 * `packages:` array without any external YAML dependency.
 */
function parseYamlPackages(raw: string): string[] {
  const out: string[] = [];
  let inPackages = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (/^packages\s*:/.test(trimmed)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (/^[\w-]+:/.test(trimmed) && !trimmed.startsWith('-')) break;
      const m = trimmed.match(/^-\s*['"]?([^'"#]+)['"]?/);
      if (m) out.push(m[1].trim());
    }
  }
  return out;
}

/**
 * E1 — Monorepo workspace detection.
 * Supports pnpm-workspace.yaml and package.json `workspaces`.
 */
export async function detectWorkspace(cwd: string): Promise<WorkspaceInfo | null> {
  let globs: string[] = [];
  const pnpmPath = resolve(cwd, 'pnpm-workspace.yaml');
  const pkgPath = resolve(cwd, 'package.json');

  if (await exists(pnpmPath)) {
    globs = parseYamlPackages(await readFile(pnpmPath, 'utf8'));
  } else if (await exists(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      workspaces?: string[] | { packages?: string[] };
    };
    if (Array.isArray(pkg.workspaces)) globs = pkg.workspaces;
    else if (pkg.workspaces?.packages) globs = pkg.workspaces.packages;
  }

  if (globs.length === 0) return null;

  const packageDirs = new Set<string>();
  for (const glob of globs) {
    const prefix = glob.replace(/[*?].*$/, '').replace(/\/$/, '');
    await collectPackageDirs(cwd, prefix, packageDirs);
  }

  const packages: WorkspacePackage[] = [];
  for (const dir of packageDirs) {
    const pkgFile = resolve(dir, 'package.json');
    if (!(await exists(pkgFile))) continue;
    const pkg = JSON.parse(await readFile(pkgFile, 'utf8')) as Record<string, unknown>;
    if (pkg.name) {
      packages.push({
        name: String(pkg.name),
        dir,
        pkg,
        dependencies: { ...((pkg.dependencies as Record<string, string>) ?? {}), ...((pkg.devDependencies as Record<string, string>) ?? {}) },
      });
    }
  }

  const graph = buildDependencyGraph(packages);
  const { order, cycles } = topologicalSort(graph);
  return { root: cwd, packages, graph, order, cycles };
}

async function collectPackageDirs(root: string, prefix: string, out: Set<string>): Promise<void> {
  const { readdir } = await import('node:fs/promises');
  const base = isAbsolute(prefix) ? prefix : resolve(root, prefix);
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = resolve(base, entry.name);
    if (await exists(resolve(full, 'package.json'))) out.add(full);
    await collectPackageDirs(root, full, out);
  }
}

/** E1 — build a package dependency DAG (name → internal dependency names). */
export function buildDependencyGraph(packages: WorkspacePackage[]): Map<string, string[]> {
  const names = new Set(packages.map((p) => p.name));
  const graph = new Map<string, string[]>();
  for (const p of packages) {
    graph.set(p.name, Object.keys(p.dependencies).filter((d) => names.has(d)));
  }
  return graph;
}

/**
 * E1 — Kahn topological sort with deterministic tie-breaking (alphabetical).
 * Detects cycles and breaks them so builds never dead-lock.
 */
export function topologicalSort(graph: Map<string, string[]>): {
  order: string[];
  cycles: string[][];
} {
  const indegree = new Map<string, number>();
  for (const node of graph.keys()) indegree.set(node, 0);
  for (const deps of graph.values()) for (const d of deps) indegree.set(d, (indegree.get(d) ?? 0) + 1);

  const queue = [...indegree.entries()].filter(([, n]) => n === 0).map(([n]) => n).sort();
  const order: string[] = [];
  const remaining = new Set(graph.keys());

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!remaining.has(node)) continue;
    remaining.delete(node);
    order.push(node);
    for (const dep of graph.get(node) ?? []) {
      indegree.set(dep, (indegree.get(dep) ?? 0) - 1);
      if (indegree.get(dep) === 0) {
        queue.push(dep);
        queue.sort();
      }
    }
  }

  // Cycle detection + breaking: any remaining nodes are part of a cycle.
  const cycles: string[][] = [];
  if (remaining.size > 0) {
    const visited = new Set<string>();
    for (const node of [...remaining].sort()) {
      if (visited.has(node)) continue;
      const cycle: string[] = [];
      let cur = node;
      while (!visited.has(cur) && remaining.has(cur) && cycle.length < remaining.size) {
        visited.add(cur);
        cycle.push(cur);
        const next = (graph.get(cur) ?? []).find((d) => remaining.has(d));
        if (!next) break;
        cur = next;
      }
      if (cycle.length > 1) cycles.push(cycle);
    }
    // Break cycles by appending them in alphabetical order.
    order.push(...[...remaining].sort());
  }

  return { order, cycles };
}

export function relativePackagePath(pkg: WorkspacePackage, root: string): string {
  return pkg.dir.replace(root + sep, '');
}
