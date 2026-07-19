# Poster Quality Spec

## Dimensions

Use export dimensions as the product contract, even when an image model uses a nearby generation size.

| Use | Export size | Model base |
| --- | --- | --- |
| Instagram/Facebook square | 1080x1080 | 1024x1024 |
| Instagram/Facebook portrait feed | 1080x1350 | 1024x1536, crop/fit |
| Stories/Reels/WhatsApp status | 1080x1920 | 1024x1536, extend/fit |
| LinkedIn portrait | 1200x1500 | 1024x1536 |
| LinkedIn/Facebook landscape | 1200x628 | 1536x1024, crop/fit |
| YouTube thumbnail | 1280x720 | 1536x1024, crop/fit |
| Google display landscape | 1200x628 | 1536x1024 |
| A4 print | 2480x3508 at 300 DPI | deterministic render |
| A3 print | 3508x4961 at 300 DPI | deterministic render |

Keep 8-10% safe margin. Keep CTA and contact details away from story/reel UI zones.

## Layout

- Use one clear focal point, one headline, one supporting line, and one CTA.
- Keep headline under 6-9 words unless the user overrides.
- Make every concept visually distinct, not just rewritten copy.
- Use generous space, strong hierarchy, and a controlled accent color.
- Use `bottom` for photo/motif-led posters, `centered` for type-led posters, `band` for offers, and `facts` for educational concepts.
- Avoid tiny paragraphs, visual clutter, fake app UI, fake logos, QR codes unless supplied, and decorative overload.

## Logo

- Place logo on every final poster, usually top-left, with controlled height around 56-80 px on 1080-wide social exports.
- Pick a logo variant that contrasts with the background: light logo on dark themes, dark logo on light themes.
- If only one logo exists, choose a background that preserves contrast or add a subtle safe logo plate.
- If no logo exists, use `brandword` as a quiet text wordmark.
- The logo identifies the brand; it must not compete with the headline.

## Color

- Lock one theme across the whole poster set.
- Use Business DNA colors first when reliable.
- Use a 4-color working palette: `bg`, `ink`, `muted`, `accent`; add `danger` or `success` only for direct-response needs.
- Maintain accessible contrast for headline, CTA, phone, URL, and price.
- Avoid random neon palettes, muddy gradients, low-contrast pastel text, cream/terracotta default AI looks, and one-note purple/blue themes.

## Typography

- Use clean sans-serif by default. Use editorial serif only for premium/luxury themes.
- Use at most two type families per poster.
- Use Noto Telugu for Telugu and Noto Devanagari for Hindi when deterministic rendering is available.
- Keep letter spacing normal; avoid warped, liquid, distorted, or decorative text.
- Render exact final text using HTML/CSS/canvas/SVG for production output.

## Imagery

Choose imagery per concept:

- Context photo: product, food, venue, local service, or people-free scene. Use a scrim/gradient for text readability.
- Designed motif: SaaS, B2B, data, abstract, or tech subjects. Use network, grid, device, dashboard, linework, or geometric motif.
- None/gradient: type-led or premium concepts.

Avoid celebrity/IP imagery, identifiable people without rights, random stock-feeling backgrounds, and visuals unrelated to the brief.

## Provider Routing

Use a shared internal brief for all providers:

```json
{
  "context": "brief text",
  "logoPath": "optional absolute or storage path",
  "brandword": "fallback wordmark",
  "theme": "value | premium | bold | edu | direct | signature | custom",
  "colors": {"bg":"#0C1A2E","ink":"#F1ECE0","muted":"#9FB0C4","accent":"#C8A24C"},
  "language": "en | te | hi | mixed",
  "sizes": ["portrait", "square", "story", "a4"],
  "concepts": []
}
```

Provider guidance:

- `chatgpt-image`: use server-side OpenAI image generation for imagery/design assistance. Keep timeouts high.
- `nano-banana-pro`: add only when a real endpoint, key, and model contract are configured. Do not invent API behavior.
- `canva-like`: quality target only unless an official Canva integration is intentionally added.
- Deterministic renderer: preferred final step for exact text, logo placement, PNG/PDF export, and batch concepts.

## QA Gate

Before presenting output, verify:

- Every requested concept file exists and opens.
- Logo is present, readable, and not stretched.
- Theme colors match across the whole set.
- English/Telugu/Hindi spelling is correct character by character.
- Phone, URL, date, price, address, and app-store names match the brief.
- Headline reads at a glance on mobile preview.
- CTA is present unless intentionally omitted.
- Nothing is clipped, off-canvas, blurred, or hidden by platform safe zones.
- No placeholder text, fake logo, fake QR, fake contact, or invented claim remains.