---
name: time2grow-table-rls
description: Create a new org-scoped Supabase table with standard RLS for time2grow (R1). Use whenever a new module needs its own table - one per module, not a shared catch-all.
---

# R1 - New org-owned table + RLS

time2grow is multi-tenant: every shared table is scoped to `org_id`, never to `user_id` alone. This is the exact pattern already used by `campaigns`, `content_items`, and `business_dna` - copy it, don't reinvent it.

## Inputs

- `{{TABLE}}` - snake_case plural table name, e.g. `leads`, `trend_ideas`.
- `{{COLUMNS}}` - the module-specific columns (types, defaults, checks). Do not include `id`, `org_id`, `created_by`, `created_at`, `updated_at` - those are always added by this recipe.
- `{{ROLES}}` - which membership roles can write (default `['owner', 'admin', 'editor']`; use `['owner', 'admin']` for anything security/credential-sensitive, matching `distribution_handles`).

## Steps

1. Create a new migration file at `supabase/migrations/{{YYYYMMDDHHMMSS}}_{{description}}.sql` (timestamp must sort after the latest existing migration - check `supabase/migrations/` first).
2. Use this exact shape:

```sql
create table if not exists public.{{TABLE}} (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  {{COLUMNS}},
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists {{TABLE}}_set_updated_at on public.{{TABLE}};
create trigger {{TABLE}}_set_updated_at
  before update on public.{{TABLE}}
  for each row execute function public.set_updated_at();

create index if not exists {{TABLE}}_org_idx on public.{{TABLE}}(org_id);

alter table public.{{TABLE}} enable row level security;

drop policy if exists "{{TABLE}}_select_members" on public.{{TABLE}};
create policy "{{TABLE}}_select_members"
  on public.{{TABLE}} for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "{{TABLE}}_write_editors" on public.{{TABLE}};
create policy "{{TABLE}}_write_editors"
  on public.{{TABLE}} for all
  to authenticated
  using (public.has_org_role(org_id, array{{ROLES}}))
  with check (public.has_org_role(org_id, array{{ROLES}}));
```

3. If the table should hold at most one row per org (a "profile" table like `business_dna`), add `unique (org_id)` inside the `create table` block and use `.upsert(payload, { onConflict: 'org_id' })` on the frontend instead of `.insert()`.
4. If the table stores tokens, credentials, or anything a user should never read directly (like `oauth_connections`, `provider_handle_credentials`), replace the two policies above with deny-all policies (`using (false)` / `with check (false)`) and only touch the table from an Edge Function's service-role client.
5. Add the matching `Row` / `Insert` / `Update` types to `apps/web/src/types/database.ts`, following the exact style already there (nullable columns as `| null`, optional on `Insert`/`Update` with `?`).

## Reference implementations already in this repo

- Standard org table with editor write access: `supabase/migrations/20260703125500_campaign_content_sources.sql` (`campaigns`, `content_items`).
- Singleton-per-org profile table: `supabase/migrations/20260705090000_business_dna.sql` (`business_dna`, `unique(org_id)`).
- Owner/admin-only write (sensitive): `supabase/migrations/20260703114500_social_distribution_core.sql` (`distribution_handles`).
- Deny-all, service-role-only table: `supabase/migrations/20260703160000_social_connection_status_and_credentials.sql` (`provider_handle_credentials`).
- The `is_org_member` / `has_org_role` / `set_updated_at` functions this all depends on: `supabase/migrations/20260703102000_initial_auth_workspaces.sql`.

## Verification

The table appears in Supabase's Table Editor with RLS enabled (green badge). As a smoke test: a signed-in user from Org A must get zero rows when querying a row that belongs to Org B.
