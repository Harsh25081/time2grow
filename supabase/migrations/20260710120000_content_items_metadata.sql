alter table public.content_items
  add column if not exists metadata jsonb;
