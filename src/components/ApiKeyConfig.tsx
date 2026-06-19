'use client';

import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Check, X, Save, Shield, Loader2, Zap, AlertCircle, Bot, Search, FileText, UserCheck } from 'lucide-react';
import clsx from 'clsx';

const STORAGE_KEY = 'qzt_aihubmix_config';

interface ApiConfig {
  apiKey: string;
}

function loadConfig(): ApiConfig {
  if (typeof window === 'undefined') return { apiKey: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { apiKey: '' };
}

function saveConfig(config: ApiConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getStoredApiKey(): string {
  return loadConfig().apiKey || '';
}

interface TestResult {
  status: 'idle' | 'testing' | 'success' | 'fail';
  model?: string;
  message?: string;
  latency?: number;
}

const BASE_URL = 'https://api.aihubmix.com/v1';

const MODEL_CONFIG = [
  { icon: Search, label: '客户搜索', model: 'AI 大模型', color: 'text-blue-600 bg-blue-50' },
  { icon: UserCheck, label: '深度背调', model: 'LLM 语言模型', color: 'text-purple-600 bg-purple-50' },
  { icon: FileText, label: '文案生成', model: 'AI 大模型', color: 'text-emerald-600 bg-emerald-50' },
];

export default function ApiKeyConfig() {
  const [config, setConfig] = useState<ApiConfig>({ apiKey: '' });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>({ status: 'idle' });

  useEffect(() => {
    setIsClient(true);
    setConfig(loadConfig());
  }, []);

  const hasKey = config.apiKey.length > 0;
  const maskedKey = hasKey
    ? config.apiKey.slice(0, 6) + '...' + config.apiKey.slice(-4)
    : '';

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    const empty = { apiKey: '' };
    setConfig(empty);
    saveConfig(empty);
    setTestResult({ status: 'idle' });
  };

  const handleTest = async () => {
    if (!config.apiKey.trim()) return;

    setTestResult({ status: 'testing' });
    const startTime = Date.now();

    try {
      const res = await fetch('/api/test-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.apiKey.trim(),
          base_url: BASE_URL,
        }),
      });

      const latency = Date.now() - startTime;
      const data = await res.json();

      if (data.success) {
        setTestResult({
          status: 'success',
          model: data.model || 'unknown',
          message: data.message || '连接成功',
          latency,
        });
      } else {
        setTestResult({
          status: 'fail',
          message: data.detail || '连接失败',
          latency,
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'fail',
        message: `网络错误: ${err.message}`,
        latency: Date.now() - startTime,
      });
    }
  };

  if (!isClient) return null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <Key size={16} className="text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-display font-semibold text-charcoal-700">
            AI 模型配置
          </h3>
          <p className="text-[11px] text-charcoal-400">
            已内置默认 Key 可直接使用，也可填入自己的 aihubmix Key
          </p>
        </div>
      </div>

      {/* 固定模型配置信息 */}
      <div className="grid grid-cols-1 gap-1.5">
        {MODEL_CONFIG.map(({ icon: Icon, label, model, color }) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-50 border border-cream-200">
            <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center', color)}>
              <Icon size={12} />
            </div>
            <span className="text-xs font-medium text-charcoal-600">{label}</span>
            <code className="ml-auto text-[10px] font-mono text-charcoal-400 bg-white px-1.5 py-0.5 rounded">{model}</code>
          </div>
        ))}
      </div>

      {/* 当前状态 */}
      {hasKey && !saved && testResult.status === 'idle' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
          <Shield size={14} />
          <span>已配置: <code className="font-mono">{maskedKey}</code></span>
          <button
            onClick={handleClear}
            className="ml-auto p-1 rounded hover:bg-emerald-100 transition-colors"
            title="清除密钥"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* 保存成功提示 */}
      {saved && testResult.status !== 'success' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
          <Check size={14} />
          <span>配置已保存</span>
        </div>
      )}

      {/* 测试结果 */}
      {testResult.status === 'testing' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
          <Loader2 size={14} className="animate-spin" />
          <span>正在测试连接...</span>
        </div>
      )}

      {testResult.status === 'success' && (
        <div className="px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500" />
            <span className="font-semibold">连接成功</span>
            <span className="ml-auto text-emerald-500">{testResult.latency}ms</span>
          </div>
          {testResult.model && (
            <div className="pl-5 text-emerald-600">
              响应模型: <code className="font-mono">{testResult.model}</code>
            </div>
          )}
        </div>
      )}

      {testResult.status === 'fail' && (
        <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-red-500" />
            <span className="font-semibold">连接失败</span>
            <span className="ml-auto text-red-400">{testResult.latency}ms</span>
          </div>
          <div className="pl-5 text-red-600">{testResult.message}</div>
        </div>
      )}

      {/* 配置表单 */}
      <div className="space-y-3">
        {/* API Key */}
        <div>
          <label className="label">API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="input-field pr-16 font-mono text-xs"
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              value={config.apiKey}
              onChange={(e) => setConfig({ apiKey: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-charcoal-400 hover:text-charcoal-600 transition-colors"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-charcoal-400 mt-1">
            前往 aihubmix.com 获取 API Key
          </p>
        </div>

        {/* 按钮组 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!config.apiKey.trim()}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
              config.apiKey.trim()
                ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                : 'bg-cream-200 text-charcoal-400 cursor-not-allowed'
            )}
          >
            <Save size={14} />
            保存配置
          </button>

          <button
            onClick={handleTest}
            disabled={!config.apiKey.trim() || testResult.status === 'testing'}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
              config.apiKey.trim() && testResult.status !== 'testing'
                ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm'
                : 'bg-cream-200 text-charcoal-400 cursor-not-allowed'
            )}
          >
            {testResult.status === 'testing' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Zap size={14} />
            )}
            测试连接
          </button>
        </div>
      </div>
    </div>
  );
}
