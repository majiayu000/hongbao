import { NextRequest, NextResponse } from "next/server"
import {
  accessTokensMatch,
  createSessionCookieValue,
  sessionCookieName,
  sessionCookieOptions,
  verifySessionCookie,
} from "@/lib/generate-guard"

/**
 * Unlock the web UI with GENERATE_ACCESS_TOKEN.
 * Sets an httpOnly signed session cookie so the secret never enters the client bundle.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.GENERATE_ACCESS_TOKEN?.trim()
  if (!expected) {
    return NextResponse.json(
      { error: "未配置 GENERATE_ACCESS_TOKEN" },
      { status: 503 }
    )
  }

  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  // Reject JSON null / non-objects before dereferencing `.token` (avoids 500).
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  const body = parsed as { token?: unknown }
  const token = typeof body.token === "string" ? body.token.trim() : ""
  if (!token || !accessTokensMatch(token, expected)) {
    return NextResponse.json({ error: "令牌无效" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(
    sessionCookieName(),
    createSessionCookieValue(expected),
    sessionCookieOptions()
  )
  return res
}

/** Report whether the current request already has a valid generate session. */
export async function GET(req: NextRequest) {
  const expected = process.env.GENERATE_ACCESS_TOKEN?.trim()
  if (!expected) {
    return NextResponse.json({ unlocked: false, configured: false })
  }
  const cookie = req.cookies.get(sessionCookieName())?.value
  return NextResponse.json({
    unlocked: verifySessionCookie(cookie, expected),
    configured: true,
  })
}

/** Clear the generate session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionCookieName(), "", sessionCookieOptions(0))
  return res
}
