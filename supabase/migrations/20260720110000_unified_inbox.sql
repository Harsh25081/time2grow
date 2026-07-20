create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_business_dna_id uuid,
  campaign_id uuid,
  lead_id uuid,
  distribution_handle_id uuid,
  channel text not null default 'other'
    check (channel in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram', 'website', 'email', 'other')),
  contact_name text not null,
  contact_email text,
  contact_phone text,
  external_thread_id text,
  status text not null default 'open'
    check (status in ('open', 'pending', 'replied', 'resolved', 'archived')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),
  last_message_preview text,
  last_message_at timestamptz not null default now(),
  assigned_to uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists inbox_threads_set_updated_at on public.inbox_threads;
create trigger inbox_threads_set_updated_at
  before update on public.inbox_threads
  for each row execute function public.set_updated_at();

create index if not exists inbox_threads_org_status_idx
  on public.inbox_threads(org_id, status);

create index if not exists inbox_threads_org_last_message_idx
  on public.inbox_threads(org_id, last_message_at desc);

create index if not exists inbox_threads_channel_idx
  on public.inbox_threads(channel);

create index if not exists inbox_threads_client_business_dna_idx
  on public.inbox_threads(client_business_dna_id);

create index if not exists inbox_threads_campaign_idx
  on public.inbox_threads(campaign_id);

create index if not exists inbox_threads_lead_idx
  on public.inbox_threads(lead_id);

create index if not exists inbox_threads_distribution_handle_idx
  on public.inbox_threads(distribution_handle_id);

create unique index if not exists inbox_threads_org_id_id_uidx
  on public.inbox_threads(org_id, id);

create unique index if not exists inbox_threads_external_thread_uidx
  on public.inbox_threads(org_id, channel, external_thread_id)
  where external_thread_id is not null;

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null,
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound', 'internal')),
  body text not null,
  sender_name text,
  sender_handle text,
  external_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inbox_messages_org_thread_idx
  on public.inbox_messages(org_id, thread_id, created_at);

create unique index if not exists inbox_messages_external_message_uidx
  on public.inbox_messages(org_id, thread_id, external_message_id)
  where external_message_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inbox_threads_same_org_client_dna_fk') then
    alter table public.inbox_threads
      add constraint inbox_threads_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null (client_business_dna_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inbox_threads_same_org_campaign_fk') then
    alter table public.inbox_threads
      add constraint inbox_threads_same_org_campaign_fk
      foreign key (org_id, campaign_id)
      references public.campaigns(org_id, id) on delete set null (campaign_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inbox_threads_same_org_lead_fk') then
    alter table public.inbox_threads
      add constraint inbox_threads_same_org_lead_fk
      foreign key (org_id, lead_id)
      references public.leads(org_id, id) on delete set null (lead_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inbox_threads_same_org_handle_fk') then
    alter table public.inbox_threads
      add constraint inbox_threads_same_org_handle_fk
      foreign key (org_id, distribution_handle_id)
      references public.distribution_handles(org_id, id) on delete set null (distribution_handle_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inbox_messages_same_org_thread_fk') then
    alter table public.inbox_messages
      add constraint inbox_messages_same_org_thread_fk
      foreign key (org_id, thread_id)
      references public.inbox_threads(org_id, id) on delete cascade not valid;
  end if;
end $$;

alter table public.inbox_threads enable row level security;
alter table public.inbox_messages enable row level security;

drop policy if exists "inbox_threads_select_members" on public.inbox_threads;
create policy "inbox_threads_select_members"
  on public.inbox_threads for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "inbox_threads_write_editors" on public.inbox_threads;
create policy "inbox_threads_write_editors"
  on public.inbox_threads for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "inbox_messages_select_members" on public.inbox_messages;
create policy "inbox_messages_select_members"
  on public.inbox_messages for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "inbox_messages_write_editors" on public.inbox_messages;
create policy "inbox_messages_write_editors"
  on public.inbox_messages for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
