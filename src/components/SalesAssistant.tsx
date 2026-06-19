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
  FileText,
  RefreshCw,
  AlertCircle,
  X,
  Database,
  Brain,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/context/AuthContext';
import { saveChatImport, saveCopyDraft } from '@/lib/cloudData';
import type { CopywritingPayload, CopywritingResponse } from '@/types/api';

/* ────────────── 类型 ────────────── */

interface CopywritingResult {
  channel: 'email' | 'whatsapp';
  version: string;
  content: string;
}

type CopyMode = 'chat_reply' | 'closing' | 'maintenance' | 'mentor';

const COPY_MODES: Array<{
  value: CopyMode;
  title: string;
  desc: string;
  icon: typeof Sparkles;
}> = [
  {
    value: 'chat_reply',
    title: '聊天回复',
    desc: '按目标生成 3 个英文回复',
    icon: MessageCircle,
  },
  {
    value: 'closing',
    title: '终局逼单',
    desc: '分析犹豫原因并给话术',
    icon: Send,
  },
  {
    value: 'maintenance',
    title: '日常维护',
    desc: '长期关系维护与跟进',
    icon: Sparkles,
  },
  {
    value: 'mentor',
    title: '销售导师',
    desc: '复盘、补救、沉淀 SOP',
    icon: Brain,
  },
];

const COPY_MODE_LABELS: Record<CopyMode, string> = {
  chat_reply: '聊天回复',
  closing: '终局逼单',
  maintenance: '日常维护',
  mentor: '销售导师',
};

/* ────────────── AI 生成 Loading 动画 ────────────── */

