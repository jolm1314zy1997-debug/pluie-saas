'use client';

import type { AppState, EnrichedLead, SearchResult } from '@/context/AppContext';

export interface CloudAppState {
  searchResults: SearchResult[];
  enrichedLeads: EnrichedLead[];
  copyCustomer: AppState['copyCustomer'];
}

export interface CopyDraftRecord {
  mode: string;
  channel: 'email' | 'whatsapp';
  customerCompany?: string;
  customerBackground?: string;
  objective?: string;
  versions: Array<{ version: string; content: string }>;
}

export async function loadCloudAppState(accessToken: string) {
  const data = await cloudRequest(accessToken, { action: 'loadAppState' });
  if (!data.exists) return null;

  return {
    searchResults: Array.isArray(data.searchResults) ? data.searchResults : [],
    enrichedLeads: Array.isArray(data.enrichedLeads) ? data.enrichedLeads : [],
    copyCustomer: data.copyCustomer || null,
  } satisfies CloudAppState;
}

export async function saveCloudAppState(accessToken: string, state: CloudAppState) {
  await cloudRequest(accessToken, { action: 'saveAppState', state });
}

export async function loadCloudBlocklist(accessToken: string) {
  const data = await cloudRequest(accessToken, { action: 'loadBlocklist' });
  return Array.isArray(data.names) ? data.names : [];
}

export async function saveCloudBlocklist(accessToken: string, names: string[]) {
  await cloudRequest(accessToken, { action: 'saveBlocklist', names });
}

export async function saveCopyDraft(accessToken: string | null, draft: CopyDraftRecord) {
  if (!accessToken || draft.versions.length === 0) return;
  await cloudRequest(accessToken, { action: 'saveCopyDraft', draft });
}

export async function saveChatImport(
  accessToken: string | null,
  payload: { source: string; contactLabel?: string; chatText: string }
) {
  if (!accessToken || !payload.chatText.trim()) return;
  await cloudRequest(accessToken, { action: 'saveChatImport', payload });
}

async function cloudRequest(accessToken: string, payload: Record<string, unknown>) {
  const res = await fetch('/api/account/cloud', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || `云端同步服务错误 (${res.status})`);
  }
  return data;
}
