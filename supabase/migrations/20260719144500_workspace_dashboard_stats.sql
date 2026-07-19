create or replace function public.workspace_dashboard_stats(target_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  usage_today integer;
  handle_count integer;
  workspace_plan text;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if caller_id is null or not exists (
    select 1
    from public.organization_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = caller_id
      and membership.status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active workspace membership is required.';
  end if;

  select count(*)::integer into usage_today
  from public.ai_usage_log usage
  where usage.org_id = target_org_id
    and usage.created_at >= day_start;

  select count(*)::integer into handle_count
  from public.distribution_handles handle
  where handle.org_id = target_org_id
    and handle.is_enabled = true;

  select organization.plan_key into workspace_plan
  from public.organizations organization
  where organization.id = target_org_id;

  return jsonb_build_object(
    'aiUsageToday', usage_today,
    'distributionHandles', handle_count,
    'planKey', coalesce(workspace_plan, 'unknown')
  );
end;
$$;

revoke all on function public.workspace_dashboard_stats(uuid) from public;
grant execute on function public.workspace_dashboard_stats(uuid) to authenticated;