# time2grow n8n Poster Agent

This workflow gives Poster Studio a local n8n agent endpoint:

```text
POST http://localhost:5678/webhook/time2grow-poster-agent
```

## Required Environment

**Option A - `.env` file (recommended, no retyping every session):**

```powershell
copy n8n\.env.example n8n\.env
notepad n8n\.env   # fill in OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY
powershell -ExecutionPolicy Bypass -File "n8n\start-n8n.ps1"
```

`n8n\.env` is already covered by the repo's `.gitignore` (`.env` / `.env.*` pattern) - it will never be committed. `start-n8n.ps1` loads it into the process environment and then runs `n8n start`; it warns (but still starts n8n) if a required value is missing.

**Option B - set variables manually each session:**

```powershell
$env:OPENAI_API_KEY = "<your OpenAI key>"
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<your Supabase service role key>"
n8n start
```

Optional (either option):

```powershell
$env:OPENAI_IMAGE_MODEL = "gpt-image-1.5"
$env:N8N_OPENAI_IMAGE_TIMEOUT_MS = "300000"
$env:N8N_POSTER_WEBHOOK_SECRET = "<choose a long random secret>"
```

If `N8N_POSTER_WEBHOOK_SECRET` is set, calls must include the same value in the `x-time2grow-secret` header.

Note: Supabase secrets (`supabase secrets set ...`) and n8n's environment are two separate stores - setting `OPENAI_API_KEY` in Supabase does not make it available to n8n, and Supabase secrets cannot be read back out once set. Use your original OpenAI key (or generate a new one) and the `service_role` key from Supabase Project Settings > API.

## Import

```powershell
n8n.cmd import:workflow --input "C:\Ad96 MarketingOS\n8n\time2grow-poster-agent.workflow.json"
```

After import, open n8n and activate the workflow.

## Request Shapes

Create headline options:

```json
{
  "mode": "concepts",
  "orgId": "organization-id",
  "topic": "festive offer for salon owners in Hyderabad",
  "style": "premium clean marketing poster",
  "format": "portrait"
}
```

Create and save a poster:

```json
{
  "mode": "poster",
  "orgId": "organization-id",
  "userId": "auth-user-id",
  "headline": "Grow Bookings This Festive Season",
  "subheadline": "Premium campaigns for local salons",
  "offer": "",
  "callToAction": "Book a demo",
  "style": "premium clean marketing poster",
  "format": "portrait",
  "quality": "medium"
}
```

The poster mode returns `poster.imageUrl`, `poster.downloadUrl`, `poster.contentItemId`, and `poster.assetId`.
