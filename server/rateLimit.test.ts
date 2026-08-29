import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, requestAddress } from "./rateLimit";

describe("sliding-window rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts up to the configured limit and blocks the next one", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.check("user").allowed).toBe(true);
    expect(limiter.check("user").allowed).toBe(true);
    const last = limiter.check("user");
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);

    const blocked = limiter.check("user");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("first").allowed).toBe(true);
    expect(limiter.check("first").allowed).toBe(false);
    // A different account must not be penalised by another account's attempts.
    expect(limiter.check("second").allowed).toBe(true);
  });

  it("frees the window once the oldest attempt ages out", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });

    expect(limiter.check("user").allowed).toBe(true);
    expect(limiter.check("user").allowed).toBe(true);
    expect(limiter.check("user").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("user").allowed).toBe(true);
  });

  it("reports a retry delay that shrinks as the window slides", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("user");

    const immediately = limiter.check("user");
    vi.advanceTimersByTime(50_000);
    const later = limiter.check("user");

    expect(immediately.allowed).toBe(false);
    expect(later.allowed).toBe(false);
    expect(later.retryAfterSeconds).toBeLessThan(immediately.retryAfterSeconds);
  });

  it("clears a key on reset so a successful login is not penalised", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("user").allowed).toBe(true);
    limiter.reset("user");
    expect(limiter.check("user").allowed).toBe(true);
  });

  it("rejects a nonsensical configuration instead of silently allowing everything", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ limit: 5, windowMs: 0 })).toThrow();
  });

  it("does not retain keys whose attempts have all aged out", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000 });
    for (let index = 0; index < 500; index += 1) limiter.check(`key-${index}`);

    // Past the window and past the prune interval, a previously seen key is
    // treated as brand new rather than growing the map forever.
    vi.advanceTimersByTime(120_000);
    const decision = limiter.check("key-0");
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(4);
  });

  it("falls back through address sources without throwing", () => {
    expect(requestAddress({ ip: "203.0.113.5" })).toBe("203.0.113.5");
    expect(requestAddress({ socket: { remoteAddress: "198.51.100.9" } })).toBe(
      "198.51.100.9"
    );
    expect(requestAddress({})).toBe("unknown");
  });
});
