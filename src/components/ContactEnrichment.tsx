'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Phone,
  Linkedin,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Building2,
  User,
  MapPin,
  FileSearch,
  ArrowRight,
  Trash2,
  Shield,
  ChevronDown,
  X,
  AlertCircle,
  Plus,
  UserPlus,
  FileText,
  Database,
  Zap,
  Target,
  Search,
  MessageCircle,
  DollarSign,
  Flame,
  UserCheck,
  Cpu,
  AlertTriangle,
  Award,
  TrendingDown,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAppState, EnrichedLead, ContactInfo } from '@/context/AppContext';
import { downloadLeadReport } from '@/lib/leadReport';

/* ── API Key 辅助 ── */
function getApiConfig(): Record<string, string> {
  try {
    const stored = localStorage.getItem('qzt_aihubmix_config');
    if (stored) {
      const config = JSON.parse(stored);
      const result: Record<string, string> = {};
      if (config.apiKey) result._api_key = config.apiKey;
      return result;
    }
  } catch {}
  return {};
}

/* ── 简易 Markdown 渲染（仅处理标题、加粗、链接、列表） ── */
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let inList = false;

  const renderInline = (line: string, key: string) => {
    // 处理链接 [text](url)
    const parts = line.split(/(\[([^\]]+)\]\(([^)]+)\))/g);
    return parts.map((part, i) => {
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a key={`${key}-${i}`} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
             className="text-brand-600 underline hover:text-brand-800">
            {linkMatch[1]}
          </a>
        );
      }
      // 处理加粗 **text**
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return boldParts.map((bp, j) => {
        if (bp.startsWith('**') && bp.endsWith('**')) {
          return <strong key={`${key}-${i}-${j}`} className="font-semibold">{bp.slice(2, -2)}</strong>;
        }
        return <span key={`${key}-${i}-${j}`}>{bp}</span>;
      });
    });
  };

  lines.forEach((line, idx) => {
    if (line.trim() === '') {
      if (inList) { inList = false; elements.push(<br key={`br-${idx}`} />); }
      return;
    }

    // 分割线
    if (line.trim().match(/^---+$/)) {
      elements.push(<hr key={`hr-${idx}`} className="my-3 border-cream-300" />);
      return;
    }

    // 标题 **xxx**
    if (line.trim().startsWith('**') && line.trim().endsWith('**') && line.trim().length > 4) {
      const title = line.trim().slice(2, -2);
      elements.push(
        <h6 key={`h-${idx}`} className="text-xs font-bold text-charcoal-800 mt-4 mb-1.5 uppercase tracking-wide">
          {title}
        </h6>
      );
      return;
    }

    // 列表项
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      if (!inList) { inList = true; }
      elements.push(
        <div key={`li-${idx}`} className="flex gap-2 text-xs text-charcoal-700 leading-relaxed ml-1 mb-0.5">
          <span className="text-emerald-500 mt-0.5 flex-shrink-0">&#8226;</span>
          <span>{renderInline(line.trim().slice(2), `l-${idx}`)}</span>
        </div>
      );
      return;
    }

    // 普通段落
    if (inList) inList = false;
    elements.push(
      <p key={`p-${idx}`} className="text-xs text-charcoal-700 leading-relaxed mb-1">
        {renderInline(line, `t-${idx}`)}
      </p>
    );
  });

  return <div className="space-y-0.5">{elements}</div>;
}

/* ────────────── 深度背调系统提示词 ────────────── */

const DEEP_PROFILE_PROMPT = `你是一位资深的B2B企业背景调查专家和市场分析师。你擅长通过分析公开信息，快速勾勒出一家公司的全貌，并为销售人员提供精准的商业洞察。

**输入**: 公司名称、网站、已知背景信息。
**输出**: 结构清晰、条理分明的客户背景调查报告。

请严格按照以下五个部分组织报告：

**第一部分：公司实力综合评估**
- 核心指标：成立年限、员工规模、地理位置、市场声誉和行业地位
- 财务状况：如有公开数据，评估营收规模、融资阶段和背后投资方
- 综合判断：给出"实力"初步结论（行业领导者/成长型企业/初创公司等）

**第二部分：客户画像精准描绘**
- 业务模式：B2B、B2C 还是 B2B2C
- 目标客群：最终用户画像
- 企业文化与价值观：从官网、社交媒体提炼的价值观和使命

**第三部分：主营业务与产品/服务分析**
- 核心类目：主营产品类别或核心服务项目
- 创新或特色：产品/服务中的亮点或区别于竞争对手的特色

**第四部分：线上线下渠道分析**
- 线下存在感：实体店、分公司、办事处或分销网络
- 线上布局：电商平台、独立站、社交媒体营销
- 渠道总结：如查无信息请明确说明

**第五部分：销售跟进策略建议**
- 潜在需求点：推测该公司可能存在的痛点或需求
- 合作切入点：2-3个具体的、可将我方产品/服务与其业务结合的切入点
- 沟通建议：建议在与客户沟通时可以强调的重点

**要求**：
- 格式清晰：使用清晰的标题和项目符号
- 内容务实：所有分析基于可推断的公开信息，避免过度猜测
- 语言精炼：专业但易于理解，直接给结论和要点
- 信息缺失处理：无法查证的信息请明确说明`;

/* ────────────── 手动输入表单 ────────────── */

interface ManualForm {
  company: string;
  website: string;
  contactName: string;
  email: string;
  country: string;
  phone: string;
  address: string;
  extraInfo: string;
}

