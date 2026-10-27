/** V3 fold-in: on phones the quiet "now playing" chip must not sit on the table's "First to n points" goal line. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
describe('now-playing chip vs goal line (≤ 600px)', () => {
  it('chip moves to the right edge, capped at 44vw, not centred', () => {
    expect(css).toMatch(/@media \(max-width: 600px\) \{\s*\.now-playing\.quiet \{ left: auto; right: 10px; transform: none; max-width: 44vw; \}/);
  });
  it('goal row stacks (after its base rule) so the right side is free for the chip', () => {
    const base = css.indexOf('.pp-goal { display: flex;');
    const stack = css.indexOf('@media (max-width: 600px) { .pp-goal { flex-direction: column;');
    expect(base).toBeGreaterThan(-1);
    expect(stack).toBeGreaterThan(base);
  });
});
