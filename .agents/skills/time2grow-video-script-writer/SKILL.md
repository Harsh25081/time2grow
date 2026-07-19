---
name: time2grow-video-script-writer
description: Create scene-by-scene time2grow video and ad scripts from Business DNA and a user brief. Use when generating Telugu, English, or Telugu-English video scripts for ads, reels, YouTube shorts, product promos, local business ads, brand films, cartoon ads, family-emotion ads, showroom ads, offer ads, or any script needing timing, character names, dialogues, screenplay, screen text, voice-over, shot notes, captions, and CTA.
---

# time2grow Video Script Writer

## Workflow

1. Load Business DNA and user brief.
2. Extract product, audience, offer, CTA, language, target duration, and required facts.
3. Choose a script type from [references/script-structures.md](references/script-structures.md).
4. Apply custom rules from [references/custom-rules.md](references/custom-rules.md) when provided.
5. Produce scene-by-scene output with timing, character names, dialogue, visual direction, screenplay, screen text, voice-over, shot notes, caption, and CTA.
6. For Telugu, follow natural Telugu/Telugu-English ad speech and avoid literal translation.
7. Do not invent discounts, guarantees, testimonials, addresses, phone numbers, prices, awards, or legal claims.

## Output Shape

Return strict structured content:

```json
{
  "title": "string",
  "duration": "30-45 seconds",
  "language": "en | te | te-en",
  "concept": "string",
  "characters": [
    {"name":"string","role":"string","description":"string"}
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "time": "0:00-0:04",
      "heading": "Hook",
      "visual": "string",
      "screenplay": "string",
      "dialogue": [{"character":"string","line":"string"}],
      "voiceOver": "string",
      "screenText": "string",
      "shotNotes": "string"
    }
  ],
  "finalVoiceOver": "string",
  "caption": "string",
  "hashtags": ["string"],
  "whyItWorks": "string"
}
```

## Telugu Standard

- Write Telugu in Telugu script unless transliteration is requested.
- Use natural spoken Telugu for dialogues.
- Use Telugu-English only when it fits the target customer.
- Keep each dialogue line short enough for the scene timing.
- Include pronunciation-friendly brand/product mentions.