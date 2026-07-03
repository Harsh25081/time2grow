create extension if not exists "pgcrypto";

alter table public.oauth_connections
  alter column refresh_token_ciphertext drop not null;

create table if not exists public.social_oauth_states (
  state_token text primary key,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'slack')),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists social_oauth_states_expires_idx
  on public.social_oauth_states(expires_at);

alter table public.social_oauth_states enable row level security;

drop policy if exists "social_oauth_states_no_direct_select" on public.social_oauth_states;
create policy "social_oauth_states_no_direct_select"
  on public.social_oauth_states for select
  to authenticated
  using (false);

drop policy if exists "social_oauth_states_no_direct_write" on public.social_oauth_states;
create policy "social_oauth_states_no_direct_write"
  on public.social_oauth_states for all
  to authenticated
  using (false)
  with check (false);

create table if not exists public.provider_handle_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  distribution_handle_id uuid not null references public.distribution_handles(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text not null default 'Bearer',
  expires_at timestamptz,
  scopes text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (distribution_handle_id, provider)
);

drop trigger if exists provider_handle_credentials_set_updated_at on public.provider_handle_credentials;
create trigger provider_handle_credentials_set_updated_at
  before update on public.provider_handle_credentials
  for each row execute function public.set_updated_at();

create index if not exists provider_handle_credentials_org_provider_idx
  on public.provider_handle_credentials(org_id, provider);

alter table public.provider_handle_credentials enable row level security;

drop policy if exists "provider_handle_credentials_no_direct_select" on public.provider_handle_credentials;
create policy "provider_handle_credentials_no_direct_select"
  on public.provider_handle_credentials for select
  to authenticated
  using (false);

drop policy if exists "provider_handle_credentials_no_direct_write" on public.provider_handle_credentials;
create policy "provider_handle_credentials_no_direct_write"
  on public.provider_handle_credentials for all
  to authenticated
  using (false)
  with check (false);
