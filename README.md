# time2grow

time2grow is an AI growth workspace for businesses, agencies, creators, and local brands. It brings Business DNA, content creation, poster generation, social publishing, and campaign operations into one SaaS-style workspace.

The app is a React/Vite/TypeScript frontend backed by Supabase Auth, Postgres, Storage, Row Level Security, Edge Functions, and local n8n AI workflows.

## Deploy to Vercel

The frontend is ready to deploy from the repository root. The included `vercel.json` installs the workspace, runs `npm run build:web`, serves `apps/web/dist`, and keeps client-side routes working.

Add these public environment variables in Vercel before deploying:

```env
VITE_APP_ENV=production
VITE_APP_NAME=time2grow
VITE_APP_URL=https://your-project.vercel.app
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Do not add the local n8n URL to Vercel: a deployed browser cannot reach `localhost:5678`. When `VITE_N8N_POSTER_WEBHOOK_URL` is unset, the Poster page uses the existing Supabase `ai-handler` action instead. You can later set this variable to a public HTTPS n8n webhook if you still want n8n in production.

Deploy the Supabase function and store `OPENAI_API_KEY` as a Supabase Function secret. Never put OpenAI keys, Supabase service-role keys, n8n credentials, or provider secrets in Vercel `VITE_` variables because those values are visible in the browser.

## Current Status

This is an early production build, not a finished public SaaS launch yet. The core foundation is in place: authentication, organization/workspace data, Business DNA, Campaigns, Content Studio, Poster AI, Social Hub, Tasks, Analytics v1, media handling, Supabase migrations, Edge Functions, and the first Poster AI workflow.

Still needed before full public launch:

- Billing and plan limits.
- Sentry, uptime checks, and production monitoring.
- Public legal pages: privacy policy, terms, refund/cancellation policy where needed.
- Provider app verification for Google, YouTube, Meta, LinkedIn, Slack, Telegram, and WhatsApp.
- Hard launch smoke tests with real users, real media, and real connected handles.

## Main Modules

- Business DNA: captures brand positioning, audience, website intelligence, colors, and logo.
- Analytics: main workspace reporting page for campaign health, content/task/social throughput, AI review scores, and reporting source metrics.
- Campaigns: main operating tree for campaign objectives, content, posters, tasks, and publishing work.
- Content Studio: Campaigns subsection for platform-ready posts and video/ad scripts using saved Business DNA.
- Poster Studio: Campaigns subsection for editable posters with logo, text, RGB palette, background controls, download, save, and Social Hub handoff.
- Poster AI Studio: uses Supabase Edge Functions in hosted deployments, with optional n8n workflows for local or advanced automation.
- Social Hub: Campaigns subsection for queueing/publishing content to selected social, ads, and messaging channels.
- Settings / Connections: workspace configuration for connected social and messaging handles.
- Supabase backend: auth, storage, Edge Functions, database tables, RLS, and organization-scoped SaaS data.

The product objective is expanding from generating marketing assets to running marketing work end to
end — SOP-based tasks, AI proof verification, recurring operations, an AI review layer, and an
executive dashboard. See [docs/product-vision.md](docs/product-vision.md) for the full vision and
roadmap.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, React Router, lucide-react.
- Rendering/export: browser canvas/HTML capture through `html-to-image`.
- Backend: Supabase Auth, Postgres, Storage, Edge Functions.
- AI: OpenAI through Supabase Edge Functions and n8n credentials.
- Workflow automation: local n8n workflow for Poster AI.

## Quick Start

Install dependencies:

```bash
npm install
```

Create the web environment file:

```bash
copy apps\web\.env.example apps\web\.env.local
```

Fill `apps/web/.env.local`:

```env
VITE_APP_ENV=local
VITE_APP_NAME=time2grow
VITE_APP_URL=http://localhost:5173
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_N8N_POSTER_WEBHOOK_URL=http://localhost:5678/webhook/time2grow-poster-workflow-2
```

Start the web app:

```bash
npm run dev:web
```

Open:

```text
http://127.0.0.1:5173
```

## Useful Commands

```bash
npm run dev:web
npm run build:web
npm run typecheck:web
npm audit
```

## Poster AI Workflow

Poster AI generates finished poster images, and returns 3 versions to choose from:

1. The user enters a topic, objective, style, size, and palette.
2. The app sends the request with Business DNA, brand/palette, logo info, and a poster count (default 3).
3. n8n sends the brief to a `deepseek-chat` planning agent that designs 3 distinct finished-poster concepts (exact copy + a full image prompt each).
4. The OpenAI image node (`gpt-image-1`) renders each concept as a complete poster with the text baked into the artwork.
5. n8n returns `{ ok, mode: "poster_set", concepts: [{ id, title, angle, imageDataUrl, copy }] }`.
6. The app shows all 3 posters in a horizontal selection bar; the user picks one.
7. The user can download, save, or send the chosen poster to Social Hub.

If the n8n webhook is unreachable, the app falls back to 3 editable template concepts rendered in the browser so the studio is never empty.

Live local webhook:

```text
POST http://localhost:5678/webhook/time2grow-poster-workflow-2
```

Important design rule: each poster must render its exact copy correctly (no misspelled or random words) and stay on the user's exact topic. Do not invent discounts, dates, prices, phone numbers, awards, or testimonials.

Current Poster AI style behavior:

- Laundry posters should include laundry-related visuals such as machines, folded clothes, bubbles, baskets, and fresh fabric.
- Festive posters should include festival-specific decor such as diyas, rangoli, lights, flowers, sweets, or fireworks.
- SaaS posters should include clean unlabeled product/dashboard/workflow motifs.
- Events, NGOs, clubs, runathons, donation camps, and community posters should use relevant activity or venue visuals.
- "Visual Value" or "Jack Butcher" style requests are translated into an original high-contrast conceptual direction: clean geometry, arrows, grids, one clear metaphor, minimal words, and strong negative space.

Do not ask the image model to generate readable text, fake logos, fake UI labels, QR codes, contact details, numbers, badges, or invented offers.

## n8n Setup

The current Poster AI workflow files live in `n8n/`:

- `n8n/build-poster-workflow-2.js`
- `n8n/time2grow-poster-workflow-2.workflow.json`

Regenerate the workflow JSON after editing the builder:

```bash
node n8n/build-poster-workflow-2.js
```

Import into local n8n:

```bash
n8n.cmd import:workflow --input "C:\Ad96 MarketingOS\n8n\time2grow-poster-workflow-2.workflow.json"
```

Activate and publish:

```bash
n8n.cmd update:workflow --id time2growPosterWorkflow2 --active=true
n8n.cmd publish:workflow --id time2growPosterWorkflow2
```

Restart n8n after importing or publishing so webhook changes take effect.

Health check payload:

```json
{
  "mode": "health"
}
```

Expected health response:

```json
{
  "ok": true,
  "workflow": "time2grow-poster-workflow-2",
  "message": "time2grow poster workflow 2 is ready."
}
```

## Supabase

The app uses Supabase for:

- Email/password authentication.
- Organization/workspace data.
- Business DNA records.
- Social handles and publish records.
- Storage bucket uploads for generated and uploaded media.
- Edge Functions for AI and social publishing.

Cloud Edge Functions currently include:

- `ai-handler`
- `social-connections-status`
- `social-auth-start`
- `social-auth-callback`
- `social-publish`

Keep service-role keys, provider secrets, OpenAI keys, and webhook signing secrets out of frontend code. Frontend Vite variables must only contain public values such as Supabase URL, Supabase anon key, and local webhook URL.

## Project Structure

```text
apps/web/                 React/Vite frontend
docs/                     Setup, architecture, launch, and operations docs
n8n/                      Local n8n workflow builders and workflow JSON
supabase/functions/       Supabase Edge Functions
supabase/migrations/      Database migrations
config/                   SaaS configuration files
tests/                    Test workspace
```

## Security Notes

- Supabase RLS should protect organization-scoped data.
- Edge Functions should verify JWTs unless the route must be public for OAuth callbacks.
- Public OAuth callbacks must validate state and provider responses.
- Do not commit `.env.local`, Supabase service-role keys, OpenAI keys, n8n credential exports, or webhook secrets.
- Run `npm audit` and a secret scan before production releases.

## Documentation

More setup details live in:

- `docs/social-hub-live-setup.md`
- `docs/n8n-poster-agent-setup.md`
- `docs/n8n-poster-workflow-build-guide.md`
- `docs/security/`
- `docs/operations/`
- `docs/launch/`

## Recommended Next Build Order

1. Smoke test Business DNA, logo upload/fetch, and brand colors.
2. Smoke test Poster AI with different topics: SaaS, laundry, festival, NGO, event, and local service.
3. Save generated posters to Supabase Storage and confirm download works.
4. Attach saved content, tasks, and social posts to campaigns during normal workflow smoke tests.
5. Send saved poster assets to selected Social Hub handles.
6. Add Analytics date filters and campaign/source drill-downs once provider sync rows are flowing.
7. Add monitoring, billing, legal pages, and provider verification for public launch.
