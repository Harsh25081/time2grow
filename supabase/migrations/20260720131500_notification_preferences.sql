create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  inbox_mentions boolean not null default true,
  lead_alerts boolean not null default true,
  campaign_updates boolean not null default true,
  competitor_alerts boolean not null default true,
  trend_alerts boolean not null default true,
  weekly_digest boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create index if not exists notification_preferences_org_user_idx
  on public.notification_preferences(org_id, user_id);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_members" on public.notification_preferences;
create policy "notification_preferences_select_members"
  on public.notification_preferences for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "notification_preferences_write_own" on public.notification_preferences;
create policy "notification_preferences_write_own"
  on public.notification_preferences for all
  to authenticated
  using (auth.uid() = user_id and public.is_org_member(org_id))
  with check (auth.uid() = user_id and public.is_org_member(org_id));
