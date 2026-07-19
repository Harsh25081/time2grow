alter table public.social_posts
  add column if not exists delivery_claim_id uuid,
  add column if not exists delivery_claimed_at timestamptz;

create index if not exists social_posts_due_delivery_idx
  on public.social_posts(scheduled_at, id)
  where status = 'queued' and scheduled_at is not null;

create or replace function public.claim_due_social_posts(p_limit integer default 10)
returns table(post_id uuid, claim_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.publish_targets target
  set status = 'failed',
      error_message = coalesce(target.error_message, 'Delivery worker timed out; review before retrying.')
  from public.social_posts post
  where post.id = target.social_post_id
    and post.status = 'publishing'
    and post.delivery_claimed_at < now() - interval '20 minutes'
    and target.status = 'publishing';

  update public.social_posts
  set status = 'failed', delivery_claim_id = null, delivery_claimed_at = null
  where status = 'publishing'
    and delivery_claimed_at < now() - interval '20 minutes';

  return query
  with due as (
    select post.id
    from public.social_posts post
    where post.status = 'queued'
      and post.scheduled_at is not null
      and post.scheduled_at <= now()
    order by post.scheduled_at, post.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  ), claimed as (
    update public.social_posts post
    set status = 'publishing', delivery_claim_id = gen_random_uuid(), delivery_claimed_at = now()
    from due
    where post.id = due.id
    returning post.id, post.delivery_claim_id
  )
  select claimed.id, claimed.delivery_claim_id from claimed;
end;
$$;

revoke all on function public.claim_due_social_posts(integer) from public, anon, authenticated;
grant execute on function public.claim_due_social_posts(integer) to service_role;

comment on function public.claim_due_social_posts(integer) is
  'Atomically leases due queued social posts to the service-role scheduled delivery worker.';
