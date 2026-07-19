---
name: time2grow-seed-demo-data
description: Add a "load demo data" / "reset demo data" pair for a module so a fresh workspace never looks empty (R4). Use for modules whose value only shows once there's data in them (Leads, Trends, Competitors, Inbox, Analytics).
---

# R4 - Seeded demo data, org-scoped

`profiles.demo_mode` already exists in the schema (`supabase/migrations/20260703102000_initial_auth_workspaces.sql`, defaults to `true`) but nothing populates or reads it yet - this recipe is what finally uses it. Unlike the original per-user blueprint sketch, seed rows in this app must be scoped to `org_id` (this project is multi-tenant, not per-user), so a "load demo data" action inserts rows tagged to the caller's current organization, not `auth.uid()` directly.

## Inputs

- `{{TABLE}}` - the table to seed (must already exist via `time2grow-table-rls`).
- `{{SEED_ROWS}}` - ~8-10 representative rows covering the realistic range of statuses/states the UI needs to demo well (see `seedHandles` in `apps/web/src/features/social-hub/shared.ts` for the level of variety expected - multiple providers, multiple statuses, believable labels).

## Steps

1. Add a `is_demo boolean not null default false` column to `{{TABLE}}` (via a small migration) so seeded rows can be told apart from real ones and cleanly deleted on reset.
2. Add a `load_demo_data` and `reset_demo_data` branch to a `demo-data` Edge Function (create it once, reuse for every module - don't make a new function per table), following the exact structure of `ai-handler` (`corsHeaders`, `getAuthenticatedUser`, `assertOrgRole`, `jsonResponse`/`errorResponse`) but without the AI/cost-cap plumbing, since this isn't an AI action.
   - `load_demo_data`: insert `{{SEED_ROWS}}` for the caller's `orgId` with `is_demo: true`, `created_by: userId`.
   - `reset_demo_data`: `delete from {{TABLE}} where org_id = :orgId and is_demo = true`.
3. On the frontend, gate the "Load demo data" / "Reset demo data" buttons behind `profile?.demo_mode` from `useAuth()`, and put them in Settings, not scattered per-page.
4. Seeded rows must still pass through the same RLS policies as real ones (`time2grow-table-rls` already handles this) - there is no special-cased demo bypass.

## Why this isn't built yet

No module currently needs it: Business DNA and Connections are meant to start empty and be filled in by the real user, and Social Hub already has its own local (non-persisted) seed fallback for when Supabase isn't configured at all (`seedHandles` in `social-hub/shared.ts`) rather than per-org demo rows. Build this recipe for the first module where an empty state would otherwise look broken - Leads, Trends, Competitors, and Inbox are the likely first candidates per the build blueprint.

## Verification

A fresh org with `demo_mode` on and zero real rows shows a populated, believable screen after "Load demo data"; "Reset demo data" removes exactly the seeded rows and nothing else (verify by adding one real row first, resetting, and confirming the real row survives).
