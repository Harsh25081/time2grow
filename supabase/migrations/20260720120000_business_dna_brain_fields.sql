alter table public.business_dna
  add column if not exists brand_voice text,
  add column if not exists ideal_customer_profile text,
  add column if not exists products_services text,
  add column if not exists faqs text,
  add column if not exists pricing text,
  add column if not exists offers text,
  add column if not exists competitors text,
  add column if not exists brand_assets text,
  add column if not exists sales_scripts text,
  add column if not exists policies text,
  add column if not exists website_summary text,
  add column if not exists social_links text;

alter table public.client_business_dna
  add column if not exists brand_voice text,
  add column if not exists ideal_customer_profile text,
  add column if not exists products_services text,
  add column if not exists faqs text,
  add column if not exists pricing text,
  add column if not exists offers text,
  add column if not exists competitors text,
  add column if not exists brand_assets text,
  add column if not exists sales_scripts text,
  add column if not exists policies text,
  add column if not exists website_summary text,
  add column if not exists social_links text;
