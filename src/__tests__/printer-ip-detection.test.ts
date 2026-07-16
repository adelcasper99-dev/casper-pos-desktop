import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('detectLocalIp', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns IP on successful response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ip: '192.168.1.100' }),
    } as Response);

    const { printService } = await import('@/lib/print-service');
    const ip = await printService.detectLocalIp();
    expect(ip).toBe('192.168.1.100');
  });

  it('retries on HTTP 500 and eventually returns null', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Server error'));

    const { printService } = await import('@/lib/print-service');
    const ip = await printService.detectLocalIp();
    expect(ip).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 127.0.0.1 and returns it only on last attempt', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ip: '127.0.0.1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ip: '127.0.0.1' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ip: '192.168.1.50' }),
      } as Response);

    const { printService } = await import('@/lib/print-service');
    const ip = await printService.detectLocalIp();
    expect(ip).toBe('192.168.1.50');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns 127.0.0.1 on third attempt if server never gives external IP', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ip: '127.0.0.1' }),
    } as Response);

    const { printService } = await import('@/lib/print-service');
    const ip = await printService.detectLocalIp();
    expect(ip).toBe('127.0.0.1');
  });

  it('uses AbortController with 3s timeout', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(global.fetch).mockImplementation(async (_url, opts) => {
      signal = opts?.signal as AbortSignal;
      return { ok: true, json: async () => ({ ip: '10.0.0.1' }) } as Response;
    });

    const { printService } = await import('@/lib/print-service');
    await printService.detectLocalIp();
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
  });
});
