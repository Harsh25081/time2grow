create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  display_name text not null,
  external_account_id text,
  status text not null default 'mock' check (status in ('mock', 'connected', 'expired', 'disabled', 'review_required')),
  scopes text[] not null default '{}',
  token_status text not null default 'not_connected' check (token_status in ('not_connected', 'active', 'refresh_required', 'revoked')),
  last_sync_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, external_account_id)
);

drop trigger if exists integration_accounts_set_updated_at on public.integration_accounts;
create trigger integration_accounts_set_updated_at
  before update on public.integration_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.distribution_handles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_account_id uuid references public.integration_accounts(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  handle_type text not null check (handle_type in ('facebook_page', 'instagram_business', 'linkedin_page', 'youtube_channel', 'google_ads_customer', 'whatsapp_phone_number', 'slack_channel', 'telegram_channel')),
  display_name text not null,
  external_handle_id text,
  is_enabled boolean not null default true,
  default_for_provider boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists distribution_handles_set_updated_at on public.distribution_handles;
create trigger distribution_handles_set_updated_at
  before update on public.distribution_handles
  for each row execute function public.set_updated_at();

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text,
  media_url text,
  status text not null default 'draft' check (status in ('draft', 'queued', 'publishing', 'published', 'partial_failed', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists social_posts_set_updated_at on public.social_posts;
create trigger social_posts_set_updated_at
  before update on public.social_posts
  for each row execute function public.set_updated_at();

create table if not exists public.publish_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  distribution_handle_id uuid references public.distribution_handles(id) on delete set null,
  provider text not null check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram')),
  target_label text not null,
  status text not null default 'queued' check (status in ('queued', 'publishing', 'published', 'failed', 'rate_limited', 'skipped')),
  external_post_id text,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists publish_targets_set_updated_at on public.publish_targets;
create trigger publish_targets_set_updated_at
  before update on public.publish_targets
  for each row execute function public.set_updated_at();

create table if not exists public.google_ads_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_account_id uuid references public.integration_accounts(id) on delete set null,
  customer_id text not null,
  campaign_name text not null,
  objective text not null default 'traffic',
  budget_micros bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'queued', 'enabled', 'paused', 'removed', 'failed')),
  external_campaign_id text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists google_ads_campaigns_set_updated_at on public.google_ads_campaigns;
create trigger google_ads_campaigns_set_updated_at
  before update on public.google_ads_campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  integration_account_id uuid references public.integration_accounts(id) on delete set null,
  template_name text not null,
  language_code text not null default 'en',
  category text not null default 'marketing',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'paused')),
  body text not null,
  external_template_id text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, template_name, language_code)
);

drop trigger if exists whatsapp_message_templates_set_updated_at on public.whatsapp_message_templates;
create trigger whatsapp_message_templates_set_updated_at
  before update on public.whatsapp_message_templates
  for each row execute function public.set_updated_at();

create index if not exists integration_accounts_org_provider_idx on public.integration_accounts(org_id, provider);
create index if not exists distribution_handles_org_provider_idx on public.distribution_handles(org_id, provider);
create index if not exists social_posts_org_status_idx on public.social_posts(org_id, status);
create index if not exists publish_targets_post_status_idx on public.publish_targets(social_post_id, status);
create index if not exists google_ads_campaigns_org_status_idx on public.google_ads_campaigns(org_id, status);
create index if not exists whatsapp_message_templates_org_status_idx on public.whatsapp_message_templates(org_id, status);

alter table public.integration_accounts enable row level security;
alter table public.distribution_handles enable row level security;
alter table public.social_posts enable row level security;
alter table public.publish_targets enable row level security;
alter table public.google_ads_campaigns enable row level security;
alter table public.whatsapp_message_templates enable row level security;

drop policy if exists "integration_accounts_select_members" on public.integration_accounts;
create policy "integration_accounts_select_members"
  on public.integration_accounts for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "integration_accounts_write_admins" on public.integration_accounts;
create policy "integration_accounts_write_admins"
  on public.integration_accounts for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']))
  with check (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "distribution_handles_select_members" on public.distribution_handles;
create policy "distribution_handles_select_members"
  on public.distribution_handles for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "distribution_handles_write_admins" on public.distribution_handles;
create policy "distribution_handles_write_admins"
  on public.distribution_handles for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']))
  with check (public.has_org_role(org_id, array['owner', 'admin']));

drop policy if exists "social_posts_select_members" on public.social_posts;
create policy "social_posts_select_members"
  on public.social_posts for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "social_posts_write_editors" on public.social_posts;
create policy "social_posts_write_editors"
  on public.social_posts for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "publish_targets_select_members" on public.publish_targets;
create policy "publish_targets_select_members"
  on public.publish_targets for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "publish_targets_write_editors" on public.publish_targets;
create policy "publish_targets_write_editors"
  on public.publish_targets for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "google_ads_campaigns_select_members" on public.google_ads_campaigns;
create policy "google_ads_campaigns_select_members"
  on public.google_ads_campaigns for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "google_ads_campaigns_write_editors" on public.google_ads_campaigns;
create policy "google_ads_campaigns_write_editors"
  on public.google_ads_campaigns for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));

drop policy if exists "whatsapp_templates_select_members" on public.whatsapp_message_templates;
create policy "whatsapp_templates_select_members"
  on public.whatsapp_message_templates for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "whatsapp_templates_write_editors" on public.whatsapp_message_templates;
create policy "whatsapp_templates_write_editors"
  on public.whatsapp_message_templates for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));