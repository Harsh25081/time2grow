---
name: time2grow-blog-post
description: Write a long-form blog article from Business DNA and a user brief. Use for SEO-friendly website articles, educational guides, how-to pieces, and any content that needs an SEO title, an introduction, and several headed sections. Do not use for LinkedIn feed posts (use time2grow-linkedin-post), for WhatsApp/Telegram/Facebook group messages (use time2grow-community-post), for scene-by-scene video scripts (use time2grow-video-script-writer), or for poster rendering.
---

# time2grow Blog Post Writer

## Workflow

1. Load Business DNA and the user brief.
2. Extract product, audience, offer, CTA, language, keywords, and required facts.
3. Apply the structure below and the length band the request asks for.
4. Apply custom client rules from [references/custom-rules.md](references/custom-rules.md) when provided.
5. Return a publish-ready article plus a one-sentence `visualConcept` for the header image.

## Structure

1. SEO title.
2. Intro.
3. 3-5 sections with headings.
4. Practical examples.
5. Closing CTA.

Keep it readable and factual. Do not invent external data.

Weave the requested keywords in naturally, including at least one in the title and one in the intro.
Never keyword-stuff.

## Length Bands

The requested length is a hard constraint on the `body` word count, not a suggestion.

| length | body word count |
|---|---|
| short | 300-500 |
| standard | 600-900 |
| long | 1000-1400 |

## Output Shape

Return strict JSON only, no prose:

```json
{
  "title": "string",
  "summary": "string",
  "variants": [
    {
      "target": "blog",
      "title": "string",
      "body": "string",
      "cta": "string",
      "hashtags": ["string"],
      "visualConcept": "string"
    }
  ]
}
```

Return exactly one variant. `body` carries the full article with its section headings. `hashtags`
carry no leading `#`. `visualConcept` is one sentence describing a header image that illustrates
*this article's subject* — a concrete scene, not a generic brand shot — and never describes text,
logos, or typography.

## Language

- Use natural English, Telugu, or Telugu-English according to the request.
- For Telugu, write in Telugu script unless the user requests transliteration.
- Keep business tone clear, practical, and non-spammy.

## Never Invent

Do not invent statistics, offers, legal claims, guarantees, testimonials, discounts, prices, phone
numbers, addresses, awards, or contact details. If a fact is not in the brief or in Business DNA,
leave it out.
