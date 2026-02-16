import { NextRequest, NextResponse } from "next/server"

const POLL_INTERVAL = 2000
const MAX_POLL_TIME = 120_000

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()

  const apiKey = process.env.AI_IMAGE_API_KEY
  const apiBase = process.env.AI_IMAGE_API_BASE || "https://api.atlascloud.ai/api/v1"
  const model = process.env.AI_IMAGE_MODEL || "google/nano-banana/text-to-image"

  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 AI_IMAGE_API_KEY 环境变量" },
      { status: 500 }
    )
  }

  const body: Record<string, unknown> = {
    model,
    prompt,
    aspect_ratio: "3:4",
    output_format: "png",
    enable_sync_mode: true,
  }

  try {
    const res = await fetch(`${apiBase}/model/generateImage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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

    if (!pollRes.ok) continue

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
