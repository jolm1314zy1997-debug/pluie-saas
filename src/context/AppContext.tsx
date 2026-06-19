'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, Dispatch, SetStateAction } from 'react';
import { useAuth } from '@/context/AuthContext';
import { loadCloudAppState, saveCloudAppState } from '@/lib/cloudData';

/* ────────────── 类型定义 ────────────── */

export interface SearchResult {
  id: string;
  company: string;
  website: string;
  title: string;
  metaDescription: string;
  tags: string[];
  customerBackgroundInfo: string;
  country?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  linkedin?: string;
  address?: string;
  rating?: string | number;
  googleMapsUrl?: string;
  source?: 'ai_web_search' | 'google_maps' | 'map_ai_search' | 'eu_premium_combined';
  matchReason?: string;
  // 真实性验证：网页搜索开启「搜索后验证」时由 Jina 写入；地图搜索由 Places 数据写入。
  verified?: boolean;
  verificationNote?: string;
  // 命中的搜索词（地图模式下，Google Places 是哪条查询拉到的）
  matchedQuery?: string;
  // 客户分级 A / B / C：基于类型 / 联系方式 / 验证状态 / 评分 / 关键词等综合打分
  tier?: 'A' | 'B' | 'C';
  tierScore?: number;
  transferred?: boolean;
  transferredToContact?: boolean;
  transferredToCopy?: boolean;
}

export interface ContactInfo {
  type: 'email' | 'phone' | 'linkedin' | 'website' | 'whatsapp' | 'facebook' | 'twitter' | 'instagram' | 'social';
  value: string;
  label?: string;
  verified?: boolean;
  // 来自哪个证据源（如 'website-markdown' / 'website-wa.me-link' / 'ai-search' / 'homepage footer'）
  source?: string;
  // 验证状态的人类可读说明，例如"官网内容里直接出现" / "AI 推测，发起前先核实"
  verificationNote?: string;
}

export interface RelatedSite {
  domain: string;
  url: string;
  title: string;
  snippet: string;
  matched_via: string; // 哪个邮箱 / 哪个查询命中
}

export interface EnrichedLead {
  id: string;
  company: string;
  website: string;
  country: string;
  tags: string[];
  customerBackgroundInfo?: string;
  contacts: ContactInfo[];
  deepProfile?: string;
  // 通过邮箱反查 + 第三方目录搜到的关联站点
  relatedSites?: RelatedSite[];
  // 公司真实性核验结果：true=AI 给的官网可能不属于这家公司 / 整个客户存疑
  websiteReality?: { suspicious: boolean; note: string };
  // 9 个结构化背调字段（深度调查升级，2026-06）——找不到时为 undefined / 空数组，UI 自动隐藏对应卡片
  businessProfile?: {
    annual_revenue?: string;
    net_profit?: string;
    employee_count?: string;
    scale_judgment?: string;
    evidence_source?: string;
  };
  hotSellers?: Array<{
    name: string;
    category?: string;
    price_current?: string;
    price_signal?: string;
  }>;
  decisionMaker?: {
    name?: string;
    role_guess?: string;
    personality_signal?: string;
    outreach_handle?: string;
  };
  softwareEcosystem?: {
    verdict?: string;
    evidence?: string;
    switch_pressure?: string;
  };
  complianceRisk?: {
    key_regulations?: string[];
    platform_risk?: string;
    must_have_certs?: string[];
  };
  competitivePosition?: {
    type?: string;
    key_differentiator?: string;
    customer_profile_short?: string;
  };
  supplierChangeSignals?: string[];
  negotiationPlaybook?: Array<{
    angle: string;
    rationale?: string;
    opening_script_en?: string;
    opening_script_zh?: string;
    kb_citations?: string[];
  }>;
  researchMode?: 'fast' | 'full';
  isProfiling?: boolean;
}

export interface CopywritingResult {
  channel: 'email' | 'whatsapp';
  version: string;
  content: string;
}

export interface AppState {
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;

