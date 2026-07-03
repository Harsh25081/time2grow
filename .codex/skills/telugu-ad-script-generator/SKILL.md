---
name: telugu-ad-script-generator
description: Generate scene-based Telugu and Telugu-English short ad scripts from client requirements or reference video links. Use when creating fresh scripts for products, showrooms, jewelry, electronics, tractors, appliances, local businesses, cartoon ads, family-emotion ads, showroom ads, offer ads, or when converting reference-video patterns into 3 or more original scripts with scenes, characters, dialogues, voice-over, screen text, captions, hashtags, and shot notes.
---

# Telugu Ad Script Generator

## Core Workflow

1. Start from the client requirement first. Treat links as optional references, not mandatory inputs.
2. If reference links have usable transcript/title/caption, extract the structure only: hook type, conflict, scene flow, proof moment, CTA style.
3. Do not copy exact words, claims, characters, visuals, or shot order from reference links.
4. If no reference data is available, generate fresh scripts from the client brief.
5. Prefer scene-based output for ads, not creator-tip scripts.
6. Generate multiple variations with different story structures.
7. Keep Telugu/Telugu-English natural for the requested accent/style.
8. Mention when reference automation is unavailable, but still generate from the brief if the brief is clear.

## Required Output Shape

Each script must include:

- Title with duration, usually 30-45 sec or 45-60 sec.
- Scene-by-scene structure.
- Visual direction in parentheses.
- Character dialogue.
- Voice-over where useful.
- Screen text.
- Caption.
- Shot notes.
- Why this concept may work.

Preferred scene format:

```text
[Product/Brand] - [Script Type] (45-60 seconds)

Scene 1 - Problem / Hook
(Visual direction.)

Character:
"Dialogue."

Scene 2 - Product/solution entry
...

Final voice-over:
"Brand line."

Screen text:
Brand name
Tagline
```

## Variation Types

Use distinct variations, such as:

- Problem-to-solution cartoon story.
- Before/after proof ad.
- Family emotion story.
- Comedy misunderstanding ad.
- Showroom/dealer trust ad.
- Offer/FOMO ad.
- Festival/wedding collection ad.
- Customer testimonial story.

## Fresh Brief Handling

For briefs like:

- "refrigerator ad for Satya Electronics"
- "jewelry wedding collection ad"
- "Mahindra tractor cartoon ad for farmers"

Infer:

- Product/brand.
- Audience.
- Problem or desire.
- Offer or proof angle.
- Emotional payoff.
- CTA.

Ask for clarification only if the brief lacks a product/brand/category entirely.

## Automation Guidance

Use n8n/ScrapeCreators only when links are provided and useful. Automation may fetch:

- Video title.
- Caption.
- Transcript.
- Views/likes/comments.
- Hook text.

If automation fails, do not block script generation when the brief is clear.