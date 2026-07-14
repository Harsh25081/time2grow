alter table public.social_media_assets
  add column if not exists content_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_media_assets_content_item_id_fkey'
      and conrelid = 'public.social_media_assets'::regclass
  ) then
    alter table public.social_media_assets
      add constraint social_media_assets_content_item_id_fkey
      foreign key (content_item_id) references public.content_items(id) on delete set null;
  end if;
end;
$$;

create index if not exists social_media_assets_content_item_idx
  on public.social_media_assets(content_item_id);
