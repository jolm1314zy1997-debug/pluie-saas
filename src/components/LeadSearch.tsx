'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  ExternalLink,
  Globe,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Star,
  Users,
  Building,
  Cpu,
  Loader2,
  X,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  Check,
  ArrowRight,
  CheckSquare,
  Square,
  ShieldOff,
  Plus,
  Trash2,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { useAppState, SearchResult } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { loadCloudBlocklist, saveCloudBlocklist, saveCopyDraft } from '@/lib/cloudData';
import { getStoredApiKey } from './ApiKeyConfig';

/* ────────────── 常量 ────────────── */

const CUSTOMER_TYPES = [
  { value: 'all', label: '全部客户', icon: Globe },
  { value: 'b2c_online', label: '线上 B2C 卖家', icon: Cpu },
  { value: 'offline_retail', label: '线下零售及批发商', icon: Building },
  { value: 'system_integrator', label: '系统集成商', icon: Users },
];

const DEFAULT_KEYWORDS = [
  'Nanny Cameras',
  'Spy Cameras',
  'Hidden Cameras',
  'Mini Voice Recorders',
  'Digital Voice Recorders',
  'GPS Trackers',
  'Forensic Equipment',
  'Counter Surveillance',
  'Tuya DIY Camera Modules',
];

const DEFAULT_COUNTRIES = ['Italy', 'France', 'Poland', 'Germany'];
const DEFAULT_MAP_REGIONS = [
  'London',
  'Birmingham',
  'Manchester',
  'Milan',
  'Rome',
  'Paris',
  'Berlin',
  'Madrid',
  'Warsaw',
  'Amsterdam',
];

const MODE_DETAILS = {
  web: {
    title: 'AI 网页搜索',
    subtitle: '适合找官网、分销商和垂直网站',
    speed: '30-60 秒',
    cost: '使用 AIHUBMIX',
  },
  map: {
    title: '地图获客',
    subtitle: '适合按城市扫本地门店、批发商和集成商',
    speed: '几秒级',
    cost: 'Google Places，默认不拉照片',
  },
  eu_premium: {
    title: '全 EU 精准 6 家',
    subtitle: '零输入，自动找 Grade A 顶级客户',
    speed: '60-90 秒',
    cost: 'AI + 地图双路并发',
  },
};

// 固定每次搜索 5 个客户，确保在 Vercel 60 秒超时限制内完成
const FIXED_RESULT_COUNT = 5;

// 屏蔽列表 localStorage key
const BLOCKLIST_KEY = 'qzt_lead_blocklist';
type SearchMode = 'web' | 'map' | 'eu_premium';

// 判断一条结果属于哪个模式（按 source 字段）
function sourceModeOf(r: { source?: string }): SearchMode {
  if (r.source === 'eu_premium_combined') return 'eu_premium';
  if (r.source === 'google_maps' || r.source === 'map_ai_search') return 'map';
  return 'web';
}

/* ────────────── 安全的客户端组件 ────────────── */

