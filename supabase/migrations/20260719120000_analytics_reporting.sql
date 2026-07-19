-- Unified marketing analytics: one org-scoped store that reporting data from every ad platform and
-- marketing source (Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, YouTube, Shopify, and 320+ more)
-- normalizes into, so the Analytics page can query spend/impressions/clicks/conversions/revenue in one
-- place regardless of which source it came from.

-- Per-org record of which sources are connected and their sync state. source_key is free text (not an
-- enum) because the connector registry has 320+ sources and grows over time.
create table if not exists public.analytics_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  display_name text not null,
  category text not null default 'other'
    check (category in ('ads', 'social', 'ecommerce', 'web', 'email', 'crm', 'other')),
  status text not null default 'disconnected'
    check (status in ('connected', 'syncing', 'disconnected', 'error')),
  external_account_id text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_key)
);

-- Normalized daily reporting fact row. Every source maps onto these shared columns so cross-source
-- totals and comparisons are a plain aggregation. One row per source + campaign + day.
create table if not exists public.analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  campaign text not null default 'All campaigns',
  metric_date date not null,
  spend numeric(14, 2) not null default 0 check (spend >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  conversions numeric(14, 2) not null default 0 check (conversions >= 0),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id, source_key, campaign, metric_date)
);

drop trigger if exists analytics_sources_set_updated_at on public.analytics_sources;
create trigger analytics_sources_set_updated_at
  before update on public.analytics_sources
  for each row execute function public.set_updated_at();

create index if not exists analytics_sources_org_status_idx
  on public.analytics_sources(org_id, status);

create index if not exists analytics_metrics_org_date_idx
  on public.analytics_metrics(org_id, metric_date desc);

create index if not exists analytics_metrics_org_source_idx
  on public.analytics_metrics(org_id, source_key);

alter table public.analytics_sources enable row level security;
alter table public.analytics_metrics enable row level security;

drop policy if exists "analytics_sources_select_members" on public.analytics_sources;
create policy "analytics_sources_select_members"
  on public.analytics_sources for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "analytics_sources_write_editors" on public.analytics_sources;
create policy "analytics_sources_write_editors"
  on public.analytics_sources for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "analytics_metrics_select_members" on public.analytics_metrics;
create policy "analytics_metrics_select_members"
  on public.analytics_metrics for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "analytics_metrics_write_editors" on public.analytics_metrics;
create policy "analytics_metrics_write_editors"
  on public.analytics_metrics for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
