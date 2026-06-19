'use client';

import { useState } from 'react';
import { Search, Building2, PenTool, Settings, Loader2, Brain, Bot, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import ApiKeyConfig from './ApiKeyConfig';
import AccountMenu from './AccountMenu';
import { useAppState } from '@/context/AppContext';
import { BRAND } from '@/config/brand';

interface StepItem {
  id: number;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}

const steps: StepItem[] = [
  { id: 1, label: '客户搜索', sublabel: 'Lead Search', icon: <Search size={18} /> },
  { id: 2, label: '深度调查', sublabel: 'Deep Research', icon: <Building2 size={18} /> },
  { id: 3, label: '破冰文案', sublabel: 'AI Copywriting', icon: <PenTool size={18} /> },
  { id: 4, label: '销售助手', sublabel: 'Sales Assistant', icon: <Brain size={18} /> },
  { id: 5, label: '物料库', sublabel: 'Materials', icon: <FolderOpen size={18} /> },
];

interface HeaderProps {
  activeStep: number;
  onStepChange: (step: number) => void;
}

export default function Header({ activeStep, onStepChange }: HeaderProps) {
  const [showConfig, setShowConfig] = useState(false);
  const { searchLoading } = useAppState();

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-cream-300 shadow-elegant">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Row: Logo */}
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img
              src={BRAND.logoUrl}
              alt={BRAND.logoAlt}
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div>
              <h1 className="text-lg font-display font-semibold text-charcoal-800 leading-tight">
                {BRAND.name}
              </h1>
              <p className="text-[11px] text-charcoal-400 tracking-wide uppercase">
                {BRAND.tagline}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-charcoal-400">
            {BRAND.assistantUrl ? (
              <a
                href={BRAND.assistantUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border bg-gradient-to-r from-indigo-50 to-emerald-50 border-indigo-200 text-indigo-700 hover:from-indigo-100 hover:to-emerald-100 hover:border-indigo-300 transition-all"
                title={BRAND.assistantTooltip}
              >
                <Bot size={13} />
                <span className="hidden sm:inline">{BRAND.assistantLabel}</span>
              </a>
            ) : null}
            <AccountMenu />
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all',
                showConfig
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-cream-200 border-cream-300 hover:border-cream-400'
              )}
              title="AI 模型配置"
            >
              <Settings size={13} />
              <span className="hidden sm:inline">配置</span>
            </button>
            <span className={clsx(
              'hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full',
              searchLoading
                ? 'bg-amber-50 border border-amber-300 text-amber-600'
                : 'bg-cream-200 border border-cream-300'
            )}>
              {searchLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  <span className="font-medium">AI 搜索中...</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  System Online
                </>
              )}
            </span>
          </div>
        </div>

        {/* Step Navigation */}
        <nav className="flex -mb-px" aria-label="Progress steps">
          {steps.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => onStepChange(step.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 flex-1 justify-center relative',
                activeStep === step.id
                  ? 'text-brand-700 border-brand-600'
                  : 'text-charcoal-400 border-transparent hover:text-charcoal-600 hover:border-cream-400'
              )}
            >
              {/* 搜索中时在步骤1上显示脉动指示 */}
              {searchLoading && step.id === 1 && (
                <span className="absolute top-2 right-4 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
              <span
                className={clsx(
                  'flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors',
                  activeStep === step.id
                    ? searchLoading && step.id === 1
                      ? 'bg-amber-500 text-white animate-pulse'
                      : 'bg-brand-600 text-white'
                    : activeStep > step.id
                    ? 'bg-brand-200 text-brand-700'
                    : 'bg-cream-200 text-charcoal-500'
                )}
              >
                {activeStep > step.id ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </span>
              <div className="hidden sm:block text-left">
                <span className="block text-sm">
                  {searchLoading && step.id === 1 ? '搜索中...' : step.label}
                </span>
                <span className="block text-[10px] opacity-60 uppercase tracking-wider">{step.sublabel}</span>
              </div>
              {idx < steps.length - 1 && (
                <span className="hidden sm:block flex-1 h-px bg-cream-300 mx-3 self-center" />
              )}
            </button>
          ))}
        </nav>
        {showConfig && (
          <div className="py-4 border-t border-cream-200 animate-fade-in-up">
            <div className="max-w-md">
              <ApiKeyConfig />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
