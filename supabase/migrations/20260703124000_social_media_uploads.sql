create extension if not exists "pgcrypto";

alter table public.social_posts
  add column if not exists content_type text not null default 'post';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_posts_content_type_check'
      and conrelid = 'public.social_posts'::regclass
  ) then
    alter table public.social_posts
      add constraint social_posts_content_type_check
      check (content_type in ('post', 'poster', 'video'));
  end if;
end;
$$;

create table if not exists public.social_media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  social_post_id uuid references public.social_posts(id) on delete set null,
  media_type text not null check (media_type in ('poster', 'video', 'image', 'document')),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_bucket text not null default 'post-media',
  storage_path text not null,
  external_url text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

drop trigger if exists social_media_assets_set_updated_at on public.social_media_assets;
create trigger social_media_assets_set_updated_at
  before update on public.social_media_assets
  for each row execute function public.set_updated_at();

create index if not exists social_media_assets_org_idx
  on public.social_media_assets(org_id);

create index if not exists social_media_assets_post_idx
  on public.social_media_assets(social_post_id);

alter table public.social_media_assets enable row level security;

drop policy if exists "social_media_assets_select_members" on public.social_media_assets;
create policy "social_media_assets_select_members"
  on public.social_media_assets for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "social_media_assets_write_editors" on public.social_media_assets;
create policy "social_media_assets_write_editors"
  on public.social_media_assets for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_object_org_id(object_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.storage_object_org_id(text) from public;
grant execute on function public.storage_object_org_id(text) to authenticated;

drop policy if exists "post_media_select_org_members" on storage.objects;
create policy "post_media_select_org_members"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'post-media'
    and public.is_org_member(public.storage_object_org_id(name))
  );

drop policy if exists "post_media_insert_editors" on storage.objects;
create policy "post_media_insert_editors"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and public.has_org_role(public.storage_object_org_id(name), array['owner', 'admin', 'editor'])
  );

drop policy if exists "post_media_update_editors" on storage.objects;
create policy "post_media_update_editors"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and public.has_org_role(public.storage_object_org_id(name), array['owner', 'admin', 'editor'])
  )
  with check (
    bucket_id = 'post-media'
    and public.has_org_role(public.storage_object_org_id(name), array['owner', 'admin', 'editor'])
  );

drop policy if exists "post_media_delete_editors" on storage.objects;
create policy "post_media_delete_editors"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and public.has_org_role(public.storage_object_org_id(name), array['owner', 'admin', 'editor'])
  );