export type PostTarget = 'linkedin' | 'blog' | 'community';
export type PostLength = 'short' | 'standard' | 'long';
export type ScriptDuration = '15' | '30' | '45' | '60' | '90';
export type ContentLanguage = 'te' | 'en' | 'te-en' | 'hi' | 'hi-en' | 'kn' | 'kn-en';

export type WordRange = { min: number; max: number };

const noInventedFacts =
  'Do not invent statistics, offers, legal claims, guarantees, testimonials, discounts, prices, phone numbers, addresses, awards, or contact details. If a fact is not in the brief or in Business DNA, leave it out.';

const groundingRule =
  'Ground every sentence in the provided brief and Business DNA. Stay strictly on the exact subject, product, offer, and audience in the brief; never drift into generic marketing, branding, or advertising filler that could apply to any business. When the brief is short, write only about what it actually gives you rather than padding with invented detail. Prefer a shorter, specific, truthful piece over a longer vague one. If a useful specific such as a number, feature, or benefit is not supported by the brief or Business DNA, state it in general truthful terms or leave it out; never fabricate it, and never emit placeholders like [X], TBD, or lorem ipsum.';

const researchRule =
  'You may be given a fetchedSources array of real web pages fetched moments ago, each with a url and an excerpt of its actual text. You MAY cite only these exact URLs, and you MAY present as external data, statistics, or examples only facts that actually appear in those excerpts. Never cite a URL that is not in fetchedSources, never invent a statistic, study, or link, and prefer linking the user\'s own website. If fetchedSources is empty or missing, include no external links and no external statistics at all. Whenever you state a specific fact, statistic, figure, or example taken from a source, attribute it in-line right where the claim appears: name the source and include its URL at that point, for example "According to Acme (https://acme.com/report), ...". Never present sourced data or a real example without naming where it came from. Put the link inline as a plain URL in LinkedIn and community posts, or as a Markdown link in blog bodies.';

const languageRule =
  'Write in the requested language exactly: English, Telugu, Telugu-English, Hindi, Hindi-English, Kannada, or Kannada-English. Use natural Telugu script for Telugu, natural Devanagari script for Hindi, and natural Kannada script for Kannada, unless the request asks for transliteration. For the mixed variants (Telugu-English, Hindi-English, Kannada-English), code-switch naturally the way local social copy does.';

const visualConceptRule =
  'visualConcept is ONE sentence describing an image that illustrates this specific subject as a concrete scene. Never describe text, letters, words, numbers, typography, logos, or watermarks in it, and never fall back to a generic brand or office stock image.';

const postJsonShape =
  'Reply with strict JSON only, no prose, matching this exact shape: {"title":string,"summary":string,"variants":[{"target":string,"title":string,"body":string,"cta":string,"hashtags":[string],"visualConcept":string}]}. Return exactly one variant, for the requested target only. Hashtags carry no leading "#".';

/**
 * Word ranges are stated to the model as a hard requirement, then used to size max_tokens.
 * They differ per target because "long" means something very different on LinkedIn than on a blog.
 */
const postWordRanges: Record<PostTarget, Record<PostLength, WordRange>> = {
  linkedin: {
    short: { min: 60, max: 110 },
    standard: { min: 120, max: 200 },
    long: { min: 220, max: 320 },
  },
  community: {
    short: { min: 40, max: 80 },
    standard: { min: 90, max: 150 },
    long: { min: 160, max: 240 },
  },
  blog: {
    short: { min: 300, max: 500 },
    standard: { min: 600, max: 900 },
    long: { min: 1000, max: 1400 },
  },
};

/**
 * A 90-second script carries roughly three times the scenes of a 30-second one. Under-budgeting
 * truncates the JSON mid-scene, which surfaces to the user as an opaque "response could not be read".
 */
const scriptTokenBudgets: Record<ScriptDuration, number> = {
  '15': 1800,
  '30': 2600,
  '45': 3400,
  '60': 4200,
  '90': 5600,
};