function ManualAddForm({
  onAdd,
  onAddAndProfile,
  loading,
}: {
  onAdd: (form: ManualForm) => void;
  onAddAndProfile: (form: ManualForm) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<ManualForm>({
    company: '',
    website: '',
    contactName: '',
    email: '',
    country: '',
    phone: '',
    address: '',
    extraInfo: '',
  });
  const [showForm, setShowForm] = useState(false);

  const isValid =
    form.company.trim().length > 0 && form.website.trim().length > 0;

  const handleSubmit = (withProfile: boolean) => {
    if (!isValid) return;
    if (withProfile) {
      onAddAndProfile({ ...form, website: form.website.trim() });
    } else {
      onAdd({ ...form, website: form.website.trim() });
    }
    setForm({ company: '', website: '', contactName: '', email: '', country: '', phone: '', address: '', extraInfo: '' });
  };

  // 自动补全 https://
  const handleWebsiteChange = (v: string) => {
    let val = v.trim();
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      val = 'https://' + val;
    }
    setForm((f) => ({ ...f, website: val }));
  };

  const updateField = (key: keyof ManualForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full card p-4 flex items-center gap-3 text-brand-600 hover:border-brand-300 group transition-all"
      >
        <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
          <UserPlus size={20} />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold">手动添加客户</p>
          <p className="text-xs text-charcoal-400">
            直接输入客户信息，无需从搜索模块导入
          </p>
        </div>
        <Plus size={18} className="ml-auto" />
      </button>
    );
  }

  return (
    <div className="card p-6 space-y-4 border-brand-200 bg-brand-50/20">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-charcoal-700 flex items-center gap-2">
          <UserPlus size={18} className="text-brand-600" />
          手动添加客户
        </h3>
        <button
          onClick={() => setShowForm(false)}
          className="p-1.5 rounded-lg hover:bg-cream-200 text-charcoal-400 hover:text-charcoal-600 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 公司名称 */}
        <div>
          <label className="label flex items-center gap-1.5">
            <Building2 size={14} />
            公司名称 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.company}
            onChange={(e) => updateField('company', e.target.value)}
            placeholder="例如: EuroTech Security S.r.l."
          />
        </div>

        {/* 公司官网 */}
        <div>
          <label className="label flex items-center gap-1.5">
            <Globe size={14} />
            公司官网 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.website}
            onChange={(e) => handleWebsiteChange(e.target.value)}
            placeholder="例如: eurotechsecurity.it"
          />
        </div>

        {/* 联系人名字 */}
        <div>
          <label className="label flex items-center gap-1.5">
            <User size={14} />
            联系人名字 <span className="text-[10px] font-normal text-charcoal-400">(可选)</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.contactName}
            onChange={(e) => updateField('contactName', e.target.value)}
            placeholder="例如: Marco Rossi"
          />
        </div>

        {/* 客户邮箱 */}
        <div>
          <label className="label flex items-center gap-1.5">
            <Mail size={14} />
            客户邮箱 <span className="text-[10px] font-normal text-charcoal-400">(可选)</span>
          </label>
          <input
            type="email"
            className="input-field"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="例如: marco@eurotechsecurity.it"
          />
        </div>

        {/* 客户电话 */}
        <div>
          <label className="label flex items-center gap-1.5">
            <Phone size={14} />
            客户电话 <span className="text-[10px] font-normal text-charcoal-400">(可选)</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="例如: +39 02 1234567"
          />
        </div>

        {/* 国家 */}
        <div>
          <label className="label flex items-center gap-1.5">
            <MapPin size={14} />
            客户国家 <span className="text-[10px] font-normal text-charcoal-400">(可选)</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.country}
            onChange={(e) => updateField('country', e.target.value)}
            placeholder="例如: Italy"
          />
        </div>

        {/* 街道地址 */}
        <div className="md:col-span-2">
          <label className="label flex items-center gap-1.5">
            <MapPin size={14} />
            街道地址 <span className="text-[10px] font-normal text-charcoal-400">(可选)</span>
          </label>
          <input
            type="text"
            className="input-field"
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="例如: Via Roma 42, 20121 Milano, Italy"
          />
        </div>

        {/* 其他已知资料 */}
        <div className="md:col-span-2">
          <label className="label flex items-center gap-1.5">
            <FileText size={14} />
            其他已知资料 <span className="text-[10px] font-normal text-charcoal-400">(可选，会提供给 AI 做背调参考)</span>
          </label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            value={form.extraInfo}
            onChange={(e) => updateField('extraInfo', e.target.value)}
            placeholder="例如: 主要做监控摄像头分销、月采购量约500台、之前通过展会认识、老板叫 Giovanni..."
            rows={3}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => handleSubmit(false)}
          disabled={!isValid || loading}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={16} />
          添加客户
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={!isValid || loading}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <FileSearch size={16} />
          )}
          添加并 AI 深度背调
        </button>
        <p className="text-[11px] text-charcoal-400 ml-1">
          填写公司名和官网即可添加，背调会使用 AI 自动调研公司背景
        </p>
      </div>
    </div>
  );
}

/* ────────────── 沉浸式爬虫等待动画 ────────────── */

