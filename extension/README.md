# Trip Planner browser extension

Save a place to a trip from any webpage. MV3, no build step — the folder is
loaded as-is.

## Install (unpacked)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → select this `extension/` folder.
3. In the app, go to **Settings → Browser extension** and generate a token.
4. Click the extension's icon, paste the token, and Connect.

## How it works

The popup reads the active tab's title and any selected text, then POSTs to
`/api/extension/places` with the token as `Authorization: Bearer`. The app
geocodes the name server-side and saves it to the trip's places tray.

Selected text wins over the page title, because a title like "Tokyo's 20 Best
Ramen Shops" is an article, not a place.

## Why a token rather than your session cookie

The extension's origin is `chrome-extension://`, which browsers treat as
cross-site, and a cookie would carry ambient authority that every page in the
browser could trigger — which is what CSRF is. A bearer token is never
attached automatically. It is stored hashed server-side and shown to you once;
revoke it from Settings at any time without signing out anywhere. See
`docs/adr/0017-browser-extension-token-auth.md`.

## Why it doesn't geocode locally

Nominatim's usage policy allows "1 machine only, no distributed scripts" and
requires results to be cached "on your side". An extension installed on many
machines, each with its own cache, is precisely that pattern. The server
geocodes instead, through the cache it already keeps.

## Local development

`host_permissions` includes `http://localhost:3000/*` so the same build works
against a local dev server — set the App URL to `http://localhost:3000` when
connecting. That entry is only useful for development; drop it if this is ever
packaged for anyone else.
