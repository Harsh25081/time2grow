alter table public.business_dna
  add column if not exists logo_storage_bucket text,
  add column if not exists logo_storage_path text,
  add column if not exists logo_file_name text,
  add column if not exists logo_mime_type text,
  add column if not exists logo_size_bytes bigint,
  add column if not exists logo_alt_text text;

create index if not exists business_dna_logo_path_idx
  on public.business_dna(logo_storage_bucket, logo_storage_path)
  where logo_storage_path is not null;
