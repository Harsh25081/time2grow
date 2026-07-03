# Voice And Scoring Reference

## Telugu Voice Defaults

- Default language: Telugu-English.
- Default writing style: romanized Telugu with simple English where natural.
- Default tone: friendly creator, practical, direct, not corporate.
- Accent/style is user-provided open text. Never force it into a fixed regional bucket.
- Respect region prompts such as Godavari, Vijayawada, Vizag, Rayalaseema, Telangana, Hyderabad, Nellore, Guntur, Srikakulam, or "simple Telugu for students."

## Accent Handling

Convert the user's accent/style prompt into delivery guidance:

- Vocabulary: simple/local words vs cleaner English-heavy words.
- Rhythm: storytelling, mass direct, urban punchy, student-friendly, expert calm.
- Sentence length: short punchy lines for reels, slightly longer lines for YouTube intros.
- CTA style: soft follow request, mass punch, expert credibility, or community invite.

Do not claim perfect dialect authenticity. Say "style direction" or "accent/style instruction" when explaining.

## Virality Scoring Language

Use these pillars:

- Profile strength: channel/profile clarity, recognizable niche, handle/title signal, visible authority.
- Hook clarity: first-line specificity, pain point, promise, curiosity, speed to value.
- Competitor gap: what competitors are not covering, or what the user can do more sharply.
- Share potential: usefulness, relatability, checklist value, myth-busting value.
- Consistency: recent publishing rhythm when real data exists.

Preferred data path:

- YouTube metrics should come from n8n calling ScrapeCreators.
- Instagram metrics should come from n8n calling ScrapeCreators.
- The app should not store ScrapeCreators API keys.
- The app should not ask the user to type metrics manually when n8n cannot fetch them.

Score labels:

- 0-44: Weak viral signal.
- 45-65: Average potential.
- 66-81: Promising.
- 82-100: Strong viral potential.

## Competitor Comparison Shape

For each competitor, include:

- Platform and handle.
- Main content pattern.
- Hook/title pattern.
- Strength.
- Gap the user can target.
- One script angle inspired by that gap.

## Script Variation Requirements

Each variation must include:

- Variation title and angle.
- Hook.
- Setup.
- Main body.
- Payoff.
- CTA.
- Caption.
- Hashtags.
- Shot list.
- Why this may work.

Variation angles should be meaningfully different:

- Pain-first hook.
- Mistake-led hook.
- Proof-first hook.
- Story-led hook.
- Competitor-gap hook.
- Checklist hook.
- Myth-busting hook.
- Transformation hook.
- Direct challenge hook.
- Community identity hook.

## Export Report Shape

PDF/Word export should include:

- Creator/profile analyzed.
- Platform and handle.
- Virality score.
- Score explanation.
- Key insights.
- Competitor comparison.
- Script variations.
- Caption options.
- Hashtag options.
- Shot lists.
- API/provider warnings.
