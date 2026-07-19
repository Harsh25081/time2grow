---
name: time2grow-crud-screen
description: Build time2grow React/Vite CRUD screens backed by Supabase tables. Use when creating module pages for content, campaigns, leads, inbox, settings, analytics inputs, or any screen that lists, creates, edits, saves, archives, or routes records into another time2grow workflow.
---

# time2grow CRUD Screen

Use this skill when building a real time2grow page over a Supabase table.

## Workflow

1. Read `AppShell.tsx`, the target table type in `apps/web/src/types/database.ts`, and one nearby feature page.
2. Add the page under `apps/web/src/features/<module>/` and wire the route in `AppShell.tsx`.
3. Use `useAuth()` for `organization` and `user`; never proceed with writes without both IDs.
4. Load org-scoped rows with `.eq('org_id', organization.id)` and deterministic ordering.
5. Insert/update using the typed Supabase client and the smallest necessary payload.
6. Show loading, empty, success, and error states.
7. Keep the UI quiet and operational: compact sections, clear labels, no marketing hero.
8. Reuse existing classes such as `page-stack`, `page-header`, `draft-panel`, `draft-form`, `status-pill`, `form-message`, and `icon-text-button` before adding new CSS.
9. Add new CSS only for layout or repeated controls that existing styles cannot cover.
10. Run `npm run build:web` before finishing.

## Guardrails

- Do not invent client-only mock data for a real module unless the user explicitly asks.
- Do not bypass RLS from the browser.
- Keep records compatible with downstream modules. For Content Studio, save into `content_items` so Social Hub can select the item.
- Avoid nested cards and large explanatory copy inside the app UI.
