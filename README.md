# 🧧 红包封面 AI 工坊

用 AI 全自动生成微信红包封面 — 从底图到动态视频，一条龙搞定。

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Python](https://img.shields.io/badge/Python-3.11+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 它能做什么

- **AI 文生图**：用 Imagen 4 生成高质量二次元风格底图（3:4 竖版）
- **AI 图生视频**：用 Kling v3.0 Pro 把静态底图变成动态视频
- **本地动效**：Pillow 逐帧渲染粒子特效（花瓣/雪花/光斑）+ FFmpeg 编码
- **一键编码**：自动裁剪到微信红包封面规格（960×1280, H.264, <2800kbps）
- **Web 界面**：Next.js 前端，选主题 → 生成 → 下载

## 项目结构

```
├── scripts/                    # Python 生成脚本
│   ├── gen_anime_covers.py     # AI 底图生成 (Imagen 4 via AtlasCloud)
│   ├── gen_anime_v2.py         # AI 底图生成 (Imagen 4 via Gemini API)
│   ├── gen_dynamic_ai.py       # AI 图生视频 (Kling v3.0 Pro)
│   └── gen_dynamic_covers.py   # 本地粒子动效 (Pillow + FFmpeg)
├── docs/                       # 文档
│   ├── 红包封面调研报告.md       # 市场调研 + 技术规格 + API 指南
│   ├── 二次元动态红包封面设计方案.md
│   └── 红包封面制作指南.md
├── src/                        # Next.js 前端
│   ├── app/page.tsx            # 主页面
│   ├── app/api/generate/       # 生成 API
│   └── lib/prompts.ts          # Prompt 模板库
└── env.example                 # 环境变量模板
```

## 快速开始

### 1. 环境准备

```bash
# 克隆
git clone https://github.com/majiayu000/hongbao.git
cd hongbao

# 前端依赖
npm install

# Python 依赖
pip install httpx pillow python-dotenv google-genai
```

### 2. 配置 API Key 与生成访问令牌

```bash
cp env.example .env.local
# 编辑 .env.local：
# - AI_IMAGE_API_KEY：AtlasCloud 上游密钥（仅服务端）
# - GENERATE_ACCESS_TOKEN：服务端共享密钥（必填；不要使用 NEXT_PUBLIC_ 前缀）
# - 多实例/serverless：配置 Upstash Redis，并建议开启 GENERATE_REQUIRE_SHARED_QUOTA=1
# - 反代部署：设置 GENERATE_TRUSTED_PROXY_HOPS 为可信代理层数（按 IP 配额）
# - 无反代时默认忽略客户端 XFF，对所有已通过鉴权的调用统一使用全局配额桶
#   （会话可反复签发、访问令牌为共享密钥，二者都不能作为稳定的 per-caller 身份）
```

`POST /api/generate` 在调用 AtlasCloud 之前会：

1. 校验访问：`Authorization: Bearer …` / `x-generate-token`，或由 `POST /api/auth` 签发的 **httpOnly** 会话 cookie（失败 → 401）
2. 按可信客户端 IP（或无反代时的显式全局认证配额）做突发限流与每日配额（超限 → 429）；生产多实例请用 Redis 共享存储

Web UI 解锁时由用户粘贴令牌换取会话 cookie，**密钥不会打进前端 JS 包**。

默认约每分钟 5 次、每天 20 次，可用 `GENERATE_RATE_LIMIT` / `GENERATE_RATE_WINDOW_MS` / `GENERATE_DAILY_QUOTA` 调整。

### 3. 生成底图

```bash
python scripts/gen_anime_covers.py
# 输出到 output/anime_covers_v3/
```

### 4. 生成动态视频

```bash
python scripts/gen_dynamic_ai.py
# 输出到 output/anime_dynamic_ai/
```

### 5. 启动 Web 界面

```bash
npm run dev
# 访问 http://localhost:5568
```

## 微信红包封面规格速查

| 参数 | 要求 |
|------|------|
| 分辨率 | 960×1280（3:4，H.264 要求偶数尺寸） |
| 编码 | H.264 / AVC |
| 时长 | 1-3 秒（推荐 2.5s） |
| 帧率 | ≤30fps（推荐 25fps） |
| 码率 | **<2800kbps**（官方写 3000，但等于 3000 也会被拒） |
| 大小 | <20MB |

> ⚠️ 官方标注 957×1278，但 957 是奇数，H.264 编码会报错，实际用 960×1280。

## AI 模型选择

| 用途 | 推荐模型 | 说明 |
|------|---------|------|
| 二次元底图 | **Imagen 4** (`google/imagen4`) | 赛璐璐风格最佳，色彩鲜艳 |
| 写实/3D 底图 | SeedDream v4 (`bytedance/seedream-v4`) | 偏 CG 风格 |
| 图生视频 | **Kling v3.0 Pro** (`kwaivgi/kling-v3.0-pro/image-to-video`) | 原画保持度高 |

所有模型通过 [AtlasCloud](https://atlascloud.ai) 统一调用。

## 三大设计风格

| 风格 | 示例 | 特点 |
|------|------|------|
| 🎀 萌系 | Q版少女拜年、萌马贺岁 | 大眼可爱、暖色调、治愈系 |
| 🏯 国风融合 | 水墨仙侠骑马、少女抚琴 | 水墨+动漫、留白构图、红金点缀 |
| ⚔️ 游戏CG | 金发战姬、仙女御马 | 高细节、戏剧光影、华丽装饰 |

## 文档

- [红包封面调研报告](docs/红包封面调研报告.md) — 市场分析、技术规格、API 使用指南、完整制作流程
- [设计方案](docs/二次元动态红包封面设计方案.md) — 小红书数据分析、风格方向、Prompt 库
- [制作指南](docs/红包封面制作指南.md) — 从零开始的操作手册

## License

MIT
