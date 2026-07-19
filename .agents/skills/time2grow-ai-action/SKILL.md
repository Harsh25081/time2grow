---
name: time2grow-ai-action
description: Add one new action to the ai-handler Edge Function (R3). Use for any new AI-powered feature - never create a second AI Edge Function.
---

# R3 - One ai-handler action, not a new function

`supabase/functions/ai-handler/index.ts` is the single Edge Function for every AI feature in time2grow, branching on a `{ action, ...payload }` field. This keeps one function to deploy and secure instead of one per feature. Adding AI to a module means adding a branch here, never a new `supabase/functions/<something>-ai/` folder.

## Default to single-shot, not an agent

Each action should be one prompt, one completion, return structured JSON. Only build multi-step reasoning (looping, calling other actions, chaining prompts) inside an action when a single completion genuinely cannot do the job. Maya (`maya_chat`, once it exists) is the one exception - it is the main agent, allowed to call other actions as tools on the user's behalf. Every other action stays flat. If you think a new feature needs to be "agentic," first check whether it's actually just a well-written single prompt.

## Inputs

- `{{ACTION}}` - snake_case action name, e.g. `score_lead`, `generate_content`.
- `{{PROMPT}}` - the system + user prompt shape (what it takes in, what JSON it returns).
- `{{INPUTS}}` - the payload fields the frontend will send.

## Steps

1. Open `supabase/functions/ai-handler/index.ts`. Add `{{ACTION}}: {{actionFunctionName}}` to the `actions` record.
2. Write the handler as `async function {{actionFunctionName}}({ supabase, orgId, userId, payload }: ActionContext): Promise<Record<string, unknown>>`. Do not re-implement auth, org-role checks, the daily cap, or usage logging - the shared `Deno.serve` handler already does all of that before your function runs.
3. Validate every payload field explicitly (`typeof payload.x === 'string'`) and throw `HttpError(400, message)` for anything missing or malformed - never trust the frontend.
4. Call the shared `callOpenAi(messages)` helper already in that file. Use `response_format: { type: 'json_object' }` and a system prompt that states the exact JSON shape expected - this is what makes the response parseable and cheap to validate.
5. Parse the model's JSON defensively (`JSON.parse` in a try/catch, `HttpError(502, ...)` on failure) and coerce every field with a `typeof value === 'string' ? value : ''`-style guard, same as `parseDnaCompletion` does. Never trust the model's output shape blindly.
6. Never put secrets, tokens, or other users'/orgs' data into a prompt. If the action needs external content (a URL, uploaded text), sanitize and cap its length before sending it to OpenAI - see `fetchSiteText`'s script/style stripping and 6000-char cap.
7. On the frontend, call it with `supabase.functions.invoke('ai-handler', { body: { action: '{{ACTION}}', orgId: organization.id, ...payload } })`. Reuse the `edgeFunctionErrorMessage` helper for a readable error instead of surfacing the raw Supabase error.
8. If the frontend uses the result to prefill a form, populate the fields and let the user review/edit before saving - never auto-save an AI action's output directly.

## Reference implementation already in this repo

- The whole pattern end to end: `supabase/functions/ai-handler/index.ts` (`extract_dna` action) and `apps/web/src/features/business-dna/BusinessDnaPage.tsx` (`handleFetchFromWebsite`, the frontend call site).

## Verification

`npm run typecheck:web` clean on the frontend side. Manually invoke the new action once real credentials exist (`OPENAI_API_KEY` secret set, function deployed) and confirm: a bad/missing payload field returns a 400 with a clear message, a valid payload returns parsed JSON matching the documented shape, and hitting the daily cap returns 429 without calling OpenAI.
