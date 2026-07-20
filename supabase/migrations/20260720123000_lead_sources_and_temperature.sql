alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (source in (
    'manual',
    'website',
    'social',
    'ads',
    'referral',
    'referrals',
    'whatsapp',
    'instagram',
    'facebook',
    'google_forms',
    'imports',
    'comments',
    'dms',
    'campaign',
    'event',
    'other'
  ));

alter table public.leads
  add column if not exists lead_type text not null default 'warm'
    check (lead_type in ('hot', 'warm', 'cold'));

update public.leads
set lead_type = case
  when lead_score >= 70 then 'hot'
  when lead_score <= 34 then 'cold'
  else 'warm'
end
where lead_type = 'warm';

create index if not exists leads_org_lead_type_idx
  on public.leads(org_id, lead_type);
