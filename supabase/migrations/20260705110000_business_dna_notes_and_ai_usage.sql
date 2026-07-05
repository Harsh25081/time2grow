alter table public.business_dna
  add column if not exists additional_notes text;

create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_org_created_idx
  on public.ai_usage_log(org_id, created_at);

alter table public.ai_usage_log enable row level security;

drop policy if exists "ai_usage_log_no_direct_select" on public.ai_usage_log;
create policy "ai_usage_log_no_direct_select"
  on public.ai_usage_log for select
  to authenticated
  using (false);

drop policy if exists "ai_usage_log_no_direct_write" on public.ai_usage_log;
create policy "ai_usage_log_no_direct_write"
  on public.ai_usage_log for all
  to authenticated
  using (false)
  with check (false);
