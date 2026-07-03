create extension if not exists "pgcrypto";

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'standard' check (type in ('standard', 'influencer', 'ads', 'launch', 'evergreen')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  objective text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  content_type text not null default 'post' check (content_type in ('post', 'poster', 'video')),
  title text not null,
  body text,
  media_url text,
  status text not null default 'draft' check (status in ('draft', 'ready', 'queued', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_posts
  add column if not exists campaign_id uuid;

alter table public.social_posts
  add column if not exists content_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_posts_campaign_id_fkey'
      and conrelid = 'public.social_posts'::regclass
  ) then
    alter table public.social_posts
      add constraint social_posts_campaign_id_fkey
      foreign key (campaign_id) references public.campaigns(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_posts_content_item_id_fkey'
      and conrelid = 'public.social_posts'::regclass
  ) then
    alter table public.social_posts
      add constraint social_posts_content_item_id_fkey
      foreign key (content_item_id) references public.content_items(id) on delete set null;
  end if;
end $$;

create index if not exists campaigns_org_status_idx
  on public.campaigns(org_id, status);

create index if not exists content_items_org_status_idx
  on public.content_items(org_id, status);

create index if not exists content_items_campaign_idx
  on public.content_items(campaign_id);

create index if not exists social_posts_campaign_idx
  on public.social_posts(campaign_id);

create index if not exists social_posts_content_item_idx
  on public.social_posts(content_item_id);

alter table public.campaigns enable row level security;
alter table public.content_items enable row level security;

drop policy if exists "campaigns_select_members" on public.campaigns;
create policy "campaigns_select_members"
  on public.campaigns for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "campaigns_write_editors" on public.campaigns;
create policy "campaigns_write_editors"
  on public.campaigns for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "content_items_select_members" on public.content_items;
create policy "content_items_select_members"
  on public.content_items for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "content_items_write_editors" on public.content_items;
create policy "content_items_write_editors"
  on public.content_items for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

select pg_notify('pgrst', 'reload schema');
