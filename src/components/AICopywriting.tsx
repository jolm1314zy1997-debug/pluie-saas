'use client';

import { useState, useEffect } from 'react';
import {
  PenTool,
  Mail,
  MessageCircle,
  Loader2,
  Copy,
  Check,
  Sparkles,
  User,
  Building2,
  FileText,
  RefreshCw,
  AlertCircle,
  X,
  Database,
  Brain,
  Search,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppState } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { saveCopyDraft } from '@/lib/cloudData';
import type { CopywritingPayload, CopywritingResponse } from '@/types/api';
import { BRAND } from '@/config/brand';

/* ────────────── 类型 ────────────── */

interface CopywritingResult {
  channel: 'email' | 'whatsapp';
  version: string;
  content: string;
}

/* ────────────── AI 生成 Loading 动画 ────────────── */

function AIGeneratingLoader({ channel }: { channel: 'email' | 'whatsapp' }) {
  const steps = [
    { icon: <Database size={16} />, text: '正在检索 公司知识库...', duration: 3000 },
    { icon: <Search size={16} />, text: 'AI 正在分析客户背景...', duration: 3000 },
    { icon: <Brain size={16} />, text: '正在构建个性化策略...', duration: 3000 },
    { icon: <PenTool size={16} />, text: '正在撰写破冰文案...', duration: 3000 },
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // 每个步骤固定3秒，自动往下走
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 3000);

    const elapsedInterval = setInterval(() => {
      setElapsed((prev) => prev + 0.1);
    }, 100);

    return () => {
      clearInterval(stepInterval);
      clearInterval(elapsedInterval);
    };
  }, []);

  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
  const progress = Math.min((elapsed / (totalDuration * 0.7)) * 100, 95);
  const elapsedSeconds = Math.floor(elapsed);

  return (
    <div className="card p-10 text-center space-y-6">
      <div className="relative w-20 h-20 mx-auto">
        <div className={clsx(
          'absolute inset-0 rounded-full animate-ping opacity-20',
          channel === 'email' ? 'bg-brand-400' : 'bg-emerald-400'
        )} />
        <div className={clsx(
          'relative w-20 h-20 rounded-full flex items-center justify-center',
          channel === 'email'
            ? 'bg-gradient-to-br from-brand-50 to-brand-100'
            : 'bg-gradient-to-br from-emerald-50 to-emerald-100'
        )}>
          <Sparkles size={32} className={clsx(
            'animate-pulse',
            channel === 'email' ? 'text-brand-600' : 'text-emerald-600'
          )} />
        </div>
      </div>

      <div>
        <p className="font-display font-semibold text-lg text-charcoal-700">
          AI 正在生成文案
        </p>
        <p className="text-sm text-charcoal-400 mt-1">
          已等待 {elapsedSeconds} 秒，AI 已强制检索 公司知识库...
        </p>
      </div>

      <div className="max-w-sm mx-auto space-y-3">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className={clsx(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-500',
              idx === currentStep
                ? channel === 'email'
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : idx < currentStep
                  ? 'border-cream-200 bg-cream-50 text-charcoal-400'
                  : 'border-cream-200 bg-white text-charcoal-300'
            )}
          >
            {idx < currentStep ? (
              <Check size={16} className="text-emerald-500" />
            ) : idx === currentStep ? (
              <span className="animate-spin">
                <Loader2 size={16} />
              </span>
            ) : (
              <span className="opacity-40">{step.icon}</span>
            )}
            <span className={clsx('text-sm', idx > currentStep && 'opacity-50')}>{step.text}</span>
            {idx === currentStep && (
              <span className="text-xs font-medium opacity-60 ml-auto">进行中...</span>
            )}
            {idx < currentStep && (
              <Check size={14} className="text-emerald-500 ml-auto" />
            )}
          </div>
        ))}
      </div>

      <div className="max-w-xs mx-auto">
        <div className="h-1.5 bg-cream-200 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-300 ease-out',
              channel === 'email' ? 'bg-brand-500' : 'bg-emerald-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────── 组件 ────────────── */

interface AICopywritingProps {
  onBackToContact?: () => void;
}

