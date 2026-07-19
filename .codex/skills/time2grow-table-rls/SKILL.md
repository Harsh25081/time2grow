---
name: time2grow-table-rls
description: Create or update time2grow Supabase Postgres tables, migrations, indexes, triggers, and row-level security policies for org-scoped SaaS data. Use when adding a new time2grow module table, modifying schema, fixing RLS, creating storage policies, or ensuring tenant-safe database access.
---

# time2grow Table RLS

Use this skill when adding or changing Supabase schema for time2grow.

## Workflow

1. Read existing migrations around the affected module and `apps/web/src/types/database.ts`.
2. Prefer additive migrations with `create table if not exists`, `alter table ... add column if not exists`, `create index if not exists`, and `drop policy if exists` before recreating policies.
3. Every user-owned table must include `id`, `org_id`, `created_by` where relevant, `created_at`, and `updated_at`.
4. Use `public.set_updated_at()` for update triggers when the table has `updated_at`.
5. Enable RLS on every new table.
6. Use the existing helper pattern:
   - Members can select: `public.is_org_member(org_id)`.
   - Owners/admins/editors can write: `public.has_org_role(org_id, array['owner', 'admin', 'editor'])`.
7. Add indexes for common filters, especially `(org_id, status)` and foreign keys.
8. Update `apps/web/src/types/database.ts` manually when no generated type command is available.
9. Run `supabase db push --linked --yes` only after migration review.
10. Run `npm run build:web` after type updates.

## Guardrails

- Never rely on client-submitted `org_id` alone for security; RLS must enforce org access.
- Do not expose OAuth tokens, credentials, or service secrets through select policies.
- Keep destructive migrations out unless the user explicitly approves data loss.
- Make migrations idempotent because this project has repeated cloud pushes.
