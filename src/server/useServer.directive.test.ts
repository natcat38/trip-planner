import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `'use server'` turns every export of a module into a Server Action, and Next
// treats Server Actions as public HTTP endpoints. An exported function that
// does not run an access gate first is therefore callable by anyone with the
// route's id. summarizeBudget once sat ungated in budget.ts for exactly this
// reason. Source-level because nothing fails at runtime when it happens.
//
// Rule: every exported function in a 'use server' module under src/server
// must call a gate (requireTripAccess, requireTripOwner,
// requireShareToken, requirePlace, currentUserId, ...) or a same-file wrapper around one.
// Pure helpers belong in src/lib or a module without the directive.
const dir = join(process.cwd(), 'src/server');
const files = readdirSync(dir).filter(
  (f) => f.endsWith('.ts') && !/\.(test|db\.test)\.ts$/.test(f),
);
const useServerFiles = files.filter((f) =>
  /^\s*['"]use server['"]/m.test(readFileSync(join(dir, f), 'utf8')),
);

// Body of each `export async function name(...) {` up to the next top-level
// declaration. Top-level code in these files starts at column 0.
function exportedFunctions(source: string) {
  const out: { name: string; body: string }[] = [];
  const re = /^export (?:async )?function (\w+)|^export const (\w+) = /gm;
  const starts = [...source.matchAll(re)];
  const topLevel = [...source.matchAll(/^\S/gm)].map((m) => m.index!);
  for (const m of starts) {
    const end =
      topLevel.find(
        (i) => i > m.index! + 1 && source[i] !== '}' && source[i] !== ')',
      ) ?? source.length;
    out.push({ name: (m[1] ?? m[2])!, body: source.slice(m.index!, end) });
  }
  return out;
}

// A gate is a require* check, or a session-identity lookup that throws when
// signed out (currentUserId, currentUserEmail, currentUserIdentity).
const GATE = /\b(?:require|currentUser)\w*\(/;

describe("'use server' modules under src/server", () => {
  it('finds the modules this test is meant to police', () => {
    expect(useServerFiles).toContain('budget.ts');
    expect(useServerFiles).toContain('trips.ts');
  });

  it('budget.ts exports only getBudgetSummary', () => {
    const source = readFileSync(join(dir, 'budget.ts'), 'utf8');
    expect(exportedFunctions(source).map((f) => f.name)).toEqual([
      'getBudgetSummary',
    ]);
  });

  for (const file of useServerFiles) {
    it(`${file}: every exported function runs a require* gate`, () => {
      const source = readFileSync(join(dir, file), 'utf8');
      const ungated = exportedFunctions(source)
        .filter((f) => !GATE.test(f.body))
        .map((f) => f.name);
      expect(ungated).toEqual([]);
    });
  }
});
