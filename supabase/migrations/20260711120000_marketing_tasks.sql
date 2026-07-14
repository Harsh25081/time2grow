create table if not exists public.marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  description text,
  task_type text not null default 'custom'
    check (task_type in ('publish_reel', 'launch_meta_ads', 'send_newsletter', 'review_google_ads', 'approve_campaign', 'custom')),
  checklist jsonb,
  brand_guidelines text,
  attachments jsonb,
  expected_outputs text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'in_review', 'approved', 'done', 'archived')),
  assignee uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists marketing_tasks_set_updated_at on public.marketing_tasks;
create trigger marketing_tasks_set_updated_at
  before update on public.marketing_tasks
  for each row execute function public.set_updated_at();

create index if not exists marketing_tasks_org_status_idx
  on public.marketing_tasks(org_id, status);

create index if not exists marketing_tasks_campaign_idx
  on public.marketing_tasks(campaign_id);

create index if not exists marketing_tasks_assignee_idx
  on public.marketing_tasks(assignee);

create index if not exists marketing_tasks_due_idx
  on public.marketing_tasks(due_at);

alter table public.marketing_tasks enable row level security;

drop policy if exists "marketing_tasks_select_members" on public.marketing_tasks;
create policy "marketing_tasks_select_members"
  on public.marketing_tasks for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "marketing_tasks_write_editors" on public.marketing_tasks;
create policy "marketing_tasks_write_editors"
  on public.marketing_tasks for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
