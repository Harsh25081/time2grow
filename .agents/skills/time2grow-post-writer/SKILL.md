---
name: time2grow-post-writer
description: Create time2grow text posts from Business DNA and a user brief. Use when generating LinkedIn posts, blog posts, community posts, social captions, announcement posts, thought-leadership posts, or platform-ready post copy in English, Telugu, or Telugu-English. Do not use for poster rendering, long documents, or scene-by-scene video scripts.
---

# time2grow Post Writer

## Workflow

1. Load Business DNA and user brief.
2. Choose one post destination: LinkedIn, blog, community, or social caption.
3. Use the matching structure in [references/post-formats.md](references/post-formats.md).
4. Apply custom client rules from [references/custom-rules.md](references/custom-rules.md) when provided.
5. Return publish-ready copy with title, body, CTA, and optional hashtags.
6. Avoid invented proof, discounts, guarantees, statistics, testimonials, phone numbers, addresses, or legal claims.

## Output Shape

Return strict structured content:

```json
{
  "title": "string",
  "summary": "string",
  "variants": [
    {
      "platform": "linkedin | blog | community",
      "title": "string",
      "body": "string",
      "cta": "string",
      "hashtags": ["string"]
    }
  ]
}
```

## Language

- Use natural English, Telugu, or Telugu-English according to the request.
- For Telugu, write in Telugu script unless the user requests transliteration.
- Keep business tone clear, practical, and non-spammy.