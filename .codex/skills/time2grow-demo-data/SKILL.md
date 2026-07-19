---
name: time2grow-demo-data
description: Create realistic time2grow demo data and seed migrations for org-scoped SaaS modules. Use when adding sample Business DNA, content items, campaigns, leads, handles, analytics rows, or demo records that must respect tenant boundaries and production-like constraints.
---

# time2grow Demo Data

Use this skill when adding sample data for development, demos, or onboarding.

## Workflow

1. Prefer SQL seed scripts or explicit migrations only when the user wants committed demo data.
2. Keep demo records org-scoped and tied to a known demo organization or seed variable.
3. Use realistic Indian SMB/creator examples when no domain is specified, but avoid real personal data.
4. Include enough data to exercise UI states: empty, draft, ready, queued, failed, and published when relevant.
5. For content, seed `content_items` records compatible with Social Hub.
6. For campaigns, seed objective and status values that match check constraints.
7. For provider handles, never seed real tokens; use non-publishable demo handles unless real OAuth exists.
8. Document any required seed order in comments inside the seed file.
9. Run build/type checks after updating types or fixtures.

## Guardrails

- Do not commit secrets, API keys, OAuth tokens, phone numbers, or private customer data.
- Do not make demo data look like verified performance claims.
- Do not weaken RLS just to make seed data easier.
