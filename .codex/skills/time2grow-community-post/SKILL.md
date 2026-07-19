---
name: time2grow-community-post
description: Write a friendly community group message from Business DNA and a user brief. Use for WhatsApp groups, Telegram channels, Facebook groups, local audience updates, neighbourhood announcements, and conversational offer messages. Do not use for LinkedIn feed posts (use time2grow-linkedin-post), for blog articles or website pages (use time2grow-blog-post), for scene-by-scene video scripts (use time2grow-video-script-writer), or for poster rendering.
---

# time2grow Community Post Writer

## Workflow

1. Load Business DNA and the user brief.
2. Extract product, audience, offer, CTA, language, keywords, and required facts.
3. Apply the structure below and the length band the request asks for.
4. Apply custom client rules from [references/custom-rules.md](references/custom-rules.md) when provided.
5. Return a publish-ready message plus a one-sentence `visualConcept` for the accompanying image.

## Structure

1. Friendly opener.
2. Main message.
3. Offer/details.
4. Simple CTA.
5. Optional short hashtags.

Keep it conversational and direct. Write it so it can be pasted straight into a group chat.

## Length Bands

The requested length is a hard constraint on the `body` word count, not a suggestion.

| length | body word count |
|---|---|
| short | 40-80 |
| standard | 90-150 |
| long | 160-240 |

## Output Shape

Return strict JSON only, no prose:

```json
{
  "title": "string",
  "summary": "string",
  "variants": [
    {
      "target": "community",
      "title": "string",
      "body": "string",
      "cta": "string",
      "hashtags": ["string"],
      "visualConcept": "string"
    }
  ]
}
```

Return exactly one variant. `hashtags` carry no leading `#` and stay short. `visualConcept` is one
sentence describing an image that illustrates *this message's subject* — a concrete scene, not a
generic brand shot — and never describes text, logos, or typography.

## Language

- Use natural English, Telugu, or Telugu-English according to the request.
- For Telugu, write in Telugu script unless the user requests transliteration.
- Match how the local audience actually talks. Avoid corporate phrasing.

## Never Invent

Do not invent statistics, offers, legal claims, guarantees, testimonials, discounts, prices, phone
numbers, addresses, awards, or contact details. If a fact is not in the brief or in Business DNA,
leave it out.
