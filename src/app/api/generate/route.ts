import { NextRequest, NextResponse } from "next/server"

const POLL_INTERVAL = 2000
/** Cap total server-side wait under common ~60s gateway limits. */
const MAX_SERVER_WAIT_MS = 45_000

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()

  if (!prompt || typeof prompt !== "string" || prompt.length > 2000) {
    return NextResponse.json({ error: "invalid prompt" }, { status: 400 })
  }

  const apiKey = process.env.AI_IMAGE_API_KEY
  const apiBase = process.env.AI_IMAGE_API_BASE || "https://api.atlascloud.ai/api/v1"
  const model = process.env.AI_IMAGE_MODEL || "google/nano-banana/text-to-image"

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 AI_IMAGE_API_KEY 环境变量" },
      { status: 500 }
    )
  }

  // Async create returns a task id promptly; sync mode can hang past the
  // deadline and leave 504s unrecoverable without a taskId.
  const body: Record<string, unknown> = {
    model,
    prompt,
    aspect_ratio: "3:4",
    output_format: "png",
    enable_sync_mode: false,
  }

  const clientSignal = req.signal
  const { signal, cleanup } = composeDeadlineSignal(clientSignal, MAX_SERVER_WAIT_MS)
  const startedAt = Date.now()
  let taskId: string | undefined

  try {
    const res = await fetch(`${apiBase}/model/generateImage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error("AI image API error:", errText)
      return NextResponse.json(
        { error: `AI 图片生成失败: ${res.status}` },
        { status: res.status }
      )
    }

    const raw = await res.json()
    // AtlasCloud 部分模型返回 { code, data: { ... } } 包装格式
    const data = (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data))
      ? raw.data as Record<string, unknown>
      : raw as Record<string, unknown>

    // 同步模式直接返回结果
    const imageUrl = extractImageUrl(data)
    if (imageUrl) {
      return NextResponse.json({ url: imageUrl })
    }

    // Prefer an immediate image if the provider still returns one.
    // Otherwise require a well-formed task id before any authenticated poll URL.
    taskId = parseTaskId(typeof data.id === "string" ? data.id : undefined)
    if (!taskId) {
      console.error("Unexpected API response:", JSON.stringify(raw))
      return NextResponse.json(
        { error: "AI 返回数据中无图片 URL 或任务 ID" },
        { status: 500 }
      )
    }

    const elapsed = Date.now() - startedAt
    const pollBudgetMs = Math.max(0, MAX_SERVER_WAIT_MS - elapsed)
    return await pollForResult(apiBase, apiKey, taskId, pollBudgetMs, signal)
  } catch (err) {
    if (isAbortError(err) || signal.aborted || clientSignal.aborted) {
      if (clientSignal.aborted) {
        return new NextResponse(null, { status: 499 })
      }
      return timeoutResponse(taskId)
    }
    console.error("Generate image error:", err)
    return NextResponse.json(
      { error: "网络错误，请重试" },
      { status: 500 }
    )
  } finally {
    cleanup()
  }
}

/** Resume an upstream prediction that may still be running after a 504. */
export async function GET(req: NextRequest) {
  const rawTaskId = req.nextUrl.searchParams.get("taskId")
  const taskId = parseTaskId(rawTaskId)
  if (!taskId) {
    return NextResponse.json({ error: "invalid taskId" }, { status: 400 })
  }

  const apiKey = process.env.AI_IMAGE_API_KEY
  const apiBase = process.env.AI_IMAGE_API_BASE || "https://api.atlascloud.ai/api/v1"

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 AI_IMAGE_API_KEY 环境变量" },
      { status: 500 }
    )
  }

  const clientSignal = req.signal
  const { signal, cleanup } = composeDeadlineSignal(clientSignal, MAX_SERVER_WAIT_MS)

  try {
    return await pollForResult(apiBase, apiKey, taskId, MAX_SERVER_WAIT_MS, signal)
  } catch (err) {
    if (isAbortError(err) || signal.aborted || clientSignal.aborted) {
      if (clientSignal.aborted) {
        return new NextResponse(null, { status: 499 })
      }
      return timeoutResponse(taskId)
    }
    console.error("Resume prediction error:", err)
    return NextResponse.json(
      { error: "网络错误，请重试" },
      { status: 500 }
    )
  } finally {
    cleanup()
  }
}

async function pollForResult(
  apiBase: string,
  apiKey: string,
  taskId: string,
  maxPollTimeMs: number,
  signal: AbortSignal
) {
  const startTime = Date.now()

  while (Date.now() - startTime < maxPollTimeMs) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }

    await sleep(POLL_INTERVAL, signal)

    const pollRes = await fetch(predictionUrl(apiBase, taskId), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })

    if (!pollRes.ok) {
      if (pollRes.status >= 400 && pollRes.status < 500) {
        return NextResponse.json(
          { error: `API error: ${pollRes.status} ${pollRes.statusText}` },
          { status: pollRes.status }
        )
      }
      continue
    }

    const pollRaw = await pollRes.json()
    const pollData = (pollRaw.data && typeof pollRaw.data === "object" && !Array.isArray(pollRaw.data))
      ? pollRaw.data as Record<string, unknown>
      : pollRaw as Record<string, unknown>
    const status = pollData.status

    if (status === "completed" || status === "succeeded") {
      const imageUrl = extractImageUrl(pollData)
      if (imageUrl) {
        return NextResponse.json({ url: imageUrl })
      }
      return NextResponse.json(
        { error: "AI 返回数据中无图片 URL" },
        { status: 500 }
      )
    }

    if (status === "failed" || status === "error") {
      return NextResponse.json(
        { error: `AI 图片生成失败: ${pollData.error || "未知错误"}` },
        { status: 500 }
      )
    }
  }

  return timeoutResponse(taskId)
}


/** Safe prediction path segment: reject traversal / alternate endpoints. */
const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function parseTaskId(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (!TASK_ID_RE.test(value)) return undefined
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    return undefined
  }
  return value
}

function predictionUrl(apiBase: string, taskId: string): string {
  // encodeURIComponent keeps the id a single path segment even if charset grows.
  return `${apiBase}/model/prediction/${encodeURIComponent(taskId)}`
}

function timeoutResponse(taskId?: string) {
  return NextResponse.json(
    {
      error:
        "AI 图片生成超时（服务端等待上限约 45 秒），请稍后重试。上游任务可能仍在处理中。",
      retry: true,
      ...(taskId ? { taskId } : {}),
    },
    { status: 504 }
  )
}

/**
 * Abort when the client disconnects OR the server deadline expires, so hung
 * upstream fetches cannot outlive MAX_SERVER_WAIT_MS.
 */
function composeDeadlineSignal(
  clientSignal: AbortSignal,
  deadlineMs: number
): { signal: AbortSignal; cleanup: () => void } {
  if (
    typeof AbortSignal.any === "function" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return {
      signal: AbortSignal.any([clientSignal, AbortSignal.timeout(deadlineMs)]),
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)
  const onClientAbort = () => controller.abort()

  if (clientSignal.aborted) {
    clearTimeout(timer)
    controller.abort()
  } else {
    clientSignal.addEventListener("abort", onClientAbort, { once: true })
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      clientSignal.removeEventListener("abort", onClientAbort)
    },
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError") ||
    (err instanceof Error && err.name === "TimeoutError")
  )
}

function extractImageUrl(data: Record<string, unknown>): string | null {
  // AtlasCloud 格式: outputs 数组
  const outputs = data.outputs as string[] | undefined
  if (outputs?.[0]) return outputs[0]

  // 其他兼容格式
  const images = data.images as Array<{ url?: string }> | undefined
  const dataArr = data.data as Array<{ url?: string }> | undefined

  if (images?.[0]?.url) return images[0].url
  if (dataArr?.[0]?.url) return dataArr[0].url

  return null
}
