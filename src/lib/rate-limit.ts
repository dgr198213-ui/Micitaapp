import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Best-effort rate limiting (§8.4): if Upstash isn't configured (e.g. local dev), every
// check succeeds — document this clearly in the production checklist instead of failing
// closed, which would make local development impossible without a Redis account.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const limiters = new Map<string, Ratelimit>();

function getLimiter(name: string, requests: number, windowSeconds: number): Ratelimit | null {
  if (!redis) return null;
  const key = `${name}:${requests}:${windowSeconds}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
      prefix: `micitaapp:${name}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  name: string,
  identifier: string,
  requests: number,
  windowSeconds: number
): Promise<{ success: boolean; retryAfterSeconds?: number }> {
  const limiter = getLimiter(name, requests, windowSeconds);
  if (!limiter) {
    return { success: true };
  }
  const result = await limiter.limit(identifier);
  if (result.success) {
    return { success: true };
  }
  return { success: false, retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
