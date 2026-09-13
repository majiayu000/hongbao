import { createHash, createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

/** Sliding-window burst limit (requests per window). */
const DEFAULT_RATE_LIMIT = 5
const DEFAULT_RATE_WINDOW_MS = 60_000
/** Per-IP daily generate ceiling. */
const DEFAULT_DAILY_QUOTA = 20
/** Drop idle in-memory buckets after this TTL (local single-process only). */
const DEFAULT_BUCKET_TTL_MS = 48 * 60 * 60_000

const SESSION_COOKIE = "generate_session"
const SESSION_MAX_AGE_SEC = 60 * 60 * 12

type Bucket = {
  hits: number[]
  day: string
  dayCount: number
  lastSeen: number
}

const buckets = new Map<string, Bucket>()

function todayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Constant-time compare for access tokens. */
export function accessTokensMatch(provided: string, expected: string): boolean {
  return safeEqual(provided, expected)
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32)
}

/**
 * Quota subject key (trusted client IP when configured, else auth identity).
 *
 * By default ignores client-controlled forwarding headers so callers cannot
 * rotate X-Forwarded-For to mint fresh buckets. Set GENERATE_TRUSTED_PROXY_HOPS
 * to the number of trusted proxies that append to X-Forwarded-For; the client
 * address is taken at index (length - hops).
 *
 * When no trusted address is available, fall back to a stable fingerprint of
 * the session cookie or access token so distinct authenticated callers do not
 * collapse into one shared "unknown" bucket.
 */
export function getClientIp(req: NextRequest): string {
  const hops = parseNonNegativeInt(process.env.GENERATE_TRUSTED_PROXY_HOPS, 0)
  if (hops > 0) {
    const forwarded = req.headers.get("x-forwarded-for")
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
      const idx = parts.length - hops
      if (idx >= 0 && parts[idx]) {
        return parts[idx]
      }
    }
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value?.trim()
  if (cookie) {
    return `sess:${fingerprint(cookie)}`
  }

  const token = extractAccessToken(req)
  if (token) {
    return `tok:${fingerprint(token)}`
  }

  // Unreachable after assertGenerateAccess; keep distinct from any shared sentinel.
  return `unauth:${fingerprint(req.headers.get("user-agent") ?? "missing")}`
}

/**
 * Extract shared secret from Authorization: Bearer … or x-generate-token.
 */
export function extractAccessToken(req: NextRequest): string | null {
  const headerToken = req.headers.get("x-generate-token")?.trim()
  if (headerToken) return headerToken

  const auth = req.headers.get("authorization")
  if (!auth) return null
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return match?.[1]?.trim() || null
}

function signSessionValue(secret: string, issuedAtMs: number): string {
  const payload = `v1.${issuedAtMs}`
  const sig = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

export function verifySessionCookie(
  raw: string | undefined,
  secret: string
): boolean {
  if (!raw) return false
  const match = /^v1\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(raw.trim())
  if (!match) return false
  const issuedAtMs = Number.parseInt(match[1], 10)
  if (!Number.isFinite(issuedAtMs)) return false
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_SEC * 1000) return false
  const expected = signSessionValue(secret, issuedAtMs)
  return safeEqual(raw.trim(), expected)
}

export function createSessionCookieValue(secret: string): string {
  return signSessionValue(secret, Date.now())
}

