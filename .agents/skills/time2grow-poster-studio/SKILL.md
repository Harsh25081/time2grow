---
name: time2grow-poster-studio
description: Turn a marketing brief, optional logo, and locked color theme into one or many finished premium poster concepts for time2grow. Use whenever building or improving poster generation, ad creatives, flyers, campaign creatives, Canva-like poster studios, logo placement, color themes, English/Telugu/Hindi poster copy, OpenAI/ChatGPT image prompts, Nano Banana Pro or other image-provider adapters, deterministic canvas/HTML rendering, PNG/PDF exports, n8n poster workflows, Supabase save flows, or Social Hub handoff.
---

# Time2grow Poster Studio

## Final Standard

Produce real poster files, not only text ideas. A finished Poster Studio workflow accepts:

- `context`: brief, product, offer, CTA, contact, language, mandatory facts.
- `logo`: uploaded logo file, saved brand logo, or fallback text wordmark.
- `theme`: one locked style from the six built-in themes, a saved brand palette, Business DNA colors, or custom hex values.
- `count`: any requested number of concepts. More concepts means more objects in the render spec, not a new workflow.
- `sizes`: social and print export sizes.

The final output is a gallery of distinct, premium, on-brand poster concepts rendered to PNG and, for print sizes, PDF. Each concept should be saved to Supabase Storage and made available for download and Social Hub publishing.

## Source Comparison

- Existing time2grow skill: strongest for SaaS safety, Business DNA, Supabase Storage, Social Hub handoff, provider secrecy, and n8n/Edge Function integration.
- Pasted Codex skill: strongest for creative quality, multi-concept rendering, logo placement, locked theme, six styles, multilingual typography, PNG/PDF output, and QA.
- Final skill: combine both. Use deterministic rendering for exact text/logo/layout, and use image providers for background imagery or design assistance only when they improve the poster.

## Workflow

1. Parse the brief: extract product, one core message, offer, CTA, contact, dates, price, app-store availability, language, target audience, and required brand facts.
2. Load Business DNA and saved brand assets server-side. Do not trust client-sent private brand state if the app can load it directly.
3. Lock the theme once for the whole set. Never let each concept invent its own colors.
4. Create distinct concept plans: benefit, emotional, direct-response, educational, authority, or local-business angle.
5. Render exact text, logo, and layout with app-controlled canvas/SVG/HTML where possible. Use OpenAI/ChatGPT image, Nano Banana Pro, or other providers as adapters for background/design generation, not as the only source of final text accuracy.
6. Export every selected size. Produce PNG for social sizes and PDF for A4/A3 or print requests.
7. Save files to `post-media`, create `content_items` and `social_media_assets`, return a gallery response, and enable Social Hub selection.
8. Run QA before presenting or marking ready.

## Read Before Editing

- Read [references/poster-quality-spec.md](references/poster-quality-spec.md) before changing prompts, layouts, dimensions, logo handling, or export behavior.
- Read [references/style-library.md](references/style-library.md) before changing built-in themes or color tokens.
- Read [references/copy-and-qa.md](references/copy-and-qa.md) before changing concept generation, Telugu/Hindi handling, or proofreading rules.
- Read [references/implementation-contract.md](references/implementation-contract.md) before changing n8n, Supabase, Edge Function, provider, storage, or Social Hub integration.

## Non-Negotiables

- Keep OpenAI, Nano Banana Pro, Canva, Supabase service role, and provider tokens out of frontend code.
- Do not invent discounts, awards, guarantees, testimonials, contact details, locations, app availability, prices, legal claims, or dates.
- Place the logo on every final poster unless the user explicitly asks for no logo. If no logo file exists, use a quiet text wordmark.
- Keep theme colors locked across the full set.
- Treat "Canva-like" as a quality bar, not a license to copy Canva assets, templates, or branding.
- Confirm real rendered output exists before saying the poster is created.
- If exact spelling matters, render final text outside the image model.

## Output Contract

Return a gallery shape that the app can use:

```json
{
  "ok": true,
  "mode": "poster_set",
  "theme": "signature",
  "concepts": [
    {
      "id": "concept-1",
      "title": "Poster title",
      "angle": "benefit",
      "language": "en",
      "files": [
        {"kind":"png","size":"1080x1350","url":"https://...","downloadUrl":"https://..."},
        {"kind":"pdf","size":"a4","url":"https://...","downloadUrl":"https://..."}
      ],
      "contentItemId": "uuid",
      "assetIds": ["uuid"],
      "qa": {"passed": true, "notes": []}
    }
  ]
}
```