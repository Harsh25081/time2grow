alter table public.inbox_threads
  add column if not exists labels text[] not null default '{}'::text[],
  add column if not exists lead_detection jsonb not null default '{"detected": false, "confidence": 0}'::jsonb,
  add column if not exists last_ai_suggestions jsonb not null default '[]'::jsonb;

create index if not exists inbox_threads_org_assigned_to_idx
  on public.inbox_threads(org_id, assigned_to);

create index if not exists inbox_threads_labels_idx
  on public.inbox_threads using gin(labels);

create index if not exists inbox_threads_lead_detection_idx
  on public.inbox_threads using gin(lead_detection);

create table if not exists public.inbox_reply_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_business_dna_id uuid,
  title text not null,
  body text not null,
  channel text not null default 'any'
    check (channel in ('any', 'facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram', 'website', 'email', 'other')),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists inbox_reply_templates_set_updated_at on public.inbox_reply_templates;
create trigger inbox_reply_templates_set_updated_at
  before update on public.inbox_reply_templates
  for each row execute function public.set_updated_at();

create index if not exists inbox_reply_templates_org_status_idx
  on public.inbox_reply_templates(org_id, status, updated_at desc);

create index if not exists inbox_reply_templates_client_business_dna_idx
  on public.inbox_reply_templates(client_business_dna_id);

create unique index if not exists inbox_reply_templates_org_id_id_uidx
  on public.inbox_reply_templates(org_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inbox_reply_templates_same_org_client_dna_fk') then
    alter table public.inbox_reply_templates
      add constraint inbox_reply_templates_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null (client_business_dna_id) not valid;
  end if;
end $$;

alter table public.inbox_reply_templates enable row level security;

drop policy if exists "inbox_reply_templates_select_members" on public.inbox_reply_templates;
create policy "inbox_reply_templates_select_members"
  on public.inbox_reply_templates for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "inbox_reply_templates_write_editors" on public.inbox_reply_templates;
create policy "inbox_reply_templates_write_editors"
  on public.inbox_reply_templates for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
