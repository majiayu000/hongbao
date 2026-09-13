import { NextRequest, NextResponse } from "next/server"

/** Sliding-window burst limit (requests per window). */
const DEFAULT_RATE_LIMIT = 5
const DEFAULT_RATE_WINDOW_MS = 60_000
/** Per-IP daily generate ceiling. */
const DEFAULT_DAILY_QUOTA = 20

type Bucket = {
  /** Timestamps of recent requests within the rate window. */
  hits: number[]
  /** Calendar day key (UTC YYYY-MM-DD) for daily quota. */
  day: string
  /** Successful auth'd generate attempts counted today. */
  dayCount: number
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

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  return "unknown"
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

/**
 * Reject before any upstream call when GENERATE_ACCESS_TOKEN is missing
 * or the caller does not present a matching secret.
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
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: "未授权：需要有效的生成访问令牌" },
      { status: 401 }
    )
  }

  return null
}

/**
 * In-memory per-IP burst rate limit + daily quota.
 * Call only after auth succeeds so anonymous traffic cannot fill buckets.
 */
export function assertGenerateQuota(req: NextRequest): NextResponse | null {
  const ip = getClientIp(req)
  const now = Date.now()
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
  const day = todayKey(now)

  let bucket = buckets.get(ip)
  if (!bucket || bucket.day !== day) {
    bucket = { hits: [], day, dayCount: 0 }
    buckets.set(ip, bucket)
  }

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

/** Test helper: clear in-memory buckets between scenarios. */
export function resetGenerateGuardStateForTests(): void {
  buckets.clear()
}