  enrichedLeads: EnrichedLead[];
  setEnrichedLeads: (leads: EnrichedLead[] | ((prev: EnrichedLead[]) => EnrichedLead[])) => void;

  copyCustomer: {
    company: string;
    industry: string;
    background: string;
    email?: string;
    phone?: string;
    website?: string;
  } | null;
  setCopyCustomer: (customer: AppState['copyCustomer']) => void;

  // 全局 loading 状态（跨步骤持久化）
  searchLoading: boolean;
  setSearchLoading: (v: boolean) => void;

  transferToContact: (leadIds: string[]) => void;
  addManualLead: (lead: {
    company: string;
    website: string;
    country: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    extraInfo?: string;
  }) => void;
  transferToCopy: (lead: EnrichedLead) => void;
  clearSearchResults: () => void;
}

/* ────────────── 多用户隔离 ────────────── */

const STORAGE_PREFIX = 'qzt_app_state_';

/**
 * 获取当前用户唯一 ID。
 * 策略：首次访问自动生成 UUID，存入 localStorage（key 不含用户前缀，全局唯一）。
 * 同一台电脑上同一个浏览器共享同一个 userId，但不同电脑/浏览器各有独立 userId。
 * 如果未来需要登录系统，可以替换为服务端下发的 userId。
 */
function getUserId(): string {
  const META_KEY = 'qzt_user_id';
  if (typeof window === 'undefined') return '';
  try {
    let uid = localStorage.getItem(META_KEY);
    if (!uid) {
      uid = crypto.randomUUID ? crypto.randomUUID() : _fallbackUUID();
      localStorage.setItem(META_KEY, uid);
    }
    return uid;
  } catch {
    return 'anonymous';
  }
}

/** crypto.randomUUID polyfill */
function _fallbackUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getStorageKey(): string {
  return STORAGE_PREFIX + getUserId();
}

/* ────────────── localStorage ────────────── */

function loadFromStorage(): Partial<AppState> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      searchResults: parsed.searchResults || [],
      enrichedLeads: parsed.enrichedLeads || [],
      copyCustomer: parsed.copyCustomer || null,
    };
  } catch {
    return {};
  }
}

