# Build Guide: time2grow Poster Studio n8n Workflow (from scratch)

A step-by-step guide to building the poster workflow yourself in the n8n editor. This
replaces the single-giant-Code-node design in `n8n/time2grow-poster-agent.workflow.json`.

## Why this design (read first)

The old workflow put everything in one Code node and read secrets from `process.env`
(`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). In n8n 2.x the **JS Task Runner**
sandboxes Code nodes and does **not** expose `process.env` to them by default, so those
reads fail with `Missing n8n environment variable: ...` even when the variables are set
for the n8n process.

**The fix used here:** store secrets as n8n **Credentials**, and let native
**HTTP Request** nodes inject them. Code nodes are used only for pure data
transformation (building prompts, parsing JSON) — never for secrets or network calls.
This sidesteps the sandbox completely and is the standard n8n pattern.

## Prerequisites

- n8n running locally (`n8n start`), editor at http://localhost:5678.
- Your OpenAI API key.
- Your Supabase project URL (`https://pekdigzqsxkqdnkjodes.supabase.co`) and the
  `service_role` key (Supabase Dashboard -> Project Settings -> API).
- The `business_dna`, `content_items`, and `social_media_assets` tables and the
  `post-media` storage bucket must exist in the project (apply the repo migrations first
  with `npx supabase db push` if you haven't).

---

## Step 1 - Create the credentials (once)

In n8n: **Credentials -> Add credential**.

### 1a. OpenAI

- Type: **OpenAI** (`OpenAi API`).
- API Key: paste your OpenAI key.
- Save as: `time2grow OpenAI`.

### 1b. Supabase service role (as Header Auth)

Supabase REST/Storage needs the service key in two headers. Create a generic header
credential:

- Type: **Header Auth**.
- Name: `apikey` · Value: `<service_role key>`.
- Save as: `time2grow Supabase apikey`.

Then a second one for the bearer token:

- Type: **Header Auth**.
- Name: `Authorization` · Value: `Bearer <service_role key>`.
- Save as: `time2grow Supabase bearer`.

> n8n's HTTP Request node lets you attach one "Predefined/Generic" credential. To send
> both headers, attach `time2grow Supabase bearer` as the credential and add `apikey`
> as a manual header on each Supabase node (Step 4b shows this). Keeping the key out of
> the node body is the point — it lives only in the credential.

---

## Step 2 - Webhook trigger

Add a **Webhook** node:

- HTTP Method: `POST`
- Path: `time2grow-poster-agent`
- Respond: `Using 'Respond to Webhook' node`
- (Optional security) add a header check later, or keep the
  `N8N_POSTER_WEBHOOK_SECRET` idea as an IF node comparing
  `{{$json.headers['x-time2grow-secret']}}`.

The production URL will be `http://localhost:5678/webhook/time2grow-poster-agent`.

---

## Step 3 - Normalize + route by mode

Add a **Code** node named `Normalize Input` right after the webhook. This does NO
network or secret work — just shapes the incoming body and picks the mode:

```js
const body = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const mode = String(body.mode || body.action || 'poster').trim();

return [{
  json: {
    mode,
    orgId: String(body.orgId || '').trim(),
    userId: String(body.userId || '').trim(),
    topic: String(body.topic || '').trim(),
    headline: String(body.headline || '').trim(),
    subheadline: String(body.subheadline || '').trim(),
    offer: String(body.offer || '').trim(),
    callToAction: String(body.callToAction || '').trim(),
    style: String(body.style || 'premium clean marketing poster').trim(),
    format: ['square','portrait','landscape'].includes(body.format) ? body.format : 'portrait',
    quality: ['low','medium','high'].includes(body.quality) ? body.quality : 'medium',
  },
}];
```

Add a **Switch** node named `Route by Mode` after it:

- Mode `Rules`, data type String, value `{{$json.mode}}`.
- Output `health` -> equals `health`
- Output `concepts` -> equals `concepts`
- Output `poster` -> equals `poster`
- Fallback output -> the error branch (Step 7).

The `health` output can go straight to a small "Set" node returning
`{ ok: true, message: "poster agent ready" }` -> Respond to Webhook.

---

## Step 4 - Shared: load Business DNA (used by concepts AND poster)

Both real modes need the org's Business DNA. Build this once and feed both branches.

### 4a. HTTP Request node `Load Business DNA`

- Method: `GET`
- URL:
  `={{ "https://pekdigzqsxkqdnkjodes.supabase.co/rest/v1/business_dna?org_id=eq." + $json.orgId + "&select=website_url,mission,vision,positioning,values,audience,proof_points,growth_goal,key_metric,additional_notes,brand_colors&limit=1" }}`
- Authentication: Generic Credential -> **Header Auth** -> `time2grow Supabase bearer`.
- Add Header (manual): `apikey` = `<paste service_role key>` — OR reference a second
  credential via an expression if you prefer not to inline it.
- Response: JSON.

### 4b. Guard `Require DNA` (IF node)

- Condition: `{{$json.length}}` (array from PostgREST) is empty -> route to an error
  "Save Business DNA before creating posters." Otherwise continue with
  `{{$json[0]}}` as the DNA object.

> Tip: after `Load Business DNA`, add a tiny Code node `Pick DNA` that returns
> `[{ json: { dna: $json[0] || null, input: $items('Normalize Input')[0].json } }]`
> so downstream nodes have both the DNA and the original input in one place.

---

## Step 5 - Concepts mode

### 5a. Code `Build Concepts Prompt`

Pure transform - assemble the messages array from `dna` + `input`:

```js
const { dna, input } = $json;
const system = 'You are the Poster Studio concept agent for time2grow. Reply with strict JSON only: {"concepts":[{"angle":string,"headline":string,"subheadline":string,"offer":string,"callToAction":string}]}. Return exactly 5 concepts. Headline under 9 words, subheadline under 18 words. Never invent discounts, phone numbers, awards, guarantees, addresses, or testimonials.';
const user = JSON.stringify({ topic: input.topic, style: input.style, format: input.format, businessDna: dna });
return [{ json: { system, user } }];
```

### 5b. OpenAI node `Concepts LLM`

- Credential: `time2grow OpenAI`.
- Resource: Chat / Message a model.
- Model: `gpt-4o-mini`.
- Messages: System = `{{$json.system}}`, User = `{{$json.user}}`.
- Options: Response Format = `JSON Object`, Temperature `0.4`.

### 5c. Code `Parse Concepts` -> **Respond to Webhook**

Parse `message.content` JSON, keep up to 5 valid concepts, return
`{ ok: true, mode: 'concepts', concepts: [...] }`. Wire into a **Respond to Webhook**
node.

---

## Step 6 - Poster mode

### 6a. Code `Build Poster Prompt`

Pure transform - build the single image prompt string from `dna` + `input` (headline,
subheadline, offer, CTA, brand colors, positioning, audience, export size). Reuse the
prompt text from `poster-quality-spec.md` (premium finished poster, exact text, brand
colors, safe margins, no fake logos/claims/watermarks). Output
`{ prompt, size, exportSize, fileName }` where:

- `size` = `1024x1024` (square) / `1024x1536` (portrait) / `1536x1024` (landscape).
- `exportSize` = `1080x1080` / `1080x1350` / `1200x628`.

### 6b. OpenAI node `Poster Image`

- Credential: `time2grow OpenAI`.
- Resource: Image -> Generate.
- Model: `gpt-image-1.5` (or your image model).
- Prompt: `{{$json.prompt}}`, Size: `{{$json.size}}`, response as base64.
- **Increase the node's timeout** (Settings -> Timeout) to ~300000 ms — image
  generation is slow. This is the main reason to run posters in n8n rather than a
  Supabase Edge Function (which has a hard ~150s limit).

### 6c. HTTP Request `Upload to Storage`

- Method: `POST`
- URL:
  `={{ "https://pekdigzqsxkqdnkjodes.supabase.co/storage/v1/object/post-media/" + $json.orgId + "/poster-studio/" + $json.fileName }}`
- Auth: `time2grow Supabase bearer` + manual `apikey` header.
- Header `Content-Type`: `image/png`, `x-upsert`: `false`.
- Body: Binary / the base64 image decoded to binary (use a `Convert to File` /
  `Move Binary Data` node before this to turn the base64 into a binary property).

### 6d. HTTP Request `Insert content_items`

- Method: `POST`, URL: `.../rest/v1/content_items`
- Auth headers as above + `Prefer: return=representation`, `Content-Type: application/json`.
- Body (JSON): `{ org_id, content_type: "poster", title: headline, body: <joined text>, status: "ready", created_by: userId }`.
- Capture the returned `id`.

### 6e. HTTP Request `Insert social_media_assets`

- Method: `POST`, URL: `.../rest/v1/social_media_assets`
- Body: `{ org_id, content_item_id, media_type: "poster", file_name, mime_type: "image/png", size_bytes, storage_bucket: "post-media", storage_path, created_by: userId }`.

### 6f. HTTP Request `Sign URL` (optional but recommended)

- `POST .../storage/v1/object/sign/post-media/<storage_path>` with
  `{ "expiresIn": 604800 }` -> returns a signed URL valid 7 days.

### 6g. HTTP Request `Patch content_items.media_url`

- `PATCH .../rest/v1/content_items?id=eq.<contentItemId>` with
  `{ media_url: <signed url> }`, header `Prefer: return=minimal`.

### 6h. Code `Poster Response` -> **Respond to Webhook**

Return `{ ok: true, mode: 'poster', poster: { contentItemId, assetId, title, imageUrl, downloadUrl, fileName, size, exportSize } }`.

---

## Step 7 - Error handling

- Add a **Respond to Webhook** node on the Switch fallback and on each guard that
  returns `{ ok: false, error: "<message>" }` with HTTP 200 (the app reads `ok`).
- Consider the workflow **Settings -> Error Workflow** or wrap risky nodes with
  `Continue On Fail` so a provider error returns a clean JSON error instead of a 500.

---

## Step 8 - Activate + test

1. Toggle the workflow **Active** (top-right of the editor).
2. Health check:
   ```bash
   curl -s -X POST http://localhost:5678/webhook/time2grow-poster-agent \
     -H "Content-Type: application/json" -d '{"mode":"health"}'
   ```
   Expect `{"ok":true,...}`.
3. Concepts (needs a real orgId that has Business DNA saved):
   ```bash
   curl -s -X POST http://localhost:5678/webhook/time2grow-poster-agent \
     -H "Content-Type: application/json" \
     -d '{"mode":"concepts","orgId":"<real-org-id>","topic":"festive salon offer","format":"portrait"}'
   ```
4. Poster: same with `"mode":"poster"`, a `headline`, and `userId`. Confirm the PNG
   lands in the `post-media` bucket and a `content_items` + `social_media_assets` row
   appear.

---

## Step 9 - Point the app at it (optional)

Today `apps/web/src/features/poster-studio/PosterStudioPage.tsx` calls the Supabase
`ai-handler` edge function. To use this n8n workflow instead, change those calls to
`fetch('http://localhost:5678/webhook/time2grow-poster-agent', ...)` (or a proxied
URL). Keep the Supabase path as a fallback until the n8n one is proven. Decide one
source of truth per environment so you don't maintain two poster implementations.

---

## Node map (quick reference)

```
Webhook
  -> Normalize Input (Code)
    -> Route by Mode (Switch)
       health   -> Set ok -> Respond
       concepts -> Load Business DNA (HTTP) -> Pick DNA (Code)
                   -> Build Concepts Prompt (Code) -> Concepts LLM (OpenAI)
                   -> Parse Concepts (Code) -> Respond
       poster   -> Load Business DNA (HTTP) -> Pick DNA (Code)
                   -> Build Poster Prompt (Code) -> Poster Image (OpenAI)
                   -> to Binary -> Upload to Storage (HTTP)
                   -> Insert content_items (HTTP) -> Insert social_media_assets (HTTP)
                   -> Sign URL (HTTP) -> Patch media_url (HTTP)
                   -> Poster Response (Code) -> Respond
       fallback -> Respond {ok:false,error}
```
