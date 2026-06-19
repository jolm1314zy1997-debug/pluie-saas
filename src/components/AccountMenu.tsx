'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, LogOut, User, X } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { BRAND } from '@/config/brand';

export default function AccountMenu() {
  const { configured, loading, user, signIn, signOut, signUp } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        toast.success('登录成功，正在同步你的工作台');
      } else {
        await signUp(email.trim(), password, displayName.trim());
        toast.success('账号已创建', {
          description: '如果 Supabase 开启了邮箱确认，请先到邮箱完成验证。',
        });
      }
      setOpen(false);
      setPassword('');
    } catch (err) {
      toast.error(mode === 'signin' ? '登录失败' : '注册失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('已退出账号，本机数据仍会保留');
    } catch (err) {
      toast.error('退出失败', {
        description: err instanceof Error ? err.message : '请稍后重试',
      });
    }
  };

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-y-auto bg-charcoal-900/45 px-4 py-8 backdrop-blur-sm sm:py-10"
            onMouseDown={() => setOpen(false)}
          >
            <div
              className="relative my-auto w-full max-w-[440px] rounded-xl border border-cream-200 bg-white shadow-[0_24px_80px_rgba(45,35,22,0.24)]"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-500">
                    {BRAND.name} Account
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-charcoal-800">业务员账号</h3>
                  <p className="mt-1 text-xs leading-relaxed text-charcoal-400">
                    登录后同步搜索结果、屏蔽名单、背调和文案记录
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-charcoal-400 hover:bg-cream-100 hover:text-charcoal-700"
                  title="关闭"
                >
                  <X size={18} />
                </button>
              </div>

              {!configured ? (
                <div className="space-y-3 px-5 py-5 text-sm text-charcoal-600">
                  <p>账号功能还没有配置 Supabase 环境变量，当前仍使用本机保存。</p>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                    需要在 Vercel 添加 `NEXT_PUBLIC_SUPABASE_URL` 和
                    `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
                  </div>
                </div>
              ) : user ? (
                <div className="space-y-4 px-5 py-5">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    <p className="font-medium">云端同步已开启</p>
                    <p className="mt-1 break-all text-xs">{user.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    <LogOut size={15} />
                    退出登录
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
                  <div className="grid grid-cols-2 rounded-lg border border-cream-200 bg-cream-50 p-1">
                    {(['signin', 'signup'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setMode(item)}
                        className={clsx(
                          'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          mode === item
                            ? 'bg-white text-brand-700 shadow-sm'
                            : 'text-charcoal-400 hover:text-charcoal-700'
                        )}
                      >
                        {item === 'signin' ? '登录' : '注册'}
                      </button>
                    ))}
                  </div>

                  {mode === 'signup' && (
                    <div>
                      <label className="label">业务员名字</label>
                      <input
                        className="input-field"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="例如 Pluie"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label">邮箱</label>
                    <input
                      className="input-field"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@company.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="label">密码</label>
                    <input
                      className="input-field"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 6 位"
                      required
                      minLength={6}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || loading}
                    className="btn-primary w-full justify-center"
                  >
                    {submitting ? '处理中...' : mode === 'signin' ? '登录并同步' : '创建账号'}
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all',
          user
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-cream-200 border-cream-300 hover:border-cream-400'
        )}
        title={user ? '账号已登录，云端同步开启' : '登录账号同步业务数据'}
      >
        {user ? <Cloud size={13} /> : <User size={13} />}
        <span className="hidden sm:inline">{user ? '已登录' : '账号'}</span>
      </button>
      {modal}
    </>
  );
}
