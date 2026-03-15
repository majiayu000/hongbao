import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/server
vi.mock("next/server", () => ({
  NextRequest: class {
    constructor(public url: string, public init?: RequestInit) {}
    json() {
      return Promise.resolve(JSON.parse((this.init?.body as string) ?? "{}"))
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      _status: init?.status ?? 200,
      json: () => Promise.resolve(data),
      status: init?.status ?? 200,
    }),
  },
}))

const { NextRequest } = await import("next/server")
const { POST } = await import("./route")

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/generate", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("POST /api/generate — input validation", () => {
  beforeEach(() => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-key")
    vi.stubEnv("AI_IMAGE_API_BASE", "https://api.test.local")
  })

  it("returns 400 when prompt is missing", async () => {
    const res = await POST(makeRequest({}))
    expect(res._status).toBe(400)
    expect((res._data as { error: string }).error).toMatch(/非空字符串/)
  })

  it("returns 400 when prompt is not a string", async () => {
    const res = await POST(makeRequest({ prompt: 123 }))
    expect(res._status).toBe(400)
  })

  it("returns 400 when prompt is empty string", async () => {
    const res = await POST(makeRequest({ prompt: "   " }))
    expect(res._status).toBe(400)
  })

  it("returns 400 when prompt exceeds 2000 characters", async () => {
    const res = await POST(makeRequest({ prompt: "a".repeat(2001) }))
    expect(res._status).toBe(400)
    expect((res._data as { error: string }).error).toMatch(/2000/)
  })

  it("accepts prompt of exactly 2000 characters (proceeds to API call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("error"),
    })
    vi.stubGlobal("fetch", fetchMock)
    const res = await POST(makeRequest({ prompt: "a".repeat(2000) }))
    expect(res._status).not.toBe(400)
  })
})

describe("POST /api/generate — polling 4xx error handling", () => {
  beforeEach(() => {
    vi.stubEnv("AI_IMAGE_API_KEY", "test-key")
    vi.stubEnv("AI_IMAGE_API_BASE", "https://api.test.local")
  })

  it("returns 429 immediately when polling gets 429", async () => {
    // First call: initial generate → returns taskId
    // Second call: poll → returns 429
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "task-123" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({}),
      })
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(makeRequest({ prompt: "test prompt" }))
    expect(res._status).toBe(429)
    expect((res._data as { error: string }).error).toMatch(/频繁/)
  })

  it("returns 401 immediately when polling gets 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "task-456" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      })
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(makeRequest({ prompt: "test prompt" }))
    expect(res._status).toBe(401)
    expect((res._data as { error: string }).error).toMatch(/认证/)
  })
})