export default function AICopywriting({ onBackToContact }: AICopywritingProps) {
  const { copyCustomer, setCopyCustomer, enrichedLeads } = useAppState();
  const { accessToken, user } = useAuth();

  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [salesPerson, setSalesPerson] = useState('Pluie');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerIndustry, setCustomerIndustry] = useState('');
  const [coreAdvantage, setCoreAdvantage] = useState('');
  const [customerBackground, setCustomerBackground] = useState('');

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CopywritingResult[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 从全局状态自动填充客户信息
  useEffect(() => {
    if (copyCustomer) {
      setCustomerCompany(copyCustomer.company);
      setCustomerIndustry(copyCustomer.industry);
      setCustomerBackground(copyCustomer.background);
      // 关键修复：切换客户时清空之前的结果，避免旧文案残留
      setResults([]);
      setError(null);
      setCopiedIdx(null);
    }
  }, [copyCustomer]);

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    // 关键修复：切换渠道时强制清空之前的结果，避免 WhatsApp/Email 互相干扰
    setResults([]);
    // 同时重置复制状态
    setCopiedIdx(null);

    try {
      // 从 localStorage 读取 API Key 配置
      let extraBody: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('qzt_aihubmix_config');
        if (stored) {
          const config = JSON.parse(stored);
          if (config.apiKey) extraBody._api_key = config.apiKey;
        }
      } catch {}

      const res = await fetch('/api/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          mode: 'outreach',
          sales_person: salesPerson,
          customer_company: customerCompany,
          customer_industry: customerIndustry,
          core_advantage: coreAdvantage,
          customer_background: customerBackground,
          ...extraBody,
        } satisfies CopywritingPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `服务器错误 (${res.status})`);
      }

      const data: CopywritingResponse = await res.json();
      if (data.versions && data.versions.length > 0) {
        // 关键修复：确保只设置当前渠道的结果
        const filteredVersions: CopywritingResult[] = data.versions.map((v) => ({
          version: v.version,
          content: v.content,
          channel: channel, // 强制使用当前选择的渠道
        }));
        setResults(filteredVersions);
        if (user) {
          saveCopyDraft(accessToken, {
            mode: 'outreach',
            channel,
            customerCompany,
            customerBackground,
            versions: filteredVersions.map(({ version, content }) => ({ version, content })),
          }).catch((draftError) => {
            console.warn('Cloud copy draft save failed:', draftError);
          });
        }
      } else {
        throw new Error('AI 返回为空，请重试');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络连接失败';
      setError(message);
      setResults(generateDemoResults(channel, salesPerson, customerCompany));
    } finally {
      setLoading(false);
    }
  };

  const copyResult = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(`${channel}-${idx}`);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const copyAll = () => {
    const all = results.map((r) => `--- ${r.version} ---\n${r.content}`).join('\n\n');
    navigator.clipboard.writeText(all);
    setCopiedIdx('all');
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // 清除自动填充（手动选择其他客户时）
  const clearAutoFill = () => {
    setCustomerCompany('');
    setCustomerIndustry('');
    setCustomerBackground('');
    setCopyCustomer(null);
  };

  // 一键清空：清空表单 + 结果 + 全局自动填充
  const clearAll = () => {
    setCustomerCompany('');
    setCustomerIndustry('');
    setCustomerBackground('');
    setCoreAdvantage('');
    setResults([]);
    setError(null);
    setCopiedIdx(null);
    setCopyCustomer(null);
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-charcoal-800">
          AI 破冰文案生成
        </h2>
        <p className="mt-1 text-sm text-charcoal-500">
          结合 企业知识库与客户背景信息，一键生成高转化率的定制化开发信
        </p>
      </div>

      {/* 顶部工具栏：自动填充提示（左）+ 一键清空（右） */}
      {(copyCustomer || customerCompany || customerBackground || results.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 animate-fade-in-up">
          {copyCustomer && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 border border-brand-200 flex-1 min-w-0">
              <Sparkles size={16} className="text-brand-600 flex-shrink-0" />
              <span className="text-xs text-brand-700 truncate">
                已自动从「深度调查」填入 <strong>{copyCustomer.company}</strong> 的信息
                {copyCustomer.email && ` (${copyCustomer.email})`}
              </span>
              <button
                onClick={clearAutoFill}
                className="p-1 rounded hover:bg-brand-100 text-brand-400 hover:text-brand-600 flex-shrink-0"
                title="只清掉自动填入的内容，不清结果"
              >
                <X size={14} />
              </button>
              {onBackToContact && (
                <button
                  onClick={onBackToContact}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-brand-600 hover:bg-brand-100 transition-colors flex-shrink-0"
                >
                  <ArrowLeft size={12} />
                  返回客户列表
                </button>
              )}
            </div>
          )}
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cream-300 bg-white text-xs text-charcoal-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors flex-shrink-0"
            title="清空所有输入与生成结果"
          >
            <Trash2 size={13} />
            一键清空
          </button>
        </div>
      )}

      {/* ── 错误提示 ── */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 animate-fade-in-up">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">AI 生成失败</p>
            <p className="text-xs mt-0.5 text-red-600">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded hover:bg-red-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 左侧表单 */}
        <div className="lg:col-span-2 card p-6 space-y-5 self-start">
          <h3 className="font-display font-semibold text-charcoal-700 flex items-center gap-2">
            <FileText size={18} />
            开发信配置
          </h3>

          {/* 沟通渠道 */}
          <div>
            <label className="label">沟通渠道</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setChannel('email')}
                className={clsx(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200',
                  channel === 'email'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-cream-300 bg-white text-charcoal-500 hover:border-cream-400'
                )}
              >
                <Mail size={18} />
                <div className="text-left">
                  <span className="block text-sm font-semibold">Email</span>
                  <span className="block text-[10px] opacity-60">正式邮件</span>
                </div>
              </button>
              <button
                onClick={() => setChannel('whatsapp')}
                className={clsx(
                  'flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all duration-200',
                  channel === 'whatsapp'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-cream-300 bg-white text-charcoal-500 hover:border-cream-400'
                )}
              >
                <MessageCircle size={18} />
                <div className="text-left">
                  <span className="block text-sm font-semibold">WhatsApp</span>
                  <span className="block text-[10px] opacity-60">即时消息</span>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <User size={14} />
              业务员名字
            </label>
            <input
              type="text"
              className="input-field"
              value={salesPerson}
              onChange={(e) => setSalesPerson(e.target.value)}
              placeholder="输入您的名字"
            />
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Building2 size={14} />
              客户公司名称
            </label>
            <input
              type="text"
              className="input-field"
              value={customerCompany}
              onChange={(e) => setCustomerCompany(e.target.value)}
              placeholder="例如: EuroTech Security S.r.l."
            />
          </div>

          <div>
            <label className="label">客户行业与主营产品</label>
            <input
              type="text"
              className="input-field"
              value={customerIndustry}
              onChange={(e) => setCustomerIndustry(e.target.value)}
              placeholder="例如: Security cameras distributor"
            />
          </div>

          <div>
            <label className="label">核心优势补充（可选）</label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              value={coreAdvantage}
              onChange={(e) => setCoreAdvantage(e.target.value)}
              placeholder="例如：我们正在测试新款 S820 模块，支持 4K 录制..."
            />
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Sparkles size={14} />
              客户背景信息 <span className="text-[10px] font-normal text-charcoal-400">(Customer_Background_Info)</span>
            </label>
            <textarea
              className="input-field min-h-[80px] resize-y"
              value={customerBackground}
              onChange={(e) => setCustomerBackground(e.target.value)}
              placeholder="自动从搜索模块带入，也可手动粘贴..."
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            className={clsx(
              'w-full py-3 rounded-lg text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200',
              channel === 'email'
                ? 'bg-brand-600 hover:bg-brand-700'
                : 'bg-emerald-600 hover:bg-emerald-700',
              loading && 'opacity-70 cursor-not-allowed'
            )}
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /> AI 生成中，请稍候...</>
            ) : (
              <><PenTool size={18} /> 一键生成开发文案</>
            )}
          </button>
        </div>

        {/* 右侧结果 */}
        <div className="lg:col-span-3 space-y-4 min-h-[600px]">
          {/* 空状态 */}
          {results.length === 0 && !loading && !error && (
            <div className="card p-12 text-center min-h-[500px] flex flex-col items-center justify-center">
              <PenTool size={48} className="mx-auto mb-4 text-cream-400" />
              <h3 className="text-lg font-display text-charcoal-500 mb-2">等待生成</h3>
              <p className="text-sm text-charcoal-400 max-w-md mx-auto">
                填写左侧表单信息后，点击「一键生成开发文案」，AI 将结合 企业知识库为客户量身定制破冰文案
              </p>
              {enrichedLeads.length > 0 && !copyCustomer && (
                <p className="text-xs text-brand-500 mt-3">
                  提示：你也可以在「深度调查」中点击「去写文案」自动填入客户信息
                </p>
              )}
            </div>
          )}

          {/* AI 生成中 */}
          {loading && <AIGeneratingLoader channel={channel} />}

          {/* 生成结果 */}
          {results.length > 0 && !loading && (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  <AlertCircle size={14} />
                  <span>AI 服务暂时不可用，当前显示的是演示文案。</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-charcoal-700 flex items-center gap-2">
                  <Sparkles size={18} />
                  生成结果
                  <span className="tag">{channel === 'email' ? 'Email' : 'WhatsApp'}</span>
                </h3>
                <div className="flex gap-2">
                  <button onClick={copyAll} className="btn-secondary text-xs">
                    {copiedIdx === 'all' ? <Check size={14} /> : <Copy size={14} />}
                    复制全部
                  </button>
                  <button 
                    onClick={() => {
                      // 关键修复：重新生成前清空结果
                      setResults([]);
                      setCopiedIdx(null);
                      handleGenerate();
                    }} 
                    className="btn-secondary text-xs"
                  >
                    <RefreshCw size={14} /> 重新生成
                  </button>
                </div>
              </div>

              {results.map((r, idx) => (
                <div key={idx} className="card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-cream-100/50 border-b border-cream-200">
                    <div className="flex items-center gap-2">
                      {channel === 'email' ? (
                        <Mail size={14} className="text-brand-500" />
                      ) : (
                        <MessageCircle size={14} className="text-emerald-500" />
                      )}
                      <span className="text-sm font-semibold text-charcoal-700">{r.version}</span>
                    </div>
                    <button onClick={() => copyResult(r.content, idx)} className="btn-secondary text-xs !py-1 !px-3">
                      {copiedIdx === `${channel}-${idx}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      复制
                    </button>
                  </div>
                  <div className="p-6">
                    <pre className="whitespace-pre-wrap text-sm text-charcoal-700 leading-relaxed font-sans">{r.content}</pre>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────── Demo 文案数据 ────────────── */

function generateDemoResults(
  channel: 'email' | 'whatsapp',
  salesPerson: string,
  company: string
): CopywritingResult[] {
  const companyName = company || 'your business';
  const recipient = company ? company.split(' ')[0] + ' Team' : 'Partner';
  const sender = salesPerson || 'Sales';
  const brand = BRAND.name;

  // 说明：这些是 AI 调用失败时的降级示范文案，**故意保持中性**，
  // 不绑死任何行业。真正的文案应来自 /api/generate-copy，
  // 由 [src/config/company.ts] 的业务身份驱动 AI 生成。
  const demoNotice = '⚠️ AI 暂时不可用，以下为占位示例。请重试以获取真实生成结果。';

  if (channel === 'email') {
    return [
      {
        channel: 'email',
        version: 'Version A - Direct Value',
        content: `${demoNotice}

Subject: A quick intro to ${brand} for ${companyName}

Dear ${recipient},

I'm ${sender} from ${brand}. We work with B2B partners in your space and noticed your activity around the categories we supply.

I'd love to share a short overview of how we work with similar buyers — what our typical order looks like, lead time, and after-sales coverage.

Open to a 10-minute call this week, or shall I send our catalogue first?

Best,
${sender}
${brand}`,
      },
      {
        channel: 'email',
        version: 'Version B - Compliance & Quality',
        content: `${demoNotice}

Subject: Verified supplier reaching out to ${companyName}

Dear ${recipient},

My name is ${sender} from ${brand}. We supply ${companyName ? 'partners like ' + companyName : 'European partners'} with a focus on:
- Clear documentation (compliance, customs paperwork ready)
- Reliable lead time and proactive after-sales
- Low-MOQ trial orders before committing to volume

Would you like a copy of our latest catalogue and pricing?

Warm regards,
${sender}
${brand}`,
      },
      {
        channel: 'email',
        version: 'Version C - Partnership',
        content: `${demoNotice}

Subject: Building a stable supply chain for ${companyName}

Hello,

I'm ${sender} with ${brand}. We focus on long-term supply partnerships rather than one-off shipments.

If you're evaluating a new supplier, happy to send samples for assessment or jump on a brief call to align on requirements.

Best,
${sender}
${brand}`,
      },
    ];
  }

  return [
    {
      channel: 'whatsapp',
      version: 'Message Sequence',
      content: `${demoNotice}

[Message 1 — Opening]
Hi! I'm ${sender} from ${brand}. We supply B2B partners across Europe and wanted to introduce ourselves.

[Message 2 — Value Hook]
We noticed ${companyName} and thought our range might complement what you already offer. Open to a quick product list?

[Message 3 — Soft CTA]
No pressure — happy to share a short catalogue first so you can evaluate at your convenience. Let me know!`,
    },
  ];
}
