import { NextRequest, NextResponse } from "next/server"

const POLL_INTERVAL = 2000
const MAX_POLL_TIME = 120_000

export async function POST(req: NextRequest) {
  const apiKey = process.env.AI_IMAGE_API_KEY
  const apiBase = process.env.AI_IMAGE_API_BASE || "https://api.atlascloud.ai/api/v1"
  const model = process.env.AI_IMAGE_MODEL || "google/nano-banana/text-to-image"

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 AI_IMAGE_API_KEY 环境变量" },
      { status: 500 }
    )
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "请求体必须为有效 JSON" }, { status: 400 })
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "请求体必须为 JSON 对象" }, { status: 400 })
    }

    const { prompt } = body as Record<string, unknown>

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "prompt 必须为非空字符串" }, { status: 400 })
    }
    if (prompt.length > 2000) {
      return NextResponse.json({ error: "prompt 不能超过 2000 字符" }, { status: 400 })
    }

    const requestBody: Record<string, unknown> = {
      model,
      prompt,
      aspect_ratio: "3:4",
      output_format: "png",
      enable_sync_mode: true,
    }
    const res = await fetch(`${apiBase}/model/generateImage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
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

    // 如果同步模式未生效，回退到轮询
    const taskId = data.id as string | undefined
    if (!taskId) {
      console.error("Unexpected API response:", JSON.stringify(raw))
      return NextResponse.json(
        { error: "AI 返回数据中无图片 URL 或任务 ID" },
        { status: 500 }
      )
    }

    return await pollForResult(apiBase, apiKey, taskId)
  } catch (err) {
    console.error("Generate image error:", err)
    return NextResponse.json(
      { error: "网络错误，请重试" },
      { status: 500 }
    )
  }
}

async function pollForResult(apiBase: string, apiKey: string, taskId: string) {
  const startTime = Date.now()

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))

    const pollRes = await fetch(`${apiBase}/model/prediction/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!pollRes.ok) {
      if (pollRes.status === 429) {
        return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 })
      }
      if (pollRes.status === 401) {
        return NextResponse.json({ error: "API 认证失败，请检查密钥配置" }, { status: 401 })
      }
      // 其他 4xx 是客户端错误，不可重试，直接返回
      if (pollRes.status >= 400 && pollRes.status < 500) {
        return NextResponse.json(
          { error: `轮询请求失败: ${pollRes.status}` },
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

  return NextResponse.json(
    { error: "AI 图片生成超时，请重试" },
    { status: 504 }
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
