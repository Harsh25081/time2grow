create extension if not exists "pgcrypto";

create table if not exists public.oauth_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_account_id uuid references public.integration_accounts(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  access_token_ciphertext text,
  refresh_token_ciphertext text not null,
  token_type text not null default 'Bearer',
  expires_at timestamptz,
  scopes text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

drop trigger if exists oauth_connections_set_updated_at on public.oauth_connections;
create trigger oauth_connections_set_updated_at
  before update on public.oauth_connections
  for each row execute function public.set_updated_at();

create index if not exists oauth_connections_org_provider_idx
  on public.oauth_connections(org_id, provider);

create table if not exists public.youtube_oauth_states (
  state_token text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists youtube_oauth_states_expires_idx
  on public.youtube_oauth_states(expires_at);

alter table public.oauth_connections enable row level security;
alter table public.youtube_oauth_states enable row level security;

drop policy if exists "oauth_connections_no_direct_select" on public.oauth_connections;
create policy "oauth_connections_no_direct_select"
  on public.oauth_connections for select
  to authenticated
  using (false);

drop policy if exists "oauth_connections_no_direct_write" on public.oauth_connections;
create policy "oauth_connections_no_direct_write"
  on public.oauth_connections for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists "youtube_oauth_states_no_direct_select" on public.youtube_oauth_states;
create policy "youtube_oauth_states_no_direct_select"
  on public.youtube_oauth_states for select
  to authenticated
  using (false);

drop policy if exists "youtube_oauth_states_no_direct_write" on public.youtube_oauth_states;
create policy "youtube_oauth_states_no_direct_write"
  on public.youtube_oauth_states for all
  to authenticated
  using (false)
  with check (false);
