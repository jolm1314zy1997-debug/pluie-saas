import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { BRAND } from '@/config/brand';

export const metadata: Metadata = {
  title: BRAND.metaTitle,
  description: BRAND.metaDescription,
  // Chrome / Edge / Safari 自动翻译会替换 React 控制的文本节点 → 后续 setState 时
  // 它会找不到原始 textNode 抛 "removeChild" / "NotFoundError" → 整页 Application error。
  // 整站禁用浏览器自动翻译——业务员需要翻译的话用浏览器选中再翻译，不要整页翻。
  other: { google: 'notranslate' },
};

const currentYear = new Date().getFullYear();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" translate="no" className="notranslate">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="min-h-screen bg-cream-50" translate="no">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#fff',
              border: '1px solid #e5e7eb',
              padding: '12px 16px',
            },
          }}
        />
        <footer className="border-t border-cream-300 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between text-sm text-charcoal-400">
            <span>
              &copy; {currentYear} {BRAND.copyrightHolder}. All rights reserved.
            </span>
            <span>{BRAND.versionLabel}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