export function sessionCookieName(): string {
  return SESSION_COOKIE
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

/**
 * Reject before any upstream call when GENERATE_ACCESS_TOKEN is missing
 * or the caller does not present a matching secret / signed session cookie.
 */
export function assertGenerateAccess(req: NextRequest): NextResponse | null {
  const expected = process.env.GENERATE_ACCESS_TOKEN?.trim()
  if (!expected) {
    return NextResponse.json(
      { error: "未配置 GENERATE_ACCESS_TOKEN，拒绝公开生成请求" },
      { status: 503 }
    )
  }

  const provided = extractAccessToken(req)
  if (provided && safeEqual(provided, expected)) {
    return null
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (verifySessionCookie(cookie, expected)) {
    return null
  }

  return NextResponse.json(
    {
      error: "未授权：需要有效的生成访问令牌或已解锁会话",
      code: "local_auth_required",
    },
    { status: 401 }
  )
}

function redisConfig(): { url: string; token: string } | null {
  const url = (
    process.env.GENERATE_QUOTA_REDIS_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  ).trim()
  const token = (
    process.env.GENERATE_QUOTA_REDIS_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  ).trim()
  if (!url || !token) return null
  return { url, token }
}

async function redisCommand(
  cfg: { url: string; token: string },
  args: Array<string | number>
): Promise<unknown> {
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    throw new Error(`quota redis HTTP ${res.status}`)
  }
  const payload = (await res.json()) as { result?: unknown; error?: string }
  if (payload.error) {
    throw new Error(`quota redis: ${payload.error}`)
  }
  return payload.result
}

/**
 * Drop idle buckets only when their burst/daily counters no longer apply.
 * A short GENERATE_BUCKET_TTL_MS must not wipe in-horizon state and reset quotas.
 */
function evictIdleBuckets(now: number, ttlMs: number, rateWindowMs: number): void {
  const day = todayKey(now)
  for (const [key, bucket] of buckets) {
    const hasBurstState = bucket.hits.some((t) => now - t < rateWindowMs)
    const hasDailyState = bucket.day === day && bucket.dayCount > 0
    if (hasBurstState || hasDailyState) {
      continue
    }
    if (now - bucket.lastSeen > ttlMs) {
      buckets.delete(key)
    }
  }
}

/**
 * Atomically prune → count → check → insert burst hits and bump the daily
 * counter so concurrent same-IP requests cannot race past the burst limit.
 */
const QUOTA_LUA = `
local burstKey = KEYS[1]
local dayKey = KEYS[2]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local rateLimit = tonumber(ARGV[3])
local dailyQuota = tonumber(ARGV[4])
local member = ARGV[5]
local burstTtl = tonumber(ARGV[6])
local dayTtl = tonumber(ARGV[7])

redis.call('ZREMRANGEBYSCORE', burstKey, 0, windowStart)
local burstCount = redis.call('ZCARD', burstKey)
if burstCount >= rateLimit then
  return {'burst'}
end

local dayCount = tonumber(redis.call('GET', dayKey) or '0')
if dayCount >= dailyQuota then
  return {'daily'}
end

redis.call('ZADD', burstKey, now, member)
redis.call('PEXPIRE', burstKey, burstTtl)
local nextDay = redis.call('INCR', dayKey)
if nextDay == 1 then
  redis.call('PEXPIRE', dayKey, dayTtl)
end
if nextDay > dailyQuota then
  return {'daily'}
end
return {'ok'}
`

async function assertQuotaRedis(
  ip: string,
  rateLimit: number,
  rateWindowMs: number,
  dailyQuota: number,
  cfg: { url: string; token: string }
): Promise<NextResponse | null> {
  const now = Date.now()
  const day = todayKey(now)
  const burstKey = `hongbao:gen:burst:${ip}`
  const dayKey = `hongbao:gen:day:${day}:${ip}`
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`
  const windowStart = now - rateWindowMs
  const burstTtl = Math.max(rateWindowMs, 1000)
  // Expire shortly after UTC day end.
  const endOfDayMs = Date.parse(`${day}T23:59:59.999Z`) - now + 60_000
  const dayTtl = Math.max(endOfDayMs, 60_000)

  const result = await redisCommand(cfg, [
    "EVAL",
    QUOTA_LUA,
    2,
    burstKey,
    dayKey,
    now,
    windowStart,
    rateLimit,
    dailyQuota,
    member,
    burstTtl,
    dayTtl,
  ])

  const verdict = Array.isArray(result) ? String(result[0] ?? "") : String(result ?? "")
  if (verdict === "burst") {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    )
  }
  if (verdict === "daily") {
    return NextResponse.json(
      { error: "今日生成次数已达上限" },
      { status: 429 }
    )
  }

  return null
}

function assertQuotaMemory(
  ip: string,
  rateLimit: number,
  rateWindowMs: number,
  dailyQuota: number
): NextResponse | null {
  const now = Date.now()
  const day = todayKey(now)
  const configuredTtlMs = parsePositiveInt(
    process.env.GENERATE_BUCKET_TTL_MS,
    DEFAULT_BUCKET_TTL_MS
  )
  // Keep empty buckets at least through the longer of the burst window and
  // the remainder of the UTC day so TTL cannot undercut enforcement horizons.
  const msUntilEndOfUtcDay = Math.max(
    Date.parse(`${day}T23:59:59.999Z`) - now + 1,
    0
  )
  const ttlMs = Math.max(configuredTtlMs, rateWindowMs, msUntilEndOfUtcDay)
  evictIdleBuckets(now, ttlMs, rateWindowMs)

  let bucket = buckets.get(ip)
  if (!bucket) {
    bucket = { hits: [], day, dayCount: 0, lastSeen: now }
    buckets.set(ip, bucket)
  } else if (bucket.day !== day) {
    // New UTC day: reset daily count but keep in-window burst hits so a
    // midnight boundary cannot grant a second full burst allowance.
    bucket.day = day
    bucket.dayCount = 0
  }

  bucket.lastSeen = now
  bucket.hits = bucket.hits.filter((t) => now - t < rateWindowMs)

  if (bucket.hits.length >= rateLimit) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429 }
    )
  }

  if (bucket.dayCount >= dailyQuota) {
    return NextResponse.json(
      { error: "今日生成次数已达上限" },
      { status: 429 }
    )
  }

  bucket.hits.push(now)
  bucket.dayCount += 1
  return null
}

/**
 * Per-IP burst rate limit + daily quota.
 * Prefer Redis (GENERATE_QUOTA_REDIS_URL + TOKEN / Upstash) for multi-instance.
 * Call only after auth succeeds so anonymous traffic cannot fill buckets.
 */
export async function assertGenerateQuota(
  req: NextRequest
): Promise<NextResponse | null> {
  const ip = getClientIp(req)
  const rateLimit = parsePositiveInt(
    process.env.GENERATE_RATE_LIMIT,
    DEFAULT_RATE_LIMIT
  )
  const rateWindowMs = parsePositiveInt(
    process.env.GENERATE_RATE_WINDOW_MS,
    DEFAULT_RATE_WINDOW_MS
  )
  const dailyQuota = parsePositiveInt(
    process.env.GENERATE_DAILY_QUOTA,
    DEFAULT_DAILY_QUOTA
  )

  const redis = redisConfig()
  const requireShared =
    process.env.GENERATE_REQUIRE_SHARED_QUOTA === "1" ||
    process.env.GENERATE_REQUIRE_SHARED_QUOTA === "true"

  if (!redis && requireShared) {
    return NextResponse.json(
      {
        error:
          "未配置共享配额存储（GENERATE_QUOTA_REDIS_URL / UPSTASH_REDIS_REST_URL），拒绝生成",
      },
      { status: 503 }
    )
  }

  if (redis) {
    try {
      return await assertQuotaRedis(ip, rateLimit, rateWindowMs, dailyQuota, redis)
    } catch (err) {
      console.error("Shared quota store error:", err)
      return NextResponse.json(
        { error: "配额服务暂时不可用，请稍后重试" },
        { status: 503 }
      )
    }
  }

  return assertQuotaMemory(ip, rateLimit, rateWindowMs, dailyQuota)
}

/** Test helper: clear in-memory buckets between scenarios. */
export function resetGenerateGuardStateForTests(): void {
  buckets.clear()
}
