import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetFxCacheForTests, convertMinor } from './fx';

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }),
  );
}

beforeEach(() => {
  process.env.EXCHANGE_RATE_API_KEY = 'test-key';
  __resetFxCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('convertMinor', () => {
  it('returns the amount unchanged when currencies match, without calling fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect(await convertMinor(350000, 'JPY', 'JPY')).toBe(350000);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches rates from the source currency and converts to the target', async () => {
    mockFetchOnce({ result: 'success', base_code: 'EUR', conversion_rates: { JPY: 165 } });

    const result = await convertMinor(6000, 'EUR', 'JPY'); // €60.00 -> ¥9,900
    expect(result).toBe(9900);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://v6.exchangerate-api.com/v6/test-key/latest/EUR'),
    );
  });

  it('caches rates for the same source currency across calls', async () => {
    mockFetchOnce({ result: 'success', base_code: 'EUR', conversion_rates: { JPY: 165 } });

    await convertMinor(1000, 'EUR', 'JPY');
    await convertMinor(2000, 'EUR', 'JPY');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null (not throw) when the HTTP request fails', async () => {
    mockFetchOnce({}, false);
    expect(await convertMinor(1000, 'EUR', 'JPY')).toBeNull();
  });

  it('returns null when the API reports an error result', async () => {
    mockFetchOnce({ result: 'error', 'error-type': 'quota-reached' });
    expect(await convertMinor(1000, 'EUR', 'JPY')).toBeNull();
  });

  it('returns null when the target currency has no rate yet', async () => {
    mockFetchOnce({ result: 'success', base_code: 'EUR', conversion_rates: { USD: 1.08 } });
    expect(await convertMinor(1000, 'EUR', 'JPY')).toBeNull();
  });
});
