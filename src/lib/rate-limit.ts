const store = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  action: string,
  entityId: string,
  opts: { windowMs: number; max: number }
): Promise<void> {
  const key = `${action}:${entityId}`;
  const now = Date.now();
  const entry = store.get(key);
  
  if (entry && now < entry.resetAt) {
    if (entry.count >= opts.max) {
      throw new Error(
        `RATE_LIMITED: ${action} for ${entityId}. Retry after ${Math.ceil((entry.resetAt - now) / 1000)}s`
      );
    }
    entry.count++;
  } else {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
  }
}
