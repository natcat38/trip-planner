/**
 * Trip Planner browser extension popup (Phase 3 M7, ADR-0017).
 *
 * Plain ES modules-free script, no build step and no dependencies: MV3 forbids
 * remote code, the whole thing is ~150 lines, and a bundler would be a
 * toolchain to maintain for no output difference.
 *
 * It talks to /api/extension/* with a bearer token the user generates in the
 * app's Settings. It deliberately does NOT geocode: Nominatim's usage policy
 * allows "1 machine only, no distributed scripts" and requires caching "on
 * your side", and an extension installed on many machines with a per-machine
 * cache is exactly the pattern that forbids. The server geocodes, through the
 * cache it already has. See ADR-0017.
 */

const $ = (id) => document.getElementById(id);

// chrome.storage.local, not sync: syncing would push the token to every
// browser signed into the same profile, which is more copies of a credential
// than anyone asked for.
const store = {
  get: () => chrome.storage.local.get(['appUrl', 'token']),
  set: (values) => chrome.storage.local.set(values),
  clear: () => chrome.storage.local.remove(['appUrl', 'token']),
};

function show(section) {
  $('setup').hidden = section !== 'setup';
  $('save').hidden = section !== 'save';
}

function setError(id, message) {
  const el = $(id);
  el.textContent = message ?? '';
  el.hidden = !message;
}

async function api(appUrl, token, path, init = {}) {
  const response = await fetch(new URL(path, appUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Something upstream of the app answered — a proxy, a captive portal, or
    // the wrong host typed into the App URL field.
  }
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }
  if (body === null || typeof body !== 'object') {
    // Saying so beats returning {} and letting the caller trip over a missing
    // field with "cannot read properties of undefined".
    throw new Error(`${appUrl} did not answer like Trip Planner.`);
  }
  return body;
}

// The page title is usually the wrong name for a place — "Tokyo's 20 Best
// Ramen Shops" is an article, not somewhere you can go. Selected text is what
// the user actually pointed at, so it wins when there is any.
async function suggestedName(tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });
    const selection = (result?.result ?? '').trim();
    if (selection) return selection.slice(0, 200);
  } catch {
    // executeScript fails on privileged pages (chrome://, the Web Store).
    // The title is a fine fallback and the field is editable anyway.
  }
  return (tab.title ?? '').trim().slice(0, 200);
}

async function loadSaveView(appUrl, token, tab) {
  const { trips } = await api(appUrl, token, '/api/extension/trips');

  const select = $('trip');
  select.textContent = '';
  if (trips.length === 0) {
    setError('save-error', 'No trips yet — create one in the app first.');
    $('submit').disabled = true;
    return;
  }
  for (const trip of trips) {
    const option = document.createElement('option');
    option.value = trip.id;
    option.textContent = trip.name;
    select.append(option);
  }

  $('name').value = await suggestedName(tab);
}

async function connect() {
  setError('setup-error', null);
  const appUrl = $('app-url').value.trim();
  const token = $('token').value.trim();
  if (!appUrl || !token) {
    setError('setup-error', 'Both fields are required.');
    return;
  }

  const btn = $('connect');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  try {
    // Verified before storing, so a mistyped token fails here rather than on
    // first use with no obvious cause.
    await api(appUrl, token, '/api/extension/trips');
    await store.set({ appUrl, token });
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    await loadSaveView(appUrl, token, tab);
    show('save');
  } catch (err) {
    setError('setup-error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
}

async function save() {
  setError('save-error', null);
  $('status').hidden = true;
  const { appUrl, token } = await store.get();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const { place } = await api(appUrl, token, '/api/extension/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: $('trip').value,
        name: $('name').value,
        url: tab.url,
        category: $('category').value,
        notes: $('notes').value,
      }),
    });
    $('status').textContent = `Saved “${place.name}”.`;
    $('status').hidden = false;
  } catch (err) {
    setError('save-error', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save to trip';
  }
}

async function init() {
  // Real <form> submit listeners (not click handlers on the buttons) so
  // pressing Enter in any field submits, same as the primary button.
  $('setup').addEventListener('submit', (e) => {
    e.preventDefault();
    connect();
  });
  $('save').addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  $('disconnect').addEventListener('click', async () => {
    if (!confirm('Disconnect from Trip Planner?')) return;
    await store.clear();
    show('setup');
  });

  const { appUrl, token } = await store.get();
  if (!appUrl || !token) {
    show('setup');
    return;
  }

  show('save');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await loadSaveView(appUrl, token, tab);
  } catch (err) {
    // A revoked token lands here. Say so and send them back to setup rather
    // than leaving an empty trip picker with no explanation.
    setError('save-error', err.message);
    show('setup');
    setError('setup-error', err.message);
    $('app-url').value = appUrl;
  }
}

// A rejection here would leave the popup completely blank — both sections
// start hidden, and whichever one should be shown is chosen inside init().
init().catch((err) => {
  show('setup');
  setError('setup-error', err.message);
});
