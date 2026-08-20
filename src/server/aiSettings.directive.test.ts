import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// A source-level assertion rather than a behavioural one, because the failure
// it guards has no runtime symptom in this process: `'use server'` turns every
// export of a module into a Server Action, and Next treats Server Actions as
// public HTTP endpoints. Adding the directive to aiSettings.ts would therefore
// publish getDecryptedKey — which returns the user's plaintext provider key —
// as an endpoint any signed-in user could call from the browser, and hand any
// XSS a one-call exfiltration route. Nothing would fail; the key would just
// quietly become reachable.
describe('aiSettings module directives', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/server/aiSettings.ts'),
    'utf8',
  );

  it("is not a 'use server' module, because it returns a decrypted key", () => {
    expect(source).toContain('getDecryptedKey');
    expect(source).not.toMatch(/^\s*['"]use server['"]/m);
  });

  it('keeps the decrypted key out of the settings route actions', () => {
    const actions = readFileSync(
      join(process.cwd(), 'src/app/settings/actions.ts'),
      'utf8',
    );
    // That file IS a 'use server' module, so anything it exports is callable
    // from the browser — it must never re-export or return the raw key.
    expect(actions).toMatch(/^\s*['"]use server['"]/m);
    expect(actions).not.toContain('getDecryptedKey');
  });
});
