import type { Request } from "express";

type Bucket = { count: number; resetAt: number };

/**
 * Rate limiter in memoria (finestra fissa) adatto a una singola istanza.
 * In deploy multi-istanza va sostituito da un limiter condiviso (es. Redis);
 * il comportamento è documentato in docs/SICUREZZA.md.
 */
export class RateLimiter {
  #buckets = new Map<string, Bucket>();
  #windowMs: number;
  #max: number;

  constructor(options: { windowMs: number; max: number }) {
    this.#windowMs = options.windowMs;
    this.#max = options.max;
  }

  /** Restituisce lo stato e incrementa il contatore. */
  hit(
    key: string,
    now = Date.now(),
  ): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    this.#cleanup(now);
    const bucket = this.#buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.#buckets.set(key, { count: 1, resetAt: now + this.#windowMs });
      return { allowed: true, remaining: this.#max - 1, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    if (bucket.count > this.#max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - now) / 1000),
        ),
      };
    }
    return {
      allowed: true,
      remaining: this.#max - bucket.count,
      retryAfterSeconds: 0,
    };
  }

  reset(key?: string): void {
    if (key) this.#buckets.delete(key);
    else this.#buckets.clear();
  }

  #cleanup(now: number): void {
    if (this.#buckets.size < 500) return;
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) this.#buckets.delete(key);
    }
  }
}

/** IP reale del client (dietro proxy fidato configurato con trust proxy). */
export function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "sconosciuto";
}

export const limiters = {
  login: new RateLimiter({ windowMs: 15 * 60 * 1000, max: 8 }),
  mfa: new RateLimiter({ windowMs: 10 * 60 * 1000, max: 8 }),
  import: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 30 }),
  upload: new RateLimiter({ windowMs: 15 * 60 * 1000, max: 60 }),
  search: new RateLimiter({ windowMs: 60 * 1000, max: 120 }),
};
