"use client"

import { useState, useCallback } from "react"
import { Download, Loader2, Sparkles, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { themeOptions, buildPrompt, type ThemeOption } from "@/lib/prompts"

export default function HomePage() {
  const [theme, setTheme] = useState<ThemeOption>(themeOptions[0])
  const [text, setText] = useState(themeOptions[0].defaultText)
  const [customPrompt, setCustomPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleThemeChange = (t: ThemeOption) => {
    setTheme(t)
    setText(t.defaultText)
  }

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)

    const prompt = customPrompt || buildPrompt(theme, text)

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        return
      }

      setImages((prev) => [data.url, ...prev])
      setSelected(data.url)
    } catch {
      setError("网络错误，请重试")
    } finally {
      setLoading(false)
    }
  }, [customPrompt, theme, text])

  const download = useCallback(() => {
    if (!selected) return
    const a = document.createElement("a")
    a.href = selected
    a.download = `红包封面_957x1278.png`
    a.target = "_blank"
    a.click()
  }, [selected])

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* 顶栏 */}
      <header className="h-12 border-b border-white/10 flex items-center px-5">
        <span className="text-red-500 font-bold">红包封面 AI</span>
        <span className="text-white/30 text-xs ml-2">选主题 → 写文字 → AI出图 → 下载</span>
      </header>

      <div className="flex h-[calc(100vh-48px)]">
        {/* 左栏：控制 */}
        <div className="w-72 border-r border-white/10 p-4 space-y-5 overflow-y-auto flex-shrink-0">
          {/* 主题 */}
          <section>
            <label className="text-xs text-white/50 mb-2 block">主题</label>
            <div className="grid grid-cols-4 gap-1.5">
              {themeOptions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleThemeChange(t)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs transition-all",
                    theme.id === t.id
                      ? "bg-red-600 text-white"
                      : "bg-white/5 hover:bg-white/10 text-white/50"
                  )}
                >
                  <span className="text-base">{t.emoji}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 封面文字 */}
          <section>
            <label className="text-xs text-white/50 mb-2 block">
              封面文字（AI 直接画进图里）
            </label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="如：新年快乐"
              maxLength={8}
              className="bg-white/5 border-white/10 text-white"
            />
            <p className="text-xs text-white/30 mt-1">留空则不含文字</p>
          </section>

          {/* 自定义提示词 */}
          <section>
            <label className="text-xs text-white/50 mb-2 block">
              自定义提示词（可选，覆盖主题）
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="留空使用主题默认提示词..."
              className="w-full h-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-red-500/50"
            />
          </section>

          {/* 生成按钮 */}
          <Button
            onClick={generate}
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 h-10"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" />生成封面</>
            )}
          </Button>

          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 rounded p-2">{error}</p>
          )}

          {/* 下载 */}
          {selected && (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <Button onClick={download} variant="outline" className="w-full border-white/10 text-white hover:bg-white/10">
                <Download className="w-4 h-4 mr-2" />
                下载当前封面
              </Button>
              <Button
                onClick={generate}
                disabled={loading}
                variant="ghost"
                className="w-full text-white/50 hover:text-white hover:bg-white/5"
              >
                <RotateCw className="w-4 h-4 mr-2" />
                不满意？重新生成
              </Button>
              <p className="text-xs text-white/20 text-center">957×1278px · 符合微信规范</p>
            </div>
          )}
        </div>

        {/* 中间：预览 */}
        <div className="flex-1 flex items-center justify-center bg-neutral-900 overflow-auto p-6">
          {selected ? (
            <div className="relative">
              <img
                src={selected}
                alt="红包封面"
                className="max-h-[80vh] rounded-2xl shadow-2xl shadow-red-950/30"
                style={{ aspectRatio: "957/1278" }}
              />
            </div>
          ) : (
            <div className="text-center text-white/20">
              <Sparkles className="w-20 h-20 mx-auto mb-4 opacity-20" />
              <p className="text-lg">选择主题，点击生成</p>
              <p className="text-sm mt-1">AI 将为你画出精美的红包封面</p>
            </div>
          )}
        </div>

        {/* 右栏：历史 */}
        {images.length > 1 && (
          <div className="w-40 border-l border-white/10 p-3 overflow-y-auto">
            <p className="text-xs text-white/30 mb-2">历史记录</p>
            <div className="space-y-2">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(url)}
                  className={cn(
                    "w-full rounded-lg overflow-hidden border-2 transition-all",
                    selected === url ? "border-red-500" : "border-transparent hover:border-white/20"
                  )}
                >
                  <img src={url} alt="" className="w-full aspect-[957/1278] object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
