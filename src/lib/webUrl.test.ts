import { describe, expect, it } from 'vitest';
import { parseHttpUrl } from './webUrl';

describe('parseHttpUrl', () => {
  it('accepts http and https', () => {
    expect(parseHttpUrl('https://example.com/a')).toEqual({
      ok: true,
      url: 'https://example.com/a',
    });
    expect(parseHttpUrl('http://example.com/')).toEqual({
      ok: true,
      url: 'http://example.com/',
    });
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com'])(
    'rejects the %s scheme, with or without assumeHttps',
    (raw) => {
      expect(parseHttpUrl(raw)).toEqual({ ok: false, reason: 'scheme' });
      expect(parseHttpUrl(raw, { assumeHttps: true })).toEqual({
        ok: false,
        reason: 'scheme',
      });
    },
  );

  it('reports a schemeless value as invalid unless assumeHttps is set', () => {
    expect(parseHttpUrl('www.example.com')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseHttpUrl('www.example.com', { assumeHttps: true })).toEqual({
      ok: true,
      url: 'https://www.example.com/',
    });
  });

  it('treats host:port as schemeless', () => {
    expect(
      parseHttpUrl('example.com:8080/menu', { assumeHttps: true }),
    ).toEqual({ ok: true, url: 'https://example.com:8080/menu' });
  });

  it('reports unparseable input as invalid', () => {
    expect(parseHttpUrl('', { assumeHttps: true })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseHttpUrl('http://', { assumeHttps: true })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});
