create table if not exists public.business_dna (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  website_url text,
  mission text,
  vision text,
  positioning text,
  values text,
  audience text,
  proof_points text,
  growth_goal text,
  key_metric text,
  brand_colors jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

drop trigger if exists business_dna_set_updated_at on public.business_dna;
create trigger business_dna_set_updated_at
  before update on public.business_dna
  for each row execute function public.set_updated_at();

create index if not exists business_dna_org_idx
  on public.business_dna(org_id);

alter table public.business_dna enable row level security;

drop policy if exists "business_dna_select_members" on public.business_dna;
create policy "business_dna_select_members"
  on public.business_dna for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "business_dna_write_editors" on public.business_dna;
create policy "business_dna_write_editors"
  on public.business_dna for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
