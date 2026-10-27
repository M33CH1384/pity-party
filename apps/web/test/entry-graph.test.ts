import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '../src');

/** Value imports only. `import type` is erased and must not count as a runtime edge. */
function valueImports(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const clause = m[1]!.trim();
    const spec = m[2]!;
    if (clause.startsWith('type ')) continue;
    if (clause.startsWith('{')) {
      const inner = clause.slice(1, clause.lastIndexOf('}'));
      const binds = inner.split(',').map((b) => b.trim()).filter(Boolean);
      if (binds.length > 0 && binds.every((b) => b.startsWith('type '))) continue;
    }
    out.push(spec);
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return spec;
  const base = normalize(join(dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try { readFileSync(c); return c; } catch { /* next */ }
  }
  return null;
}

describe('first script on a reload', () => {
  it('does not statically import three (that download was the blank-screen stall)', () => {
    const entry = join(src, 'main.tsx');
    const seen = new Set<string>();
    const pkgs = new Set<string>();
    const queue = [entry];
    while (queue.length) {
      const path = queue.pop()!;
      if (seen.has(path) || !path.startsWith('/')) continue;
      seen.add(path);
      for (const spec of valueImports(path)) {
        const next = resolve(path, spec);
        if (!next) continue;
        if (next.startsWith('.')) continue;
        if (!next.startsWith('/')) { pkgs.add(next); continue; }
        queue.push(next);
      }
    }
    const heavy = [...pkgs].filter((p) => p === 'three' || p.startsWith('@react-three') || p === 'postprocessing');
    expect(heavy).toEqual([]);
  });

  it('V10: src/three3d/** keeps three behind the lazy PPScene import', () => {
    const dir = join(src, 'three3d');
    const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => join(dir, f));
    expect(files.length).toBeGreaterThan(0);
    // walk the first-load graph again and collect every three3d file it reaches statically
    const seen = new Set<string>(); const queue = [join(src, 'main.tsx')];
    while (queue.length) {
      const path = queue.pop()!;
      if (seen.has(path)) continue; seen.add(path);
      for (const spec of valueImports(path)) { const next = resolve(path, spec); if (next && next.startsWith('/')) queue.push(next); }
    }
    const reached = files.filter((f) => seen.has(f));
    const imports3 = (f: string) => valueImports(f).some((p) => p === 'three' || p.startsWith('three/') || p.startsWith('@react-three'));
    // the three-importing files exist (PPScene + its table / theme helpers) but none is on the first-load graph
    expect(files.filter(imports3).map((f) => f.slice(dir.length + 1)).sort()).toEqual(['PPScene.tsx', 'table.ts', 'themeUniforms.ts']);
    expect(reached.filter(imports3)).toEqual([]);
    expect(reached.map((f) => f.slice(dir.length + 1)).sort()).toEqual(['Table3DLayer.tsx', 'preload.ts', 'renderer.ts']);
    // preload reaches PPScene only through a dynamic import()
    expect(readFileSync(join(dir, 'preload.ts'), 'utf8')).toMatch(/import\('\.\/PPScene'\)/);
  });
});
