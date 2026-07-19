---
name: time2grow-linkedin-post
description: Write a single LinkedIn post from Business DNA and a user brief. Use for founder posts, agency and SaaS updates, B2B thought leadership, hiring posts, launch announcements, lessons learned, and proof-led professional posts destined for the LinkedIn feed. Do not use for blog articles or website pages (use time2grow-blog-post), for WhatsApp/Telegram/Facebook group messages (use time2grow-community-post), for scene-by-scene video scripts (use time2grow-video-script-writer), or for poster rendering.
---

# time2grow LinkedIn Post Writer

## Workflow

1. Load Business DNA and the user brief.
2. Extract product, audience, offer, CTA, language, keywords, and required facts.
3. Apply the structure below and the length band the request asks for.
4. Apply custom client rules from [references/custom-rules.md](references/custom-rules.md) when provided.
5. Return publish-ready copy plus a one-sentence `visualConcept` for the accompanying image.

## Structure

1. Hook: one sharp line.
2. Context: why this matters.
3. Body: 3-5 short paragraphs or bullets.
4. Insight/proof: only if supplied or from Business DNA.
5. CTA: comment, DM, book, visit, try, or learn.
6. Hashtags: 3-5 relevant tags.

Keep lines short. Avoid hype.

## Length Bands

The requested length is a hard constraint on the `body` word count, not a suggestion.

| length | body word count |
|---|---|
| short | 60-110 |
| standard | 120-200 |
| long | 220-320 |

## Output Shape

Return strict JSON only, no prose:

```json
{
  "title": "string",
  "summary": "string",
  "variants": [
    {
      "target": "linkedin",
      "title": "string",
      "body": "string",
      "cta": "string",
      "hashtags": ["string"],
      "visualConcept": "string"
    }
  ]
}
```

Return exactly one variant. `hashtags` carry no leading `#`. `visualConcept` is one sentence
describing an image that illustrates *this post's subject* — a concrete scene, not a generic brand
shot — and never describes text, logos, or typography.

## Language

- Use natural English, Telugu, or Telugu-English according to the request.
- For Telugu, write in Telugu script unless the user requests transliteration.
- Keep business tone clear, practical, and non-spammy.

## Never Invent

Do not invent statistics, offers, legal claims, guarantees, testimonials, discounts, prices, phone
numbers, addresses, awards, or contact details. If a fact is not in the brief or in Business DNA,
leave it out.
