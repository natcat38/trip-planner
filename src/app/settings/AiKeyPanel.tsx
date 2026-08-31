'use client';

/**
 * Client half of the Settings route: the paste-a-key form when no key is
 * stored, or the mask/provider/model picker/remove controls once one is.
 * The paste input is `type="password"` and never carries a `defaultValue` —
 * there is no stored plaintext available to the client to populate it with,
 * and `getKeyStatus()` never returns one (only `maskedKey`).
 */

import { useActionState, useEffect, useRef, useState } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { Select } from '@/components/Select';
import { SubmitButton } from '@/components/SubmitButton';
import type { KeyStatus } from '@/server/aiSettings';
import {
  deleteApiKeyAction,
  refreshModelsAction,
  saveApiKeyAction,
  setModelAction,
  type KeyFormState,
  type ModelFormState,
} from './actions';

type Models = { id: string; free: boolean }[] | null;

// This component is 'use client' — Next.js SSRs it once for the initial
// HTML, then hydrates it in the browser. The previous `status.updatedAt
// .toLocaleDateString()` (no locale, no options) let the server's and the
// browser's own default locale/implementation each pick their own output
// shape, and a mismatch between them is exactly what caused this
// component's SSR/client hydration error. Explicit options make the format
// deterministic; hardcoding the locale to 'en-US' (rather than `undefined`)
// is what actually fixes the hydration mismatch — `undefined` still lets
// server and client resolve different default locales when they differ,
// which reintroduces the same class of bug (see ItineraryDays.tsx's
// formatDay for a case where that happened in this exact codebase).
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function AiKeyPanel({
  status,
  models,
}: {
  status: KeyStatus | null;
  models: Models;
}) {
  if (!status) return <ApiKeyForm />;
  return <StoredKeyPanel status={status} models={models} />;
}

function ApiKeyForm() {
  const [state, formAction] = useActionState<KeyFormState, FormData>(
    saveApiKeyAction,
    {},
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p className="text-sm text-danger" role="alert" tabIndex={-1} ref={errorRef}>
          {state.error}
        </p>
      )}

      <div>
        <label
          htmlFor="apiKey"
          className="block mb-1 text-sm font-medium text-foreground"
        >
          API key
        </label>
        <input
          id="apiKey"
          type="password"
          name="apiKey"
          autoComplete="off"
          placeholder="gsk_… or sk-or-v1-…"
          className="w-full rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
        />
      </div>

      <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          <strong className="text-foreground">Groq</strong> is the default
          provider — its terms don&apos;t permit training on your prompts,
          unlike OpenRouter&apos;s free tier. Get a key at{' '}
          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            console.groq.com
          </a>
          .
        </p>
        <p>
          Or use <strong className="text-foreground">OpenRouter</strong> — get a
          key at{' '}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            openrouter.ai
          </a>
          . Its free models come with a privacy trade-off, explained once a key
          is saved and you pick a model.
        </p>
      </div>

      <SubmitButton
        pendingLabel="Saving…"
        className="self-start rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        Save key
      </SubmitButton>
    </form>
  );
}

function StoredKeyPanel({
  status,
  models,
}: {
  status: KeyStatus;
  models: Models;
}) {
  const [modelState, modelAction] = useActionState<ModelFormState, FormData>(
    setModelAction,
    {},
  );
  const [selected, setSelected] = useState(status.model ?? '');
  const selectedIsFree = models?.find((m) => m.id === selected)?.free ?? false;
  const modelErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (modelState.error) modelErrorRef.current?.focus();
  }, [modelState.error]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-foreground">
          {status.provider === 'groq' ? 'Groq' : 'OpenRouter'}
        </span>{' '}
        key <code className="font-mono">{status.maskedKey}</code>, saved{' '}
        <span className="font-mono tabular-nums">
          {formatDate(status.updatedAt)}
        </span>
        .
      </p>

      {models === null ? (
        <div className="rounded border border-dashed border-border p-4">
          <p className="mb-3 text-sm text-warning">
            Couldn&apos;t load models from the provider right now — the key may
            be temporarily unreachable or no longer valid.
          </p>
          <form action={refreshModelsAction}>
            <SubmitButton
              pendingLabel="Retrying…"
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground"
            >
              Retry
            </SubmitButton>
          </form>
        </div>
      ) : (
        <form action={modelAction} className="flex flex-col gap-3">
          {modelState.error && (
            <p
              className="text-sm text-danger"
              role="alert"
              tabIndex={-1}
              ref={modelErrorRef}
            >
              {modelState.error}
            </p>
          )}

          <label
            htmlFor="model"
            className="text-sm font-medium text-foreground"
          >
            Model
          </label>
          <Select
            id="model"
            name="model"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full max-w-md px-3 py-2 text-sm text-foreground"
            options={[
              { value: '', label: 'Choose a model…', disabled: true },
              ...models.map((m) => ({
                value: m.id,
                label: `${m.id}${m.free ? ' (free)' : ''}`,
              })),
            ]}
          />

          {selectedIsFree && (
            <p className="rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
              This is a free OpenRouter model. Its endpoint generally requires
              permission to train on and publish the prompts you send —
              including anything in your trip data, like hotel names and travel
              companions&apos; names. The app never turns this permission on for
              you; OpenRouter requires it as a condition of the free tier
              itself.
            </p>
          )}

          <SubmitButton
            pendingLabel="Saving…"
            disabled={!selected}
            className="self-start rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Set model
          </SubmitButton>
        </form>
      )}

      <form action={deleteApiKeyAction}>
        <ConfirmSubmitButton
          confirm="Remove the stored API key?"
          pendingLabel="Removing…"
          className="text-sm text-danger underline"
        >
          Remove key
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}
