-- Agency client context: link operational records to a selected client Business DNA.
-- Null means the workspace's own Business DNA/self brand.

create unique index if not exists client_business_dna_org_id_id_uidx
  on public.client_business_dna(org_id, id);

alter table public.campaigns
  add column if not exists client_business_dna_id uuid;

alter table public.content_items
  add column if not exists client_business_dna_id uuid;

alter table public.marketing_tasks
  add column if not exists client_business_dna_id uuid;

alter table public.social_posts
  add column if not exists client_business_dna_id uuid;

alter table public.analytics_metrics
  add column if not exists client_business_dna_id uuid;

create index if not exists campaigns_client_business_dna_idx
  on public.campaigns(client_business_dna_id);

create index if not exists content_items_client_business_dna_idx
  on public.content_items(client_business_dna_id);

create index if not exists marketing_tasks_client_business_dna_idx
  on public.marketing_tasks(client_business_dna_id);

create index if not exists social_posts_client_business_dna_idx
  on public.social_posts(client_business_dna_id);

create index if not exists analytics_metrics_client_business_dna_idx
  on public.analytics_metrics(client_business_dna_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_same_org_client_dna_fk') then
    alter table public.campaigns
      add constraint campaigns_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_items_same_org_client_dna_fk') then
    alter table public.content_items
      add constraint content_items_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'marketing_tasks_same_org_client_dna_fk') then
    alter table public.marketing_tasks
      add constraint marketing_tasks_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'social_posts_same_org_client_dna_fk') then
    alter table public.social_posts
      add constraint social_posts_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'analytics_metrics_same_org_client_dna_fk') then
    alter table public.analytics_metrics
      add constraint analytics_metrics_same_org_client_dna_fk
      foreign key (org_id, client_business_dna_id)
      references public.client_business_dna(org_id, id) on delete set null not valid;
  end if;
end $$;
