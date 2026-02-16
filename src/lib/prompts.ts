export interface ThemeOption {
  id: string
  name: string
  emoji: string
  prompt: string
  defaultText: string
}

// 构建完整提示词：基础主题 + 用户自定义文字
export function buildPrompt(theme: ThemeOption, text: string): string {
  const textPart = text
    ? `, with elegant Chinese calligraphy text "${text}" as the prominent centerpiece`
    : ""
  return theme.prompt + textPart
}

export const themeOptions: ThemeOption[] = [
  {
    id: "guochao-horse",
    name: "国潮鎏金",
    emoji: "🐴",
    defaultText: "马到成功",
    prompt:
      "WeChat red packet cover design, golden embossed horse galloping through auspicious clouds, gilded gold craft texture, deep crimson red background with golden cloud patterns, Chinese Guochao national trend style, luxurious and noble, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "cute-horse",
    name: "3D萌马",
    emoji: "🧸",
    defaultText: "新年快乐",
    prompt:
      "WeChat red packet cover design, adorable white fluffy plush baby horse sitting on golden ingot, red scarf, red lanterns hanging above, golden particles and confetti, warm golden background, 3D render C4D style, soft lighting, cute kawaii, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "starry-horse",
    name: "星河天马",
    emoji: "🌌",
    defaultText: "前程似锦",
    prompt:
      "WeChat red packet cover design, majestic pink-purple horse galloping through galaxy starry sky, shooting stars, sparkling nebula, dreamy pink purple gradient background, fantasy magical atmosphere, romantic and ethereal, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "ink-horse",
    name: "水墨骏马",
    emoji: "🎨",
    defaultText: "一马当先",
    prompt:
      "WeChat red packet cover design, ink wash painting style horse galloping powerfully, splashing ink dynamic motion, fireworks in background, traditional Chinese brush painting meets modern illustration, red and gold accents on ink black, majestic and bold, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "papercut-horse",
    name: "剪纸皮影",
    emoji: "🏮",
    defaultText: "万事如意",
    prompt:
      "WeChat red packet cover design, multi-layer paper cutting art style, Chinese traditional palace background, red paper-cut horse with golden floral patterns, intricate paper craft, traditional Chinese folk art, festive and refined, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "fortune-horse",
    name: "马上有钱",
    emoji: "💰",
    defaultText: "恭喜发财",
    prompt:
      "WeChat red packet cover design, cute golden cartoon horse carrying treasure bag and gold ingots, festive red background, auspicious clouds, hanging lanterns, Guochao illustration style, cheerful and prosperous, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "birthday",
    name: "生日",
    emoji: "🎂",
    defaultText: "生日快乐",
    prompt:
      "WeChat red packet cover design, birthday celebration theme, colorful confetti, balloons, warm pink and gold tones, joyful festive atmosphere, sparkles and stars, flat illustration style, clean composition, no text no words, vertical 3:4 aspect ratio, high quality",
  },
  {
    id: "wedding",
    name: "婚礼",
    emoji: "💍",
    defaultText: "百年好合",
    prompt:
      "WeChat red packet cover design, Chinese wedding theme, double happiness symbol, red and gold luxurious, peony flowers, phoenix and dragon motifs, elegant romantic atmosphere, flat illustration, clean design, no text no words, vertical 3:4 aspect ratio, high quality",
  },
]
