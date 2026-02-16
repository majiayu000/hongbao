// 微信红包封面规范常量
export const COVER_WIDTH = 957
export const COVER_HEIGHT = 1278
export const COVER_ASPECT_RATIO = COVER_WIDTH / COVER_HEIGHT

// 详情页规范
export const DETAIL_WIDTH = 750
export const DETAIL_HEIGHT = 1250

// 安全区域（顶部和底部的安全边距）
export const SAFE_AREA_TOP = 200
export const SAFE_AREA_BOTTOM = 300

// 导出限制
export const MAX_FILE_SIZE = 500 * 1024 // 500KB
export const SUPPORTED_FORMATS = ['png', 'jpeg'] as const
export type ExportFormat = (typeof SUPPORTED_FORMATS)[number]

// 历史记录
export const MAX_HISTORY_STEPS = 30

// 编辑器布局
export const SIDE_PANEL_WIDTH = 240
export const PROPERTIES_PANEL_WIDTH = 240
export const PREVIEW_PANEL_WIDTH = 280
