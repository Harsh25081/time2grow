-- Agency mode: per-client Business DNA. Parallel to business_dna but MANY rows
-- per org (one per client), each with a client name. The org's own business_dna
-- row and all its existing consumers are left untouched.
create table if not exists public.client_business_dna (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  website_url text,
  contact_phone text,
  contact_email text,
  mission text,
  vision text,
  positioning text,
  values text,
  audience text,
  proof_points text,
  growth_goal text,
  key_metric text,
  additional_notes text,
  brand_colors jsonb not null default '[]'::jsonb,
  logo_storage_bucket text,
  logo_storage_path text,
  logo_file_name text,
  logo_mime_type text,
  logo_size_bytes bigint,
  logo_alt_text text,
  qr_storage_bucket text,
  qr_storage_path text,
  qr_file_name text,
  qr_mime_type text,
  qr_size_bytes bigint,
  qr_alt_text text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists client_business_dna_set_updated_at on public.client_business_dna;
create trigger client_business_dna_set_updated_at
  before update on public.client_business_dna
  for each row execute function public.set_updated_at();

create index if not exists client_business_dna_org_idx
  on public.client_business_dna(org_id);

create index if not exists client_business_dna_logo_path_idx
  on public.client_business_dna(logo_storage_bucket, logo_storage_path)
  where logo_storage_path is not null;

alter table public.client_business_dna enable row level security;

drop policy if exists "client_business_dna_select_members" on public.client_business_dna;
create policy "client_business_dna_select_members"
  on public.client_business_dna for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "client_business_dna_write_editors" on public.client_business_dna;
create policy "client_business_dna_write_editors"
  on public.client_business_dna for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin', 'editor']))
  with check (public.has_org_role(org_id, array['owner', 'admin', 'editor']));
