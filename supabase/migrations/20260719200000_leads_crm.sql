create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_business_dna_id uuid,
  campaign_id uuid,
  full_name text not null,
  company text,
  email text,
  phone text,
  source text not null default 'manual'
    check (source in ('manual', 'website', 'social', 'ads', 'referral', 'whatsapp', 'campaign', 'event', 'other')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived')),
  lead_score integer not null default 0
    check (lead_score >= 0 and lead_score <= 100),
  estimated_value numeric(12, 2),
  next_follow_up_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create index if not exists leads_org_status_idx
  on public.leads(org_id, status);

create index if not exists leads_org_follow_up_idx
  on public.leads(org_id, next_follow_up_at);

create index if not exists leads_campaign_idx
  on public.leads(campaign_id);

create index if not exists leads_client_business_dna_idx
  on public.leads(client_business_dna_id);

create unique index if not exists leads_org_id_id_uidx
  on public.leads(org_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_same_org_client_dna_fk') then
    alter table public.leads
      add constraint leads_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null (client_business_dna_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'leads_same_org_campaign_fk') then
    alter table public.leads
      add constraint leads_same_org_campaign_fk
      foreign key (org_id, campaign_id)
      references public.campaigns(org_id, id) on delete set null (campaign_id) not valid;
  end if;
end $$;

alter table public.leads enable row level security;

drop policy if exists "leads_select_members" on public.leads;
create policy "leads_select_members"
  on public.leads for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "leads_write_editors" on public.leads;
create policy "leads_write_editors"
  on public.leads for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
