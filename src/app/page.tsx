'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';

// Dynamic import with SSR disabled to prevent hydration mismatch
const Header = dynamic(() => import('@/components/Header'), { ssr: false });
const LeadSearch = dynamic(() => import('@/components/LeadSearch'), { ssr: false });
const ContactEnrichment = dynamic(() => import('@/components/ContactEnrichment'), { ssr: false });
const AICopywriting = dynamic(() => import('@/components/AICopywriting'), { ssr: false });
const SalesAssistant = dynamic(() => import('@/components/SalesAssistant'), { ssr: false });
const MaterialsLibrary = dynamic(() => import('@/components/MaterialsLibrary'), { ssr: false });

function AppContent() {
  const [activeStep, setActiveStep] = useState(1);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const assistantChat = url.searchParams.get('assistant_chat');
      const openAssistant = url.searchParams.get('assistant') === '1';

      if (assistantChat) {
        localStorage.setItem('qzt_assistant_prefill', assistantChat);
        window.dispatchEvent(
          new CustomEvent('qzt-assistant-prefill', {
            detail: { chat: assistantChat },
          })
        );
      }

      if (assistantChat || openAssistant) {
        setActiveStep(4);
        url.searchParams.delete('assistant_chat');
        url.searchParams.delete('assistant');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {}
  }, []);

  const handleTransferToContact = useCallback(() => {
    setActiveStep(2);
  }, []);

  const handleTransferToCopy = useCallback(() => {
    setActiveStep(3);
  }, []);

  const handleBackToContact = useCallback(() => {
    setActiveStep(2);
  }, []);

  return (
    <div className="min-h-screen bg-cream-50">
      <Header activeStep={activeStep} onStepChange={setActiveStep} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 四个步骤同时渲染，用 CSS 隐藏/显示，保证组件不被卸载 */}
        <div className={clsx(activeStep !== 1 && 'hidden')}>
          <LeadSearch onTransferComplete={handleTransferToContact} />
        </div>
        <div className={clsx(activeStep !== 2 && 'hidden')}>
          <ContactEnrichment onTransferToCopy={handleTransferToCopy} />
        </div>
        <div className={clsx(activeStep !== 3 && 'hidden')}>
          <AICopywriting onBackToContact={handleBackToContact} />
        </div>
        <div className={clsx(activeStep !== 4 && 'hidden')}>
          <SalesAssistant />
        </div>
        <div className={clsx(activeStep !== 5 && 'hidden')}>
          <MaterialsLibrary />
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}
