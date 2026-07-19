---
name: time2grow-crud-screen
description: Generate a time2grow feature page - form or list, org-scoped, wired into the nav (R2). Use after time2grow-table-rls has created the table this screen reads/writes.
---

# R2 - Feature page wired to an org-scoped table

Every real page in this app (`BusinessDnaPage`, `ConnectionsPage`, `SocialHubPage`) follows the same shape. Reuse it exactly rather than inventing new state/layout patterns - it keeps every module consistent and keeps the amount of hand-written code small.

## Inputs

- `{{ENTITY}}` - human name, e.g. "Lead", "Trend Idea".
- `{{TABLE}}` - the Supabase table from `time2grow-table-rls` (or an existing one).
- `{{ROUTE}}` - the URL path, e.g. `/leads`.
- `{{FIELDS}}` - the fields the form/list needs to show and edit.

## File layout

- New page component: `apps/web/src/features/{{feature-folder}}/{{Entity}}Page.tsx`.
- If the feature will grow into multiple pages that share types/constants/helpers (like `social-hub/shared.ts` is shared by `SocialHubPage.tsx` and `connections/ConnectionsPage.tsx`), put the shared code in a `shared.ts` inside the owning feature folder and import it from the other pages - don't duplicate types or helper functions across pages.

## Component shape (copy this structure)

1. `const { organization, user } = useAuth();` for the current org/user - every query filters `.eq('org_id', organization.id)`.
2. State: the form fields, plus `loading`, `saving` (or `queueing`/whatever verb fits), `message`, `error`. Use separate message/error pairs per independent action on the page (see `ConnectionsPage.tsx`'s `connectionMessage`/`connectionError` vs `formMessage`/`formError` - two independent flows, two independent message pairs).
3. `useEffect(() => { ... }, [organization?.id])` with an `active` flag to guard against setting state after unmount, fetching the row(s) needed on load.
4. Handlers wrap the Supabase call in try/catch, call the shared `errorMessage(error, fallback)` helper on failure (copy it into a new file if the feature doesn't already have one nearby - it is intentionally duplicated per-feature rather than pulled into a global util).
5. JSX: `<div className="page-stack">` > `<header className="page-header">` (eyebrow + h2 + a `status-pill`) > one or more `<section>`s. Reuse existing CSS classes rather than adding new ones: `.draft-panel` (card wrapper), `.draft-form` (2-col grid, `.draft-body-field` for full-width rows), `.primary-action` (submit buttons), `.form-message` (success/error/warning), `.icon-button` / `.icon-text-button` (icon-only and icon+label buttons), `.status-pill`. Only add new CSS when nothing existing fits - and when you do, follow the CSS variable palette in `apps/web/src/styles/global.css` (`--primary`, `--muted`, `--line`, etc.), never hardcode colors.

## Wiring into navigation

Both the desktop sidebar and the mobile bottom nav render from the same array - there's exactly one place to edit:

1. In `apps/web/src/app/AppShell.tsx`, add `{{ to: '{{ROUTE}}', label: '{{Entity}}', icon: SomeIcon }}` to the `primaryNav` array. Pick an icon from `lucide-react` (check it exists first, e.g. `find node_modules/lucide-react/dist/esm/icons -iname "somename*"`).
2. Add `<Route path="{{ROUTE}}" element={<{{Entity}}Page />} />` inside the `<Routes>` block, and import the component at the top of the file.
3. If the module previously showed as a `ModulePlaceholder` on the dashboard's `modules` array, flip its `status` to `'Live'`.

## Reference implementations already in this repo

- Single-record "profile" form with a dynamic repeatable sub-list: `apps/web/src/features/business-dna/BusinessDnaPage.tsx` (also shows the pattern for calling an `ai-handler` action from a page - see `time2grow-ai-action`).
- Two pages sharing one `shared.ts`: `apps/web/src/features/social-hub/shared.ts` used by `SocialHubPage.tsx` and `apps/web/src/features/connections/ConnectionsPage.tsx`.
- Grouped list with per-row actions (select, delete): the `handle-selector` section in either of the two files above.

## Verification

Run `npm run typecheck:web` (must be clean). Then load the page in a browser: confirm it appears in both the left sidebar and the mobile bottom nav (resize to a narrow viewport to check), and that create/read/update (and delete, if applicable) all round-trip through Supabase without a full page reload.
