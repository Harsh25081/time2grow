---
name: time2grow-module-wrapper
description: Scaffold production-minded time2grow SaaS modules that combine Supabase schema, RLS, React screens, ai-handler actions, Social Hub handoff, cost controls, and launch-readiness checks. Use when starting a new major module such as Content Studio, Campaigns, Maya, Leads, Inbox, Analytics, Competitors, Trends, Poster Studio, Settings, or Billing.
---

# time2grow Module Wrapper

Use this skill when starting a complete time2grow module.

## Workflow

1. Identify the module's user workflow and downstream handoff before coding.
2. Check whether a table already exists. Reuse existing tables when they match the workflow.
3. If schema is needed, use `time2grow-table-rls` patterns first.
4. Build the React page with `time2grow-crud-screen` patterns.
5. If AI is needed, add one bounded `ai-handler` action with `time2grow-ai-action` patterns.
6. Save outputs into tables that other modules can consume. Example: Content Studio saves to `content_items`; Social Hub reads `content_items`.
7. Keep first release useful but narrow: create, save, list, and hand off before advanced automation.
8. Add minimal CSS that matches the quiet operational UI.
9. Verify with `npm run build:web`, deploy changed Edge Functions, and push migrations if added.
10. Update README/AUDIT only when status meaningfully changes.

## Done Criteria

- Route is wired in `AppShell.tsx`.
- Data saves to Supabase with RLS-compatible payloads.
- Loading, empty, success, and error states exist.
- AI actions are deployed if changed.
- GitHub is pushed after build and secret scan.

## Guardrails

- Do not call a module production-ready until tests, CI, monitoring, billing/limits, legal pages, and provider verification are handled.
- Do not build decorative landing pages for app modules.
- Do not strand generated data in local state when another module needs it.
