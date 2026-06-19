'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/lib/supabase';

interface AccountSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: User;
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: AccountSession | null;
  accessToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'qzt_account_session';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const accessToken = session?.access_token || null;

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as AccountSession;
        if (stored?.access_token && stored?.user) {
          setSession(stored);
          setUser(stored.user);
        }
      }
    } catch {}
    setLoading(false);
  }, [configured]);

  const persistSession = useCallback((nextSession: AccountSession | null) => {
    setSession(nextSession);
    setUser(nextSession?.user || null);
    try {
      if (nextSession) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {}
  }, []);

  const authRequest = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/account/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.detail || `账号服务错误 (${res.status})`);
    }
    return data;
  }, [accessToken]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const data = await authRequest({ action: 'signin', email, password });
      if (!data?.session?.access_token || !data?.user) {
        throw new Error('登录成功但未返回有效会话，请重试');
      }
      persistSession({ ...data.session, user: data.user });
    },
    [authRequest, persistSession]
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const data = await authRequest({ action: 'signup', email, password, displayName });
      if (data?.session?.access_token && data?.user) {
        persistSession({ ...data.session, user: data.user });
      }
    },
    [authRequest, persistSession]
  );

  const signOut = useCallback(async () => {
    persistSession(null);
  }, [persistSession]);

  const value = useMemo(
    () => ({
      configured,
      loading,
      user,
      session,
      accessToken,
      signIn,
      signUp,
      signOut,
    }),
    [configured, loading, user, session, accessToken, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
