-- Post-level performance insights and comment reply system.
--
-- Design:
--   * post_insights   - one row per publish_target (i.e. per post-per-platform). Holds the
--                        latest metrics snapshot. Rows are only ever written by the
--                        `social-insights` edge function (service role), never fetched
--                        automatically on a schedule - they refresh on demand when a user
--                        opens the analytics/insights view for a post.
--   * post_comments    - one row per comment thread on a published post, per platform,
--                        plus our own replies (direction = 'outbound'). Replies are sent
--                        through the `social-comment-reply` edge function, which posts to
--                        the provider's API and then records the result here.
--
-- Both tables are readable by any org member (select), but writes are restricted to the
-- service role only - the same pattern used for provider_handle_credentials - because all
-- writes must go through an edge function that talks to the real platform API first.

create table if not exists public.post_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  publish_target_id uuid not null references public.publish_targets(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  impressions bigint not null default 0 check (impressions >= 0),
  reach bigint not null default 0 check (reach >= 0),
  likes bigint not null default 0 check (likes >= 0),
  comments_count bigint not null default 0 check (comments_count >= 0),
  shares bigint not null default 0 check (shares >= 0),
  saves bigint not null default 0 check (saves >= 0),
  video_views bigint not null default 0 check (video_views >= 0),
  engagement_rate numeric(7, 4),
  raw_metrics jsonb not null default '{}'::jsonb,
  fetch_status text not null default 'idle' check (fetch_status in ('idle', 'fetching', 'ok', 'error')),
  fetch_error text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publish_target_id)
);

drop trigger if exists post_insights_set_updated_at on public.post_insights;
create trigger post_insights_set_updated_at
  before update on public.post_insights
  for each row execute function public.set_updated_at();

create index if not exists post_insights_org_post_idx
  on public.post_insights(org_id, social_post_id);

create index if not exists post_insights_org_target_idx
  on public.post_insights(org_id, publish_target_id);

alter table public.post_insights enable row level security;

drop policy if exists "post_insights_select_members" on public.post_insights;
create policy "post_insights_select_members"
  on public.post_insights for select
  to authenticated
  using (public.is_org_member(org_id));

-- No direct client writes: only the service-role edge function may insert/update, after it
-- has actually confirmed data with the platform's API.
drop policy if exists "post_insights_no_direct_write" on public.post_insights;
create policy "post_insights_no_direct_write"
  on public.post_insights for all
  to authenticated
  using (false)
  with check (false);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  publish_target_id uuid not null references public.publish_targets(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  external_comment_id text,
  parent_comment_id uuid references public.post_comments(id) on delete set null,
  external_parent_comment_id text,
  author_name text,
  author_handle text,
  author_avatar_url text,
  message text not null,
  like_count integer not null default 0 check (like_count >= 0),
  status text not null default 'received' check (status in ('received', 'sending', 'sent', 'failed')),
  error_message text,
  external_created_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists post_comments_set_updated_at on public.post_comments;
create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();

create index if not exists post_comments_org_post_idx
  on public.post_comments(org_id, social_post_id, created_at desc);

create index if not exists post_comments_org_target_idx
  on public.post_comments(org_id, publish_target_id, created_at desc);

create index if not exists post_comments_parent_idx
  on public.post_comments(parent_comment_id);

create unique index if not exists post_comments_external_uidx
  on public.post_comments(org_id, provider, external_comment_id)
  where external_comment_id is not null;

alter table public.post_comments enable row level security;

drop policy if exists "post_comments_select_members" on public.post_comments;
create policy "post_comments_select_members"
  on public.post_comments for select
  to authenticated
  using (public.is_org_member(org_id));

-- Same as post_insights: only the service-role edge functions write here (one fetches and
-- caches inbound platform comments, the other records the outcome of a reply attempt).
drop policy if exists "post_comments_no_direct_write" on public.post_comments;
create policy "post_comments_no_direct_write"
  on public.post_comments for all
  to authenticated
  using (false)
  with check (false);
