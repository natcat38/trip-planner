'use client';

/**
 * Client half of the Settings route: the paste-a-key form when no key is
 * stored, or the mask/provider/model picker/remove controls once one is.
 * The paste input is `type="password"` and never carries a `defaultValue` —
 * there is no stored plaintext available to the client to populate it with,
 * and `getKeyStatus()` never returns one (only `maskedKey`).
 */

import { useActionState, useState } from 'react';
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
  const [state, formAction, isPending] = useActionState<KeyFormState, FormData>(
    saveApiKeyAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <label
          htmlFor="apiKey"
          className="block mb-1 text-sm font-medium text-black dark:text-zinc-50"
        >
          API key
        </label>
        <input
          id="apiKey"
          type="password"
          name="apiKey"
          autoComplete="off"
          placeholder="gsk_… or sk-or-v1-…"
          className="w-full rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
        />
      </div>

      <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          <strong className="text-black dark:text-zinc-50">Groq</strong> is the
          default provider — its terms don&apos;t permit training on your
          prompts, unlike OpenRouter&apos;s free tier. Get a key at{' '}
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
          Or use{' '}
          <strong className="text-black dark:text-zinc-50">OpenRouter</strong> —
          get a key at{' '}
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

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isPending ? 'Saving…' : 'Save key'}
      </button>
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
  const [modelState, modelAction, modelPending] = useActionState<
    ModelFormState,
    FormData
  >(setModelAction, {});
  const [selected, setSelected] = useState(status.model ?? '');
  const selectedIsFree = models?.find((m) => m.id === selected)?.free ?? false;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-black dark:text-zinc-50">
          {status.provider === 'groq' ? 'Groq' : 'OpenRouter'}
        </span>{' '}
        key <code className="font-mono">{status.maskedKey}</code>, saved{' '}
        {status.updatedAt.toLocaleDateString()}.
      </p>

      {models === null ? (
        <div className="rounded border border-dashed border-black/[.08] p-4 dark:border-white/25">
          <p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
            Couldn&apos;t load models from the provider right now — the key may
            be temporarily unreachable or no longer valid.
          </p>
          <form action={refreshModelsAction}>
            <SubmitButton
              pendingLabel="Retrying…"
              className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium text-black dark:border-white/25 dark:text-zinc-50"
            >
              Retry
            </SubmitButton>
          </form>
        </div>
      ) : (
        <form action={modelAction} className="flex flex-col gap-3">
          {modelState.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {modelState.error}
            </p>
          )}

          <label
            htmlFor="model"
            className="text-sm font-medium text-black dark:text-zinc-50"
          >
            Model
          </label>
          {/* The explicit background is required, not cosmetic: with a
              transparent select the native option list inherits the page's
              dark backdrop but keeps default dark text, leaving the choices
              nearly unreadable. Options carry their own colours because
              browsers don't inherit the select's into the popup list. */}
          <select
            id="model"
            name="model"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full max-w-md rounded border border-black/[.08] bg-white px-3 py-2 text-sm text-black dark:border-white/25 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="" disabled className="bg-white dark:bg-zinc-900">
              Choose a model…
            </option>
            {models.map((m) => (
              <option
                key={m.id}
                value={m.id}
                className="bg-white text-black dark:bg-zinc-900 dark:text-zinc-50"
              >
                {m.id}
                {m.free ? ' (free)' : ''}
              </option>
            ))}
          </select>

          {selectedIsFree && (
            <p className="rounded border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-300">
              This is a free OpenRouter model. Its endpoint generally requires
              permission to train on and publish the prompts you send —
              including anything in your trip data, like hotel names and travel
              companions&apos; names. The app never turns this permission on for
              you; OpenRouter requires it as a condition of the free tier
              itself.
            </p>
          )}

          <button
            type="submit"
            disabled={modelPending || !selected}
            className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {modelPending ? 'Saving…' : 'Set model'}
          </button>
        </form>
      )}

      <form
        action={deleteApiKeyAction}
        onSubmit={(e) => {
          if (!window.confirm('Remove the stored API key?')) {
            e.preventDefault();
          }
        }}
      >
        <button
          type="submit"
          className="text-sm text-red-600 dark:text-red-400 underline"
        >
          Remove key
        </button>
      </form>
    </div>
  );
}
