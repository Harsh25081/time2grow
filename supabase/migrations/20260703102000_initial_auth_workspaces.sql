create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  persona text not null default 'creator'
    check (persona in ('creator', 'founder', 'coach', 'local_business', 'agency')),
  demo_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  org_type text not null default 'solo'
    check (org_type in ('solo', 'agency', 'company')),
  plan_key text not null default 'free',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'editor', 'viewer', 'billing_admin')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists organization_memberships_user_id_idx
  on public.organization_memberships(user_id);

create index if not exists organization_memberships_org_id_idx
  on public.organization_memberships(org_id);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'viewer'
    check (role in ('admin', 'editor', 'viewer', 'billing_admin')),
  token_hash text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create index if not exists organization_invitations_org_id_idx
  on public.organization_invitations(org_id);

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.is_org_creator(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = target_org_id
      and o.created_by = auth.uid()
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.is_org_creator(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.is_org_creator(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invitations enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "organizations_select_members" on public.organizations;
create policy "organizations_select_members"
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id) or auth.uid() = created_by);

drop policy if exists "organizations_insert_creator" on public.organizations;
create policy "organizations_insert_creator"
  on public.organizations for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "organizations_update_admins" on public.organizations;
create policy "organizations_update_admins"
  on public.organizations for update
  to authenticated
  using (public.has_org_role(id, array['owner', 'admin']))
  with check (public.has_org_role(id, array['owner', 'admin']));

drop policy if exists "organizations_delete_owner" on public.organizations;
create policy "organizations_delete_owner"
  on public.organizations for delete
  to authenticated
  using (public.has_org_role(id, array['owner']));

drop policy if exists "memberships_select_org_members" on public.organization_memberships;
create policy "memberships_select_org_members"
  on public.organization_memberships for select
  to authenticated
  using (public.is_org_member(org_id) or auth.uid() = user_id);

drop policy if exists "memberships_insert_self_or_admin" on public.organization_memberships;
create policy "memberships_insert_self_or_admin"
  on public.organization_memberships for insert
  to authenticated
  with check (
    (auth.uid() = user_id and public.is_org_creator(org_id))
    or public.has_org_role(org_id, array['owner', 'admin'])
  );

drop policy if exists "memberships_update_admins" on public.organization_memberships;
create policy "memberships_update_admins"
  on public.organization_memberships for update
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']))
  with check (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "memberships_delete_admins" on public.organization_memberships;
create policy "memberships_delete_admins"
  on public.organization_memberships for delete
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "invitations_select_admins" on public.organization_invitations;
create policy "invitations_select_admins"
  on public.organization_invitations for select
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "invitations_insert_admins" on public.organization_invitations;
create policy "invitations_insert_admins"
  on public.organization_invitations for insert
  to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "invitations_update_admins" on public.organization_invitations;
create policy "invitations_update_admins"
  on public.organization_invitations for update
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']))
  with check (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "invitations_delete_admins" on public.organization_invitations;
create policy "invitations_delete_admins"
  on public.organization_invitations for delete
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']));