function saveToStorage(state: Partial<AppState>) {
  if (typeof window === 'undefined') return;
  try {
    const key = getStorageKey();
    const toSave = {
      searchResults: state.searchResults || [],
      enrichedLeads: state.enrichedLeads || [],
      copyCustomer: state.copyCustomer || null,
    };
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

/* ────────────── Context ────────────── */

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { configured: cloudConfigured, user, accessToken } = useAuth();
  const [searchResults, setSearchResultsState] = useState<SearchResult[]>([]);
  const [enrichedLeads, setEnrichedLeadsState] = useState<EnrichedLead[]>([]);
  const [copyCustomer, setCopyCustomerState] = useState<AppState['copyCustomer']>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const latestStateRef = useRef({
    searchResults: [] as SearchResult[],
    enrichedLeads: [] as EnrichedLead[],
    copyCustomer: null as AppState['copyCustomer'],
  });
  const cloudReadyRef = useRef(false);
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 首次加载：从 localStorage 恢复
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved.searchResults) setSearchResultsState(saved.searchResults);
    if (saved.enrichedLeads) setEnrichedLeadsState(saved.enrichedLeads);
    if (saved.copyCustomer) setCopyCustomerState(saved.copyCustomer);
    setHydrated(true);
  }, []);

  // 每次状态变化 -> 持久化到 localStorage
  useEffect(() => {
    if (hydrated) {
      saveToStorage({ searchResults, enrichedLeads, copyCustomer });
    }
  }, [searchResults, enrichedLeads, copyCustomer, hydrated]);

  useEffect(() => {
    latestStateRef.current = { searchResults, enrichedLeads, copyCustomer };
  }, [searchResults, enrichedLeads, copyCustomer]);

  // 登录后：从 Supabase 恢复云端工作台；若云端为空，则把本机当前数据迁移上去。
  useEffect(() => {
    cloudReadyRef.current = false;
    if (!hydrated || !cloudConfigured || !user || !accessToken) return;

    let cancelled = false;
    const cloudToken = accessToken;

    async function hydrateFromCloud() {
      try {
        const cloudState = await loadCloudAppState(cloudToken);
        if (cancelled) return;

        if (cloudState) {
          setSearchResultsState(cloudState.searchResults);
          setEnrichedLeadsState(cloudState.enrichedLeads);
          setCopyCustomerState(cloudState.copyCustomer);
        } else {
          await saveCloudAppState(cloudToken, latestStateRef.current);
        }
      } catch (err) {
        console.warn('Cloud workspace sync failed:', err);
      } finally {
        if (!cancelled) cloudReadyRef.current = true;
      }
    }

    hydrateFromCloud();

    return () => {
      cancelled = true;
      cloudReadyRef.current = false;
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
    };
  }, [hydrated, cloudConfigured, user?.id, accessToken]);

  // 登录后：任何工作台变化都做轻量防抖同步。
  useEffect(() => {
    if (!hydrated || !cloudConfigured || !user || !accessToken || !cloudReadyRef.current) return;
    if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);

    cloudSaveTimerRef.current = setTimeout(() => {
      saveCloudAppState(accessToken, latestStateRef.current).catch((err) => {
        console.warn('Cloud workspace save failed:', err);
      });
    }, 800);

    return () => {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
    };
  }, [searchResults, enrichedLeads, copyCustomer, hydrated, cloudConfigured, user?.id, accessToken]);

  const setSearchResults = useCallback((results: SearchResult[]) => {
    setSearchResultsState(results);
  }, []);

  const setEnrichedLeads = useCallback((
    leads: EnrichedLead[] | ((prev: EnrichedLead[]) => EnrichedLead[])
  ) => {
    if (typeof leads === 'function') {
      setEnrichedLeadsState((prev) => leads(prev || []));
    } else {
      setEnrichedLeadsState(leads);
    }
  }, []);

  const setCopyCustomer = useCallback((customer: AppState['copyCustomer']) => {
    setCopyCustomerState(customer);
  }, []);

  // 把搜索结果转移到深度调查步骤
  // 重要：使用函数式 setState 确保 searchResults 取的是最新值（而非闭包捕获的旧值）
  const transferToContact = useCallback((leadIds: string[]) => {
    // 先标记 searchResults 中的 transferredToContact
    setSearchResultsState((prev) =>
      prev.map((r) =>
        leadIds.includes(r.id) ? { ...r, transferredToContact: true } : r
      )
    );

    // 用函数式 setState 获取最新的 searchResults 来生成 enrichedLeads
    // 关键修复：判断是否全选了当前搜索结果，如果是全选则替换而非追加
    setSearchResultsState((prevSearchResults) => {
      const newLeads: EnrichedLead[] = leadIds
        .map((id) => {
          const result = prevSearchResults.find((r) => r.id === id);
          if (!result) return null;
          return {
            id: result.id,
            company: result.company,
            website: result.website,
            country: result.country || 'Unknown',
            tags: result.tags,
            customerBackgroundInfo: result.customerBackgroundInfo,
            contacts: [
              ...(result.email
                ? [{ type: 'email' as const, value: result.email, label: 'From Search', verified: false }]
                : []),
              ...(result.phone
                ? [{ type: 'phone' as const, value: result.phone, label: 'From Search', verified: false }]
                : []),
              ...(result.whatsapp
                ? [{ type: 'whatsapp' as const, value: result.whatsapp, label: 'WhatsApp', verified: false }]
                : []),
              ...(result.linkedin
                ? [{ type: 'linkedin' as const, value: result.linkedin, label: 'LinkedIn', verified: false }]
                : []),
              ...(result.website
                ? [{ type: 'website' as const, value: result.website, label: 'Website' }]
                : []),
            ],
          };
        })
        .filter(Boolean) as EnrichedLead[];

      // 获取新转移 leads 的 ID 集合
      const newLeadIds = new Set(newLeads.map(l => l.id));

      setEnrichedLeadsState((prevEnriched) => {
        // 判断是否全选了当前搜索结果（leadIds === 所有未转移的 searchResults 的 id）
        const untransferredIds = prevSearchResults
          .filter(r => !r.transferredToContact)
          .map(r => r.id);
        const isFullSelect = leadIds.length === untransferredIds.length &&
          leadIds.every(id => untransferredIds.includes(id));

        if (isFullSelect) {
          // 全选模式：清空旧数据，只保留手动添加的 + 新转移的
          const manualLeads = prevEnriched.filter(l =>
            l.id.startsWith('manual-') && !newLeadIds.has(l.id)
          );
          return [...manualLeads, ...newLeads];
        } else {
          // 部分选择模式：追加模式，替换同 ID 的
          const kept = prevEnriched.filter(l => !newLeadIds.has(l.id));
          return [...kept, ...newLeads];
        }
      });

      // 返回 prevSearchResults 不做修改（上面已经处理了）
      return prevSearchResults;
    });
  }, []);

  // 手动添加客户（不经过搜索步骤）
  const addManualLead = useCallback(
    (info: { company: string; website: string; country: string; contactName?: string; email?: string; phone?: string; address?: string; extraInfo?: string }) => {
      const contacts: EnrichedLead['contacts'] = [
        ...(info.website
          ? [{ type: 'website' as const, value: info.website, label: 'Website' }]
          : []),
      ];
      if (info.email) {
        contacts.push({ type: 'email' as const, value: info.email, label: 'Email' });
      }
      if (info.phone) {
        contacts.push({ type: 'phone' as const, value: info.phone, label: 'Phone' });
      }

      // 组合背景信息，包含所有已知资料
      const bgParts: string[] = [];
      if (info.contactName) bgParts.push(`联系人: ${info.contactName}`);
      if (info.email) bgParts.push(`邮箱: ${info.email}`);
      if (info.phone) bgParts.push(`电话: ${info.phone}`);
      if (info.address) bgParts.push(`地址: ${info.address}`);
      bgParts.push(`公司: ${info.company}`);
      bgParts.push(`网站: ${info.website}`);
      if (info.country) bgParts.push(`国家: ${info.country}`);
      if (info.extraInfo) bgParts.push(`其他已知资料: ${info.extraInfo}`);

      const newLead: EnrichedLead = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        company: info.company,
        website: info.website,
        country: info.country || 'Unknown',
        tags: ['手动添加'],
        customerBackgroundInfo: bgParts.join('\n'),
        contacts,
      };
      setEnrichedLeadsState((prev) => [...prev, newLead]);
    },
    []
  );

  // 把客户信息转移到文案步骤
  const transferToCopy = useCallback((lead: EnrichedLead) => {
    setSearchResultsState((prev) =>
      prev.map((r) =>
        r.id === lead.id ? { ...r, transferredToCopy: true } : r
      )
    );

    // 组合客户背景信息：原有背景 + AI 深度背调报告
    let combinedBackground = lead.customerBackgroundInfo || '';
    if (lead.deepProfile) {
      if (combinedBackground) {
        combinedBackground += '\n\n---\n\n';
      }
      combinedBackground += `【AI 深度背调报告】\n${lead.deepProfile}`;
    }

    setCopyCustomerState({
      company: lead.company,
      industry: lead.tags.join(', '),
      background: combinedBackground,
      email: lead.contacts.find((c) => c.type === 'email')?.value,
      phone: lead.contacts.find((c) => c.type === 'phone')?.value,
      website: lead.website,
    });
  }, []);

  const clearSearchResults = useCallback(() => {
    setSearchResultsState([]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        searchResults,
        setSearchResults,
        enrichedLeads,
        setEnrichedLeads,
        copyCustomer,
        setCopyCustomer,
        searchLoading,
        setSearchLoading,
        transferToContact,
        addManualLead,
        transferToCopy,
        clearSearchResults,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
