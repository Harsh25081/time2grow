alter table public.leads
  add column if not exists external_source_key text,
  add column if not exists external_lead_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists leads_external_source_idx
  on public.leads(org_id, external_source_key);

create unique index if not exists leads_external_source_uidx
  on public.leads(org_id, external_source_key, external_lead_id);
