/**
 * Brand 配置 - 仅影响 UI 显示层（logo / 名字 / footer / metadata）。
 *
 * 业务身份（产品/卖点/地理/9 个 proof points）不在这里 —— 看 [company.ts]。
 *
 * 切换品牌：改这个文件的 fallback 值，或在 Vercel 环境变量里覆盖。
 * 因为 NEXT_PUBLIC_* 是构建时注入，部署后改 env 需要重新触发构建。
 */

const env = (key: string, fallback: string): string => {
  if (typeof process === 'undefined' || !process.env) return fallback;
  const value = process.env[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

export const BRAND = {
  // UI 主标识
  name: env('NEXT_PUBLIC_BRAND_NAME', 'Pluie'),
  tagline: env('NEXT_PUBLIC_BRAND_TAGLINE', 'AI Lead Intelligence'),
  taglineZh: env('NEXT_PUBLIC_BRAND_TAGLINE_ZH', 'AI 外贸客户开发副驾驶'),

  // 标识资源
  logoUrl: env('NEXT_PUBLIC_BRAND_LOGO', '/Logo120-120.jpg'),
  logoAlt: env('NEXT_PUBLIC_BRAND_LOGO_ALT', 'Pluie Logo'),

  // Footer
  copyrightHolder: env('NEXT_PUBLIC_BRAND_COPYRIGHT', 'Pluie'),
  versionLabel: env('NEXT_PUBLIC_BRAND_VERSION_LABEL', 'AI Lead Intelligence Platform'),

  // Browser metadata
  metaTitle: env('NEXT_PUBLIC_BRAND_META_TITLE', 'Pluie · AI 外贸客户开发'),
  metaDescription: env(
    'NEXT_PUBLIC_BRAND_META_DESC',
    'AI lead generation, deep enrichment & sales copywriting for B2B exporters'
  ),

  // 外部"AI 小助手"链接（你接自家 RAG 时用；其他用户置空就不显示按钮）
  assistantUrl: env('NEXT_PUBLIC_ASSISTANT_URL', ''),
  assistantLabel: env('NEXT_PUBLIC_ASSISTANT_LABEL', 'AI 小助手'),
  assistantTooltip: env('NEXT_PUBLIC_ASSISTANT_TOOLTIP', '打开 AI 小助手（公司知识库 RAG）'),

  // 服务端抓取使用的 User-Agent
  botUserAgent: env('NEXT_PUBLIC_BOT_UA', 'Mozilla/5.0 (compatible; PluieLeadBot/1.0)'),
};

export type Brand = typeof BRAND;
