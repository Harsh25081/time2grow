---
name: telugu-virality-output
description: Optimize Telugu and Telugu-English creator virality reports, competitor comparisons, regional accent/style instructions, and multiple short-form script variations for the Ad96 MarketingOS link-only YouTube/Instagram MVP. Use when generating or improving scripts, scoring explanations, export-ready reports, prompt templates, backend analysis output, or Telugu creator voice quality.
---

# Telugu Virality Output

## Overview

Use this skill to make the MVP output sharper for Telugu creators: clearer virality reasoning, better competitor-gap framing, regional accent/style fidelity, and more distinct script variations.

## Workflow

1. Read the current product requirement in `README.md` when working inside the project.
2. Keep the product link-only: do not reintroduce manual metric fields.
3. Use n8n Community Edition with ScrapeCreators as the preferred automation layer for both YouTube and Instagram metrics.
4. Treat accent as open text supplied by the user, not as a fixed dropdown.
5. Generate scripts for Telugu or Telugu-English creators first; other languages are secondary.
6. Produce multiple variations that use different angles, not shallow rewrites.
7. Make competitor comparison actionable: state what competitors do, what gap exists, and what angle the user should target.
8. Keep export output complete enough for PDF/Word: score, insights, competitors, scripts, captions, hashtags, and shot lists.

## Output Quality Rules

- Start each report with the creator/platform, score, and the strongest next action.
- Explain scores with plain creator language: hook clarity, topic promise, consistency, competitor gap, and share potential.
- Use romanized Telugu-English by default unless the user explicitly asks for Telugu script.
- Preserve the user's accent/style text exactly as a direction and reflect it in the script rhythm.
- Avoid generic lines like "create engaging content"; give specific first-line hooks, examples, and shot choices.
- Make each variation have a unique purpose: pain-first, mistake-led, proof-first, story-led, competitor-gap, checklist, controversy, or transformation.
- When ScrapeCreators/n8n is unavailable, clearly say the automation is not configured/reachable; do not ask for manual metrics.

## References

Read `references/voice-scoring.md` when tuning script quality, scoring language, competitor comparison, or accent handling.

## Scripts

Use `scripts/build_telugu_output_prompt.mjs` to create an LLM-ready generation prompt from a JSON payload. It accepts a JSON file path or stdin and prints a prompt that follows this skill's output rules.
