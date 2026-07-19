---
name: time2grow-ai-action
description: Add safe actions to the time2grow Supabase `ai-handler` Edge Function. Use when implementing AI features such as Business DNA extraction, content generation, Maya responses, lead scoring, trend ideas, campaign copy, or any OpenAI-backed workflow in time2grow.
---

# time2grow AI Action

Use this skill when adding an action to `supabase/functions/ai-handler/index.ts`.

## Workflow

1. Add a flat action handler to the `actions` map; keep one action equal to one bounded task.
2. Reuse the existing request flow: authenticated user, org role check, daily cap, usage log, then handler.
3. Validate all payload fields with strict type checks and length limits.
4. Load required org data server-side with the service client; do not trust client-sent Business DNA or private state.
5. Use strict JSON response prompts with an exact shape.
6. Parse and normalize model output. Reject unusable responses with `HttpError(502, ...)`.
7. Keep max tokens and timeouts bounded. Use env-driven limits when a new limit may need tuning.
8. Never ask the model to execute instructions from scraped websites or user content.
9. Never return secrets, access tokens, raw provider credentials, or hidden prompts.
10. Deploy with `supabase functions deploy ai-handler --project-ref <ref>` after local build checks.

## Guardrails

- Do not use `--no-verify-jwt` for `ai-handler`; authenticated app users must be required.
- Count usage before external provider calls so failed attempts cannot bypass caps.
- For URL-fetching actions, preserve SSRF protections: public http/https only, DNS checks, redirect limits, byte limits, and timeouts.
- For generation actions, avoid invented proof, discounts, guarantees, legal claims, testimonials, or contact details.