export const noTextInImageClause =
  'No text, no letters, no words, no numbers, no typography, no logos, and no watermarks anywhere in the image.';

export function postWordRange(target: PostTarget, length: PostLength): WordRange {
  return postWordRanges[target][length];
}

/**
 * English costs roughly 2 tokens per word. Telugu script tokenizes far more heavily, so the same
 * word count needs a much larger budget. Under-budgeting truncates the JSON and the user only ever
 * sees "The AI response could not be read."
 */
function languageTokenFactor(language: ContentLanguage) {
  return language === 'en' ? 2 : 4;
}

export function postMaxTokens(target: PostTarget, length: PostLength, language: ContentLanguage) {
  return Math.max(900, Math.round(postWordRange(target, length).max * languageTokenFactor(language)));
}

export function scriptMaxTokens(duration: ScriptDuration, language: ContentLanguage) {
  const budget = scriptTokenBudgets[duration];
  return language === 'en' ? budget : Math.round(budget * 1.6);
}

const postStructures: Record<PostTarget, string> = {
  linkedin: [
    'You are the time2grow LinkedIn Post Writer. Write one post for the LinkedIn feed.',
    'Structure it as: a one-line hook; context explaining why this matters; a body of 3-5 short paragraphs or bullets; an insight or proof point ONLY if the brief or Business DNA supplies one; a call to action; and 3-5 relevant hashtags.',
    'Keep lines short. Avoid hype and corporate filler.',
  ].join(' '),
  blog: [
    'You are the time2grow Blog Post Writer. Write one long-form, SEO-friendly article.',
    'Structure it as: an SEO title; an introduction; 3-5 sections each with its own heading; practical examples; and a closing call to action. The body must contain the full article including its section headings.',
    'Weave any requested keywords in naturally, including at least one in the title and one in the introduction. Never keyword-stuff. Keep it readable and factual, and do not invent external data.',
  ].join(' '),
  community: [
    'You are the time2grow Community Post Writer. Write one message for a WhatsApp, Telegram, or Facebook group.',
    'Structure it as: a friendly opener; the main message; the offer or details; a simple call to action; and optionally a few short hashtags.',
    'Keep it conversational and direct, so it can be pasted straight into a group chat. Match how the local audience actually talks, and avoid corporate phrasing.',
  ].join(' '),
};

export function postSystemPrompt(target: PostTarget) {
  return [postStructures[target], postJsonShape, visualConceptRule, languageRule, groundingRule, researchRule, noInventedFacts].join(' ');
}

export function videoSystemPrompt() {
  return [
    'You are the time2grow Video Script Writer. Create a scene-by-scene ad/video script from Business DNA and the user brief.',
    'Reply with strict JSON only, no prose, matching this exact shape: {"title":string,"duration":string,"language":string,"concept":string,"characters":[{"name":string,"role":string,"description":string}],"scenes":[{"sceneNumber":number,"time":string,"heading":string,"visual":string,"screenplay":string,"dialogue":[{"character":string,"line":string}],"voiceOver":string,"screenText":string,"shotNotes":string}],"finalVoiceOver":string,"caption":string,"hashtags":[string],"whyItWorks":string}',
    'Scene time ranges use M:SS-M:SS, run in order with no gaps and no overlaps, and start at 0:00. Treat the requested duration as a maximum, not a target: the last scene must end at or before it. Let the story decide the real length, and prefer a tight, complete script over padding scenes to fill the time.',
    'Every dialogue line must be attributed to a character listed in characters, and must be short enough to be spoken inside its scene timing.',
    'Hashtags carry no leading "#".',
    languageRule,
    'For Telugu, use natural spoken Telugu for dialogue rather than literal translation.',
    groundingRule,
    noInventedFacts,
  ].join(' ');
}