function ClientOnlyCombobox({
  label,
  options,
  value,
  onChange,
  placeholder = '输入或选择...',
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = inputValue.trim()
    ? options.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase()))
    : options; // 空输入时显示全部选项

  return (
    <div ref={ref} className="relative">
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type="text"
          className="input-field pr-8"
          placeholder={placeholder}
          value={inputValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {inputValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInputValue('');
              onChange('');
              setOpen(true); // 清除后立即显示全部选项
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-600"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-600"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-cream-300 bg-white shadow-elegant-md">
          {filtered.map((opt) => (
            <li
              key={opt}
              onClick={() => {
                setInputValue(opt);
                onChange(opt);
                setOpen(false);
              }}
              className={clsx(
                'px-4 py-2 text-sm cursor-pointer transition-colors',
                opt === inputValue
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-charcoal-700 hover:bg-cream-100'
              )}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────── Loading 骨架屏 ────────────── */

function SkeletonCards() {
  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="h-5 w-32 bg-cream-200 rounded animate-pulse" />
        <div className="h-5 w-20 bg-cream-200 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-cream-200 rounded animate-pulse" />
                <div className="h-3 w-52 bg-cream-100 rounded animate-pulse" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-cream-100 rounded-full animate-pulse" />
              <div className="h-5 w-12 bg-cream-100 rounded-full animate-pulse" />
              <div className="h-5 w-14 bg-cream-100 rounded-full animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-full bg-cream-100 rounded animate-pulse" />
              <div className="h-3 w-4/5 bg-cream-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────── 主组件 ────────────── */

interface LeadSearchProps {
  onTransferComplete?: () => void;
}

export default function LeadSearch({ onTransferComplete }: LeadSearchProps) {
  const {
    searchResults,
    setSearchResults,
    transferToContact,
    searchLoading,
    setSearchLoading,
  } = useAppState();
  const { configured: cloudConfigured, user, accessToken } = useAuth();

  const [customerType, setCustomerType] = useState('all');
  const [searchMode, setSearchMode] = useState<SearchMode>('web');
  const [productKeyword, setProductKeyword] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [targetRegion, setTargetRegion] = useState('');
  const [whatsappOnly, setWhatsappOnly] = useState(true);
  // Naples 为圆心半径搜索：0 = 关闭走城市/区域；>0 = 半径（km）
  const [naplesRadiusKm, setNaplesRadiusKm] = useState<number>(0);
  const [resultCount] = useState(5); // 固定 5 个客户，确保 1 分钟内完成
  // 网页搜索模式下可选：搜索后再做一次官网真实性验证（默认关，避免超时）
  const [verifyOnSearch, setVerifyOnSearch] = useState(false);
  // 注意：深度抓取已从搜索中分离，用户需在「深度调查」页面点击「AI 深度调查」按钮触发

  // 屏蔽列表（两个模式共用）
  const [blocklist, setBlocklist] = useState<string[]>([]);
  const [blockInput, setBlockInput] = useState('');
  const [showBlocklist, setShowBlocklist] = useState(false);
  const blocklistRef = useRef<string[]>([]);
  const cloudBlocklistReadyRef = useRef(false);
  const cloudBlocklistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 当前哪个模式在跑搜索（用于让 loader 卡片只在对应 tab 里显示）
  const [loadingMode, setLoadingMode] = useState<SearchMode | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [quickOutreach, setQuickOutreach] = useState<Record<string, {
    loading?: boolean;
    content?: string;
    error?: string;
  }>>({});
  const [outreachSalesName, setOutreachSalesName] = useState('Pluie');

  // Loading 动态文案状态
  const webLoadingTexts = [
    '正在全球搜索潜在客户...',
    '正在抓取官网信息...',
    '正在由 LLM 提炼精华...',
    '正在生成 JSON 报告...',
    '正在验证公司真实性...',
  ];
  const mapLoadingTexts = [
    '正在按城市区域搜索地图商家...',
    '正在筛选本地批发商与门店...',
    '正在提取电话、官网和地图链接...',
    '正在判断 WhatsApp 可联系性...',
    '正在整理可转入背调的客户清单...',
  ];
  const euPremiumLoadingTexts = [
    'AI 联网搜 EU 顶级 spy shop 与系统集成商...',
    'Google Places 并行扫描 10 个 Tier 1 EU 国家...',
    '按买家画像 + 国家分层评分排序...',
    '合并去重、抓取官网验证联系方式...',
    '筛出 Grade A ≥ 5 分的 top 6...',
  ];
  const loadingTexts =
    searchMode === 'eu_premium' ? euPremiumLoadingTexts
    : searchMode === 'map' ? mapLoadingTexts
    : webLoadingTexts;
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  // loader 是否要在当前 tab 显示（只有当前 tab 触发的搜索才显示 loader）
  const showLoaderForCurrentMode = loadingMode === searchMode;

  // 每隔 10 秒切换 Loading 文案（只在当前 tab loading 时跑）
  useEffect(() => {
    if (!showLoaderForCurrentMode) {
      setLoadingTextIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 10000); // 10 秒切换一次

    return () => clearInterval(interval);
  }, [showLoaderForCurrentMode, loadingTexts.length]);

  // 勾选的客户 ID
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 是否全选
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // 从 localStorage 恢复屏蔽列表（共用一份）
    try {
      const stored = localStorage.getItem(BLOCKLIST_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setBlocklist(parsed);
      } else {
        // 兼容老版本临时分模式 key：合并两个 key 后写回单一 key
        const rawWeb = localStorage.getItem('qzt_lead_blocklist_web');
        const rawMap = localStorage.getItem('qzt_lead_blocklist_map');
        if (rawWeb || rawMap) {
          const merged = Array.from(new Set([
            ...(rawWeb ? JSON.parse(rawWeb) : []),
            ...(rawMap ? JSON.parse(rawMap) : []),
          ]));
          setBlocklist(merged);
          localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(merged));
          localStorage.removeItem('qzt_lead_blocklist_web');
          localStorage.removeItem('qzt_lead_blocklist_map');
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    blocklistRef.current = blocklist;
  }, [blocklist]);

  // 登录后从云端拉屏蔽列表，合并到本地
  useEffect(() => {
    cloudBlocklistReadyRef.current = false;
    if (!isClient || !cloudConfigured || !user || !accessToken) return;

    let cancelled = false;
    const cloudToken = accessToken;

    async function hydrateBlocklist() {
      try {
        const cloudList = await loadCloudBlocklist(cloudToken);
        if (cancelled) return;
        const merged = Array.from(new Set([...cloudList, ...blocklistRef.current]));
        setBlocklist(merged);
        localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(merged));
        if (!sameStringList(merged, cloudList)) {
          await saveCloudBlocklist(cloudToken, merged).catch(() => {});
        }
      } catch (err) {
        console.warn('Cloud blocklist sync failed:', err);
      } finally {
        if (!cancelled) cloudBlocklistReadyRef.current = true;
      }
    }

    hydrateBlocklist();

    return () => {
      cancelled = true;
      cloudBlocklistReadyRef.current = false;
      if (cloudBlocklistTimerRef.current) clearTimeout(cloudBlocklistTimerRef.current);
    };
  }, [isClient, cloudConfigured, user?.id, accessToken]);

  // 屏蔽列表变更后，节流回写云端
  useEffect(() => {
    if (!cloudConfigured || !user || !accessToken || !cloudBlocklistReadyRef.current) return;
    if (cloudBlocklistTimerRef.current) clearTimeout(cloudBlocklistTimerRef.current);
    cloudBlocklistTimerRef.current = setTimeout(() => {
      saveCloudBlocklist(accessToken, blocklistRef.current).catch((err) => {
        console.warn('Cloud blocklist save failed:', err);
      });
    }, 600);

    return () => {
      if (cloudBlocklistTimerRef.current) clearTimeout(cloudBlocklistTimerRef.current);
    };
  }, [blocklist, cloudConfigured, user?.id, accessToken]);

  // 从全局状态恢复时，如果有搜索结果，显示已搜索状态
  useEffect(() => {
    if (searchResults.length > 0) {
      setSearched(true);
    }
  }, [searchResults]);

  /* ── 搜索处理 ── */
  const handleSearch = useCallback(async () => {
    const keyword = productKeyword.trim();
    const country = selectedCountry.trim();
    const region = targetRegion.trim();

    // 全 EU 精准搜索：零输入，跳过所有校验
    if (searchMode !== 'eu_premium') {
      if (!keyword) {
        setError('请输入产品关键词');
        return;
      }
      if (searchMode === 'map' && naplesRadiusKm === 0 && !region && !country) {
        setError('地图获客模式请至少输入城市/区域或目标国家，或开启 Naples 半径');
        return;
      }
    }

    setError(null);
    setSearchLoading(true);
    setLoadingMode(searchMode);
    // 保留之前的搜索结果，不清空
    setSelectedIds(new Set());
    setSelectAll(false);

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

      // 设置 3 分钟超时（AI 联网搜索可能需要较长时间）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);

      // 全 EU 精准搜索：只传 search_source + blocklist + api key，零输入；
      // 其他 mode 维持原有 body
      const requestBody =
        searchMode === 'eu_premium'
          ? {
              search_source: 'eu_premium',
              blocklist: blocklist.length > 0 ? blocklist : undefined,
              ...extraBody,
            }
          : {
              customer_type: customerType,
              search_source: searchMode,
              keyword,
              country: country || undefined,
              target_region: searchMode === 'map' ? region || undefined : undefined,
              whatsapp_priority: searchMode === 'map' ? whatsappOnly : undefined,
              naples_radius_km: searchMode === 'map' && naplesRadiusKm > 0 ? naplesRadiusKm : undefined,
              result_count: resultCount,
              blocklist: blocklist.length > 0 ? blocklist : undefined,
              // 网页搜索：用户开启「验证官网/联系方式」时才做 Jina 校验
              deep_enrich: searchMode === 'web' ? verifyOnSearch : false,
              ...extraBody,
            };
      const res = await fetch('/api/leads/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `服务器错误 (${res.status})`);
      }

      const data = await res.json();
      if (data?.success === false) {
        throw new Error(data.detail || '搜索失败，请检查 API 配置');
      }
      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        ...r,
        transferredToContact: false,
        transferredToCopy: false,
      }));
      // 只替换当前模式的旧结果，保留另一模式的列表，避免切 tab 时被覆盖
      const otherModeResults = searchResults.filter((r) => sourceModeOf(r) !== searchMode);
      setSearchResults([...otherModeResults, ...results]);
    } catch (err) {
      let message = err instanceof Error ? err.message : '网络连接失败';
      if (message.includes('abort') || message.includes('timeout') || message.includes('AbortError')) {
        message = '请求超时，请重试（国内访问 Vercel 可能较慢）';
        toast.error('抓取时间过长或被限制，请稍后重试', {
          description: '建议：开启代理后刷新页面再试',
          duration: 5000,
        });
      } else if (message.includes('504') || message.includes('Gateway')) {
        toast.error('服务端响应超时，请稍后重试', {
          description: 'AI 搜索可能需要较长时间，建议稍后重试',
          duration: 5000,
        });
      } else if (message.includes('429')) {
        toast.error('请求过于频繁，请稍后再试', {
          description: 'API 频率限制，请等待 1-2 分钟后重试',
          duration: 5000,
        });
      } else {
        toast.error('搜索失败', {
          description: message,
          duration: 4000,
        });
      }
      setError(message);
      // 失败兜底也只动当前模式的结果
      const otherModeResults = searchResults.filter((r) => sourceModeOf(r) !== searchMode);
      if (searchMode === 'map' || searchMode === 'eu_premium') {
        // 地图获客 / EU 精选 依赖真实数据，失败时不展示本地演示数据
        setSearchResults(otherModeResults);
      } else {
        setSearchResults([
          ...otherModeResults,
          ...generateDemoResults(keyword, country || region || 'EU', searchMode),
        ]);
      }
    } finally {
      setSearchLoading(false);
      setLoadingMode(null);
      setSearched(true);
    }
  }, [customerType, productKeyword, selectedCountry, targetRegion, whatsappOnly, naplesRadiusKm, searchMode, resultCount, blocklist, verifyOnSearch, searchResults, setSearchResults, setSearchLoading]);

  // 当前模式下的结果（按 source 分桶，A 级置顶）
  const tierWeight: Record<string, number> = { A: 3, B: 2, C: 1 };
  const currentModeResults = searchResults
    .filter((r) => sourceModeOf(r) === searchMode)
    .slice()
    .sort((a, b) => {
      const aw = tierWeight[String(a.tier || 'C')] || 1;
      const bw = tierWeight[String(b.tier || 'C')] || 1;
      if (aw !== bw) return bw - aw;
      return (b.tierScore || 0) - (a.tierScore || 0);
    });
  const otherModeCount = searchResults.length - currentModeResults.length;

  /* ── 勾选逻辑（仅作用于当前模式） ── */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      setSelectAll(next.size === currentModeResults.length && currentModeResults.length > 0);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedIds(new Set(currentModeResults.map((r) => r.id)));
      setSelectAll(true);
    }
  };

  // 切换模式时清空勾选（避免选中状态跨模式残留）
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [searchMode]);

  /* ── 屏蔽列表管理（两个模式共用） ── */
  const saveBlocklist = (list: string[]) => {
    setBlocklist(list);
    try { localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(list)); } catch {}
  };

  const addToBlocklist = () => {
    const name = blockInput.trim();
    if (!name) return;
    if (blocklist.includes(name)) {
      setBlockInput('');
      return;
    }
    const newList = [...blocklist, name];
    saveBlocklist(newList);
    setBlockInput('');
    toast.success(`已屏蔽「${name}」，下次搜索时将排除该客户`);
  };

  const removeFromBlocklist = (name: string) => {
    saveBlocklist(blocklist.filter((b) => b !== name));
  };

  const addSelectedToBlocklist = () => {
    if (selectedIds.size === 0) return;

    const existingNames = new Set(blocklist.map((name) => name.trim().toLowerCase()));
    const selectedNames = searchResults
      .filter((result) => selectedIds.has(result.id))
      .map((result) => result.company.trim())
      .filter(Boolean);
    const namesToAdd = Array.from(new Set(selectedNames)).filter(
      (name) => !existingNames.has(name.toLowerCase())
    );

    if (namesToAdd.length === 0) {
      toast.info('已选客户已经在屏蔽列表中');
      setSelectedIds(new Set());
      setSelectAll(false);
      return;
    }

    saveBlocklist([...blocklist, ...namesToAdd]);
    setSelectedIds(new Set());
    setSelectAll(false);
    setShowBlocklist(true);
    toast.success(`已批量屏蔽 ${namesToAdd.length} 个客户`, {
      description: '下次 AI 网页搜索或地图获客会自动排除这些公司',
      duration: 4000,
    });
  };

  const clearBlocklist = () => {
    saveBlocklist([]);
    toast.success('屏蔽列表已清空');
  };

  /* ── 一键转移到深度调查 ── */
  const handleTransferToContact = () => {
    if (selectedIds.size === 0) return;
    transferToContact(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectAll(false);
    onTransferComplete?.();
  };

  /* ── 导出 CSV（只导当前模式） ── */
  const exportCSV = () => {
    const header = 'Company,Website,Title,Meta Description,Customer Background Info\n';
    const rows = currentModeResults
      .map(
        (r) =>
          `"${r.company}","${r.website}","${r.title}","${r.metaDescription}","${r.customerBackgroundInfo}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qzt_leads_${selectedCountry || 'all'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 严格规则：只用已验证 / 候选的 WhatsApp 号，不能用普通电话兜底。
  // Google Maps / Places 返回的 phone 字段不一定是手机号，更不一定开通 WhatsApp，
  // 强行 wa.me/座机 会产生大量"打不通"的死链。
  const buildWhatsAppLink = (lead: SearchResult, text: string) => {
    const rawNumber = lead.whatsapp || '';
    const number = rawNumber.replace(/\D/g, '');
    if (!number) return '';
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  };

  const updateQuickOutreachContent = (leadId: string, content: string) => {
    setQuickOutreach((prev) => ({
      ...prev,
      [leadId]: { ...prev[leadId], content },
    }));
  };

  const generateQuickOutreach = async (lead: SearchResult) => {
    setQuickOutreach((prev) => ({
      ...prev,
      [lead.id]: { ...prev[lead.id], loading: true, error: undefined },
    }));

    try {
      let extraBody: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('qzt_aihubmix_config');
        if (stored) {
          const config = JSON.parse(stored);
          if (config.apiKey) extraBody._api_key = config.apiKey;
        }
      } catch {}

      const background = [
        `[Company] ${lead.company}`,
        lead.website ? `[Website] ${lead.website}` : '',
        lead.country ? `[Country] ${lead.country}` : '',
        lead.title ? `[Title] ${lead.title}` : '',
        lead.metaDescription ? `[Meta] ${lead.metaDescription}` : '',
        lead.matchReason ? `[Match reason] ${lead.matchReason}` : '',
        lead.customerBackgroundInfo ? `[Background]\n${lead.customerBackgroundInfo}` : '',
      ].filter(Boolean).join('\n');

      const res = await fetch('/api/generate-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'whatsapp',
          mode: 'outreach',
          sales_person: outreachSalesName,
          customer_company: lead.company,
          customer_industry: lead.tags.join(', '),
          customer_background: background,
          my_goal: `根据搜索和调研到的客户背景，使用 AIDA 逻辑生成一条适合 WhatsApp 首次破冰的英文消息。发送人名字是 ${outreachSalesName || 'sales'}。不要只罗列卖点，要说明这些优势给客户业务带来的价值，目标是让客户愿意回复。`,
          ...extraBody,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || `服务器错误 (${res.status})`);
      }

      const data = await res.json();
      const content = data?.versions?.[0]?.content || data?.copy || '';
      if (!content.trim()) throw new Error('AI 返回为空');

      setQuickOutreach((prev) => ({
        ...prev,
        [lead.id]: { loading: false, content },
      }));
      if (user) {
        saveCopyDraft(accessToken, {
          mode: 'quick_outreach',
          channel: 'whatsapp',
          customerCompany: lead.company,
          customerBackground: background,
          objective: 'Search result quick WhatsApp outreach',
          versions: [{ version: '快速破冰', content }],
        }).catch((draftError) => {
          console.warn('Cloud quick outreach save failed:', draftError);
        });
      }
      toast.success(`已生成 ${lead.company} 的 WhatsApp 破冰文案`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      setQuickOutreach((prev) => ({
        ...prev,
        [lead.id]: { loading: false, error: message },
      }));
      toast.error('破冰文案生成失败', { description: message });
    }
  };

  const copyQuickOutreach = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('破冰文案已复制');
  };

  const selectableResults = currentModeResults.filter((r) => !r.transferredToContact);

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* ── 页面标题 ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold text-charcoal-800">
            客户搜索器
          </h2>
          <p className="mt-1 text-sm text-charcoal-500">
            根据产品关键词、目标市场或地图区域，精准搜索欧洲潜在客户
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-cream-300 bg-white p-2 text-xs shadow-elegant">
          <div className="px-3 py-2">
            <p className="font-semibold text-charcoal-800">5 条/次</p>
            <p className="mt-0.5 text-charcoal-400">控时控成本</p>
          </div>
          <div className="px-3 py-2 border-x border-cream-200">
            <p className="font-semibold text-charcoal-800">{searchMode === 'map' ? 'Places' : 'Gemini'}</p>
            <p className="mt-0.5 text-charcoal-400">当前引擎</p>
          </div>
          <div className="px-3 py-2">
            <p className="font-semibold text-charcoal-800">{searchMode === 'map' ? '低' : '中'}</p>
            <p className="mt-0.5 text-charcoal-400">调用成本</p>
          </div>
        </div>
      </div>

      {/* ── 错误提示 ── */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 animate-fade-in-up">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium">请求失败</p>
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

      {/* ── 搜索表单 ── */}
      <div className="card p-6 space-y-5">
        <div>
          <label className="label">获客来源</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setSearchMode('web')}
              className={clsx(
                'relative overflow-hidden rounded-lg border p-4 text-left transition-all duration-200',
                searchMode === 'web'
                  ? 'bg-charcoal-900 text-white border-charcoal-900 shadow-elegant-md'
                  : 'bg-white text-charcoal-700 border-cream-300 hover:border-brand-300 hover:shadow-elegant'
              )}
            >
              <span className="flex items-start gap-3">
                <span className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-lg border',
                  searchMode === 'web' ? 'border-white/20 bg-white/10' : 'border-cream-300 bg-cream-50'
                )}>
                  <Search size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold flex items-center gap-1.5">
                    {MODE_DETAILS.web.title}
                    {loadingMode === 'web' && (
                      <Loader2 size={12} className="animate-spin opacity-70" />
                    )}
                  </span>
                  <span className={clsx('mt-1 block text-xs', searchMode === 'web' ? 'text-white/70' : 'text-charcoal-400')}>
                    {loadingMode === 'web' ? '正在跑联网搜索…' : MODE_DETAILS.web.subtitle}
                  </span>
                </span>
              </span>
              <span className={clsx('mt-3 flex gap-2 text-[10px]', searchMode === 'web' ? 'text-white/75' : 'text-charcoal-400')}>
                <span className="rounded-full border border-current/20 px-2 py-0.5">{MODE_DETAILS.web.speed}</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5">{MODE_DETAILS.web.cost}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('map')}
              className={clsx(
                'relative overflow-hidden rounded-lg border p-4 text-left transition-all duration-200',
                searchMode === 'map'
                  ? 'bg-brand-700 text-white border-brand-700 shadow-elegant-md'
                  : 'bg-white text-charcoal-700 border-cream-300 hover:border-brand-300 hover:shadow-elegant'
              )}
            >
              <span className="flex items-start gap-3">
                <span className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-lg border',
                  searchMode === 'map' ? 'border-white/20 bg-white/10' : 'border-cream-300 bg-cream-50'
                )}>
                  <MapPin size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold flex items-center gap-1.5">
                    {MODE_DETAILS.map.title}
                    {loadingMode === 'map' && (
                      <Loader2 size={12} className="animate-spin opacity-70" />
                    )}
                  </span>
                  <span className={clsx('mt-1 block text-xs', searchMode === 'map' ? 'text-white/70' : 'text-charcoal-400')}>
                    {loadingMode === 'map' ? '正在抓取 Google Places…' : MODE_DETAILS.map.subtitle}
                  </span>
                </span>
              </span>
              <span className={clsx('mt-3 flex gap-2 text-[10px]', searchMode === 'map' ? 'text-white/75' : 'text-charcoal-400')}>
                <span className="rounded-full border border-current/20 px-2 py-0.5">{MODE_DETAILS.map.speed}</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5">{MODE_DETAILS.map.cost}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSearchMode('eu_premium')}
              className={clsx(
                'relative overflow-hidden rounded-lg border p-4 text-left transition-all duration-200',
                searchMode === 'eu_premium'
                  ? 'bg-gradient-to-br from-purple-700 to-amber-600 text-white border-purple-800 shadow-elegant-md'
                  : 'bg-white text-charcoal-700 border-cream-300 hover:border-purple-300 hover:shadow-elegant'
              )}
            >
              <span className="flex items-start gap-3">
                <span className={clsx(
                  'flex h-9 w-9 items-center justify-center rounded-lg border',
                  searchMode === 'eu_premium' ? 'border-white/20 bg-white/10' : 'border-cream-300 bg-cream-50'
                )}>
                  <Target size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold flex items-center gap-1.5">
                    {MODE_DETAILS.eu_premium.title}
                    {loadingMode === 'eu_premium' && (
                      <Loader2 size={12} className="animate-spin opacity-70" />
                    )}
                  </span>
                  <span className={clsx('mt-1 block text-xs', searchMode === 'eu_premium' ? 'text-white/80' : 'text-charcoal-400')}>
                    {loadingMode === 'eu_premium' ? '正在双路扫 EU 顶级客户…' : MODE_DETAILS.eu_premium.subtitle}
                  </span>
                </span>
              </span>
              <span className={clsx('mt-3 flex gap-2 text-[10px]', searchMode === 'eu_premium' ? 'text-white/85' : 'text-charcoal-400')}>
                <span className="rounded-full border border-current/20 px-2 py-0.5">{MODE_DETAILS.eu_premium.speed}</span>
                <span className="rounded-full border border-current/20 px-2 py-0.5">{MODE_DETAILS.eu_premium.cost}</span>
              </span>
            </button>
          </div>
        </div>

        {searchMode === 'eu_premium' && (
          <div className="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-amber-50 p-5 space-y-3">
            <div className="flex items-start gap-2 text-sm text-purple-900">
              <Target size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-1">零输入 · 一键搜 6 家全 EU Grade A 客户</p>
                <ul className="text-xs leading-relaxed text-purple-800 space-y-0.5">
                  <li>· 自动跨 10 个 Tier 1 EU 国家扫描（意 / 德 / 法 / 英 / 西 / 荷 / 北欧 / 奥 / 瑞 / 比）</li>
                  <li>· AI 网搜 + Google 地图双路并发，互为兜底</li>
                  <li>· 买家画像评分（业态 + 官网 + 联系方式 + Tier），分数 ≥ 5/11 才进结果</li>
                  <li>· 排除已加入黑名单的公司，约 60-90 秒</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {searchMode === 'map' && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 md:grid-cols-2">
            <div className="flex items-start gap-2">
              <Navigation size={15} className="mt-0.5 flex-shrink-0" />
              <span><strong>直接查 Google Places</strong><br />不等 AI，先拿真实地图商家。</span>
            </div>
            <div className="flex items-start gap-2">
              <Phone size={15} className="mt-0.5 flex-shrink-0" />
              <span><strong>优先电话/WhatsApp</strong><br />手机格式才生成 wa.me 入口。</span>
            </div>
          </div>
        )}

        {searchMode !== 'eu_premium' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 客户类型 */}
          <div>
            <label className="label">客户类型</label>
            <div className="grid grid-cols-2 gap-2">
              {CUSTOMER_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => setCustomerType(t.value)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150',
                      customerType === t.value
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'bg-white text-charcoal-600 border-cream-300 hover:border-brand-300'
                    )}
                  >
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 产品关键词 */}
          {isClient ? (
            <ClientOnlyCombobox
              label="产品关键词"
              options={DEFAULT_KEYWORDS}
              value={productKeyword}
              onChange={setProductKeyword}
              placeholder="输入或选择产品关键词..."
            />
          ) : (
            <div>
              <label className="label">产品关键词</label>
              <input
                type="text"
                className="input-field"
                placeholder="输入或选择产品关键词..."
                value={productKeyword}
                onChange={(e) => setProductKeyword(e.target.value)}
              />
            </div>
          )}

          {/* 目标国家 */}
          {isClient ? (
            <ClientOnlyCombobox
              label="目标国家 / 地区"
              options={DEFAULT_COUNTRIES}
              value={selectedCountry}
              onChange={setSelectedCountry}
              placeholder="输入或选择目标国家..."
            />
          ) : (
            <div>
              <label className="label">目标国家 / 地区</label>
              <input
                type="text"
                className="input-field"
                placeholder="输入或选择目标国家..."
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
              />
            </div>
          )}

          {/* 地图区域 */}
          {searchMode === 'map' && naplesRadiusKm === 0 && (
            isClient ? (
              <ClientOnlyCombobox
                label="城市 / 区域"
                options={DEFAULT_MAP_REGIONS}
                value={targetRegion}
                onChange={setTargetRegion}
                placeholder="例如 London / West London..."
              />
            ) : (
              <div>
                <label className="label">城市 / 区域</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="例如 London / West London..."
                  value={targetRegion}
                  onChange={(e) => setTargetRegion(e.target.value)}
                />
              </div>
            )
          )}

          {/* Naples 为圆心 半径搜索 */}
          {searchMode === 'map' && (
            <div className={naplesRadiusKm > 0 ? 'md:col-span-2 lg:col-span-1' : ''}>
              <label className="label flex items-center gap-1">
                🇮🇹 Naples 为圆心
                <span className="text-[10px] text-charcoal-400 font-normal">（覆盖意大利仓库 24-72h 发货圈）</span>
              </label>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { km: 0,   label: '关闭',          hint: '按城市/国家搜索（默认）' },
                  { km: 80,  label: '🚗 1小时车程',   hint: '80km · Campania + Caserta，随时能来' },
                  { km: 200, label: '🚄 半天往返',   hint: '200km · 罗马都市圈 + Bari 北部，当天来回' },
                  { km: 400, label: '🚙 整天往返',   hint: '400km · 中部意大利 + 西西里北，安排一天' },
                  { km: 800, label: '✈️ 飞过来谈',    hint: '800km · 全意 + 法南 + 瑞士南，重要客户值得飞' },
                ].map((opt) => (
                  <button
                    key={opt.km}
                    type="button"
                    onClick={() => setNaplesRadiusKm(opt.km)}
                    title={opt.hint}
                    className={clsx(
                      'px-2 py-2 rounded-lg text-[11px] font-semibold border transition-all',
                      naplesRadiusKm === opt.km
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                        : 'bg-white text-charcoal-600 border-cream-300 hover:border-emerald-300 hover:text-emerald-700'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {naplesRadiusKm > 0 && (
                <p className="mt-1.5 text-[10px] text-emerald-700 leading-relaxed">
                  以 Naples (Via Boscofangone, Nola) 为中心，Google Places 只返回半径 {naplesRadiusKm}km 内商家。
                  严守半径，找不到 5 家不会自动扩张——保证返回的客户都能方便来展厅。
                  城市/国家筛选在此模式下被忽略。
                </p>
              )}
            </div>
          )}

          {/* 结果数量 - 固定 5 个以控制时间在 1 分钟内 */}
          <div>
            <label className="label">结果数量</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-cream-50 border border-cream-200 rounded-lg text-sm text-charcoal-600">
              <span className="font-semibold text-brand-600">5</span>
              <span>个客户</span>
              <span className="text-xs text-charcoal-400 ml-1">(固定数量确保 1 分钟内完成)</span>
            </div>
          </div>

          {searchMode === 'map' && (
            <div className="md:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={() => setWhatsappOnly((v) => !v)}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all',
                  whatsappOnly
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-white border-cream-300 text-charcoal-600 hover:border-brand-300'
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <MessageCircle size={16} />
                  优先寻找可 WhatsApp 联系的客户
                </span>
                {whatsappOnly ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </div>
          )}

          {searchMode === 'web' && (
            <div className="md:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={() => setVerifyOnSearch((v) => !v)}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all',
                  verifyOnSearch
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-white border-cream-300 text-charcoal-600 hover:border-brand-300'
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Globe size={16} />
                  搜索后自动验证官网与联系方式（会多花 5-15 秒）
                </span>
                {verifyOnSearch ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </div>
          )}

          {/* 屏蔽客户 */}
          <div className="md:col-span-2 lg:col-span-3">
            <div
              className="flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
              onClick={() => setShowBlocklist((v) => !v)}
            >
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                <ShieldOff size={15} />
                屏蔽客户列表
                {blocklist.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 text-xs font-semibold">
                    {blocklist.length}
                  </span>
                )}
              </div>
              <ChevronDown
                size={14}
                className={`text-amber-500 transition-transform ${showBlocklist ? 'rotate-180' : ''}`}
              />
            </div>

            {showBlocklist && (
              <div className="mt-2 p-4 rounded-lg border border-amber-200 bg-amber-50 space-y-3">
                <p className="text-xs text-amber-700">
                  添加公司名称后，AI 网页搜索 / 地图获客都会主动排除这些客户，避免重复出现。
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input-field flex-1 text-sm"
                    placeholder="输入要屏蔽的公司名称..."
                    value={blockInput}
                    onChange={(e) => setBlockInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addToBlocklist(); } }}
                  />
                  <button
                    type="button"
                    onClick={addToBlocklist}
                    disabled={!blockInput.trim()}
                    className="btn-primary px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus size={14} />
                    添加
                  </button>
                </div>
                {blocklist.length > 0 ? (
                  <div className="space-y-1.5">
                    {blocklist.map((name) => (
                      <div
                        key={name}
                        className="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-amber-200 text-sm"
                      >
                        <span className="text-charcoal-700 truncate">{name}</span>
                        <button
                          onClick={() => removeFromBlocklist(name)}
                          className="ml-2 p-1 rounded hover:bg-red-50 text-charcoal-400 hover:text-red-500 transition-colors flex-shrink-0"
                          title="移除屏蔽"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={clearBlocklist}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 mt-1"
                    >
                      <Trash2 size={12} />
                      清空所有屏蔽
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-amber-500 italic">暂无屏蔽客户</p>
                )}
              </div>
            )}
          </div>

          {/* 提示：深度抓取已分离到「深度调查」页面 */}
          <div className="px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">提示：</span>
              {searchMode === 'map'
                ? '地图获客会按城市/区域优先找本地门店、批发商和贸易商，并把电话、官网、地图链接整理进客户背景。自动发送 WhatsApp 风险较高，当前只生成可人工确认的一键跟进线索。'
                : '搜索仅返回基础公司信息。如需深度背调（邮箱、电话、LinkedIn、背调报告），请将客户转移到「深度调查」页面，点击「AI 深度调查」按钮单独触发。'}
            </p>
          </div>

          <div>
            <label className="label">破冰发送人名字</label>
            <input
              type="text"
              className="input-field"
              value={outreachSalesName}
              onChange={(e) => setOutreachSalesName(e.target.value)}
              placeholder="例如：Pluie"
            />
          </div>

          {/* 搜索按钮 */}
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="btn-primary w-full justify-center py-3"
              title={searchLoading && !showLoaderForCurrentMode
                ? `${loadingMode === 'web' ? 'AI 网页搜索' : '地图获客'} 正在进行中，请稍候`
                : undefined}
            >
              {showLoaderForCurrentMode ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  搜索中...
                </>
              ) : searchLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin opacity-60" />
                  另一搜索进行中...
                </>
              ) : (
                <>
                  {searchMode === 'map' ? <MapPin size={18} /> : <Search size={18} />}
                  {searchMode === 'map' ? '开始地图获客' : '开始精准搜索'}
                </>
              )}
            </button>
          </div>
        </div>
        )}

        {/* 全 EU 精准搜索：零输入大按钮 + 屏蔽列表 */}
        {searchMode === 'eu_premium' && (
          <div className="space-y-4">
            <div
              className="flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
              onClick={() => setShowBlocklist((v) => !v)}
            >
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                <ShieldOff size={15} />
                屏蔽客户列表
                {blocklist.length > 0 && (
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full text-[10px] font-bold">
                    {blocklist.length}
                  </span>
                )}
              </div>
              <ChevronDown
                size={15}
                className={clsx('text-amber-600 transition-transform', showBlocklist && 'rotate-180')}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className={clsx(
                'w-full justify-center flex items-center gap-2 py-4 rounded-lg font-semibold text-white shadow-elegant-md transition-all',
                searchLoading
                  ? 'bg-charcoal-400 cursor-not-allowed'
                  : 'bg-gradient-to-br from-purple-700 to-amber-600 hover:from-purple-800 hover:to-amber-700'
              )}
              title={searchLoading && !showLoaderForCurrentMode
                ? `${loadingMode === 'web' ? 'AI 网页搜索' : loadingMode === 'map' ? '地图获客' : '全 EU 精准搜索'} 正在进行中，请稍候`
                : undefined}
            >
              {showLoaderForCurrentMode ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  AI 网搜 + 地图双路扫 EU 中... (约 60-90 秒)
                </>
              ) : searchLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin opacity-60" />
                  另一搜索进行中...
                </>
              ) : (
                <>
                  <Target size={20} />
                  🎯 一键搜 6 家 EU 顶级 Grade A 客户
                </>
              )}
            </button>
          </div>
        )}
      </div>



      {/* ── 搜索结果 ── */}
      {searched && (
        <div className="animate-fade-in-up space-y-4">
          {currentModeResults.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
              <Check size={14} />
              <span>
                当前 <strong>{searchMode === 'eu_premium' ? '全 EU 精准 6 家' : searchMode === 'web' ? 'AI 网页搜索' : '地图获客'}</strong> 共 {currentModeResults.length} 条潜在客户。
                {otherModeCount > 0 && (
                  <>切到另一个模式还能看到 {otherModeCount} 条之前的结果。</>
                )}
              </span>
            </div>
          )}
          {error && currentModeResults.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              <AlertCircle size={14} />
              <span>网页搜索失败，当前显示的是本地演示数据：{error}</span>
            </div>
          )}

          {/* Loading 状态 - 只在当前 tab 触发的搜索时显示 */}
          {showLoaderForCurrentMode && (
            <div className="relative overflow-hidden rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-indigo-50 p-6 animate-fade-in-up">
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-200/50">
                    <Search size={22} className="text-white" />
                  </div>
                  <span className="absolute inset-0 rounded-full bg-brand-300/30 animate-ping" style={{ animationDuration: '2s' }}></span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-charcoal-800 animate-pulse">
                    {loadingTexts[loadingTextIndex]}
                  </p>
                  <p className="text-xs text-charcoal-400 mt-1">
                    {searchMode === 'map'
                      ? 'Google Places 正在按多组关键词提取本地商家，通常几秒返回'
                      : 'Gemini-Search 正在联网搜索、验证公司信息，通常需要 30-50 秒'}
                  </p>
                  <div className="mt-2 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-brand-400 to-indigo-400 rounded-full animate-indeterminate-progress" />
                  </div>
                  <p className="text-[10px] text-charcoal-300 mt-1">
                    步骤 {loadingTextIndex + 1} / {loadingTexts.length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 工具栏：全选 + 转移按钮 */}
          {currentModeResults.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-display font-semibold text-charcoal-800">
                  {searchMode === 'web' ? 'AI 网页搜索结果' : '地图获客结果'}
                  <span className="ml-2 text-sm font-normal text-charcoal-400">
                    找到 {currentModeResults.length} 条潜在客户
                  </span>
                </h3>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
                >
                  {selectAll ? (
                    <CheckSquare size={16} className="text-brand-600" />
                  ) : (
                    <Square size={16} />
                  )}
                  {selectAll ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <>
                    <button
                      onClick={addSelectedToBlocklist}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors shadow-sm"
                    >
                      <ShieldOff size={14} />
                      屏蔽已选 ({selectedIds.size})
                    </button>
                    <button
                      onClick={handleTransferToContact}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      <ArrowRight size={14} />
                      转移到「深度调查」({selectedIds.size})
                    </button>
                  </>
                )}
                <button onClick={exportCSV} className="btn-secondary text-xs">
                  <Download size={14} />
                  导出 CSV
                </button>
              </div>
            </div>
          )}

          {currentModeResults.length === 0 ? (
            <div className="card p-12 text-center text-charcoal-400">
              <Search size={40} className="mx-auto mb-3 opacity-30" />
              <p>
                {error
                  ? error
                  : `当前 ${searchMode === 'web' ? 'AI 网页搜索' : '地图获客'} 暂无结果，请尝试调整搜索条件`}
              </p>
              {otherModeCount > 0 && (
                <p className="text-xs mt-1 text-charcoal-300">
                  另一模式还有 {otherModeCount} 条结果，可切换查看
                </p>
              )}
              <button
                onClick={handleSearch}
                className="btn-secondary text-xs mt-4 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                重新搜索
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {currentModeResults.map((r) => {
                const isSelected = selectedIds.has(r.id);
                const isTransferred = r.transferredToContact;
                const outreach = quickOutreach[r.id];
                const whatsappText = outreach?.content || '';
                const whatsappLink = whatsappText ? buildWhatsAppLink(r, whatsappText) : '';
                return (
                  <div
                    key={r.id}
                    className={clsx(
                      'card p-5 space-y-3 hover:border-brand-300 group relative transition-all',
                      isSelected && 'border-brand-400 ring-2 ring-brand-100',
                      isTransferred && 'border-emerald-300 bg-emerald-50/30'
                    )}
                  >
                    {/* 勾选框 */}
                    {!isTransferred && (
                      <button
                        onClick={() => toggleSelect(r.id)}
                        className="absolute top-4 right-4 z-10 p-1 rounded hover:bg-cream-100 transition-colors"
                        title={isSelected ? '取消选择' : '选择此客户'}
                      >
                        {isSelected ? (
                          <CheckSquare size={18} className="text-brand-600" />
                        ) : (
                          <Square size={18} className="text-charcoal-300" />
                        )}
                      </button>
                    )}

                    {/* 已转移标记 */}
                    {isTransferred && (
                      <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                        <Check size={12} />
                        已转移
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* A/B/C 客户分级徽章——业务员第一眼锁定优先级 */}
                          {r.tier && (
                            <span
                              className={clsx(
                                'inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold flex-shrink-0',
                                r.tier === 'A' && 'bg-emerald-600 text-white shadow-sm shadow-emerald-200',
                                r.tier === 'B' && 'bg-amber-500 text-white shadow-sm shadow-amber-200',
                                r.tier === 'C' && 'bg-charcoal-300 text-white'
                              )}
                              title={`客户分级 ${r.tier}${typeof r.tierScore === 'number' ? `（评分 ${r.tierScore}/100）` : ''}：${r.tier === 'A' ? '优先开发，建议立即 WhatsApp / 电话' : r.tier === 'B' ? '中等优先，可邮件 + 一次跟进' : '低优先，群发为主'}`}
                            >
                              {r.tier}
                            </span>
                          )}
                          <h4 className="font-semibold text-charcoal-800 group-hover:text-brand-700 transition-colors truncate">
                            {r.company}
                          </h4>
                        </div>
                        {r.website ? (
                          <a
                            href={r.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1 mt-0.5"
                          >
                            {r.website}
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <p className="text-xs text-charcoal-400 mt-0.5">官网未公开，优先从 Google Maps 或电话确认</p>
                        )}
                      </div>
                    </div>

                    {/* 命中搜索词芯片——告诉业务员这条线索是被哪个关键词捞到的，方便分组 */}
                    {r.matchedQuery && (
                      <div
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-medium max-w-full"
                        title="这条客户是被这个搜索词捞到的（Google Places 命中关键词）"
                      >
                        <Search size={11} />
                        <span className="truncate">命中：{r.matchedQuery}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {(r.tags || []).map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                      {r.country && (
                        <span className="tag bg-brand-50 text-brand-700 border-brand-200">
                          {r.country}
                        </span>
                      )}
                      {r.whatsapp && (
                        <span
                          className="tag bg-emerald-50 text-emerald-700 border-emerald-200"
                          title={r.source === 'google_maps' || r.source === 'map_ai_search'
                            ? '地图来源：根据手机号段判断的 WhatsApp 候选，需人工确认'
                            : 'AI 联网搜索到的 WhatsApp 号码'}
                        >
                          {r.source === 'google_maps' || r.source === 'map_ai_search'
                            ? 'WhatsApp 候选'
                            : 'WhatsApp'}
                        </span>
                      )}
                      {r.rating && (
                        <span className="tag bg-amber-50 text-amber-700 border-amber-200">
                          评分 {r.rating}
                        </span>
                      )}
                    </div>

                    {(r.address || r.googleMapsUrl || r.rating) && (
                      <div className="grid grid-cols-1 gap-2 rounded-lg border border-cream-200 bg-cream-50 p-3 text-xs text-charcoal-600">
                        {r.address && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} />
                            {r.address}
                          </span>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {r.rating && (
                            <span className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-amber-700 border border-amber-200">
                              <Star size={12} />
                              Google {r.rating}
                            </span>
                          )}
                          {r.googleMapsUrl && (
                            <a
                              href={r.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-brand-600 border border-brand-200 hover:bg-brand-50"
                            >
                              打开地图
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 真实性验证状态 */}
                    {(r.verified !== undefined || r.verificationNote) && (
                      <div
                        className={clsx(
                          'flex items-start gap-2 p-2.5 rounded-md border text-xs',
                          r.verified
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                        )}
                      >
                        {r.verified ? (
                          <Check size={14} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                        ) : (
                          <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-600" />
                        )}
                        <p className="leading-relaxed">
                          <span className="font-semibold">
                            {r.verified ? '已验证：' : '未公开验证：'}
                          </span>
                          {r.verificationNote || (r.verified ? '官网可访问' : '需人工确认')}
                        </p>
                      </div>
                    )}

                    {/* 匹配度分析 */}
                    {r.matchReason && (
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 border border-amber-200">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5 text-amber-600">
                          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                        </svg>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          <span className="font-semibold">匹配度分析：</span>{r.matchReason}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-charcoal-500 leading-relaxed line-clamp-3">
                      {r.metaDescription}
                    </p>

                    {/* 联系方式 */}
                    {(r.email || r.phone || r.whatsapp || r.linkedin || r.googleMapsUrl) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {r.email && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            {r.email}
                          </span>
                        )}
                        {r.phone && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            <Phone size={12} />
                            {r.phone}
                          </span>
                        )}
                        {(() => {
                          // WhatsApp 链接：只有手机号格式才发，号码必须 ≥ 8 位有效数字
                          const waDigits = (r.whatsapp || '').replace(/\D/g, '');
                          if (!r.whatsapp || waDigits.length < 8) return null;
                          const isMapCandidate = r.source === 'google_maps' || r.source === 'map_ai_search' || r.source === 'eu_premium_combined';
                          return (
                            <a
                              href={`https://wa.me/${waDigits}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              title={isMapCandidate
                                ? '候选 WhatsApp（基于号段判断 / 官网 wa.me 链接，需人工确认是否真实开通）'
                                : 'AI 联网搜索到的 WhatsApp'}
                            >
                              <MessageCircle size={12} />
                              {isMapCandidate ? 'WhatsApp 候选' : 'WhatsApp'}
                              <ExternalLink size={10} />
                            </a>
                          );
                        })()}
                        {r.googleMapsUrl && (
                          <a
                            href={r.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                            title="在 Google Maps 查看商家位置 / 评分 / 评论"
                          >
                            <MapPin size={12} />
                            Google Maps
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    )}

                    {/* 地图来源 + 没 WhatsApp 候选 → 不展示 WhatsApp 破冰区（避免业务员看到无法发送的死链） */}
                    {!(sourceModeOf(r) === 'map' && !r.whatsapp) && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-emerald-800">WhatsApp 破冰</p>
                          <p className="text-[10px] text-emerald-700/75">根据当前客户背景自动生成，不需要先做深度调查。</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => generateQuickOutreach(r)}
                          disabled={outreach?.loading}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {outreach?.loading ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                          {outreach?.content ? '重新生成' : '生成破冰'}
                        </button>
                      </div>

                      {outreach?.error && (
                        <p className="text-xs text-red-600">{outreach.error}</p>
                      )}

                      {outreach?.content && (
                        <div className="space-y-2">
                          <textarea
                            className="input-field min-h-[120px] resize-y bg-white text-xs leading-relaxed"
                            value={outreach.content}
                            onChange={(e) => updateQuickOutreachContent(r.id, e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => copyQuickOutreach(outreach.content || '')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                            >
                              <Check size={13} />
                              复制文案
                            </button>
                            {whatsappLink ? (
                              <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                              >
                                <MessageCircle size={13} />
                                {r.source === 'google_maps' || r.source === 'map_ai_search' || r.source === 'eu_premium_combined'
                                  ? '发送 WhatsApp（候选）'
                                  : '发送 WhatsApp'}
                                <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span
                                className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700"
                                title="只有真实/候选 WhatsApp 才会生成一键发送；普通电话需要人工确认是否开通 WhatsApp"
                              >
                                {r.phone ? '暂无已验证 WhatsApp（电话需人工确认）' : '暂无 WhatsApp，先复制文案'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    )}

                    <details className="text-xs">
                      <summary className="cursor-pointer text-brand-600 hover:text-brand-700 font-medium">
                        展开客户背景详情
                      </summary>
                      <p className="mt-1.5 p-2 rounded-md bg-cream-100 text-charcoal-600 leading-relaxed whitespace-pre-line">
                        {r.customerBackgroundInfo}
                      </p>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────── Demo 数据 ────────────── */

function generateDemoResults(keyword: string, country: string, mode: 'web' | 'map' = 'web'): SearchResult[] {
  if (mode === 'map') {
    return [
      {
        company: 'London Spy Shop & Security Supplies',
        website: 'https://example-security-london.co.uk',
        title: '本地安防设备零售（地图线索示例）',
        metaDescription:
          '伦敦本地的安防设备店，主营零售客流并有少量批发样式品类。适合测试 WhatsApp 优先开发流程。',
        tags: ['地图线索', '线下零售'],
        address: 'West London, United Kingdom',
        phone: '+44 20 7000 0001',
        whatsapp: '+44 20 7000 0001',
        rating: '4.6',
        googleMapsUrl: 'https://maps.google.com/',
        matchReason: `本地经营安防设备，可能把 ${keyword} 作为新品类补货测试。`,
      },
      {
        company: 'Metro Surveillance Trade Centre',
        website: 'https://example-surveillance-trade.co.uk',
        title: '面向安装商的批发监控供应商（地图线索示例）',
        metaDescription:
          '面向安装商和小型经销商的伦敦本地批发监控供应商，主要靠电话沟通，适合做人工 WhatsApp 跟进。',
        tags: ['地图线索', '批发商'],
        address: 'North London, United Kingdom',
        phone: '+44 20 7000 0002',
        whatsapp: '+44 20 7000 0002',
        rating: '4.4',
        googleMapsUrl: 'https://maps.google.com/',
        matchReason: '面向安装商和经销商，可对接迷你摄像头、录音笔、DIY 摄像头模块。',
      },
    ].map((c, i) => ({
      id: `demo-map-${i}`,
      ...c,
      customerBackgroundInfo: `[地图线索] ${c.company}\n[地址] ${c.address}\n[电话] ${c.phone}\n[WhatsApp] ${c.whatsapp}\n[评分] ${c.rating}\n[官网] ${c.website}\n[匹配度分析] ${c.matchReason}`,
      country,
      source: 'map_ai_search',
      transferredToContact: false,
      transferredToCopy: false,
    }));
  }

  const companies = [
    {
      company: 'EuroTech Security S.r.l.',
      website: 'https://eurotechsecurity.it',
      title: '专业安防摄像头与监控系统分销商',
      metaDescription:
        'EuroTech Security 是意大利头部安防分销商，主营专业级安防摄像头、CCTV 系统和智能监控方案，服务南欧零售与企业客户。',
      tags: ['线下零售', '批发商'],
    },
    {
      company: 'SecureHome France',
      website: 'https://securehome-france.com',
      title: '线上零售：间谍摄像头 / GPS 追踪器 / 智能家居安防',
      metaDescription:
        'SecureHome France 提供间谍摄像头、隐藏摄像头、GPS 追踪器和家用/商用 DIY 安防套装，覆盖法国及全欧快递。',
      tags: ['线上 B2C 卖家'],
    },
    {
      company: 'PolGuard Systems Sp. z o.o.',
      website: 'https://polguard.pl',
      title: '波兰视频监控与安防设备批发商',
      metaDescription:
        'PolGuard Systems 是波兰本地安防批发商，主营 CCTV 摄像头、数字录音笔和智能安防模组，服务波兰全境的系统集成商和零售连锁。',
      tags: ['系统集成商', '批发商'],
    },
    {
      company: 'SicherCam Deutschland GmbH',
      website: 'https://sichercam.de',
      title: '德国线上安防摄像头与智能安防产品店',
      metaDescription:
        'SicherCam 主营高品质安防摄像头、迷你摄像头和兼容涂鸦智能的安防产品，对经销商和安装商提供 B2B 批发价。',
      tags: ['线上 B2C 卖家'],
    },
  ];

  return companies.map((c, i) => ({
    id: `demo-${i}`,
    ...c,
    customerBackgroundInfo: `[标题] ${c.title}\n[公司简介] ${c.metaDescription}\n[官网] ${c.website}`,
    country,
    transferredToContact: false,
    transferredToCopy: false,
  }));
}

function sameStringList(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const aSet = new Set(a.map((item) => item.trim().toLowerCase()));
  return b.every((item) => aSet.has(item.trim().toLowerCase()));
}
