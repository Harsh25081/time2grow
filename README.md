# time2grow

time2grow is an AI growth workspace for solopreneurs and creators. The repo is a React/Vite/TypeScript web app in `apps/web` backed by Supabase Auth, Postgres, Storage, and Edge Functions.

## Current Status

This is an early production build, not a finished full SaaS yet. The real foundation is in place: auth, multi-tenant org data, Social Hub publishing, Business DNA, Supabase migrations, and the first deployed AI action. The remaining SaaS layers still need to be built and tested before public launch: Content Studio, Maya, Campaigns, Leads, Inbox, Analytics, billing, monitoring, tests, CI, and legal/compliance pages.

## Live Now

- Auth: Supabase email/password auth, password reset, org/workspace membership, and RLS-backed account data.
- Social Hub: channel connection and publishing flow for social, ads, and messaging targets. Google Ads is intentionally not a one-click social post target; it needs a separate campaign builder.
- Business DNA: brand/audience/positioning profile at `/business-dna`, including a website-to-DNA assist action.
- Media uploads: Social Hub can use uploaded media and content/campaign source records.
- Supabase cloud project: migrations have been pushed to project `pekdigzqsxkqdnkjodes`.

## Deployed Edge Functions

The following Supabase Edge Functions are deployed on the cloud project:

- `social-connections-status`
- `social-auth-start`
- `social-auth-callback`
- `social-publish`
- `ai-handler`

`social-auth-callback` must stay public because OAuth providers call it directly. `ai-handler` is deployed with JWT verification on, so unauthenticated requests are rejected.

## AI Handler

`supabase/functions/ai-handler/index.ts` now implements the first action, `extract_dna`. It reads a public website URL, extracts useful page text, sends a bounded prompt to OpenAI, and returns editable Business DNA fields.

Safety and cost controls already included:

- Signed-in user required.
- Owner/admin/editor org role required.
- Per-org daily usage cap.
- AI usage logging.
- Website URL validation.
- Localhost, private IP, reserved host, and unsafe redirect blocking.
- Fetch timeout and page-size limits.
- OpenAI timeout and model configuration.

The required secret name `OPENAI_API_KEY` is present in Supabase. Secret values are not committed or printed.

## Known OAuth Blocks

Google/YouTube and Meta/Facebook/Instagram apps can remain blocked for public users until their provider dashboards are verified. During testing, the connecting user must be allow-listed in the provider app.

Typical launch requirements:

- Privacy policy and terms pages.
- Verified app/domain in Google, Meta, LinkedIn, Slack, and other providers.
- Correct OAuth redirect URL in every provider dashboard.
- Platform review for public publishing permissions.

## Known Gaps

- No automated test suite yet.
- No CI pipeline yet.
- No Sentry/uptime monitoring wired into the app yet.
- Billing is not implemented.
- Content Studio, Maya, Campaigns, Leads, Inbox, Analytics, Competitors, Trends, Poster Studio, Onboarding, and Settings still need real product screens/workflows.
- Google Ads needs a proper campaign builder with budget, targeting, creative, policy status, and Google Ads API integration.
- A full authenticated browser smoke test is still needed after each deployment.

## Recommended Next Build Order

1. Smoke test Business DNA in the live app with a signed-in user.
2. Build Content Studio so Business DNA can generate usable posts, captions, scripts, and creatives.
3. Add basic automated tests and GitHub CI.
4. Add Sentry/monitoring and uptime checks.
5. Build Campaigns and Google Ads as a separate workflow.
6. Add billing, plan limits, admin tools, legal pages, and public launch checks.

## Development

```bash
npm run dev:web
npm run build:web
npm run typecheck:web
npm audit
```

The web app needs `apps/web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use the example env files for names only; do not commit real secrets.