function AIGeneratingLoader({ channel }: { channel: 'email' | 'whatsapp' }) {
  const steps = [
    { icon: <Database size={16} />, text: '正在检索 公司知识库...', duration: 3000 },
    { icon: <Search size={16} />, text: 'AI 正在分析客户背景...', duration: 3000 },
    { icon: <Brain size={16} />, text: '正在构建个性化策略...', duration: 3000 },
    { icon: <PenTool size={16} />, text: '正在生成销售话术...', duration: 3000 },
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

interface SalesAssistantProps {
  onBackToContact?: () => void;
}

export default function SalesAssistant({ onBackToContact: _onBackToContact }: SalesAssistantProps) {
  // SalesAssistant 不再订阅 copyCustomer——「去写文案」只去 AICopywriting / 破冰文案。
  // 销售助手是处理具体聊天/逼单/维护场景，业务员手动粘对话即可，跨页面自动带入反而干扰。
  const { accessToken, user } = useAuth();

  const [copyMode, setCopyMode] = useState<CopyMode>('chat_reply');
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email');
  const [customerIndustry, setCustomerIndustry] = useState('');
  const [customerBackground, setCustomerBackground] = useState('');
  const [myGoal, setMyGoal] = useState('');

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CopywritingResult[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const applyPrefill = (chat: string) => {
      const cleaned = chat.trim();
      if (!cleaned) return;
      setCopyMode('chat_reply');
      setChannel('whatsapp');
      setCustomerBackground(cleaned);
      setMyGoal('根据这段 WhatsApp 对话，生成下一步适合发送给客户的英文回复');
      setCustomerIndustry('');
      setResults([]);
      setError(null);
      setCopiedIdx(null);
      if (user) {
        saveChatImport(accessToken, {
          source: 'whatsapp_extension',
          chatText: cleaned,
        }).catch((chatError) => {
          console.warn('Cloud chat import save failed:', chatError);
        });
      }
    };

    try {
      const stored = localStorage.getItem('qzt_assistant_prefill');
      if (stored) {
        applyPrefill(stored);
        localStorage.removeItem('qzt_assistant_prefill');
      }
    } catch {}

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ chat?: string }>).detail;
      if (detail?.chat) applyPrefill(detail.chat);
    };

    window.addEventListener('qzt-assistant-prefill', handler);
    return () => window.removeEventListener('qzt-assistant-prefill', handler);
  }, [accessToken, user]);

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
          mode: copyMode,
          customer_industry: customerIndustry,
          customer_background: customerBackground,
          my_goal: myGoal,
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
        const subjectBlock =
          channel === 'email' && data.subject_lines?.length
            ? `Subject options:\n${data.subject_lines.map((line) => `- ${line}`).join('\n')}\n\n`
            : '';
        const filteredVersions: CopywritingResult[] = data.versions.map((v, idx) => ({
          version: v.version,
          content: idx === 0 ? `${subjectBlock}${v.content}` : v.content,
          channel: channel, // 强制使用当前选择的渠道
        }));
        setResults(filteredVersions);
        if (user) {
          saveCopyDraft(accessToken, {
            mode: copyMode,
            channel,
            customerBackground,
            objective: myGoal,
            versions: filteredVersions.map(({ version, content }) => ({ version, content })),
          }).catch((draftError) => {
            console.warn('Cloud assistant draft save failed:', draftError);
          });
        }
      } else {
        throw new Error('AI 返回为空，请重试');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络连接失败';
      setError(message);
      setResults(generateDemoResults(channel, copyMode));
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

  // 一键清空：重置所有输入和结果
  const clearAll = () => {
    setCustomerIndustry('');
    setCustomerBackground('');
    setMyGoal('');
    setResults([]);
    setError(null);
    setCopiedIdx(null);
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h2 className="text-2xl font-display font-semibold text-charcoal-800">
          AI 销售助手
        </h2>
        <p className="mt-1 text-sm text-charcoal-500">
          接入 公司知识库与销售 SOP，处理聊天回复、终局逼单、日常维护和销售复盘
        </p>
      </div>

      {/* 顶部工具栏：一键清空 */}
      {(customerIndustry || customerBackground || myGoal || results.length > 0) && (
        <div className="flex items-center justify-end gap-2 animate-fade-in-up">
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cream-300 bg-white text-xs text-charcoal-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
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
            销售场景配置
          </h3>

          {/* 功能场景 */}
          <div>
            <label className="label">功能场景</label>
            <div className="grid grid-cols-2 gap-2">
              {COPY_MODES.map((mode) => {
                const Icon = mode.icon;
                const active = copyMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setCopyMode(mode.value)}
                    className={clsx(
                      'rounded-lg border p-3 text-left transition-all duration-200',
                      active
                        ? 'border-charcoal-800 bg-charcoal-900 text-white shadow-elegant-md'
                        : 'border-cream-300 bg-white text-charcoal-600 hover:border-brand-300 hover:shadow-elegant'
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon size={16} />
                      {mode.title}
                    </span>
                    <span className={clsx('mt-1 block text-[10px]', active ? 'text-white/70' : 'text-charcoal-400')}>
                      {mode.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
            <label className="label">客户类型 / 产品方向（可选）</label>
            <input
              type="text"
              className="input-field"
              value={customerIndustry}
              onChange={(e) => setCustomerIndustry(e.target.value)}
              placeholder="例如：意大利零售店 / 线上 B2C 卖家 / 问 MOQ 的客户"
            />
          </div>

          <div>
            <label className="label">本次目标 / 当前卡点</label>
            <textarea
              className="input-field min-h-[74px] resize-y"
              value={myGoal}
              onChange={(e) => setMyGoal(e.target.value)}
              placeholder={
                copyMode === 'chat_reply'
                  ? '例如：客户问 MOQ 和欧洲发货时间，想要一个自然简短回复'
                  : copyMode === 'closing'
                    ? '例如：客户已看报价但一直说考虑，需要推动样品单'
                    : copyMode === 'maintenance'
                      ? '例如：客户在售前/售中/售后阶段，想做一次不打扰的日常维护'
                      : '例如：我想复盘这段对话，看哪里没处理好，下一步怎么补救'
              }
            />
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <Sparkles size={14} />
              详细对话内容
              <span className="text-[10px] font-normal text-charcoal-400">
                (Chat log / Customer context)
              </span>
            </label>
            <textarea
              className="input-field min-h-[160px] resize-y"
              value={customerBackground}
              onChange={(e) => setCustomerBackground(e.target.value)}
              placeholder="粘贴客户完整或关键对话，最好包含客户最新消息、你已经怎么回复、报价/MOQ/发货/样品等上下文..."
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
              <><PenTool size={18} /> 生成{COPY_MODE_LABELS[copyMode]}</>
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
                粘贴带有 Customer / Me 标记的对话，AI 会区分客户和我的发言，再结合 公司知识库生成回复或复盘建议
              </p>
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
                  <span className="tag bg-charcoal-50 text-charcoal-700 border-charcoal-200">{COPY_MODE_LABELS[copyMode]}</span>
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
  mode: CopyMode
): CopywritingResult[] {
  if (mode === 'closing') {
    return [
      {
        channel,
        version: '原因分析与行动指示',
        content: `【原因分析】
客户没有马上下单，通常不是完全没兴趣，而是还在确认风险：质量是否稳定、首单数量是否合适、售后是否方便。

【下一步行动指示】
不要继续催问“是否下单”。先降低决策压力，建议客户从小批量测试开始，并强调我们的本地服务能力。

【逼单策略与技巧】
用选择题推进：Would you prefer to start with a small trial order, or should I prepare the sample option first?`,
      },
      {
        channel,
        version: 'WhatsApp 逼单话术',
        content: `Hi, I understand you may still need to confirm the first order risk.

For a first cooperation, I suggest starting with a small trial order. You can test the quality, delivery, and customer feedback first.

Would you prefer the trial order option or the sample option?`,
      },
      {
        channel,
        version: 'Email 逼单话术',
        content: `Subject: Small trial order option

Hello,

I understand you may still need to reduce the risk before confirming the first order.

For this situation, we can start with a small trial order or samples first. This helps you check product quality, delivery speed, and customer feedback before placing repeat orders.

Which option is easier for you to start with?`,
      },
    ];
  }

  if (mode === 'mentor') {
    return [
      {
        channel,
        version: 'Detailed Action Plan',
        content: `Diagnosis: The current conversation needs a clearer next step. The customer may be waiting for risk reduction, not more product introduction.

Action & Salvage Strategy: Reply with one direct answer, one company proof point, and one easy question.

Review & Summarize: Avoid sending long catalog-style messages when the customer asks a specific buying question.

Prevention & Improvement: Build a habit: answer first, prove second, ask one small next-step question third.`,
      },
      {
        channel,
        version: '下一步客户话术',
        content: `Hi, yes, we can support a small first order.

For EU customers, our Italy warehouse and local service can make the first cooperation easier.

May I know which model you want to test first? I can suggest the safest trial quantity.`,
      },
      {
        channel,
        version: 'SOP Library Record',
        content: `Brief Problem Synopsis: Customer asks a concrete buying question, but the sales reply may become too broad.

Core Strategy & Action: Give a short direct answer, add one company trust point, then ask one specific next-step question.`,
      },
    ];
  }

  return [
    {
      channel,
      version: '回复方案A：高效直接',
      content: `[策略简析]: Directly answer the question, then ask for the model or quantity.

Yes, we can support small trial orders. For EU customers, we can also use our Italy warehouse for faster handling when stock is available.

Which model are you interested in testing first?`,
    },
    {
      channel,
      version: '回复方案B：关系优先',
      content: `[策略简析]: First reduce pressure, then make the next step easy.

No problem. You can start small first. Many customers prefer to test quality and delivery before repeat orders.

Tell me the product type you need, and I will suggest a simple starting option.`,
    },
    {
      channel,
      version: '回复方案C：顾问姿态',
      content: `[策略简析]: Give practical buying advice instead of only answering.

For the first order, I suggest choosing 1-2 models that match your current customers. This is easier to test and easier to reorder.

Do you sell more spy cameras, voice recorders, or DIY camera modules now?`,
    },
  ];
}
