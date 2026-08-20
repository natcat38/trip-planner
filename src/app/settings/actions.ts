'use server';

/**
 * Server Actions for the Settings route (Phase 3 M3, ADR-0011): save/replace
 * the user's own Groq/OpenRouter API key, remove it, choose a model, or
 * retry fetching the model list after a transient provider failure. Thin
 * wrappers around src/server/aiSettings.ts, mirroring
 * src/app/trips/[id]/places/actions.ts's shape. Every export gates on
 * `currentUserId()` inside aiSettings.ts itself — nothing here reaches for
 * `db` or `crypto` directly, and none of these ever return the raw key.
 * @packageDocumentation
 */

import { revalidatePath } from 'next/cache';
import { deleteApiKey, saveApiKey, setModel } from '@/server/aiSettings';
import {
  createExtensionToken,
  revokeExtensionToken,
} from '@/server/extensionToken';
import { ValidationError } from '@/server/errors';

export interface KeyFormState {
  error?: string;
}

export async function saveApiKeyAction(
  _prevState: KeyFormState,
  formData: FormData,
): Promise<KeyFormState> {
  const rawKey = String(formData.get('apiKey') ?? '').trim();
  if (!rawKey) return { error: 'Paste an API key first.' };
  try {
    await saveApiKey(rawKey);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath('/settings');
  return {};
}

export async function deleteApiKeyAction(): Promise<void> {
  await deleteApiKey();
  revalidatePath('/settings');
}

export interface ModelFormState {
  error?: string;
}

export async function setModelAction(
  _prevState: ModelFormState,
  formData: FormData,
): Promise<ModelFormState> {
  const model = String(formData.get('model') ?? '');
  try {
    await setModel(model);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath('/settings');
  return {};
}

// listAvailableModels() is called fresh on every render of the settings page
// itself — this action exists purely to force that re-render (and therefore
// a fresh provider request) after a transient failure, without giving the
// retry button anything else to do.
export async function refreshModelsAction(): Promise<void> {
  revalidatePath('/settings');
}

export interface ExtensionTokenFormState {
  // The plaintext token, returned to the browser exactly once. Only its hash
  // is stored (ADR-0017), so if the user doesn't copy it now they generate a
  // new one — there is no path to showing this value again.
  token?: string;
}

// Generate and revoke share one action, and therefore one useActionState, on
// purpose. As two actions the revoke button had no way to clear the token the
// generate button had just put on screen, so revoking left a dead credential
// displayed under "copy this now" as though it still worked.
export async function manageExtensionTokenAction(
  _prevState: ExtensionTokenFormState,
  formData: FormData,
): Promise<ExtensionTokenFormState> {
  if (formData.get('intent') === 'revoke') {
    await revokeExtensionToken();
    revalidatePath('/settings');
    return {};
  }
  const token = await createExtensionToken();
  revalidatePath('/settings');
  return { token };
}