function CrawlerAnimation({ progress, total }: { progress: string; total: number; currentStep?: number }) {
  const [dots, setDots] = useState('');
  const [stepIdx, setStepIdx] = useState(0);

  const steps = [
    { icon: <Target size={18} />, text: '锁定目标网站' },
    { icon: <Globe size={18} />, text: '云端渲染网页' },
    { icon: <FileText size={18} />, text: '抓取联系页面' },
    { icon: <Zap size={18} />, text: 'AI 深度分析' },
    { icon: <Search size={18} />, text: '搜索联系方式' },
    { icon: <Shield size={18} />, text: '生成背调报告' },
    { icon: <Check size={18} />, text: '调查完成' },
  ];

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    // 每秒自动切换步骤（到倒数第二步循环，最后一步留给完成）
    const stepTimer = setInterval(() => {
      setStepIdx((prev) => (prev >= steps.length - 2 ? 0 : prev + 1));
    }, 1200);
    return () => {
      clearInterval(dotTimer);
      clearInterval(stepTimer);
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 animate-fade-in-up">
      <div className="relative flex flex-col items-center text-center space-y-4">
        {/* 爬虫图标 */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-200/50 animate-pulse">
            <Globe size={28} className="text-white" />
          </div>
          <span className="absolute inset-0 rounded-full bg-orange-300/30 animate-ping" style={{ animationDuration: '2s' }}></span>
        </div>

        {/* 主标题 */}
        <div>
          <h3 className="text-lg font-bold text-charcoal-800">
            AI 深度调查{dots}
          </h3>
          <p className="text-xs text-charcoal-500 mt-1">
            正在调查 {total} 个客户
          </p>
        </div>

        {/* 当前步骤 - 单行显示 */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-100 border border-orange-200">
          <span className="text-orange-600">{steps[stepIdx].icon}</span>
          <span className="text-sm font-medium text-orange-700">{steps[stepIdx].text}</span>
        </div>

        {/* 进度条 */}
        <div className="w-full max-w-xs">
          <div className="h-1.5 bg-cream-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-500"
              style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-charcoal-400 mt-1.5">
            <span>步骤 {stepIdx + 1}/{steps.length}</span>
            <span>{progress}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────── 主组件 ────────────── */

interface ContactEnrichmentProps {
  onTransferToCopy?: () => void;
}

export default function ContactEnrichment({ onTransferToCopy }: ContactEnrichmentProps) {
  const { enrichedLeads, setEnrichedLeads, addManualLead, transferToCopy } = useAppState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [addAndProfileLoading, setAddAndProfileLoading] = useState(false);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // 速搜模式：跳过 URL HEAD 校验 + 关联站扩展，~15s 出结果
  const [fastMode, setFastMode] = useState(false);

  /* ── Step 2+3: 流式深度调查（Streaming）── */
  const handleResearch = async (leadId: string) => {
    const lead = enrichedLeads.find((l) => l.id === leadId);
    if (!lead?.website) return;

    setScrapingId(leadId);
    setProfileLoading(leadId);
    setProfileError(null);
    setEnrichedLeads(
      enrichedLeads.map((l) =>
        l.id === leadId ? { ...l, isProfiling: true } : l
      )
    );

    try {
      const apiConfig = getApiConfig();
      
      // 使用流式 API
      const res = await fetch('/api/research/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: lead.website,
          company_name: lead.company,
          country: lead.country || '',
          background_info: lead.customerBackgroundInfo || '',
          api_key: apiConfig._api_key || '',
          mode: fastMode ? 'fast' : 'full',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `服务器错误 (${res.status})`);
      }

      // 读取流式响应
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let partialData = '';
      let finalData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partialData += decoder.decode(value, { stream: true });

        // 尝试解析累积的数据
        try {
          // 流式格式可能是 data: {...} 的形式
          const lines = partialData.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr && jsonStr !== '[DONE]') {
                const parsed = JSON.parse(jsonStr);
                if (parsed.object) {
                  finalData = parsed.object;
                  // 实时更新 UI - 显示部分结果
                  updateLeadWithPartialData(leadId, finalData);
                }
              }
            }
          }
        } catch {
          // 解析失败继续累积数据
        }
      }

      // 最终更新
      if (finalData) {
        updateLeadWithFinalData(leadId, finalData);
        toast.success(`${lead.company} 深度调查完成`);
      } else {
        throw new Error('未获取到有效数据');
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : '调查失败';
      setProfileError(message);
      toast.error(message);
      setEnrichedLeads(
        enrichedLeads.map((l) =>
          l.id === leadId ? { ...l, isProfiling: false } : l
        )
      );
    } finally {
      setScrapingId(null);
      setProfileLoading(null);
    }
  };

  // 实时更新部分数据（流式显示）—— 只更新 deepProfile，不动 contacts
  const updateLeadWithPartialData = (leadId: string, data: any) => {
    setEnrichedLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          // 流式过程中只更新背调报告，contacts 等流式结束后一次性合并
          deepProfile: data.deep_profile || l.deepProfile,
        };
      })
    );
  };

  // 最终更新完整数据 + 自动下载背调表格
  const updateLeadWithFinalData = (leadId: string, data: any) => {
    let finalLead: EnrichedLead | null = null;
    setEnrichedLeads((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;

        const newContacts: ContactInfo[] = (data.contacts || [])
          .filter((c: any) => c.value)
          .map((c: any) => ({
            type: c.type || 'email',
            value: c.value,
            label: c.label || '',
            verified: c.verified || false,
            source: c.source || undefined,
            verificationNote: c.verificationNote || undefined,
          }));

        const existingValues = new Set(l.contacts.map((c) => c.value));
        const uniqueNew = newContacts.filter((c) => !existingValues.has(c.value));

        // 关联站点
        const relatedSites = Array.isArray(data.related_sites) ? data.related_sites : [];

        // 公司真实性
        const websiteReality = data.website_reality && typeof data.website_reality === 'object'
          ? { suspicious: Boolean(data.website_reality.suspicious), note: String(data.website_reality.note || '') }
          : undefined;

        // 9 个结构化深度背调字段——后端找不到时为 null / 空数组，UI 自动隐藏对应卡片
        const businessProfile = data.business_profile && typeof data.business_profile === 'object'
          ? data.business_profile
          : undefined;
        const hotSellers = Array.isArray(data.hot_sellers) ? data.hot_sellers : undefined;
        const decisionMaker = data.decision_maker && typeof data.decision_maker === 'object'
          ? data.decision_maker
          : undefined;
        const softwareEcosystem = data.software_ecosystem && typeof data.software_ecosystem === 'object'
          ? data.software_ecosystem
          : undefined;
        const complianceRisk = data.compliance_risk && typeof data.compliance_risk === 'object'
          ? data.compliance_risk
          : undefined;
        const competitivePosition = data.competitive_position && typeof data.competitive_position === 'object'
          ? data.competitive_position
          : undefined;
        const supplierChangeSignals = Array.isArray(data.supplier_change_signals)
          ? data.supplier_change_signals
          : undefined;
        const negotiationPlaybook = Array.isArray(data.negotiation_playbook)
          ? data.negotiation_playbook
          : undefined;
        const researchMode = data.research_mode === 'fast' ? 'fast' : 'full';

        const next: EnrichedLead = {
          ...l,
          contacts: [...l.contacts, ...uniqueNew],
          deepProfile: data.deep_profile || l.deepProfile,
          relatedSites: relatedSites.length > 0 ? relatedSites : l.relatedSites,
          websiteReality: websiteReality || l.websiteReality,
          businessProfile: businessProfile || l.businessProfile,
          hotSellers: hotSellers && hotSellers.length > 0 ? hotSellers : l.hotSellers,
          decisionMaker: decisionMaker || l.decisionMaker,
          softwareEcosystem: softwareEcosystem || l.softwareEcosystem,
          complianceRisk: complianceRisk || l.complianceRisk,
          competitivePosition: competitivePosition || l.competitivePosition,
          supplierChangeSignals: supplierChangeSignals && supplierChangeSignals.length > 0
            ? supplierChangeSignals
            : l.supplierChangeSignals,
          negotiationPlaybook: negotiationPlaybook && negotiationPlaybook.length > 0
            ? negotiationPlaybook
            : l.negotiationPlaybook,
          researchMode,
          isProfiling: false,
        };
        finalLead = next;
        return next;
      })
    );

    // 调查完成 → 自动下载背调表格（命名：公司名-背调-日期.xlsx）
    // 用 setTimeout 跳出 React 渲染周期，避免阻塞 UI
    if (finalLead) {
      const leadForDownload = finalLead;
      setTimeout(() => {
        try {
          downloadLeadReport(leadForDownload);
        } catch (err) {
          console.error('[leadReport] download failed:', err);
          toast.error('背调表格下载失败，可点击「下载表格」按钮重试');
        }
      }, 200);
    }
  };

  /* ── 手动添加并调查 ── */
  const handleAddAndProfile = useCallback(
    async (form: ManualForm) => {
      setAddAndProfileLoading(true);
      setProfileError(null);

      const tempId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const contacts: ContactInfo[] = [
        { type: 'website' as const, value: form.website.trim(), label: 'Website' },
      ];
      if (form.email.trim()) {
        contacts.push({ type: 'email' as const, value: form.email.trim(), label: 'Email' });
      }
      if (form.phone.trim()) {
        contacts.push({ type: 'phone' as const, value: form.phone.trim(), label: 'Phone' });
      }

      // 组合背景信息，包含电话、地址、其他资料
      const bgParts: string[] = [];
      if (form.contactName.trim()) bgParts.push(`联系人: ${form.contactName.trim()}`);
      if (form.email.trim()) bgParts.push(`邮箱: ${form.email.trim()}`);
      if (form.phone.trim()) bgParts.push(`电话: ${form.phone.trim()}`);
      if (form.address.trim()) bgParts.push(`地址: ${form.address.trim()}`);
      bgParts.push(`公司: ${form.company.trim()}`);
      bgParts.push(`网站: ${form.website.trim()}`);
      if (form.country.trim()) bgParts.push(`国家: ${form.country.trim()}`);
      if (form.extraInfo.trim()) bgParts.push(`其他已知资料: ${form.extraInfo.trim()}`);

      const newLead: EnrichedLead = {
        id: tempId,
        company: form.company.trim(),
        website: form.website.trim(),
        country: form.country.trim() || 'Unknown',
        tags: ['手动添加'],
        customerBackgroundInfo: bgParts.join('\n'),
        contacts,
        isProfiling: true,
      };

      setEnrichedLeads((prev) => [...prev, newLead]);
      setExpandedId(tempId);

      // 使用流式调查端点
      let finalData: any = null;
      try {
        const apiConfig = getApiConfig();
        const res = await fetch('/api/research/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            website: newLead.website,
            company_name: newLead.company,
            country: newLead.country,
            background_info: newLead.customerBackgroundInfo || '',
            api_key: apiConfig._api_key || '',
            mode: fastMode ? 'fast' : 'full',
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || errData?.detail || `服务器错误 (${res.status})`);
        }

        // 流式读取
        const reader = res.body?.getReader();
        if (!reader) throw new Error('无法读取响应流');
        const decoder = new TextDecoder();
        let partialData = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          partialData += decoder.decode(value, { stream: true });
          const lines = partialData.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6).trim();
                if (jsonStr && jsonStr !== '[DONE]') {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.object) {
                    finalData = parsed.object;
                    updateLeadWithPartialData(tempId, parsed.object);
                  }
                }
              } catch {}
            }
          }
        }

        // 最终更新（使用 finalData 而不是从闭包 enrichedLeads 读取）
        if (finalData) {
          updateLeadWithFinalData(tempId, finalData);
          toast.success(`${newLead.company} 深度调查完成`);
        } else {
          throw new Error('未获取到有效数据');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '调查请求失败';
        setProfileError(message);
        toast.error(message);
        setEnrichedLeads((prev) =>
          prev.map((l) =>
            l.id === tempId ? { ...l, isProfiling: false } : l
          )
        );
      } finally {
        setAddAndProfileLoading(false);
      }
    },
    [setEnrichedLeads, fastMode]
  );

  /* ── 仅手动添加 ── */
  const handleManualAdd = (form: ManualForm) => {
    addManualLead({
      company: form.company.trim(),
      website: form.website.trim(),
      country: form.country.trim(),
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      extraInfo: form.extraInfo.trim() || undefined,
    });
  };

  /* ── 转移到文案步骤 ── */
  const handleTransferToCopy = (lead: EnrichedLead) => {
    transferToCopy(lead);
    onTransferToCopy?.();
  };

  /* ── 删除客户 ── */
  const handleRemove = (leadId: string) => {
    setEnrichedLeads(enrichedLeads.filter((l) => l.id !== leadId));
    if (expandedId === leadId) setExpandedId(null);
  };

  /* ── 复制到剪贴板 ── */
  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const contactIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <Mail size={16} />;
      case 'phone':
        return <Phone size={16} />;
      case 'linkedin':
        return <Linkedin size={16} />;
      case 'whatsapp':
        return <MessageCircle size={16} />;
      case 'facebook':
      case 'twitter':
      case 'instagram':
      case 'social':
        return <Globe size={16} />;
      case 'website':
        return <Globe size={16} />;
      default:
        return <Globe size={16} />;
    }
  };

  // 判断是否有手动添加的客户
  const hasManualLeads = enrichedLeads.some((l) => l.id.startsWith('manual-'));
  const hasSearchLeads = enrichedLeads.some((l) => !l.id.startsWith('manual-'));

  // 搜索过滤后的客户列表
  const filteredLeads = searchTerm.trim()
    ? enrichedLeads.filter(
        (l) =>
          l.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.website.toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
          l.contacts.some((c) => c.value.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : enrichedLeads;

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── 页面标题 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold text-charcoal-800">
            深度调查
          </h2>
          <p className="mt-1 text-sm text-charcoal-500">
            深度抓取目标客户的邮箱、电话及社交媒体信息，或手动添加客户进行 AI 背调
          </p>
        </div>
      </div>

      {/* ── 搜索框 ── */}
      {enrichedLeads.length > 0 && (
        <div className="relative">
          <input
            type="text"
            placeholder="搜索客户名称、网站、国家或联系方式..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full input-field pl-10"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-600"
            >
              <X size={16} />
            </button>
          )}
          {searchTerm && (
            <p className="mt-2 text-xs text-charcoal-400">
              找到 {filteredLeads.length} 个匹配结果
            </p>
          )}
        </div>
      )}

      {/* ── 错误提示 ── */}
      {profileError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 animate-fade-in-up">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">操作失败</p>
            <p className="text-xs mt-0.5 text-red-600">{profileError}</p>
          </div>
          <button onClick={() => setProfileError(null)} className="p-1 rounded hover:bg-red-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 手动添加表单 ── */}
      <ManualAddForm
        onAdd={handleManualAdd}
        onAddAndProfile={handleAddAndProfile}
        loading={addAndProfileLoading}
      />

      {/* ── 空状态 ── */}
      {enrichedLeads.length === 0 && (
        <div className="card p-12 text-center">
          <Building2 size={48} className="mx-auto mb-3 text-cream-400" />
          <h3 className="text-lg font-display text-charcoal-500 mb-2">暂无客户</h3>
          <p className="text-sm text-charcoal-400 max-w-md mx-auto">
            你可以通过以下两种方式添加客户：
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
            <div className="text-xs text-charcoal-400 px-4 py-2 rounded-lg bg-cream-50 border border-cream-200">
              <span className="font-medium text-brand-600">方式一</span>：在「客户搜索」中搜索并转移
            </div>
            <div className="text-xs text-charcoal-400 px-4 py-2 rounded-lg bg-cream-50 border border-cream-200">
              <span className="font-medium text-purple-600">方式二</span>：使用上方表单手动添加
            </div>
          </div>
        </div>
      )}

      {/* ── 客户列表 ── */}
      {filteredLeads.map((lead) => {
        const isExpanded = expandedId === lead.id;
        const isManual = lead.id.startsWith('manual-');
        return (
          <div
            key={lead.id}
            className={clsx(
              'card overflow-hidden transition-all',
              lead.deepProfile && 'border-emerald-300',
              isManual && 'border-dashed border-purple-200'
            )}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : lead.id)}
              className="w-full flex items-center justify-between p-5 hover:bg-cream-50 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  isManual
                    ? 'bg-purple-100 text-purple-700'
                    : lead.deepProfile
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-brand-100 text-brand-700'
                )}>
                  {lead.deepProfile ? (
                    <Shield size={20} />
                  ) : isManual ? (
                    <User size={20} />
                  ) : (
                    <Building2 size={20} />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-charcoal-800">{lead.company}</h4>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-charcoal-400">
                    {lead.website && (
                      <span className="flex items-center gap-1 group">
                        <Globe size={12} />
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-brand-600 underline-offset-2 hover:underline"
                        >
                          {lead.website.replace(/^https?:\/\//, '')}
                        </a>
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(lead.website, `header-site-${lead.id}`); }}
                          className="p-0.5 rounded hover:bg-cream-200 text-charcoal-300 hover:text-charcoal-500 transition-colors"
                          title="复制网址"
                        >
                          {copiedField === `header-site-${lead.id}` ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                        </button>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MapPin size={12} />
                      {lead.country}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex gap-1.5">
                  {(lead.tags || []).map((tag) => (
                    <span key={tag} className={clsx(
                      'tag text-[10px]',
                      isManual && tag === '手动添加' && 'bg-purple-50 text-purple-700 border-purple-200'
                    )}>
                      {tag}
                    </span>
                  ))}
                  {lead.deepProfile && (
                    <span className="tag text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                      已背调
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-brand-600">
                  <span className="text-sm font-medium">
                    {lead.contacts.length} 条联系信息
                  </span>
                  <svg
                    className={clsx('w-4 h-4 transition-transform', isExpanded && 'rotate-180')}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="border-t border-cream-200 bg-cream-50/50 space-y-4">
                {/* Action bar */}
                <div className="flex flex-wrap items-center gap-2 p-5 pb-0">
                  <button
                    onClick={() => !scrapingId && handleResearch(lead.id)}
                    disabled={!!scrapingId}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      lead.deepProfile
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gradient-to-r from-purple-50 to-orange-50 text-purple-700 border-purple-200 hover:from-purple-100 hover:to-orange-100'
                    )}
                  >
                    {(scrapingId === lead.id || lead.isProfiling) ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : lead.deepProfile ? (
                      <Shield size={14} />
                    ) : (
                      <FileSearch size={14} />
                    )}
                    {(scrapingId === lead.id || lead.isProfiling) ? 'AI 深度调查中...' : lead.deepProfile ? '重新调查' : 'AI 深度调查'}
                  </button>
                  <label
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border cursor-pointer select-none transition-colors',
                      fastMode
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-cream-50 text-charcoal-500 border-cream-200 hover:border-amber-200'
                    )}
                    title="速搜模式跳过 URL 校验 + 关联站扩展，约 15 秒出结果（关联站点、链接存活校验会缺）"
                  >
                    <input
                      type="checkbox"
                      checked={fastMode}
                      onChange={(e) => setFastMode(e.target.checked)}
                      className="accent-amber-600 h-3 w-3"
                    />
                    速搜模式 (~15s)
                  </label>
                  {lead.deepProfile && (
                    <button
                      onClick={() => {
                        try {
                          downloadLeadReport(lead);
                          toast.success('背调表格已下载');
                        } catch (err) {
                          console.error('[leadReport] manual download failed:', err);
                          toast.error('下载失败');
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                      title="重新下载该客户的背调表格"
                    >
                      <FileText size={14} />
                      下载表格
                    </button>
                  )}
                  <button
                    onClick={() => handleTransferToCopy(lead)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition-colors"
                  >
                    <ArrowRight size={14} />
                    去写文案
                  </button>
                  <button
                    onClick={() => handleRemove(lead.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors ml-auto"
                  >
                    <Trash2 size={14} />
                    移除
                  </button>
                </div>

                {/* AI 深度调查中 Loading */}
                {(scrapingId === lead.id || lead.isProfiling) && (
                  <CrawlerAnimation
                    progress={`正在调查 ${lead.company}（已抓取网页，AI 分析中...）`}
                    total={1}
                  />
                )}

                {/* 公司真实性存疑警告——最显眼的位置 */}
                {lead.websiteReality?.suspicious && !lead.isProfiling && (
                  <div className="mx-5 p-4 rounded-lg bg-red-50 border-2 border-red-300 flex items-start gap-3 animate-fade-in-up">
                    <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm text-red-800">
                      <p className="font-bold mb-1">⚠️ 公司真实性存疑</p>
                      <p className="text-xs leading-relaxed">{lead.websiteReality.note}</p>
                      <p className="text-xs mt-2 text-red-600">
                        <strong>建议</strong>：先 Google 搜公司名 + 国家确认这家公司是否真实存在，再决定要不要发邮件或拨打电话。下方所有"已验证"徽章在此情况下都需要人工二次核验。
                      </p>
                    </div>
                  </div>
                )}

                {/* 🚀 临门一脚谈判策略——置顶大卡片 */}
                {Array.isArray(lead.negotiationPlaybook) && lead.negotiationPlaybook.length > 0 && !lead.isProfiling && (
                  <div className="mx-5 p-5 rounded-lg bg-gradient-to-br from-emerald-50 via-cream-50 to-amber-50 border-2 border-emerald-300 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <Megaphone size={18} className="text-emerald-700" />
                      <h5 className="text-sm font-bold text-emerald-900">🚀 临门一脚：3 条谈判破冰策略</h5>
                      {lead.researchMode === 'fast' && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">速搜</span>
                      )}
                    </div>
                    <p className="text-[11px] text-charcoal-500">每条话术直接复制粘贴可用——英文给客户发，中文是给业务员自己看依据。</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {lead.negotiationPlaybook.slice(0, 3).map((play, idx) => (
                        <div key={`play-${idx}`} className="p-3 rounded-lg bg-white border border-emerald-200 flex flex-col gap-2">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                            <h6 className="text-xs font-bold text-charcoal-800 leading-snug">{play.angle}</h6>
                          </div>
                          {play.rationale && (
                            <p className="text-[11px] text-charcoal-500 leading-relaxed">{play.rationale}</p>
                          )}
                          {Array.isArray(play.kb_citations) && play.kb_citations.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {play.kb_citations.slice(0, 5).map((cit, ci) => (
                                <span
                                  key={`cit-${ci}`}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-mono"
                                  title="引用自公司内部知识库"
                                >
                                  📚 {cit}
                                </span>
                              ))}
                            </div>
                          )}
                          {play.opening_script_en && (
                            <details className="text-[11px]">
                              <summary className="cursor-pointer text-charcoal-600 hover:text-emerald-700 font-medium">📩 英文话术</summary>
                              <p className="mt-1 p-2 rounded bg-cream-50 text-charcoal-700 leading-relaxed">{play.opening_script_en}</p>
                            </details>
                          )}
                          {play.opening_script_zh && (
                            <details className="text-[11px]">
                              <summary className="cursor-pointer text-charcoal-600 hover:text-emerald-700 font-medium">🇨🇳 中文依据</summary>
                              <p className="mt-1 p-2 rounded bg-cream-50 text-charcoal-700 leading-relaxed">{play.opening_script_zh}</p>
                            </details>
                          )}
                          <div className="flex gap-1 mt-auto pt-1">
                            {play.opening_script_en && (
                              <button
                                onClick={() => copyToClipboard(play.opening_script_en!, `play-en-${lead.id}-${idx}`)}
                                className="flex-1 text-[10px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1"
                              >
                                {copiedField === `play-en-${lead.id}-${idx}` ? <Check size={10} /> : <Copy size={10} />}
                                EN
                              </button>
                            )}
                            {play.opening_script_zh && (
                              <button
                                onClick={() => copyToClipboard(play.opening_script_zh!, `play-zh-${lead.id}-${idx}`)}
                                className="flex-1 text-[10px] px-2 py-1 rounded bg-charcoal-700 text-white hover:bg-charcoal-800 transition-colors flex items-center justify-center gap-1"
                              >
                                {copiedField === `play-zh-${lead.id}-${idx}` ? <Check size={10} /> : <Copy size={10} />}
                                中文
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 公司画像 grid（财务/主推产品/决策人/软件生态） */}
                {(lead.businessProfile || (lead.hotSellers && lead.hotSellers.length > 0) || lead.decisionMaker || lead.softwareEcosystem) && !lead.isProfiling && (
                  <div className="mx-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {lead.businessProfile && (
                      <div className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <DollarSign size={14} className="text-emerald-700" />
                          <h6 className="text-xs font-bold text-emerald-900">财务实力</h6>
                        </div>
                        {lead.businessProfile.annual_revenue && (
                          <div className="text-[11px]"><span className="text-charcoal-400">年营收：</span><span className="text-charcoal-800 font-semibold">{lead.businessProfile.annual_revenue}</span></div>
                        )}
                        {lead.businessProfile.net_profit && (
                          <div className="text-[11px]"><span className="text-charcoal-400">净利润：</span><span className="text-charcoal-800">{lead.businessProfile.net_profit}</span></div>
                        )}
                        {lead.businessProfile.employee_count && (
                          <div className="text-[11px]"><span className="text-charcoal-400">人员规模：</span><span className="text-charcoal-800">{lead.businessProfile.employee_count}</span></div>
                        )}
                        {lead.businessProfile.scale_judgment && (
                          <div className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">{lead.businessProfile.scale_judgment}</div>
                        )}
                        {lead.businessProfile.evidence_source && (
                          <p className="text-[10px] text-charcoal-400 italic pt-1 border-t border-emerald-100">来源：{lead.businessProfile.evidence_source}</p>
                        )}
                      </div>
                    )}
                    {lead.hotSellers && lead.hotSellers.length > 0 && (
                      <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Flame size={14} className="text-amber-700" />
                          <h6 className="text-xs font-bold text-amber-900">主推产品</h6>
                        </div>
                        {lead.hotSellers.slice(0, 4).map((p, i) => (
                          <div key={`hs-${i}`} className="text-[11px] border-b border-amber-100 last:border-b-0 pb-1.5 last:pb-0">
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="font-semibold text-charcoal-800 truncate">{p.name}</span>
                              {p.price_current && <span className="text-amber-800 font-bold text-[11px] flex-shrink-0">{p.price_current}</span>}
                            </div>
                            {p.category && <div className="text-[10px] text-charcoal-500">{p.category}</div>}
                            {p.price_signal && (
                              <div className="text-[10px] text-rose-700 mt-0.5 flex items-center gap-1">
                                <TrendingDown size={9} />
                                {p.price_signal}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {lead.decisionMaker && (
                      <div className="p-4 rounded-lg bg-purple-50/60 border border-purple-200 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <UserCheck size={14} className="text-purple-700" />
                          <h6 className="text-xs font-bold text-purple-900">关键决策人</h6>
                        </div>
                        {lead.decisionMaker.name && (
                          <div className="text-sm font-semibold text-charcoal-800">{lead.decisionMaker.name}</div>
                        )}
                        {lead.decisionMaker.role_guess && (
                          <div className="text-[11px] text-charcoal-600">{lead.decisionMaker.role_guess}</div>
                        )}
                        {lead.decisionMaker.personality_signal && (
                          <p className="text-[11px] text-charcoal-500 italic leading-relaxed">"{lead.decisionMaker.personality_signal}"</p>
                        )}
                        {lead.decisionMaker.outreach_handle && (
                          <div className="text-[10px] text-purple-700 pt-1 border-t border-purple-100">
                            🎯 触达方式：{lead.decisionMaker.outreach_handle}
                          </div>
                        )}
                      </div>
                    )}
                    {lead.softwareEcosystem && (
                      <div className="p-4 rounded-lg bg-blue-50/60 border border-blue-200 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Cpu size={14} className="text-blue-700" />
                          <h6 className="text-xs font-bold text-blue-900">软件生态</h6>
                        </div>
                        {lead.softwareEcosystem.verdict && (
                          <div className="text-[11px] font-semibold text-charcoal-800">{lead.softwareEcosystem.verdict}</div>
                        )}
                        {lead.softwareEcosystem.evidence && (
                          <p className="text-[11px] text-charcoal-500 leading-relaxed">{lead.softwareEcosystem.evidence}</p>
                        )}
                        {lead.softwareEcosystem.switch_pressure && (
                          <div className="text-[10px] text-blue-700 pt-1 border-t border-blue-100 leading-relaxed">
                            💡 切入点：{lead.softwareEcosystem.switch_pressure}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 风险与定位 row */}
                {(lead.complianceRisk || lead.competitivePosition) && !lead.isProfiling && (
                  <div className="mx-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lead.complianceRisk && (
                      <div className="p-4 rounded-lg bg-orange-50/60 border border-orange-200 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={14} className="text-orange-700" />
                          <h6 className="text-xs font-bold text-orange-900">合规风险</h6>
                        </div>
                        {Array.isArray(lead.complianceRisk.key_regulations) && lead.complianceRisk.key_regulations.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {lead.complianceRisk.key_regulations.map((r, i) => (
                              <span key={`reg-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">{r}</span>
                            ))}
                          </div>
                        )}
                        {lead.complianceRisk.platform_risk && (
                          <p className="text-[11px] text-charcoal-600 leading-relaxed">⚠️ {lead.complianceRisk.platform_risk}</p>
                        )}
                        {Array.isArray(lead.complianceRisk.must_have_certs) && lead.complianceRisk.must_have_certs.length > 0 && (
                          <div className="text-[10px] text-charcoal-500 pt-1 border-t border-orange-100">
                            必备认证：{lead.complianceRisk.must_have_certs.join(' / ')}
                          </div>
                        )}
                      </div>
                    )}
                    {lead.competitivePosition && (
                      <div className="p-4 rounded-lg bg-teal-50/60 border border-teal-200 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Award size={14} className="text-teal-700" />
                          <h6 className="text-xs font-bold text-teal-900">竞争定位</h6>
                        </div>
                        {lead.competitivePosition.type && (
                          <div className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">{lead.competitivePosition.type}</div>
                        )}
                        {lead.competitivePosition.key_differentiator && (
                          <p className="text-[11px] text-charcoal-700 leading-relaxed">✨ {lead.competitivePosition.key_differentiator}</p>
                        )}
                        {lead.competitivePosition.customer_profile_short && (
                          <div className="text-[10px] text-charcoal-500 pt-1 border-t border-teal-100">
                            客户画像：{lead.competitivePosition.customer_profile_short}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 供应商更替信号 */}
                {Array.isArray(lead.supplierChangeSignals) && lead.supplierChangeSignals.length > 0 && !lead.isProfiling && (
                  <div className="mx-5 p-4 rounded-lg bg-yellow-50/60 border border-yellow-200">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Zap size={14} className="text-yellow-700" />
                      <h6 className="text-xs font-bold text-yellow-900">供应商更替信号（切入时机）</h6>
                    </div>
                    <ul className="space-y-1">
                      {lead.supplierChangeSignals.slice(0, 4).map((s, i) => (
                        <li key={`sig-${i}`} className="text-[11px] text-charcoal-700 flex items-start gap-1.5">
                          <span className="text-yellow-700 flex-shrink-0">▸</span>
                          <span className="leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 深度背调结果——降级为"执行摘要" */}
                {lead.deepProfile && !lead.isProfiling && (
                  <div className="mx-5 p-5 rounded-lg bg-white border border-emerald-200 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={16} className="text-emerald-600" />
                      <h5 className="text-sm font-semibold text-charcoal-800">执行摘要</h5>
                      <button
                        onClick={() => copyToClipboard(lead.deepProfile!, `profile-${lead.id}`)}
                        className="ml-auto p-1 rounded hover:bg-cream-200 text-charcoal-400 hover:text-charcoal-600"
                      >
                        {copiedField === `profile-${lead.id}` ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto pr-1">
                      <SimpleMarkdown text={lead.deepProfile!} />
                    </div>
                  </div>
                )}

                {/* 关联网站（邮箱反查 + 公司域名第三方提及） */}
                {Array.isArray(lead.relatedSites) && lead.relatedSites.length > 0 && !lead.isProfiling && (
                  <div className="mx-5 p-5 rounded-lg bg-white border border-indigo-200 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Search size={16} className="text-indigo-600" />
                      <h5 className="text-sm font-semibold text-charcoal-800">
                        关联网站
                        <span className="ml-2 text-[10px] font-normal text-charcoal-400">
                          根据邮箱反查 + 公司在第三方目录的提及——可能是姐妹品牌 / 经销商 / 行业目录
                        </span>
                      </h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {lead.relatedSites.map((site, idx) => (
                        <a
                          key={`${site.domain}-${idx}`}
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 p-3 rounded-lg border border-cream-200 bg-cream-50/40 hover:bg-indigo-50/50 hover:border-indigo-200 transition-colors group"
                        >
                          <Globe size={14} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-charcoal-800 truncate group-hover:text-indigo-700">
                              {site.title || site.domain}
                            </div>
                            <div className="text-[10px] text-indigo-600 truncate flex items-center gap-0.5">
                              {site.domain}
                              <ExternalLink size={9} />
                            </div>
                            {site.snippet && (
                              <p className="text-[11px] text-charcoal-500 mt-1 line-clamp-2 leading-relaxed">
                                {site.snippet}
                              </p>
                            )}
                            {site.matched_via && (
                              <p className="text-[10px] text-charcoal-400 mt-1">
                                命中：<span className="font-mono">{site.matched_via}</span>
                              </p>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 联系方式列表 */}
                <div className="p-5">
                  <p className="text-xs text-charcoal-400 mb-3">
                    已抓取 {lead.contacts.length} 条联系方式
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lead.contacts
                      .slice()
                      .sort((a, b) => {
                        // WhatsApp 永远置顶，让业务员一眼看到
                        const wa = (x: typeof a) => (x.type === 'whatsapp' ? 0 : 1);
                        return wa(a) - wa(b);
                      })
                      .map((c, idx) => {
                      const fieldId = `${lead.id}-${idx}`;
                      const isWhatsApp = c.type === 'whatsapp';
                      return (
                        <div
                          key={fieldId}
                          className={clsx(
                            'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                            isWhatsApp
                              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-100 shadow-sm'
                              : 'bg-white border-cream-200 hover:border-brand-200'
                          )}
                        >
                          <div
                            className={clsx(
                              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                              c.type === 'email'
                                ? 'bg-blue-50 text-blue-600'
                                : c.type === 'phone'
                                ? 'bg-emerald-50 text-emerald-600'
                                : c.type === 'linkedin'
                                ? 'bg-sky-50 text-sky-600'
                                : c.type === 'whatsapp'
                                ? 'bg-green-50 text-green-600'
                                : c.type === 'facebook'
                                ? 'bg-blue-50 text-blue-700'
                                : c.type === 'twitter'
                                ? 'bg-sky-50 text-sky-500'
                                : c.type === 'instagram'
                                ? 'bg-pink-50 text-pink-600'
                                : 'bg-cream-200 text-brand-600'
                            )}
                          >
                            {contactIcon(c.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-charcoal-800 truncate">
                              {(c.type === 'website' || c.type === 'linkedin' || c.type === 'facebook' || c.type === 'twitter' || c.type === 'instagram' || c.type === 'social') ? (
                                <a
                                  href={c.value}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-brand-600 flex items-center gap-1"
                                >
                                  {c.value}
                                  <ExternalLink size={10} />
                                </a>
                              ) : c.type === 'whatsapp' ? (
                                <a
                                  href={`https://wa.me/${c.value.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-green-600 flex items-center gap-1"
                                >
                                  {c.value}
                                  <ExternalLink size={10} />
                                </a>
                              ) : (
                                c.value
                              )}
                            </div>
                            {c.label && (
                              <div className="text-[10px] text-charcoal-400 mt-0.5">
                                {c.label}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isWhatsApp && c.verified && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-semibold shadow-sm"
                                title={c.verificationNote || '官网有 wa.me 链接'}
                              >
                                ✓ 重点跟进
                              </span>
                            )}
                            {isWhatsApp && !c.verified && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 font-semibold"
                                title={c.verificationNote || '未验证：AI 推测，发起 WhatsApp 前先在 app 里搜一下号码'}
                              >
                                ⚠ 未验证
                              </span>
                            )}
                            {!isWhatsApp && c.verified && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200"
                                title={c.verificationNote || '已交叉验证'}
                              >
                                ✓ 已验证
                              </span>
                            )}
                            {!isWhatsApp && !c.verified && c.verificationNote && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                                title={c.verificationNote}
                              >
                                ⚠ 未验证
                              </span>
                            )}
                            <button
                              onClick={() => copyToClipboard(c.value, fieldId)}
                              className="p-1.5 rounded hover:bg-cream-200 transition-colors text-charcoal-400 hover:text-charcoal-600"
                            >
                              {copiedField === fieldId ? (
                                <Check size={14} className="text-emerald-600" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick stats */}
                  <div className="flex gap-4 pt-3 mt-3 border-t border-cream-200">
                    <div className="text-xs text-charcoal-400">
                      <span className="font-medium text-charcoal-600">
                        {lead.contacts.filter((c) => c.type === 'email').length}
                      </span>{' '}
                      邮箱
                    </div>
                    <div className="text-xs text-charcoal-400">
                      <span className="font-medium text-charcoal-600">
                        {lead.contacts.filter((c) => c.type === 'phone').length}
                      </span>{' '}
                      电话
                    </div>
                    <div className="text-xs text-charcoal-400">
                      <span className="font-medium text-charcoal-600">
                        {lead.contacts.filter((c) => c.type === 'linkedin').length}
                      </span>{' '}
                      LinkedIn
                    </div>
                    <div className="text-xs text-charcoal-400">
                      <span className="font-medium text-green-600">
                        {lead.contacts.filter((c) => c.type === 'whatsapp').length}
                      </span>{' '}
                      WhatsApp
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
