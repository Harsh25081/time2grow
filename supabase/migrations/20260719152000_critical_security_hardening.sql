-- Critical security hardening: owner-role protection, atomic AI quota reservations,
-- and same-workspace relational integrity. All changes are additive and idempotent.

-- Admins may manage non-owner memberships, but only owners may create, update,
-- or delete owner memberships. Workspace bootstrap remains able to create the
-- creator's first active owner membership.
drop policy if exists "memberships_insert_self_or_admin" on public.organization_memberships;
drop policy if exists "memberships_update_admins" on public.organization_memberships;
drop policy if exists "memberships_delete_admins" on public.organization_memberships;

create policy "memberships_insert_creator_or_managers"
  on public.organization_memberships for insert
  to authenticated
  with check (
    (
      auth.uid() = user_id
      and role = 'owner'
      and status = 'active'
      and public.is_org_creator(org_id)
    )
    or public.has_org_role(org_id, array['owner'])
    or (
      public.has_org_role(org_id, array['admin'])
      and role <> 'owner'
    )
  );

create policy "memberships_update_owner_or_admin_non_owner"
  on public.organization_memberships for update
  to authenticated
  using (
    public.has_org_role(org_id, array['owner'])
    or (
      public.has_org_role(org_id, array['admin'])
      and role <> 'owner'
    )
  )
  with check (
    public.has_org_role(org_id, array['owner'])
    or (
      public.has_org_role(org_id, array['admin'])
      and role <> 'owner'
    )
  );

create policy "memberships_delete_owner_or_admin_non_owner"
  on public.organization_memberships for delete
  to authenticated
  using (
    public.has_org_role(org_id, array['owner'])
    or (
      public.has_org_role(org_id, array['admin'])
      and role <> 'owner'
    )
  );

-- Reserve and log one AI action under a per-workspace transaction lock. The
-- function is callable only by service_role because the Edge Function has
-- already authenticated the user and bounded the configured limit.
create or replace function public.reserve_ai_usage(
  p_org_id uuid,
  p_user_id uuid,
  p_action text,
  p_daily_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  usage_count integer;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  bounded_limit integer := greatest(1, least(coalesce(p_daily_limit, 40), 1000));
begin
  if p_org_id is null or p_user_id is null or nullif(btrim(p_action), '') is null then
    raise exception using errcode = '22023', message = 'Invalid AI usage reservation.';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.org_id = p_org_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.role = any (array['owner', 'admin', 'editor'])
  ) then
    raise exception using errcode = '42501', message = 'An active write-capable membership is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-usage:' || p_org_id::text, 0));

  select count(*)::integer into usage_count
  from public.ai_usage_log usage
  where usage.org_id = p_org_id
    and usage.created_at >= day_start;

  if usage_count >= bounded_limit then
    raise exception using errcode = 'P0001', message = 'This workspace has reached its daily AI limit.';
  end if;

  insert into public.ai_usage_log (org_id, user_id, action)
  values (p_org_id, p_user_id, left(p_action, 120));

  return jsonb_build_object(
    'ok', true,
    'usedToday', usage_count + 1,
    'remainingToday', greatest(bounded_limit - usage_count - 1, 0)
  );
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, uuid, text, integer) to service_role;

comment on function public.reserve_ai_usage(uuid, uuid, text, integer) is
  'Atomically authorizes, caps, and logs one AI action for the service-role ai-handler.';

-- Composite unique indexes provide referenced keys for tenant-safe foreign keys.
create unique index if not exists integration_accounts_org_id_id_uidx on public.integration_accounts(org_id, id);
create unique index if not exists distribution_handles_org_id_id_uidx on public.distribution_handles(org_id, id);
create unique index if not exists social_posts_org_id_id_uidx on public.social_posts(org_id, id);
create unique index if not exists campaigns_org_id_id_uidx on public.campaigns(org_id, id);
create unique index if not exists content_items_org_id_id_uidx on public.content_items(org_id, id);
create unique index if not exists distribution_target_groups_org_id_id_uidx on public.distribution_target_groups(org_id, id);

-- NOT VALID protects every new or changed row immediately without deleting or
-- rewriting historical data. Validate these constraints after any legacy
-- mismatches have been reviewed and repaired.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distribution_handles_same_org_account_fk') then
    alter table public.distribution_handles
      add constraint distribution_handles_same_org_account_fk
      foreign key (org_id, integration_account_id)
      references public.integration_accounts(org_id, id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'publish_targets_same_org_post_fk') then
    alter table public.publish_targets
      add constraint publish_targets_same_org_post_fk
      foreign key (org_id, social_post_id)
      references public.social_posts(org_id, id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'publish_targets_same_org_handle_fk') then
    alter table public.publish_targets
      add constraint publish_targets_same_org_handle_fk
      foreign key (org_id, distribution_handle_id)
      references public.distribution_handles(org_id, id) on delete set null (distribution_handle_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'social_media_assets_same_org_post_fk') then
    alter table public.social_media_assets
      add constraint social_media_assets_same_org_post_fk
      foreign key (org_id, social_post_id)
      references public.social_posts(org_id, id) on delete set null (social_post_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'google_ads_campaigns_same_org_account_fk') then
    alter table public.google_ads_campaigns
      add constraint google_ads_campaigns_same_org_account_fk
      foreign key (org_id, integration_account_id)
      references public.integration_accounts(org_id, id) on delete set null (integration_account_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'whatsapp_templates_same_org_account_fk') then
    alter table public.whatsapp_message_templates
      add constraint whatsapp_templates_same_org_account_fk
      foreign key (org_id, integration_account_id)
      references public.integration_accounts(org_id, id) on delete set null (integration_account_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_items_same_org_campaign_fk') then
    alter table public.content_items
      add constraint content_items_same_org_campaign_fk
      foreign key (org_id, campaign_id)
      references public.campaigns(org_id, id) on delete set null (campaign_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'social_posts_same_org_campaign_fk') then
    alter table public.social_posts
      add constraint social_posts_same_org_campaign_fk
      foreign key (org_id, campaign_id)
      references public.campaigns(org_id, id) on delete set null (campaign_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'social_posts_same_org_content_item_fk') then
    alter table public.social_posts
      add constraint social_posts_same_org_content_item_fk
      foreign key (org_id, content_item_id)
      references public.content_items(org_id, id) on delete set null (content_item_id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'target_group_members_same_org_group_fk') then
    alter table public.distribution_target_group_members
      add constraint target_group_members_same_org_group_fk
      foreign key (org_id, target_group_id)
      references public.distribution_target_groups(org_id, id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'target_group_members_same_org_handle_fk') then
    alter table public.distribution_target_group_members
      add constraint target_group_members_same_org_handle_fk
      foreign key (org_id, distribution_handle_id)
      references public.distribution_handles(org_id, id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'oauth_connections_same_org_account_fk') then
    alter table public.oauth_connections
      add constraint oauth_connections_same_org_account_fk
      foreign key (org_id, integration_account_id)
      references public.integration_accounts(org_id, id) on delete cascade not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_credentials_same_org_handle_fk') then
    alter table public.provider_handle_credentials
      add constraint provider_credentials_same_org_handle_fk
      foreign key (org_id, distribution_handle_id)
      references public.distribution_handles(org_id, id) on delete cascade not valid;
  end if;
end;
$$;
