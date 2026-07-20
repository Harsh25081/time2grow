# time2grow Product Vision

## Mission

time2grow started as a way to **generate** marketing assets — Business DNA, posts, video scripts,
posters, social publishing. The product objective is now larger: **run marketing work end to end, not
just generate assets.** A business or agency should be able to plan the work, do it against a
standard operating procedure, have AI verify the quality of what was produced, run it on a recurring
cadence, and watch the whole operation from one executive view.

This document holds the product objective and roadmap. Setup and run instructions stay in
[README.md](../README.md); SaaS-readiness (tenancy, billing, security) stays in
`time2grow-full-saas.config.json`.

## Maya

Maya is the AI Growth Partner that understands the Business DNA and helps users across every module.
Inside the app, Maya works as a workspace-aware chatbot that can answer questions, give executive
briefings, and produce insights from the available org-scoped data across campaigns, content, leads,
inbox, analytics, trends, competitors, scheduling, and connected sources.

Capabilities:

- Strategy
- Campaign Planning
- Content Creation
- Poster Suggestions
- Lead Intelligence
- Competitor Analysis
- Analytics
- Scheduling
- Executive Briefings

Maya is one of time2grow's biggest differentiators because she turns the product from a set of tools
into an AI Growth Workspace that can explain what is happening and recommend what to do next.

## Growth Loop

The product workflow is proactive, not reactive. time2grow should guide users through this loop:

1. Business DNA
2. Trend Radar
3. Campaigns
4. Content Studio / Poster Studio
5. Distribution Hub
6. Unified Inbox
7. Leads CRM
8. Analytics
9. Maya Recommendations
10. Improve & Repeat

Trend Radar moves the system upstream: Maya can spot market signals before a user manually decides
what to promote. Analytics and Inbox outcomes then feed the next recommendations, so each cycle gets
smarter.

## The five operations pillars

### 1. AI Proof Verification
Verify the *quality* of what was delivered, not just that something was produced. Instead of
verifying cleaning photos (the earlier framing), time2grow verifies marketing deliverables:

- Poster quality
- Social media creatives
- Ad copy
- Video deliverables
- Campaign assets

### 2. SOP-Based Marketing Tasks
Repeatable marketing tasks, each driven by a standard operating procedure. Examples:

- Publish Instagram Reel
- Launch Meta Ads
- Send Newsletter
- Review Google Ads
- Approve Campaign

Each task can carry: a **checklist**, **brand guidelines**, **attachments**, and **expected outputs**.

### 3. Recurring Marketing Operations
The work that repeats on a cadence:

- Daily content publishing
- Weekly analytics review
- Monthly SEO audit
- Client reporting
- Competitor monitoring

### 4. AI Review Layer
The automated engine behind pillar 1. AI checks a delivered asset for:

- Brand colors
- Logo usage
- Image dimensions
- Spelling
- CTA presence
- Campaign completeness

### 5. Executive Dashboard
One operational view across the workspace and its clients:

- Campaign health
- Team productivity
- Client-wise completion
- Delayed approvals
- AI quality score
- ROI

## Where we are today

Live pages: Business DNA, Analytics, Campaigns, Content Studio, Poster AI, Social Hub, Tasks, and
Settings / Connections. Campaigns is the main operating tree; Content, AI Posters, Social, and Tasks
sit under it. Connections is workspace configuration under Settings. The Home dashboard has early
live stats, and Analytics is now a main tree with Overview and Reporting Data subsections. Reporting
Data registers Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, YouTube, and Shopify as normalized
marketing sources so their rows can land in one queryable analytics store. Leads / Inbox / Settings
overview are stubs; competitors, maya, and trends are empty folders.

Existing org-scoped tables (RLS via `is_org_member` / `has_org_role`): profiles, organizations,
memberships, invitations, business_dna, client_business_dna, campaigns, content_items, social_posts,
publish_targets, social_media_assets, analytics_sources, analytics_metrics, integration/oauth
tables, ai_usage_log.

| Pillar | Today | Gap |
|---|---|---|
| 1 AI Proof Verification | Poster QA lives only inside generation prompts | No post-hoc verification of a saved asset |
| 2 SOP Tasks | none — `campaigns` groups content, not tasks | Tasks table + UI |
| 3 Recurring Ops | `social_posts.scheduled_at` is one-shot | No recurrence engine |
| 4 AI Review Layer | `review_asset` v1 checks saved content/posters against Business DNA and stores the result in `content_items.metadata.review` | Needs review history, task attachment, and richer image/dimension evidence |
| 5 Executive Dashboard | placeholder stat tiles | Real metrics, dependent on 2-4 producing data |

Implementation note: AI proof verification, SOP Tasks, and the executive view have moved forward
since the original table was written. `review_asset` v1, `marketing_tasks`, the Tasks UI, Analytics
Overview, and Analytics Reporting Data are now live; the remaining gaps are review history, task
attachment, recurrence materialization, provider sync execution, richer charts, and provider-backed
ROI confidence.

## Roadmap

The five pillars are one connected system, and **SOP Tasks (pillar 2) is the spine**: recurrence
(pillar 3) is a property of a task, approvals (pillar 5) are a task status, and a verification run
(pillars 1 and 4) attaches to a task's asset. So the build order starts there.

- **Phase 1 — SOP Marketing Tasks foundation.** A `marketing_tasks` table (checklist, brand
  guidelines, attachments, expected outputs, status incl. `in_review`/`approved`, recurrence,
  assignee, due date) plus a Tasks page to create, run, and approve tasks. Deliberately seeds
  pillars 2, 3, and 5.
- **Phase 2 — AI Review Layer.** `review_asset` v1 exists in `ai-handler`: it checks a saved asset
  against Business DNA (brand fit, audience fit, CTA clarity, spelling/readability, claim safety,
  completeness, and visual readiness when an image is available) and stores a structured result plus
  quality score in `content_items.metadata.review`. The next upgrade is review history and task
  attachment.
- **Phase 3 — Recurring Operations.** An engine that materializes tasks from `recurrence` on a
  schedule (daily/weekly/monthly), so recurring ops appear as real work items.
- **Phase 4 — Executive Dashboard.** Replace the placeholder Home tiles with real aggregates over
  tasks, campaigns, approvals, and AI quality scores. Add ROI once billing/spend data exists.

## Design principles

- Every operations table is org-scoped with RLS, following the existing `is_org_member` /
  `has_org_role` pattern.
- AI features are added as **actions in the single `ai-handler` Edge Function**, never as a second
  function.
- Structured AI output and verification results persist as `jsonb` (the `content_items.metadata`
  pattern), with a human-readable rendering alongside so downstream modules keep working.
- Any AI "quality score" is a model self-assessment against a rubric, surfaced honestly — never
  presented as a guaranteed real-world outcome.
