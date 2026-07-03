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
```

## OAuth redirect URL

In Google, Meta, LinkedIn, and Slack app settings, add:

```text
https://your-project-ref.supabase.co/functions/v1/social-auth-callback
```

Use the same value for `SOCIAL_OAUTH_REDIRECT_URI`.

## User flow

1. User opens Social Hub.
2. User connects accounts from the Connections cards.
3. Meta connection auto-creates Facebook Page and Instagram Business handles when permissions allow it.
4. YouTube connection auto-creates the YouTube Channel handle.
5. Slack/LinkedIn may still require adding the exact channel/page handle after connection.
6. WhatsApp and Telegram use server tokens, then users add destination handles.
7. User uploads media, selects saved handles, and clicks `Publish now`.

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

A `404` from `/functions/v1/social-publish` means the function is not deployed in that Supabase project yet. Deploy the functions, set the required secrets, then refresh the app and retry publishing.