# Implementation Contract

## Current time2grow State

The app currently has Poster Studio, Supabase `ai-handler`, and a local n8n workflow for one-poster generation. The published local n8n webhook path is:

```text
POST http://localhost:5678/webhook/time2grow-poster-agent
```

The current live workflow is useful but incomplete for the final standard. It generates one poster and saves it. It does not yet implement multi-concept batch rendering, logo placement, locked themes across a set, PNG/PDF bundles, or deterministic exact-text layout.

## Target Modes

Support these server-side modes:

- `concepts`: return concept plans only.
- `poster`: render one final poster.
- `poster_set`: render any number of finished concepts in one request.
- `health`: return workflow readiness.

## Required Input For poster_set

```json
{
  "mode": "poster_set",
  "orgId": "uuid",
  "userId": "uuid",
  "context": "brief",
  "logoAssetId": "optional uuid",
  "brandword": "fallback brand name",
  "theme": "signature",
  "colors": {"bg":"#0C1A2E","ink":"#F1ECE0","muted":"#9FB0C4","accent":"#C8A24C"},
  "count": 5,
  "sizes": ["portrait", "square", "story"],
  "pdf": false,
  "language": "en"
}
```

## Rendering Strategy

Preferred production flow:

1. AI creates structured concept plans and optional background prompts.
2. Provider generates background/image assets where useful.
3. Deterministic renderer places logo, text, colors, shapes, and final layout.
4. Renderer exports PNG and PDF.
5. Server saves files and database rows.

Do not rely only on an image model for final text when spelling and brand accuracy matter.

## Supabase Contract

- Store files in `post-media`.
- Store one `content_items` row per concept, `content_type: "poster"`, `status: "ready"`.
- Store one `social_media_assets` row per generated file with `content_item_id` when available.
- Save preview/signed URL back to `content_items.media_url`.
- Return `contentItemId`, `assetIds`, `imageUrl`, `downloadUrl`, and `exportSize`.

## Provider Safety

- Keep service keys in Supabase Edge Functions, n8n credentials, or server env only.
- Do not put provider keys in React/Vite frontend env.
- Use env-driven model/provider names.
- Add Nano Banana Pro only after real API endpoint, auth, model names, request body, response body, and commercial terms are known.

## Validation

Before committing or deploying:

- Validate skill folder with `quick_validate.py`.
- Validate JSON workflows parse.
- Build web app when UI changes.
- Run no-secret scan for provider keys and service role keys.
- Smoke-test n8n webhook health and one render path if credentials are available.