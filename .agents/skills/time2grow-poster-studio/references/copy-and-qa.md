# Copy And QA

## Brief Parsing

Extract these fields from the brief:

- subject or product
- target audience
- one core message
- offer or hook
- CTA
- brand name
- contact details, URL, date, price, address, app-store availability
- language: English, Telugu, Hindi, or mixed
- desired feeling: premium, urgent, friendly, educational, local, executive

Ask only when a missing fact blocks output, such as no brand/logo fallback, unclear price, or unclear event date. Otherwise infer safely and note the assumption in metadata.

## Concept Angles

Create genuinely different concepts. Good angle set:

- Benefit: what the customer gets.
- Emotional: why it matters.
- Direct: offer, CTA, urgency, or conversion.
- Educational: 3 facts or steps.
- Authority: proof, positioning, trust.
- Local: place, festival, community, habit, or familiar use case.

Do not create five copies of the same headline.

## Copy Limits

- Eyebrow: 2-5 words.
- Headline: ideally 6 words or fewer; max 9 words for social.
- Subheadline: one line, ideally under 18 words.
- CTA: 2-5 words.
- Meta/footer: only required facts like URL, phone, date, address, app availability.

## Telugu And Hindi

- Write natural native copy, not word-by-word translation.
- Use Telugu script for `lang: "te"` and Devanagari for `lang: "hi"` unless the user asks for transliteration.
- Keep lines short because Indic scripts need more breathing room.
- Use deterministic renderer fonts such as Noto Telugu and Noto Devanagari when available.
- Proofread character by character before final output.

## Claim Safety

Do not invent:

- discounts or percentages
- award claims
- guarantees
- testimonials
- phone numbers
- addresses
- app-store availability
- legal/medical/financial claims
- urgency such as "today only" unless supplied

## Mandatory QA

Check every final file:

1. File opens and is not blank.
2. Logo exists, has correct aspect ratio, and has contrast.
3. Theme colors are locked across all concepts.
4. Headline, subheadline, CTA, phone, URL, dates, price, and address are correct.
5. Telugu/Hindi spelling is correct.
6. Text is not clipped and reads on mobile.
7. Export size is correct.
8. PDF is created for print sizes.
9. No placeholders remain.
10. Supabase records and Social Hub handoff are created when working inside time2grow.