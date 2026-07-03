create table if not exists public.distribution_target_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

drop trigger if exists distribution_target_groups_set_updated_at on public.distribution_target_groups;
create trigger distribution_target_groups_set_updated_at
  before update on public.distribution_target_groups
  for each row execute function public.set_updated_at();

create table if not exists public.distribution_target_group_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  target_group_id uuid not null references public.distribution_target_groups(id) on delete cascade,
  distribution_handle_id uuid not null references public.distribution_handles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (target_group_id, distribution_handle_id)
);

create index if not exists distribution_target_groups_org_idx
  on public.distribution_target_groups(org_id);

create index if not exists distribution_target_group_members_group_idx
  on public.distribution_target_group_members(target_group_id);

create index if not exists distribution_target_group_members_handle_idx
  on public.distribution_target_group_members(distribution_handle_id);

alter table public.distribution_target_groups enable row level security;
alter table public.distribution_target_group_members enable row level security;

drop policy if exists "target_groups_select_members" on public.distribution_target_groups;
create policy "target_groups_select_members"
  on public.distribution_target_groups for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "target_groups_write_editors" on public.distribution_target_groups;
create policy "target_groups_write_editors"
  on public.distribution_target_groups for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "target_group_members_select_members" on public.distribution_target_group_members;
create policy "target_group_members_select_members"
  on public.distribution_target_group_members for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "target_group_members_write_editors" on public.distribution_target_group_members;
create policy "target_group_members_write_editors"
  on public.distribution_target_group_members for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));