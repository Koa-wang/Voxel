import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { FrameworkName, ShowcaseConfig } from '../types.js';
import { logger } from '../core/logger.js';

export interface ComponentSource {
  framework: FrameworkName;
  path: string;
  code: string;
}

export interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  tags: string[];
  props: Record<string, unknown>;
  sources: ComponentSource[];
}

function frameworkForFile(file: string): FrameworkName | null {
  if (file.endsWith('.vue')) return 'vue';
  if (file.endsWith('.solid.tsx') || file.endsWith('.solid.jsx')) return 'solid';
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) return 'react';
  return null;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * F7 / `unibits showcase generate` — scan a components directory and build the
 * showcase manifest. Convention per component dir:
 *   index.vue       → Vue source
 *   index.tsx       → React source
 *   index.solid.tsx → Solid source
 *   meta.json       → name / category / description / props schema / tags
 */
export async function scanComponents(
  componentsDir: string,
  fallbackCategory = 'Components',
): Promise<ComponentMeta[]> {
  const metas: ComponentMeta[] = [];
  let entries;
  try {
    entries = await readdir(componentsDir, { withFileTypes: true });
  } catch {
    return metas;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(componentsDir, entry.name);
    const metaPath = join(dir, 'meta.json');
    const meta = (await exists(metaPath))
      ? JSON.parse(await readFile(metaPath, 'utf8'))
      : {};

    const sources: ComponentSource[] = [];
    const files = (await readdir(dir)).filter((f) => frameworkForFile(f));
    for (const file of files) {
      const framework = frameworkForFile(file)!;
      sources.push({ framework, path: join(dir, file), code: await readFile(join(dir, file), 'utf8') });
    }
    if (sources.length === 0) continue;

    metas.push({
      name: meta.name ?? entry.name,
      category: meta.category ?? fallbackCategory,
      description: meta.description ?? '',
      tags: meta.tags ?? [],
      props: meta.props ?? {},
      sources,
    });
  }
  return metas;
}

export async function generateManifest(
  componentsDir: string,
  outDir: string,
  showcase: ShowcaseConfig,
): Promise<ComponentMeta[]> {
  const metas = await scanComponents(componentsDir);
  await mkdir(outDir, { recursive: true });
  const manifest = { title: showcase.title, components: metas };
  await writeFile(resolve(outDir, 'showcase-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  logger.success(`generated showcase manifest with ${metas.length} component(s)`);
  return metas;
}
