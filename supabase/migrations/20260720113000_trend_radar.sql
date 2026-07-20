create table if not exists public.trend_radar_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_business_dna_id uuid,
  campaign_id uuid,
  source text not null default 'manual'
    check (source in ('google_trends', 'instagram', 'youtube', 'linkedin', 'competitor', 'ai_opportunity', 'manual', 'other')),
  topic text not null,
  signal text,
  change_percent numeric(7, 2) not null default 0,
  confidence_score integer not null default 50
    check (confidence_score >= 0 and confidence_score <= 100),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'approved', 'campaign_generated', 'dismissed', 'archived')),
  recommended_campaign text,
  opportunity text,
  source_url text,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trend_radar_items_set_updated_at on public.trend_radar_items;
create trigger trend_radar_items_set_updated_at
  before update on public.trend_radar_items
  for each row execute function public.set_updated_at();

create index if not exists trend_radar_items_org_status_idx
  on public.trend_radar_items(org_id, status);

create index if not exists trend_radar_items_org_detected_idx
  on public.trend_radar_items(org_id, detected_at desc);

create index if not exists trend_radar_items_source_idx
  on public.trend_radar_items(source);

create index if not exists trend_radar_items_client_business_dna_idx
  on public.trend_radar_items(client_business_dna_id);

create index if not exists trend_radar_items_campaign_idx
  on public.trend_radar_items(campaign_id);

create unique index if not exists trend_radar_items_org_id_id_uidx
  on public.trend_radar_items(org_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trend_radar_same_org_client_dna_fk') then
    alter table public.trend_radar_items
      add constraint trend_radar_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null (client_business_dna_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'trend_radar_same_org_campaign_fk') then
    alter table public.trend_radar_items
      add constraint trend_radar_same_org_campaign_fk
      foreign key (org_id, campaign_id)
      references public.campaigns(org_id, id) on delete set null (campaign_id) not valid;
  end if;
end $$;

alter table public.trend_radar_items enable row level security;

drop policy if exists "trend_radar_items_select_members" on public.trend_radar_items;
create policy "trend_radar_items_select_members"
  on public.trend_radar_items for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "trend_radar_items_write_editors" on public.trend_radar_items;
create policy "trend_radar_items_write_editors"
  on public.trend_radar_items for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
