alter table public.business_dna
  add column if not exists contact_phone text,
  add column if not exists contact_email text;
