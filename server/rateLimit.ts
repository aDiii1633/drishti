// In-process sliding-window rate limiting.
//
// DRISHTI runs as a single Node process in front of a libSQL/SQLite file, so
// counters live in memory rather than in a shared store. That is sufficient for
// the current deployment shape but is NOT shared across replicas - if this app
// is ever scaled horizontally, these limits must move to a shared store
// (Redis or a rate-limit table) or each replica will allow `limit` attempts.

export type RateLimitDecision = {
  allowed: boolean;
  /** Attempts still available in the current window. */
  remaining: number;
  /** Seconds until the caller may retry. Zero while `allowed` is true. */
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check(key: string): RateLimitDecision;
  /** Clears a key after a legitimate success so honest users are not penalised. */
  reset(key: string): void;
  clearAll(): void;
};

const PRUNE_INTERVAL_MS = 60_000;

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const { limit, windowMs } = options;
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Rate limit must be a positive integer.");
  if (!Number.isFinite(windowMs) || windowMs <= 0)
    throw new Error("Rate limit window must be a positive duration.");

  // key -> ascending timestamps of the attempts still inside the window.
  const hits = new Map<string, number[]>();
  let lastPrunedAt = 0;

  // Drop keys whose attempts have all aged out, so a long-running process does
  // not accumulate one Map entry per login id or IP it has ever seen.
  function prune(now: number) {
    if (now - lastPrunedAt < PRUNE_INTERVAL_MS) return;
    lastPrunedAt = now;
    const cutoff = now - windowMs;
    hits.forEach((timestamps, key) => {
      const live = timestamps.filter(timestamp => timestamp > cutoff);
      if (live.length) hits.set(key, live);
      else hits.delete(key);
    });
  }

  return {
    check(key: string): RateLimitDecision {
      const now = Date.now();
      prune(now);
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter(
        timestamp => timestamp > cutoff
      );

      if (recent.length >= limit) {
        hits.set(key, recent);
        // The window frees up when the oldest recorded attempt ages out.
        const retryAfterMs = recent[0] + windowMs - now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      recent.push(now);
      hits.set(key, recent);
      return {
        allowed: true,
        remaining: limit - recent.length,
        retryAfterSeconds: 0,
      };
    },
    reset(key: string) {
      hits.delete(key);
    },
    clearAll() {
      hits.clear();
      lastPrunedAt = 0;
    },
  };
}

/** Best-effort client address for rate-limit keying. */
export function requestAddress(req: {
  ip?: string;
  socket?: { remoteAddress?: string | null } | null;
}): string {
  // NOTE: `req.ip` only reflects X-Forwarded-For when Express `trust proxy` is
  // enabled. It is deliberately used as a secondary key - the primary key is
  // the account identifier, which stays correct behind any proxy or NAT.
  return req.ip || req.socket?.remoteAddress || "unknown";
}
