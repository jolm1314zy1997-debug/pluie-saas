// 文案生成 API 类型定义

export interface CopywritingPayload {
  channel: 'email' | 'whatsapp';
  mode?: 'outreach' | 'chat_reply' | 'closing' | 'mentor' | 'maintenance';
  sales_person?: string;
  customer_company?: string;
  customer_industry?: string;
  core_advantage?: string;
  customer_background?: string;
  my_goal?: string;
  style_preference?: string;
  tone?: 'professional' | 'friendly' | 'formal';
  language?: string;
  // 内部字段（不走业务逻辑）
  _api_key?: string;
  _base_url?: string;
}

export interface CopywritingVersion {
  version: string;
  content: string;
  channel: string;
}

export interface CopywritingResponse {
  success: boolean;
  detail?: string;
  copy: string;
  versions: CopywritingVersion[];
  subject_lines: string[] | null;
  model_used: string;
  channel: string;
}
