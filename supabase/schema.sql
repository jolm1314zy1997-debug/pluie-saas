-- QZT Lead System account + cloud sync schema
-- Run this once in Supabase SQL Editor, then configure Vercel env vars.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  search_results jsonb not null default '[]'::jsonb,
  enriched_leads jsonb not null default '[]'::jsonb,
  copy_customer jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_blocklist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  normalized_name text not null,
  scope text not null default 'all',
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name, scope)
);

-- Migration: 老版本只有 (user_id, normalized_name) 唯一约束，没有 scope 列。
-- 这里把它升级为按 scope（'web'/'map'/'all'）分桶。idempotent，可重复跑。
alter table public.lead_blocklist
  add column if not exists scope text not null default 'all';
alter table public.lead_blocklist
  drop constraint if exists lead_blocklist_user_id_normalized_name_key;
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
     where t.relname = 'lead_blocklist'
       and c.contype = 'u'
       and pg_get_constraintdef(c.oid) ilike '%scope%'
  ) then
    alter table public.lead_blocklist
      add constraint lead_blocklist_user_normalized_scope_unique
      unique (user_id, normalized_name, scope);
  end if;
end $$;

create table if not exists public.copy_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  customer_company text,
  customer_background text,
  objective text,
  versions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'whatsapp_extension',
  contact_label text,
  chat_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_blocklist_user_created
  on public.lead_blocklist (user_id, created_at desc);

create index if not exists idx_copy_drafts_user_created
  on public.copy_drafts (user_id, created_at desc);

create index if not exists idx_chat_imports_user_created
  on public.chat_imports (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_user_app_state_updated_at on public.user_app_state;
create trigger set_user_app_state_updated_at
before update on public.user_app_state
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;
alter table public.lead_blocklist enable row level security;
alter table public.copy_drafts enable row level security;
alter table public.chat_imports enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can manage own app state" on public.user_app_state;
create policy "Users can manage own app state"
on public.user_app_state for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own blocklist" on public.lead_blocklist;
create policy "Users can manage own blocklist"
on public.lead_blocklist for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own copy drafts" on public.copy_drafts;
create policy "Users can manage own copy drafts"
on public.copy_drafts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own chat imports" on public.chat_imports;
create policy "Users can manage own chat imports"
on public.chat_imports for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 物料库 Materials Library 改用 Cloudflare R2，不再需要 Supabase Storage 与表。
-- R2 配置见 supabase/materials-setup.md。
