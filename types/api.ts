/* ──────────────────────────────────────────────
   全局数据契约 — 文案生成 API
   前后端共用，确保字段一致
   ────────────────────────────────────────────── */

/** 前端 → 后端请求体 */
export interface CopywritingPayload {
  /** 必填：沟通渠道 */
  channel: 'email' | 'whatsapp';
  /** 可选：文案助手场景 */
  mode?: 'outreach' | 'chat_reply' | 'closing' | 'mentor' | 'maintenance';
  /** 可选：发件人姓名 */
  sales_person?: string;
  /** 可选：客户公司名；聊天工具可不填 */
  customer_company?: string;
  /** 可选：客户行业（影响 RAG 关键词） */
  customer_industry?: string;
  /** 可选：核心优势（用户手动填写，AI 必须融入文案） */
  core_advantage?: string;
  /** 可选：客户背景信息（来自深度调查 / 手动输入） */
  customer_background?: string;
  /** 可选：本次回复目标 / 当前卡点 */
  my_goal?: string;
  /** 可选：业务员说话风格 */
  style_preference?: string;
  /** 可选：语气风格 (默认 professional) */
  tone?: 'professional' | 'friendly' | 'formal';
  /** 可选：输出语言 (默认 English) */
  language?: string;

  /* 内部字段 — 由前端自动注入，不走用户输入 */
  /** @internal API Key（优先使用用户的） */
  _api_key?: string;
  /** @internal API Base URL */
  _base_url?: string;
}

/** 后端 → 前端响应体 */
export interface CopywritingResponse {
  success: boolean;
  copy: string;
  versions: CopywritingVersion[];
  /** 邮件渠道返回 2-3 个主题行，WhatsApp 返回 null */
  subject_lines: string[] | null;
  model_used: string;
  channel: 'email' | 'whatsapp';
  detail?: string;
}

export interface CopywritingVersion {
  version: string;
  content: string;
  channel: 'email' | 'whatsapp';
}
