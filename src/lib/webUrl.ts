// The one http(s)-only rule for URLs the app stores and later renders as links.
// A `javascript:` or `data:` URL in a stored link is a stored-XSS vector, so
// every place that persists a user- or third-party-supplied URL goes through
// here. Not a `'use server'` module: it is a pure helper.

export type WebUrlResult =
  { ok: true; url: string } | { ok: false; reason: 'invalid' | 'scheme' };

// "host:8080" has a colon but no scheme; "javascript:alert(1)" has one.
// A colon followed by digits then a slash or the end is a port.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i;

/**
 * Parses `raw` as an http(s) URL. With `assumeHttps`, a value with no scheme
 * at all (`www.example.com`, common in OSM tags) gets `https://` prepended;
 * a value with any other scheme is still rejected.
 */
export function parseHttpUrl(
  raw: string,
  options: { assumeHttps?: boolean } = {},
): WebUrlResult {
  const trimmed = raw.trim();
  const candidate =
    options.assumeHttps && !HAS_SCHEME.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' };
  }
  return { ok: true, url: parsed.toString() };
}
