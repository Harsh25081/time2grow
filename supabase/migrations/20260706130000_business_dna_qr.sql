alter table public.business_dna
  add column if not exists qr_storage_bucket text,
  add column if not exists qr_storage_path text,
  add column if not exists qr_file_name text,
  add column if not exists qr_mime_type text,
  add column if not exists qr_size_bytes bigint,
  add column if not exists qr_alt_text text;
