create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_business_dna_id uuid,
  name text not null,
  industry text,
  website_url text,
  logo_url text,
  social_accounts jsonb not null default '{}'::jsonb,
  status text not null default 'monitoring'
    check (status in ('monitoring', 'paused', 'archived')),
  activity_score integer not null default 50
    check (activity_score between 0 and 100),
  trend text not null default 'stable'
    check (trend in ('growing', 'stable', 'declining', 'unknown')),
  google_rating numeric(3,2),
  running_ads boolean not null default false,
  refresh_schedule text not null default 'weekly'
    check (refresh_schedule in ('manual', 'daily', 'weekly', 'monthly')),
  website_snapshot jsonb not null default '{}'::jsonb,
  social_snapshot jsonb not null default '{}'::jsonb,
  content_snapshot jsonb not null default '{}'::jsonb,
  ads_snapshot jsonb not null default '{}'::jsonb,
  review_snapshot jsonb not null default '{}'::jsonb,
  offer_snapshot jsonb not null default '{}'::jsonb,
  seo_snapshot jsonb not null default '{}'::jsonb,
  analytics_snapshot jsonb not null default '{}'::jsonb,
  ai_insights jsonb not null default '{}'::jsonb,
  swot jsonb not null default '{}'::jsonb,
  why_winning jsonb not null default '{}'::jsonb,
  last_refreshed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists competitors_set_updated_at on public.competitors;
create trigger competitors_set_updated_at
  before update on public.competitors
  for each row execute function public.set_updated_at();

create index if not exists competitors_org_status_idx
  on public.competitors(org_id, status);

create index if not exists competitors_org_activity_idx
  on public.competitors(org_id, activity_score desc);

create index if not exists competitors_client_business_dna_idx
  on public.competitors(client_business_dna_id);

create unique index if not exists competitors_org_id_id_uidx
  on public.competitors(org_id, id);

create table if not exists public.competitor_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  competitor_id uuid not null,
  event_type text not null default 'insight'
    check (event_type in ('website', 'social', 'content', 'ads', 'reviews', 'offers', 'seo', 'analytics', 'alert', 'insight')),
  severity text not null default 'info'
    check (severity in ('info', 'opportunity', 'threat', 'alert')),
  title text not null,
  details text,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists competitor_events_org_event_at_idx
  on public.competitor_events(org_id, event_at desc);

create index if not exists competitor_events_competitor_idx
  on public.competitor_events(competitor_id, event_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'competitors_same_org_client_dna_fk') then
    alter table public.competitors
      add constraint competitors_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null (client_business_dna_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'competitor_events_same_org_competitor_fk') then
    alter table public.competitor_events
      add constraint competitor_events_same_org_competitor_fk
      foreign key (org_id, competitor_id)
      references public.competitors(org_id, id) on delete cascade not valid;
  end if;
end $$;

alter table public.competitors enable row level security;
alter table public.competitor_events enable row level security;

drop policy if exists "competitors_select_members" on public.competitors;
create policy "competitors_select_members"
  on public.competitors for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "competitors_write_editors" on public.competitors;
create policy "competitors_write_editors"
  on public.competitors for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "competitor_events_select_members" on public.competitor_events;
create policy "competitor_events_select_members"
  on public.competitor_events for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "competitor_events_write_editors" on public.competitor_events;
create policy "competitor_events_write_editors"
  on public.competitor_events for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
