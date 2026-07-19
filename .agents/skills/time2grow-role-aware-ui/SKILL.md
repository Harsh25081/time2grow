---
name: time2grow-role-aware-ui
description: Gate a page's write actions (add/edit/delete buttons) to the roles that can actually use them (R5). Use whenever a new screen has any button behind a role-restricted RLS policy from time2grow-table-rls.
---

# R5 - Role-aware UI wrapper

The original build blueprint called this a "persona-aware wrapper" (persona switching sidebar/content-type UI). That was never built - this app went straight to real multi-tenant orgs with role-based membership instead of persona switching, so this recipe is adapted to what's actually here: gating UI by **membership role**, not persona.

Today, `membership?.role` is fetched by `useAuth()` on every page but is only ever *displayed* (`AppShell.tsx`'s sidebar footer) - no page hides or disables an action based on it yet. Every write action is currently protected by RLS alone, which is safe but means a `viewer` can click "Add handle" or "Delete" and only find out it's blocked after a round-trip error. This recipe closes that gap for every new module going forward.

## The rule

Whatever roles a table's `..._write_editors` (or `..._write_admins`) RLS policy allows (`time2grow-table-rls` step 2), the UI must hide or disable the matching buttons for anyone outside those roles. Front-end hiding is convenience, not security - RLS remains the actual enforcement (per `time2grow-full-saas.config.json`'s `"front_end_hides_unavailable_actions" + "database_rls_enforces_final_access"` pair) - never skip the RLS policy because the UI already hides the button.

## Steps

1. Read the target table's RLS write policy to know the exact allowed roles array (e.g. `['owner', 'admin', 'editor']` for most tables, `['owner', 'admin']` for `distribution_handles`-style sensitive ones).
2. In the page component: `const { membership } = useAuth();` and derive `const canWrite = membership?.role ? allowedRoles.includes(membership.role) : false;`.
3. Wrap every write control (add/edit/delete buttons, the whole form) with `canWrite` - either don't render it, or render it `disabled` with a short explanatory label (e.g. "Ask an admin to make changes here") so viewers understand why, rather than a control that silently does nothing.
4. Read-only rendering (the list/table itself) stays visible to every role covered by the table's `..._select_members` policy - only the write affordances are gated.

## Reference

No page does this yet - this recipe exists to establish the pattern for the next one that has a role-restricted write action. When you build it for the first time, add the concrete file here as the reference example for future skill invocations.

## Verification

Sign in as a `viewer`-role member (or temporarily downgrade a test membership's role in `organization_memberships`) and confirm the gated controls are hidden/disabled, while the same page still loads correctly for `owner`/`admin`/`editor`. Then confirm the RLS policy independently blocks the same action via a direct API call, even if the UI check were somehow bypassed.