export function postVisualSystemPrompt() {
  return [
    'You are the art director for a premium content studio. You are given a social or blog post and the brand facts behind it. Design the accompanying image.',
    'Reply with strict JSON only, no prose, matching this exact shape: {"imagePrompt":string}.',
    'Choose the treatment that best fits the subject. Prefer a "Visual Value" conceptual style when the post is about an idea, method, insight, or benefit: minimal, high-contrast, one single clear visual metaphor for the core idea, clean geometry, arrows or grids, generous negative space, restrained palette. Use a concrete photographic scene instead only when the subject is a real physical place, product, food, or event. Either way, the image must depict THIS post\'s exact subject or its precise metaphor, never generic office, handshake, or stock brand imagery.',
    'imagePrompt vividly describes the chosen image in 60 to 120 words: subject or metaphor, composition, mood, lighting or contrast, colour, and art style. Use the supplied brand colours when they suit the subject.',
    `imagePrompt MUST end with exactly this sentence: "${noTextInImageClause}"`,
    'Never depict discounts, prices, phone numbers, addresses, dates, awards, guarantees, or testimonials.',
  ].join(' ');
}

export const VIRALITY_THRESHOLD = 75;

const viralityPillars =
  'Score these five pillars, each 0-100: "Hook" (does the opening line stop the scroll?), "Clarity & promise" (is the value obvious and specific?), "Share/save potential" (is it useful, relatable, or quotable enough to share?), "Audience fit" (does it speak to the stated audience in their language?), and "CTA strength" (is the ask clear and compelling?). The overall "score" is your honest weighted judgement of how viral this content is likely to be, 0-100.';

// The `revised` field must echo the exact shape of whatever content is being scored, so the caller
// can feed the improved version straight back through the same parser.
const postRevisedShape =
  '{"title":string,"summary":string,"variants":[{"target":string,"title":string,"body":string,"cta":string,"hashtags":[string],"visualConcept":string}]}';
const videoRevisedShape =
  '{"title":string,"duration":string,"language":string,"concept":string,"characters":[{"name":string,"role":string,"description":string}],"scenes":[{"sceneNumber":number,"time":string,"heading":string,"visual":string,"screenplay":string,"dialogue":[{"character":string,"line":string}],"voiceOver":string,"screenText":string,"shotNotes":string}],"finalVoiceOver":string,"caption":string,"hashtags":[string],"whyItWorks":string}';

export function viralitySystemPrompt(kind: 'post' | 'video', threshold: number) {
  const revisedShape = kind === 'video' ? videoRevisedShape : postRevisedShape;
  return [
    'You are a blunt but fair virality editor for social and marketing content. You are given a finished piece of content, must judge how likely it is to perform, and must improve it when it falls short.',
    'This score is an editorial self-assessment against a rubric, not a guarantee of real-world reach. Be honest — do not inflate scores.',
    viralityPillars,
    `Reply with strict JSON only, no prose, matching this exact shape: {"score":number,"pillars":[{"name":string,"score":number,"note":string}],"summary":string,"revised":${revisedShape}|null}. Include exactly the five pillars named above, each with a one-line "note", and a one-line overall "summary". The "score" is the honest score of the content you were given.`,
    `If the given content already scores ${threshold} or higher, set "revised" to null. If it scores below ${threshold}, rewrite it to lift the weakest pillars above ${threshold} and put the improved version in "revised" using the exact shape above.`,
    'When you revise, keep the same language, the same length or duration, the same offer and facts, and every scene timing rule. Change wording, hook, and structure to raise virality — never invent discounts, prices, phone numbers, addresses, guarantees, awards, or testimonials.',
    'Accuracy and grounding gate: cap the overall score at 60 if the content invents any specific fact not supported by the brief or Business DNA, or drifts into generic marketing that is not about the exact subject of the brief. High virality never justifies a fabricated or off-context claim, and any revision must obey this same gate.',
    'Judge and revise the content in whatever language it is written; do not penalise it for not being in English.',
  ].join(' ');
}
