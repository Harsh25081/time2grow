create or replace function public.reserve_poster_generation(
  target_org_id uuid,
  requested_units integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  daily_limit constant integer := 40;
  burst_limit constant integer := 8;
  used_today integer;
  used_recently integer;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if caller_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required for poster generation.';
  end if;
  if target_org_id is null then
    raise exception using
      errcode = '22023',
      message = 'A workspace is required for poster generation.';
  end if;
  if requested_units < 1 or requested_units > 7 then
    raise exception using
      errcode = '22023',
      message = 'Invalid poster generation usage reservation.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('poster:' || target_org_id::text, 0));

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = caller_id
      and membership.status = 'active'
      and membership.role = any (array['owner', 'admin', 'editor'])
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active owner, admin, or editor membership is required for poster generation.';
  end if;

  select count(*)::integer into used_today
  from public.ai_usage_log usage
  where usage.org_id = target_org_id
    and usage.created_at >= day_start;

  if used_today + requested_units > daily_limit then
    raise exception using
      errcode = 'P0001',
      message = 'Daily poster generation limit reached. Try again tomorrow.';
  end if;

  select count(*)::integer into used_recently
  from public.ai_usage_log usage
  where usage.org_id = target_org_id
    and usage.user_id = caller_id
    and usage.action like 'poster_generation:%'
    and usage.created_at >= now() - interval '1 minute';

  if used_recently + requested_units > burst_limit then
    raise exception using
      errcode = 'P0001',
      message = 'Too many poster generation requests. Wait a minute and try again.';
  end if;

  insert into public.ai_usage_log (org_id, user_id, action)
  select
    target_org_id,
    caller_id,
    case when unit_number = 1 then 'poster_generation:plan' else 'poster_generation:render' end
  from generate_series(1, requested_units) as unit_number;

  return jsonb_build_object(
    'ok', true,
    'reservedUnits', requested_units,
    'usedToday', used_today + requested_units,
    'remainingToday', greatest(daily_limit - used_today - requested_units, 0)
  );
end;
$$;

revoke all on function public.reserve_poster_generation(uuid, integer) from public;
grant execute on function public.reserve_poster_generation(uuid, integer) to authenticated;