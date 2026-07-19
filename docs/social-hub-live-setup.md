# Social Hub Live Setup

This is the production checklist for turning Social Hub from local app code into a working SaaS publishing flow.

## Apply migrations

Run all migrations in order, including:

- `20260703143000_youtube_oauth_upload.sql`
- `20260703160000_social_connection_status_and_credentials.sql`

These add service-only OAuth state, workspace OAuth connections, and per-handle provider credentials.

## Deploy functions

Deploy these Supabase Edge Functions:

- `social-connections-status`
- `social-auth-start`
- `social-auth-callback`
- `social-publish`
- `scheduled-jobs`

The older `youtube-auth-start` and `youtube-auth-callback` functions can remain, but the web app now uses the generic `social-auth-*` functions.

## Required shared secrets

Set these in Supabase secrets:

```env
SUPABASE_SERVICE_ROLE_KEY=
OAUTH_TOKEN_ENCRYPTION_KEY=
APP_ORIGIN=https://your-app-domain.com
SOCIAL_OAUTH_REDIRECT_URI=https://your-project-ref.supabase.co/functions/v1/social-auth-callback
```

Use a long random value for `OAUTH_TOKEN_ENCRYPTION_KEY`.

## Provider secrets

Set only the providers you want live.

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

META_CLIENT_ID=
META_CLIENT_SECRET=
META_GRAPH_VERSION=v21.0

LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_VERSION=202606

SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=

WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

TELEGRAM_BOT_TOKEN=
SCHEDULED_JOBS_SECRET=
```

Use a separate, long random value for `SCHEDULED_JOBS_SECRET`. Never expose it as a `VITE_*` variable.

## Automatic scheduled delivery

After applying `20260719150000_scheduled_social_post_delivery.sql` and deploying both publishing functions, create a Supabase Cron job that runs once per minute:

- Method: `POST`
- URL: `https://your-project-ref.supabase.co/functions/v1/scheduled-jobs`
- Headers: `Authorization: Bearer <SUPABASE_ANON_KEY>`; `apikey: <SUPABASE_ANON_KEY>`; and `x-scheduled-jobs-secret: <SCHEDULED_JOBS_SECRET>`
- Body: `{}`
- Schedule: `* * * * *`

Store the header values in Supabase Vault when the Cron interface offers Vault-backed secrets. The worker atomically claims up to ten due posts per run. Concurrent runs skip posts already claimed. Abandoned claims become failed after twenty minutes and require review, avoiding an unsafe automatic duplicate publish.

## OAuth redirect URL

In Google, Meta, LinkedIn, and Slack app settings, add:

```text
https://your-project-ref.supabase.co/functions/v1/social-auth-callback
```

Use the same value for `SOCIAL_OAUTH_REDIRECT_URI`.

## User flow

Connections and posting are two separate pages: `/connections` (setup) and `/social` (posting). Both read and write the same `distribution_handles` table, so a handle added or removed on one page is immediately visible on the other.

**On `/connections`:**
1. User connects accounts from the Connections cards.
2. Meta connection auto-creates Facebook Page and Instagram Business handles when permissions allow it.
3. YouTube connection auto-creates the YouTube Channel handle.
4. Slack/LinkedIn may still require adding the exact channel/page handle after connection.
5. WhatsApp and Telegram use server tokens, then users add destination handles manually.
6. Handles can be removed from here at any time (deletes the saved handle and any stored per-handle credentials; past publish history keeps its record but loses the handle reference).

**On `/social`:**
1. User picks a campaign or Content Studio item as the source (optional), or writes a post from scratch.
2. User uploads media, selects saved handles (handles for OAuth-only providers without a live connection show "Connect first" and can't be selected via "Select ready").
3. User clicks `Publish now`.

## Publishing capability matrix

| Channel | Current live path |
| --- | --- |
| Facebook Pages | Text, image, and video through Meta Graph with Page token. |
| Instagram Business | Image and Reel/video publishing through Meta Graph after app approval. |
| LinkedIn Pages | Text and image posts through LinkedIn REST API. Video needs the Videos API finalize flow before production video posting. |
| YouTube Channels | Video upload through Google OAuth and resumable upload. |
| WhatsApp Business | Text, image, and video messages through Cloud API, subject to opt-in/template rules. |
| Slack Channels | Channel messages with media links through Slack OAuth/bot token. |
| Telegram Channels | Text, photo, and video messages through bot token. |
| Google Ads | Listed as a connected channel, but real ads require a separate campaign builder with objective, budget, landing page, assets, and policy checks. |
## Platform realities

- Meta and LinkedIn require app review for many production permissions.
- YouTube uploads from unverified API projects may be forced private by Google policy.
- WhatsApp marketing sends must follow template and opt-in rules.
- Google Ads is intentionally not part of the one-click post flow; it needs a separate Ads campaign builder with budget, objective, assets, and policy checks.

## Troubleshooting Edge Function reachability

If the browser shows `Failed to send a request to the Edge Function`, the function endpoint is not reachable from the app. For Social Hub publishing, first check that these functions are deployed to the same Supabase project used by `VITE_SUPABASE_URL`:

- `social-connections-status`
- `social-auth-start`
- `social-auth-callback`
- `social-publish`
- `scheduled-jobs`

A `404` from `/functions/v1/social-publish` means the function is not deployed in that Supabase project yet. Deploy the functions, set the required secrets, then refresh the app and retry publishing.