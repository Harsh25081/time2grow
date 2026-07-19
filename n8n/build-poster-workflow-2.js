const fs = require('fs');
const path = require('path');

const root = __dirname;

const workflowName = 'time2grow-poster-workflow-2';
const webhookPath = 'time2grow-poster-workflow-2';

// The planner returns a set of finished-poster concepts. Each concept carries the
// exact text to render plus a complete image prompt. The image model then bakes
// the whole poster (text included) - there is no browser text overlay.
const posterConceptSchema = {
  concepts: [
    {
      title: 'Bright Diwali greeting',
      angle: 'festive greeting',
      primaryText: 'Happy Diwali',
      secondaryText: 'Warm wishes from AD96',
      ctaText: '',
      imagePrompt:
        'A premium, minimalist Diwali greeting poster, portrait. Deep indigo background (#0C1A2E) with a single glowing gold (#C8A24C) diya and simple rangoli-inspired geometry, generous negative space. Render exactly two separate text blocks only: large centered headline "Happy Diwali" and small support line "Warm wishes from AD96". Do not render the raw instruction sentence, do not merge headline and support line, do not add the word logo, and do not add extra text. A small AD96 brand signature only in the top-left corner. High-end, editorial, Canva-quality, print-ready, high resolution. No watermark, no QR code, no extra or misspelled words, no stock-photo clutter.',
    },
  ],
};
function code(value) {
  return value.trim();
}

const normalizeRequestCode = code(String.raw`
const body = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const safeColors = object(body.palette || body.colors);
const businessDna = object(body.businessDna);
const logo = object(body.logo);
const productImage = object(body.productImage);
const copy = object(body.copy);

const format = oneOf(text(body.format, 30), ['portrait', 'square', 'landscape', 'story', 'youtube'], 'portrait');
const language = oneOf(text(body.language, 20), ['en', 'te', 'hi'], 'en');
const topic = text(body.topic || body.rawBrief || body.userIdea || body.brief || body.context, 900) || 'Poster campaign';
const objective = text(body.objective || body.goal, 120) || 'Generic poster';
const brandName = text(body.brandName || body.brandword || businessDna.brandName || logo.brandName, 120) || 'time2grow brand';
const requestedCount = Math.min(4, Math.max(1, Number(body.count) || 1));
const conceptCount = Math.min(4, Math.max(1, Number(body.conceptCount) || requestedCount));
const previewCount = Math.min(3, Math.max(1, Number(body.previewCount) || 1));
const offerType = text(body.offerType || body.offer_type, 80);
const offer = text(body.offer || body.offerDetails || body.offer_details, 220);
// Split a raw CTA like "call now/ for demo 9276969696" into clean action words
// plus the exact contact number. The number is preserved verbatim; the wording
// is cleaned of slashes and the digits so it can render as a real button.
function parseCta(raw) {
  const value = text(raw, 160);
  if (!value) return { wording: '', contact: '' };
  const phoneMatch = value.match(/(\+?\d[\d\s\-().]{5,}\d)/);
  const contact = phoneMatch ? phoneMatch[1].replace(/\s+/g, ' ').trim() : '';
  let wording = phoneMatch ? value.replace(phoneMatch[1], ' ') : value;
  wording = wording.replace(/[\/|,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  wording = wording.split(' ').slice(0, 5).join(' ');
  if (wording) wording = wording.charAt(0).toUpperCase() + wording.slice(1);
  return { wording: wording, contact: contact };
}
const ctaParsed = parseCta(body.callToAction || body.cta || copy.callToAction);
const requestedCta = ctaParsed.wording;
const requestedContact = text(ctaParsed.contact || body.contact || body.phone || copy.footerContact, 40);
// Contact details the user explicitly chose to show (checkboxes in the app),
// prefilled from Business DNA but editable per poster. Shown exactly, never invented.
const chosenContact = object(body.contactDetails);
const contactDetails = {
  website: text(chosenContact.website, 200),
  phone: text(chosenContact.phone, 40),
  email: text(chosenContact.email, 120),
};
const contactSummary = [
  contactDetails.website ? 'website ' + contactDetails.website : '',
  contactDetails.phone ? 'phone ' + contactDetails.phone : '',
  contactDetails.email ? 'email ' + contactDetails.email : '',
].filter(Boolean).join(', ') || 'none';
const qrRequested = Boolean(object(body.qr).show || body.showQr);
const theme = oneOf(text(body.theme, 40), ['value', 'premium', 'bold', 'edu', 'direct', 'signature', 'custom'], 'custom');
const sizeByFormat = {
  square: '1080x1080 square',
  portrait: '1080x1350 portrait',
  story: '1080x1920 story',
  landscape: '1200x628 landscape',
  youtube: '1280x720 YouTube thumbnail',
};
const sizesNeeded = Array.isArray(body.sizes)
  ? body.sizes.map((item) => text(item, 80)).filter(Boolean).slice(0, 5)
  : [sizeByFormat[format] || '1080x1350 portrait'];
const logoUrl = text(logo.url || body.logoUrl, 2000);
const productImageName = text(productImage.name || body.productImageName, 180);
const productImageAvailable = Boolean(productImage.available || body.hasProductImage || productImageName);
const productImageCutout = Boolean(productImage.hasCutout || productImage.cutout);
const productMarketingMode = Boolean(body.productMarketingMode || object(body.productMode).enabled || productImageAvailable);
const learningContextObject = object(body.learningContext);
const learningSummary = text(body.learningContext, 3000) || text(learningContextObject.summary, 3000);
function textList(value, max = 120) {
  return Array.isArray(value) ? value.map((item) => text(item, max)).filter(Boolean) : [];
}
function uniqueTextList(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const previousHeadlines = uniqueTextList([
  ...textList(learningContextObject.previousHeadlines),
  ...textList(learningContextObject.forbiddenHeadlines),
  ...textList(learningContextObject.titles),
  ...textList(learningContextObject.pickedHeadlines),
  ...textList(learningContextObject.recentHeadlines),
]).slice(0, 24);
const forbiddenHeadlineText = previousHeadlines.length ? previousHeadlines.join(' | ') : 'none';
function classifyUseCase() {
  const requestText = [topic, objective, text(body.assetType, 120), text(body.editIntent, 120), text(body.preferredStyle || body.style, 300)].join(' ').toLowerCase();
  if (/translate|locali[sz]e|replace text|change text/.test(requestText)) return 'text-localization';
  if (/transparent|remove background|cutout|background extraction/.test(requestText)) return 'background-extraction';
  if (/remove object|replace object|object edit|interior swap/.test(requestText)) return 'precise-object-edit';
  if (/style transfer|same style|reference style/.test(requestText)) return 'style-transfer';
  if (/combine|composite|merge image|insert into/.test(requestText)) return 'compositing';
  if (/sketch to|drawing to|render my sketch/.test(requestText)) return 'sketch-to-render';
  if (/logo|wordmark|brand mark/.test(requestText) && !/poster|ad|flyer|creative|campaign/.test(requestText)) return 'logo-brand';
  if (/mockup|packaging|catalog|merch|product shot/.test(requestText)) return 'product-mockup';
  if (/wireframe|ui mockup|app screen|website mockup/.test(requestText)) return 'ui-mockup';
  if (/infographic|diagram|chart|flowchart|process/.test(requestText)) return 'infographic-diagram';
  if (/slide|workflow|dashboard|report|data visual/.test(requestText)) return 'productivity-visual';
  if (/comic|story|children|character scene/.test(requestText)) return 'illustration-story';
  if (/3d|stylized|concept art/.test(requestText)) return 'stylized-concept';
  if (/historical|period accurate|ancient|medieval/.test(requestText)) return 'historical-scene';
  if (/photo|photoreal|lifestyle|editorial/.test(requestText) && !/ad|poster|flyer|campaign/.test(requestText)) return 'photorealistic-natural';
  if (/science|classroom|lesson|educational diagram/.test(requestText)) return 'scientific-educational';
  return 'ads-marketing';
}
const useCase = classifyUseCase();

const payloadForAgents = {
  workflow: 'time2grow-poster-workflow-2',
  topic,
  rawBrief: text(body.rawBrief || body.userIdea || body.brief || body.context, 1800),
  objective,
  preferredStyle: text(body.preferredStyle || body.style, 500),
  format,
  language,
  useCase,
  offerType,
  offer,
  requestedCta,
  requestedContact,
  contactDetails,
  qrRequested,
  theme,
  sizesNeeded,
  count: conceptCount,
  previewCount,
  brandName,
  orgId: text(body.orgId, 90),
  userId: text(body.userId, 90),
  palette: safeColors,
  businessDna,
  productMarketingMode,
  logo: {
    url: logoUrl,
    brandName,
    source: text(logo.source, 80) || (logoUrl ? 'business_dna' : 'wordmark'),
  },
  productImage: {
    available: productImageAvailable,
    name: productImageName,
    source: text(productImage.source, 80) || (productImageAvailable ? 'poster_upload' : 'none'),
    hasCutout: productImageCutout,
  },  currentCopy: {
    headline: text(copy.headline, 160),
    subheadline: text(copy.subheadline, 260),
    callToAction: requestedCta,
    contactText: requestedContact,
  },
  learningContext: learningSummary,
  previousHeadlines,
  forbiddenHeadlines: previousHeadlines,
  varietyToken: Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36),
};

const structuredUserMessage = [
  'Brief: ' + topic,
  'Goal/objective: ' + objective,
  'Brand name / wordmark fallback: ' + brandName,
  'Logo available: ' + (logoUrl ? 'yes' : 'no'),
  'Product marketing poster mode: ' + (productMarketingMode ? 'yes' : 'no'),
  'Poster-only product image uploaded: ' + (productImageAvailable ? 'yes' : 'no'),
  productImageAvailable ? 'Uploaded product image filename: ' + (productImageName || 'unnamed product image') : '',
  productImageAvailable ? 'Product image background already removed where possible: ' + (productImageCutout ? 'yes' : 'no') : '',
  'Theme: ' + theme + ' (one of: value, premium, bold, edu, direct, signature, or custom hex)',
  'Custom colors (if theme=custom): ' + JSON.stringify(safeColors),
  'Language: ' + language + ' (en=English, te=Telugu, hi=Hindi)',
  'Use case taxonomy slug: ' + useCase,
  'Offer type (optional): ' + (offerType || 'none'),
  'Offer/details (optional): ' + (offer || 'none'),
  'CTA wording (optional, may be refined): ' + (requestedCta || 'none'),
  'Contact/phone to show EXACTLY (optional): ' + (requestedContact || 'none'),
  'Brand contact details available - show only those present, exact, never invented: ' + contactSummary,
  'QR code overlay requested (reserve a clean square, never draw a QR): ' + (qrRequested ? 'yes' : 'no'),
  'Number of concepts needed: ' + conceptCount,
  'Number of preview images per concept: ' + previewCount,
  'Sizes needed: ' + sizesNeeded.join(', '),
  payloadForAgents.preferredStyle ? 'Style notes: ' + payloadForAgents.preferredStyle : '',
  payloadForAgents.learningContext ? 'User preference memory: ' + payloadForAgents.learningContext : '',
  'Previous headlines that are forbidden to reuse or lightly rewrite: ' + forbiddenHeadlineText,
].filter(Boolean).join('\n');

const agentInput = [
  'Return strict JSON only.',
  'Use this structured user message as the source of truth:',
  structuredUserMessage,
  '',
  'Important interpretation rules:',
  '- The Brief is the PRIMARY instruction. The Goal/objective is only a helper.',
  '- Offer type, offer/details, and CTA are optional. If blank, do not force a CTA or offer.',
  '- CTA wording is intent, not fixed display text: refine it into clean, natural button words (e.g. "call now for demo" -> "Book a Demo" or "Call Now"). Never output slashes or the raw typed input in ctaText.',
  '- If a Contact/phone is supplied, it is exact contact info: put those digits UNCHANGED in footerContact and keep them OUT of ctaText. Never alter, add, or drop a digit, and never invent a phone number.',
  '- If offer/details are supplied, use only those facts. Never invent discounts, prices, dates, urgency, or extra claims.',
  '- If product marketing poster mode is on, make the product, model, pack, machine, appliance, tractor, cosmetic, food item, or offer the main visual idea. If no product photo is uploaded, create a product-led visual from the brief without inventing unsupported specs.',
  '- If a poster-only product image is uploaded, treat it as the real product source for this poster only. The app will overlay the actual product photo after image generation, so reserve a clean product hero zone instead of drawing a different main product. Choose productImagePlacement from left, right, top, bottom, center and productImageTreatment from plain or soft-card.',
  '- Return EXACTLY ' + conceptCount + ' concept object(s) in concepts[]. If the count is 1, return one finished poster concept only.',
  '- If more than one concept is requested later, make them genuinely different: different angle, scene/backdrop, focal visual, layout, and copy. Do not make near-duplicates.',
  '- Previous headlines are spent ideas, not preferences. Never reuse or lightly rewrite any forbidden headline.',
  '- Avoid lazy formula headlines like "Content without chaos", "Manage content clearly", "Launch content faster", or simple "verb + content + adjective/adverb" variations unless the user supplied that exact line.',
  '- Do NOT copy the raw brief into primaryText or secondaryText. Extract clean poster copy.',
  '- Example: if Brief is "Happy Diwali wishes from AD96 with a warm premium festive look", return primaryText "Happy Diwali", secondaryText "Warm wishes from AD96", and ctaText "".',
  '- Every imagePrompt must quote the exact final text to display and demand correct spelling. It must also say not to merge text blocks and not to render prompt/style words.',
  '- Create original Visual Value inspired conceptual design only when useful; never copy a creator/template.',
  '- Fresh-creativity seed: ' + payloadForAgents.varietyToken + '.',
  '',
  'Machine-readable request payload:',
  JSON.stringify(payloadForAgents, null, 2),
].join('\n\n');

return [{
  json: {
    mode: text(body.mode || body.action, 80) || 'poster_set',
    workflow: 'time2grow-poster-workflow-2',
    receivedAt: new Date().toISOString(),
    payloadForAgents,
    agentInput,
  },
}];
`);

// Turn the planner's concept set into one item per concept so the image node
// runs once per concept and we get N finished posters.
const expandConceptsCode = code(String.raw`
// Tolerant JSON reader: unwrap code fences, then fall back to the first {...} block.
function parseMaybeJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  const fence = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
  const raw = value.trim()
    .replace(new RegExp('^' + fence + 'json', 'i'), '')
    .replace(new RegExp('^' + fence), '')
    .replace(new RegExp(fence + '$'), '')
    .trim();
  try { return JSON.parse(raw); } catch (e) {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch (e2) {}
  }
  return {};
}

const FESTIVALS = [
  { names: ['diwali', 'deepavali', 'deepawali', 'deepwali'], greeting: 'Happy Diwali', noun: 'Diwali' },
  { names: ['holi'], greeting: 'Happy Holi', noun: 'Holi' },
  { names: ['christmas', 'xmas'], greeting: 'Merry Christmas', noun: 'Christmas' },
  { names: ['new year'], greeting: 'Happy New Year', noun: 'New Year' },
  { names: ['eid'], greeting: 'Eid Mubarak', noun: 'Eid' },
  { names: ['pongal'], greeting: 'Happy Pongal', noun: 'Pongal' },
  { names: ['sankranti'], greeting: 'Happy Sankranti', noun: 'Sankranti' },
  { names: ['ugadi'], greeting: 'Happy Ugadi', noun: 'Ugadi' },
  { names: ['dussehra', 'dasara'], greeting: 'Happy Dussehra', noun: 'Dussehra' },
];

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalized(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function wordCount(value) {
  const cleaned = compact(value);
  return cleaned ? cleaned.split(/\s+/).length : 0;
}

function detectFestival(value) {
  const haystack = normalized(value);
  return FESTIVALS.find(function (festival) {
    return festival.names.some(function (name) { return haystack.includes(name); });
  }) || null;
}

function extractBrand(value, fallback) {
  const stop = ['with', 'and', 'a', 'an', 'the', 'warm', 'premium', 'festive', 'look', 'style', 'poster', 'wishes', 'wish', 'greeting', 'greetings', 'for'];
  const words = compact(value).replace(/[.,!?;:]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const key = words[i].toLowerCase();
    if (key !== 'from' && key !== 'by') continue;
    const picked = [];
    for (let j = i + 1; j < words.length && picked.length < 3; j++) {
      const clean = words[j].replace(/[^A-Za-z0-9&.'-]/g, '');
      if (!clean || stop.includes(clean.toLowerCase())) break;
      picked.push(clean);
    }
    if (picked.length) return picked.join(' ');
  }
  return compact(fallback) || 'time2grow';
}

function cleanHeadlineFromTopic(value) {
  const filler = ['poster', 'post', 'make', 'create', 'design', 'with', 'warm', 'premium', 'look', 'style', 'brand', 'safe', 'message', 'for', 'about', 'need', 'want', 'give', 'please'];
  const words = compact(value).replace(/[.,!?;:]/g, ' ').split(/\s+/).filter(Boolean)
    .filter(function (word) { return !filler.includes(word.toLowerCase()); });
  return words.slice(0, 6).join(' ') || 'Your campaign';
}

function smartHeadlineFromTopic(source, angle) {
  const text = normalized([source.topic, source.rawBrief, source.objective].filter(Boolean).join(' '));
  if (text.includes('cms') || text.includes('content management')) {
    if (angle === 'educational') return 'Plan every channel';
    if (angle === 'direct-response') return 'Publish from one place';
    if (angle === 'emotional') return 'Calm campaigns start here';
    if (angle === 'authority') return 'Control every update';
    return 'From idea to launch';
  }
  if (text.includes('saas') || text.includes('software') || text.includes('dashboard') || text.includes('app')) {
    if (angle === 'educational') return 'Workflows made clear';
    if (angle === 'direct-response') return 'Start smarter today';
    if (angle === 'emotional') return 'Less chaos, more clarity';
    if (angle === 'authority') return 'Built for confident growth';
    return 'Growth runs smoother';
  }
  if (text.includes('laundry') || text.includes('wash') || text.includes('dry clean')) return 'Fresh clothes, faster';
  if (text.includes('hackathon')) return 'Build something bold';
  if (text.includes('runathon') || text.includes('marathon')) return 'Run for more';
  if (text.includes('cycle') || text.includes('cycling') || text.includes('ride')) return 'Ride with purpose';
  if (text.includes('donation') || text.includes('ngo') || text.includes('charity')) return 'Give hope today';
  const cleaned = cleanHeadlineFromTopic(source.topic || source.rawBrief || source.objective || 'Poster');
  return wordCount(cleaned) > 7 ? cleaned.split(/\s+/).slice(0, 6).join(' ') : cleaned;
}

function inferSceneBackdrop(source, concept) {
  const existing = compact(concept.sceneBackdrop || concept.scene_backdrop || concept.backdrop || concept.scene || '');
  if (existing) return existing;
  const text = normalized([source.topic, source.rawBrief, concept.subject, concept.title].filter(Boolean).join(' '));
  if (detectFestival(text)) return 'designed motif: one clear festive symbol such as a glowing diya or lamp, subtle rangoli geometry, warm light, and generous negative space for the greeting';
  if (text.includes('laundry') || text.includes('wash') || text.includes('dry clean')) return 'context photo: clean laundry service scene with washing machine, folded clothes, fresh fabric, basket, bubbles, and airy negative space';
  if (text.includes('saas') || text.includes('software') || text.includes('cms') || text.includes('dashboard') || text.includes('app')) return 'designed motif: unlabeled SaaS dashboard/workflow abstraction with cards, nodes, connecting lines, and clean product-like depth';
  if (text.includes('runathon') || text.includes('marathon') || text.includes('run')) return 'designed motif: running route line, finish marker, motion lines, and energetic open space';
  if (text.includes('cycle') || text.includes('cycling') || text.includes('ride')) return 'designed motif: bicycle wheel/route-line metaphor with motion arcs and community ride energy';
  if (text.includes('donation') || text.includes('ngo') || text.includes('charity')) return 'designed motif: hands, heart, growth, or community-support symbol rendered as a clean premium visual metaphor';
  if (text.includes('food') || text.includes('restaurant') || text.includes('cafe')) return 'context photo: appetizing product or dish as the clear focal subject with clean space for typography';
  if (text.includes('hackathon')) return 'designed motif: code blocks without readable text, circuit lines, teamwork energy, and one clear innovation symbol';
  return 'designed motif: one topic-specific focal visual or metaphor from the brief, premium composition, clean depth, and generous negative space';
}
function looksLikeRawBriefEcho(value, source) {
  const v = normalized(value);
  const topic = normalized(source.topic);
  const raw = normalized(source.rawBrief);
  if (!v) return false;
  if ((topic && v === topic) || (raw && v === raw)) return true;
  if (v.includes('designed with') || v.includes('brand safe') || v.includes('warm premium festive look')) return true;
  if (v.length >= 18 && ((topic && topic.includes(v)) || (raw && raw.includes(v)))) return true;
  return false;
}

function stripBadWords(value) {
  return compact(value)
    .replace(/\s+logo\s*$/i, '')
    .replace(/^logo\s+/i, '')
    .replace(/AD96 logo/gi, 'AD96')
    .replace(/designed with.*$/i, '')
    .replace(/brand-safe style/gi, '')
    .replace(/brand safe style/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOGO_PLACEMENTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center'];
const LOGO_TREATMENTS = ['plain', 'light-plate', 'dark-plate'];
const PRODUCT_PLACEMENTS = ['left', 'right', 'top', 'bottom', 'center'];
const PRODUCT_TREATMENTS = ['plain', 'soft-card'];
const PRODUCT_ZONE_TEXT = { left: 'left-side hero area', right: 'right-side hero area', top: 'top hero area', bottom: 'bottom hero area', center: 'center hero area' };
const LOGO_ZONE_TEXT = {
  'top-left': 'top-left corner',
  'top-right': 'top-right corner',
  'bottom-left': 'bottom-left corner',
  'bottom-right': 'bottom-right corner',
  'top-center': 'top-center area',
  'bottom-center': 'bottom-center area',
};

// Read whatever the planner sent (nested or flat), validate, and fall back to a
// varied top safe zone so missing metadata does not pin every logo to one side.
function resolveLogo(concept, index) {
  const nested = concept.logo && typeof concept.logo === 'object' ? concept.logo : {};
  const rawPlacement = normalized(concept.logoPlacement || nested.placement || '').replace(/\s+/g, '-');
  const rawTreatment = normalized(concept.logoTreatment || nested.treatment || '').replace(/\s+/g, '-');
  const fallbackPlacements = ['top-right', 'top-left', 'top-center'];
  const fallbackPlacement = fallbackPlacements[Math.abs(Number(index) || 0) % fallbackPlacements.length];
  const placement = LOGO_PLACEMENTS.indexOf(rawPlacement) !== -1 ? rawPlacement : fallbackPlacement;
  const treatment = LOGO_TREATMENTS.indexOf(rawTreatment) !== -1 ? rawTreatment : 'plain';
  const reason = compact(concept.logoReason || nested.reason || (rawPlacement ? '' : 'Fallback top safe zone; planner omitted placement')).slice(0, 200);
  return { placement, treatment, reason };
}

function resolveProduct(concept, index, source) {
  if (!source.productImage || !source.productImage.available) return null;
  const nested = concept.productImage && typeof concept.productImage === 'object' ? concept.productImage : {};
  const rawPlacement = normalized(concept.productImagePlacement || nested.placement || '').replace(/\s+/g, '-');
  const rawTreatment = normalized(concept.productImageTreatment || nested.treatment || '').replace(/\s+/g, '-');
  const fallbackPlacements = source.format === 'landscape' || source.format === 'youtube' ? ['right', 'left', 'center'] : ['right', 'center', 'left'];
  const fallbackPlacement = fallbackPlacements[Math.abs(Number(index) || 0) % fallbackPlacements.length];
  const placement = PRODUCT_PLACEMENTS.indexOf(rawPlacement) !== -1 ? rawPlacement : fallbackPlacement;
  const treatment = PRODUCT_TREATMENTS.indexOf(rawTreatment) !== -1 ? rawTreatment : (source.productImage.hasCutout ? 'plain' : 'soft-card');
  const reason = compact(concept.productImageReason || nested.reason || (rawPlacement ? '' : 'Fallback product hero zone; planner omitted placement')).slice(0, 200);
  return { placement, treatment, reason, name: compact(source.productImage.name || '') };
}
// QR placement, validated and forced to a different corner than the logo.
function resolveQr(concept, logoPlacement) {
  const nested = concept.qr && typeof concept.qr === 'object' ? concept.qr : {};
  const raw = normalized(concept.qrPlacement || nested.placement || '').replace(/\s+/g, '-');
  let placement = LOGO_PLACEMENTS.indexOf(raw) !== -1 ? raw : 'bottom-right';
  if (placement === logoPlacement) {
    const order = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center', 'top-center'];
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== logoPlacement) { placement = order[i]; break; }
    }
  }
  return { placement: placement };
}

function normalizeConceptCopy(source, concept) {
  const combined = [source.topic, source.rawBrief, concept.primaryText, concept.secondaryText].filter(Boolean).join(' ');
  const festival = detectFestival(combined);
  const brand = extractBrand(combined, source.brandName);

  let primaryText = stripBadWords(concept.primaryText || concept.headline || source.currentCopy.headline || '');
  let secondaryText = stripBadWords(concept.secondaryText || concept.subheadline || '');
  let ctaText = stripBadWords(source.requestedCta || concept.ctaText || concept.callToAction || '');

  if (festival) {
    if (!primaryText || wordCount(primaryText) > 4 || looksLikeRawBriefEcho(primaryText, source) || normalized(primaryText).includes('wishes from') || normalized(primaryText).includes('with a')) {
      primaryText = festival.greeting;
    }
    if (!secondaryText || wordCount(secondaryText) > 9 || looksLikeRawBriefEcho(secondaryText, source) || normalized(secondaryText).includes(normalized(primaryText)) || normalized(secondaryText).includes('designed with')) {
      secondaryText = 'Warm wishes from ' + brand;
    }
    ctaText = source.requestedCta ? stripBadWords(source.requestedCta) : '';
  } else {
    if (!primaryText || wordCount(primaryText) > 8 || primaryText.length > 58 || looksLikeRawBriefEcho(primaryText, source)) {
      primaryText = smartHeadlineFromTopic(source, compact(concept.angle || ''));
    }
    if (secondaryText && (wordCount(secondaryText) > 16 || looksLikeRawBriefEcho(secondaryText, source))) {
      secondaryText = '';
    }
    if (!source.requestedCta && wordCount(ctaText) > 5) ctaText = '';
    if (!source.requestedCta) {
      const directContext = normalized([source.offerType, source.offer, source.objective, source.topic].filter(Boolean).join(' '));
      const ctaAllowed = ['offer', 'sale', 'lead', 'demo', 'register', 'event', 'book', 'buy', 'order', 'donat', 'launch', 'signup', 'sign up', 'contact', 'visit', 'join'].some(function (token) { return directContext.includes(token); });
      if (!ctaAllowed) ctaText = '';
    }
  }

  return { primaryText, secondaryText, ctaText, brandSignature: brand };
}

// If the planner JSON can't be read, still hand gpt-image-2 clean plain-language
// prompts built from the request, so it never receives JSON and never hard-fails.
function fallbackConcepts(src, count, startIndex) {
  const festival = detectFestival(src.topic + ' ' + src.rawBrief);
  const brand = extractBrand(src.topic + ' ' + src.rawBrief, src.brandName);
  const angles = festival
    ? ['local', 'emotional', 'authority', 'benefit']
    : ['benefit', 'emotional', 'direct-response', 'educational'];
  const titles = {
    benefit: 'Benefit Concept',
    emotional: 'Emotional Concept',
    'direct-response': 'Direct Concept',
    educational: 'Educational Concept',
    authority: 'Authority Concept',
    local: 'Local Greeting Concept',
  };
  const prompts = {
    benefit: 'A premium poster with a clear customer-benefit visual metaphor, strong hierarchy, clean negative space, and one topic-specific focal symbol.',
    emotional: 'A premium poster with an emotional, human-feeling visual metaphor, warm depth, generous negative space, and a topic-specific focal subject without clutter.',
    'direct-response': 'A premium direct-response poster with a bold focal subject, clean offer/CTA zone only if supplied, high contrast, and strong readable hierarchy.',
    educational: 'A premium educational poster with simple structured visual cues, clean cards or nodes without readable fake UI text, and one clear topic-specific idea.',
    authority: 'A premium authority-style poster with refined editorial hierarchy, confident spacing, proof-like visual rhythm without invented claims, and restrained detail.',
    local: 'A premium local or festive poster with one culturally relevant focal symbol, refined pattern detail, warm light, and generous negative space.',
  };
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const angle = angles[(startIndex + i) % angles.length];
    const primary = festival ? festival.greeting : smartHeadlineFromTopic(src, angle);
    result.push({
      title: festival ? (festival.noun + ' ' + (i + 1)) : (titles[angle] || ('Concept ' + (startIndex + i + 1))),
      angle,
      primaryText: primary,
      secondaryText: festival ? 'Warm wishes from ' + brand : '',
      ctaText: src.requestedCta || '',
      sceneBackdrop: inferSceneBackdrop(src, { angle, title: primary }),
      imagePrompt: festival
        ? 'A premium minimalist ' + festival.noun + ' greeting poster with one clear festive symbol, refined typography, locked brand palette, and generous negative space. Create a distinct composition from the other options.'
        : prompts[angle] + ' Topic: ' + cleanHeadlineFromTopic(src.topic || src.rawBrief || 'Poster') + '. Create a distinct composition from the other options.',
    });
  }
  return result;
}

const source = $('Normalize Poster Request').item.json.payloadForAgents;
const count = source.count || 1;
const parsed = parseMaybeJson($json.output || $json.text || $json);
let concepts = Array.isArray(parsed.concepts) ? parsed.concepts.filter(function (c) { return c && typeof c === 'object'; }) : [];
concepts = concepts.slice(0, count);
if (concepts.length < count) {
  const missing = fallbackConcepts(source, count - concepts.length, concepts.length);
  concepts = concepts.concat(missing).slice(0, count);
}

const sizeByFormat = {
  square: '1024x1024',
  portrait: '1024x1536',
  story: '1024x1536',
  landscape: '1536x1024',
  youtube: '1536x1024',
};

const exportSizeByFormat = {
  square: '1080x1080px',
  portrait: '1080x1350px',
  story: '1080x1920px',
  landscape: '1200x628px',
  youtube: '1280x720px',
};

const paletteText = source.palette && Object.keys(source.palette).length
  ? Object.keys(source.palette).map(function (key) {
      const token = source.palette[key];
      const hex = token && typeof token === 'object' ? (token.hex || token.value || '') : token;
      return key + ' ' + hex;
    }).join(', ')
  : '';

return concepts.map(function (concept, index) {
  const normalizedCopy = normalizeConceptCopy(source, concept);
  const primaryText = normalizedCopy.primaryText;
  const secondaryText = normalizedCopy.secondaryText;
  const ctaText = normalizedCopy.ctaText;
  const brandSignature = normalizedCopy.brandSignature;
  const basePrompt = compact(concept.imagePrompt || concept.fullImagePrompt || concept.full_image_prompt || concept.prompt || '');
  const exportSize = compact(concept.size || '') || exportSizeByFormat[source.format] || '1080x1350px';
  const conceptLanguage = compact(concept.language || source.language || 'en');
  const sceneBackdrop = inferSceneBackdrop(source, concept);
  const logo = resolveLogo(concept, index);
  const logoZone = LOGO_ZONE_TEXT[logo.placement] || 'top-left corner';
  const product = resolveProduct(concept, index, source);
  const productZone = product ? (PRODUCT_ZONE_TEXT[product.placement] || 'right-side hero area') : '';
  const qr = source.qrRequested ? resolveQr(concept, logo.placement) : null;
  const qrZone = qr ? (LOGO_ZONE_TEXT[qr.placement] || 'bottom-right corner') : '';
  const ctaContact = compact(source.requestedContact || '');
  const contactSource = source.contactDetails || {};
  const contactWebsite = compact(contactSource.website || '');
  const contactPhone = compact(contactSource.phone || '');
  const contactEmail = compact(contactSource.email || '');
  const contactStrip = [contactWebsite, contactPhone, contactEmail].filter(Boolean).join('   |   ');
  const contactText = ctaContact || contactPhone;

  const fullImagePromptFromDeepSeek = basePrompt || ('A premium, minimalist, high-end poster about ' + source.topic + '.');

  const finalPrompt = [
    'Create a premium, professional social media poster. Follow these instructions exactly.',
    '',
    fullImagePromptFromDeepSeek,
    '',
    'Scene/backdrop: ' + sceneBackdrop + '.',
    'This scene/backdrop is a priority visual instruction. Make the focal subject/backdrop clearly visible and directly related to the brief.',
    '',
    'Poster contract:',
    'Use case: ' + compact(concept.useCase || source.useCase || 'ads-marketing') + '. Creative angle: ' + compact(concept.angle || 'emotional') + '. Exact export size: ' + exportSize + '. Language: ' + conceptLanguage + '.',
    source.offerType ? 'Offer type supplied by user: ' + source.offerType + '.' : 'Offer type supplied by user: none.',
    source.offer ? 'Offer/details supplied by user: ' + source.offer + '.' : 'Offer/details supplied by user: none.',
    source.requestedCta ? 'CTA supplied by user: "' + source.requestedCta + '".' : 'CTA supplied by user: none.',
    'Primary headline text: "' + primaryText + '".',
    secondaryText ? 'Subheadline text: "' + secondaryText + '".' : 'Subheadline text: none.',
    ctaText ? 'CTA text: "' + ctaText + '".' : 'CTA text: none.',
    ctaContact ? 'CTA contact to display EXACTLY (do not change any digit): "' + ctaContact + '".' : 'CTA contact: none.',
    contactStrip ? 'Contact strip footer to display EXACTLY (render every character and digit exactly; show all listed, invent none): ' + contactStrip + '.' : 'Contact strip: none.',
    qr ? 'QR code zone: reserve a clean empty square in the ' + qrZone + ' for a real scannable QR the app overlays. Do NOT draw, invent, or imitate a QR code, barcode, or matrix pattern.' : 'QR code: none.',
    'Topic lock: this poster is about "' + source.topic + '".',
    source.productMarketingMode ? 'Product marketing mode: make the product or offer the main visual hero. Keep supporting graphics secondary and avoid generic brand-only layouts.' : '',
    'Logo/brand zone: keep the ' + logoZone + ' clean and uncluttered for the real app-controlled logo overlay. Move headline, focal subject, CTA, QR, and contact footer away from this zone. If the logo zone is bottom-aligned, reserve it above or beside the footer, never on top of contact details. Do not draw a fake logo, do not write the word logo, and do not invent a brand mark. The final app will overlay the real logo or wordmark: "' + brandSignature + '".',
    product ? 'Product image zone: reserve a clean empty ' + productZone + ' for the app to overlay the uploaded product photo' + (product.name ? ' named "' + product.name + '"' : '') + '. Keep text, logo, QR, contact footer, and busy details away from this zone. Do not draw a different product as the main hero.' : '',
    paletteText ? 'Use this locked brand palette: ' + paletteText + '.' : '',
    '',
    'Hard requirements:',
    '- Render the headline, subheadline, and CTA text EXACTLY as written above; no rewording, no spelling changes, no merged text blocks.',
    '- If the text is Telugu or Hindi, render it in correct native script, not transliteration.',
    '- Keep an 8-10% safe margin on all sides. No text or brand mark touching the edge.',
    '- Do not add fake QR codes, fake app store badges, fake logos, fake UI labels, fake contact details, or extra claims not listed above.',
    '- Offer and CTA are optional. If no CTA is listed above, do not create one. If offer/details are listed, use only those supplied facts and never invent discount, price, date, urgency, or extra claims.',
    ctaContact ? '- Show the CTA words with the contact "' + ctaContact + '" as a clean call button/line. Render the digits exactly; never show slashes or the raw typed request.' : '',
    contactStrip ? '- Add a clean contact strip/footer showing EXACTLY: ' + contactStrip + '. Render every character and digit exactly; never add, drop, reformat, or invent any detail.' : '',
    qr ? '- Keep the ' + qrZone + ' clear for the app QR overlay. Never render a fake QR code, barcode, or matrix pattern anywhere on the poster.' : '',
    '- Keep the ' + logoZone + ' logo zone clean for the app overlay; do not place headline, focal subject, CTA, QR, or contact footer inside it. Do not create or imitate a logo inside the generated image.',
    product ? '- Keep the ' + productZone + ' clear for the uploaded product photo overlay. Do not put headline, CTA, logo, QR, contact footer, or decorative clutter inside that product zone.' : '',
    '- Never render the raw user brief, prompt fragments, style words, or phrases like "with a warm premium festive look", "designed with", "brand-safe style", "AD96 logo", or the word "logo".',
    '- Clean, high-end advertising aesthetic. No warped or distorted text. No cluttered layout.',
    '- Include the scene/backdrop described above as the main visual foundation. It must not be generic, unrelated, or a plain gradient unless explicitly requested.',
    '- Art direction: original Visual Value / Jack Butcher inspired conceptual clarity when suitable: one metaphor, clean geometry, disciplined negative space. Do not copy any specific creator or template.',
    source.count > 1 ? '- This poster is one option in a ' + source.count + '-concept set; use a distinct angle, scene/backdrop, focal visual, layout, and composition from the other options.' : '',
    source.previewCount > 1 ? '- This exact prompt will be sampled ' + source.previewCount + ' times independently; keep topic, text, palette, and brand fixed, but allow natural variation in composition, framing, lighting, and arrangement.' : '',
    '- Output size: ' + exportSize + '.',
    'Avoid: misspelled or random words, lorem ipsum, watermark, QR code, fake phone numbers, invented offers, stock-photo clutter, prompt text, and extra typography.',
  ].filter(Boolean).join('\n');

  return {
    json: {
      workflow: 'time2grow-poster-workflow-2',
      index: index,
      conceptId: 'concept-' + (index + 1),
      title: compact(concept.title || ('Concept ' + (index + 1))),
      angle: compact(concept.angle || ''),
      copy: { headline: primaryText, subheadline: secondaryText, callToAction: ctaText, contactText: contactText },
      logo: logo,
      logoPlacement: logo.placement,
      logoTreatment: logo.treatment,
      qr: qr,
      qrPlacement: qr ? qr.placement : '',
      productImage: product,
      productImagePlacement: product ? product.placement : '',
      productImageTreatment: product ? product.treatment : '',
      productImageReason: product ? product.reason : '',
      sceneBackdrop,
      openAiPrompt: finalPrompt,
      imageSize: 'auto',
      imageQuality: 'auto',
      previewCount: source.previewCount || 1,
      aspectTarget: sizeByFormat[source.format] || '1024x1536',
    },
  };
});
`);

// Runs once for all image items: collect every generated poster into one
// response. Handles binary output AND json output (b64 or url), and surfaces
// the real image-node error instead of hard-failing so it is visible in the app.
const packageResponseCode = code(String.raw`
const items = $input.all();
const concepts = [];
const errors = [];

function pushConcept(item, imageDataUrl, imageUrl, previewIndex) {
  const j = item.json || {};
  const suffix = previewIndex > 0 ? '-preview-' + (previewIndex + 1) : '';
  concepts.push({
    id: (j.conceptId || ('concept-' + (concepts.length + 1))) + suffix,
    title: j.title || ('Concept ' + (concepts.length + 1)),
    angle: j.angle || '',
    imageDataUrl: imageDataUrl || '',
    imageUrl: imageUrl || '',
    copy: j.copy || {},
    logo: j.logo || {},
    logoPlacement: j.logoPlacement || (j.logo && j.logo.placement) || '',
    logoTreatment: j.logoTreatment || (j.logo && j.logo.treatment) || '',
    qr: j.qr || null,
    qrPlacement: j.qrPlacement || (j.qr && j.qr.placement) || '',
    productImage: j.productImage || null,
    productImagePlacement: j.productImagePlacement || (j.productImage && j.productImage.placement) || '',
    productImageTreatment: j.productImageTreatment || (j.productImage && j.productImage.treatment) || '',
    productImageReason: j.productImageReason || (j.productImage && j.productImage.reason) || '',
    imageSize: j.imageSize || '',
    prompt: j.openAiPrompt || '',
    previewIndex: previewIndex + 1,
  });
}

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const j = item.json || {};

  if (j.error) errors.push(String(j.error && j.error.message ? j.error.message : j.error));

  let pushed = 0;
  if (item.binary && Object.keys(item.binary).length) {
    const keys = Object.keys(item.binary).sort(function (a, b) {
      if (a === 'poster') return -1;
      if (b === 'poster') return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    for (const key of keys) {
      const buffer = await this.helpers.getBinaryDataBuffer(i, key);
      const binary = item.binary[key] || {};
      const mimeType = binary.mimeType || 'image/png';
      pushConcept(item, 'data:' + mimeType + ';base64,' + buffer.toString('base64'), '', pushed);
      pushed += 1;
    }
  }

  if (!pushed) {
    const dataArr = Array.isArray(j.data) ? j.data : (Array.isArray(j.images) ? j.images : []);
    if (dataArr.length) {
      for (let k = 0; k < dataArr.length; k++) {
        const entry = dataArr[k] || {};
        const b64 = entry.b64_json || entry.b64 || '';
        const url = entry.url || '';
        if (b64) pushConcept(item, 'data:image/png;base64,' + String(b64), '', k);
        else if (url) pushConcept(item, '', String(url), k);
      }
    } else {
      const b64 = j.b64_json || j.b64 || '';
      const url = j.url || j.imageUrl || '';
      if (b64) pushConcept(item, 'data:image/png;base64,' + String(b64), '', 0);
      else if (url) pushConcept(item, '', String(url), 0);
    }
  }
}

if (concepts.length === 0) {
  return [{
    json: {
      ok: false,
      workflow: 'time2grow-poster-workflow-2',
      mode: 'poster_set',
      error: errors.length
        ? ('Image generation failed: ' + errors.join(' | '))
        : 'The image model returned no image. Open the OpenAI Poster Image Agent node output in n8n to see what it returned.',
      concepts: [],
      previews: [],
    },
  }];
}

return [{
  json: {
    ok: true,
    workflow: 'time2grow-poster-workflow-2',
    mode: 'poster_set',
    source: 'n8n-ai-agent',
    concepts: concepts,
    previews: concepts.map(function (concept) { return concept.imageDataUrl || concept.imageUrl; }).filter(Boolean),
    imageDataUrl: concepts[0].imageDataUrl || '',
    imageUrl: concepts[0].imageUrl || '',
    copy: concepts[0].copy || {},
    generatedAt: new Date().toISOString(),
  },
}];
`);

const healthResponseCode = code(String.raw`
return [{
  json: {
    ok: true,
    workflow: 'time2grow-poster-workflow-2',
    message: 'time2grow poster workflow 2 is ready.',
    models: {
      planner: 'deepseek-v4-flash',
      imageAgent: 'gpt-image-2-2026-04-21',
    },
  },
}];
`);

const posterConceptSystem = code(String.raw`
You are a Poster Prompt Composer for an Indian ad agency (AD96/time2grow). Reply with STRICT JSON only, no prose.

You do not generate images. You write precise, self-contained poster concept briefs that are ready to hand to an image-generation AI.

Rules:
- One clear focal point, one headline max 9 words, one subheadline max 18 words, and one CTA max 5 words when a CTA is appropriate. For festive wishes/greetings, CTA can be an empty string.
- Offer type, offer/details, and CTA are optional user-supplied fields. If blank, do not force them. If supplied, use them exactly and do not invent missing discount, price, date, value, or urgency.
- Treat the CTA as intent, not literal display text. Polish it into clean button words (e.g. "call now/ for demo 9276969696" -> ctaText "Book a Demo" or "Call Now"). Never put slashes, the raw typed request, or the phone number inside ctaText.
- If a contact/phone number is supplied, place those exact digits UNCHANGED in footerContact and keep ctaText as short action words only. Never alter or invent a phone number.
- Brand contact details (website, phone, email) may be added as a small footer strip by the pipeline. Leave clean space near the bottom for a one-line contact footer; never invent contact details yourself.
- Never invent discounts, prices, dates, phone numbers, addresses, guarantees, awards, claims, testimonials, or urgency not given in the brief.
- Use the theme's locked colors from the request. Do not invent random new colors.
- Match the requested language exactly: English / Telugu / Hindi. Write real native copy, not word-by-word translation.
- Return exactly the requested Number of concepts. If the request says 3, output exactly 3 concept objects in concepts[].
- If more than one concept is requested, each concept must be meaningfully different: different angle chosen from benefit, emotional, direct-response, educational, authority, local; different scene/backdrop; different focal visual; different layout; and different copy. Do not make near-duplicates.
- Treat previously used headlines from the request payload as forbidden spent ideas. Do not reuse them exactly and do not lightly rewrite the same pattern.
- Avoid lazy content headline formulas such as "Content without chaos", "Manage content clearly", "Launch content faster", or simple "verb + content + adjective/adverb" variants unless the user supplied that exact phrase.
- Specify exact export size in pixels for the requested format.
- Decide the best logo placement PER concept based on the design. Choose logoPlacement from exactly: top-left, top-right, bottom-left, bottom-right, top-center, bottom-center. Do not default to left or right. Pick the clean reserved corner/edge that avoids the headline, focal subject, CTA, QR, contact footer, and busiest area, and keep that zone visibly empty so the app can overlay the real logo there. For portrait posters with big lower headline blocks, prefer a clean top-right/top-left white or low-detail area. If contact details are shown in a footer strip, do not put the logo on top of that strip.
- Decide logoTreatment from exactly: plain, light-plate, dark-plate. Prefer plain when the chosen zone is clean/flat/light because the app removes the real logo background before overlaying it. Use a plate only when the reserved zone is busy or contrast would fail.
- Give a short logoReason (max 16 words) explaining the placement/treatment choice and what content it avoids, e.g. "Top-right is clear; headline sits left".
- If a QR code overlay is requested, also choose qrPlacement from the same six positions but DIFFERENT from logoPlacement, in a corner/edge that avoids the headline and focal subject. Reserve a clean empty square there for a real QR the app overlays; never draw, invent, or imitate a QR code, barcode, or matrix pattern.
- If the request payload says productImage.available is true, reserve a clean product hero zone for the app-overlaid uploaded product photo. Choose productImagePlacement from exactly: left, right, top, bottom, center. Choose productImageTreatment from exactly: plain, soft-card. Prefer soft-card unless the product image is a cutout. Do not draw a different product as the main hero.
- The brand mark is about 56-80px tall on a 1080-wide export. Call it wordmark or brand signature; never ask the image model to draw or write the word "logo" - the app overlays the real logo.
- Do not describe camera gear, lens, or photography jargon. Describe layout, mood, colors, typography, and composition only.
- Never echo the raw prompt as poster copy. Extract the intended subject, brand, offer, and mood. Example: "Happy Diwali wishes from AD96 with a warm premium festive look" means primaryText "Happy Diwali", secondaryText "Warm wishes from AD96", ctaText "".
- Stay exactly on the user's topic/occasion. Detect greetings and festivals (Diwali, Christmas, New Year, Eid, Pongal, Sankranti, Ugadi, etc.) and write the correct greeting.
- Scene/backdrop is a CRITICAL field and must never be vague. Choose exactly one direction: context photo, designed motif, or none/gradient. Describe what the viewer actually sees, the focal subject, visual metaphor, environment/objects, depth, and negative space. It must be directly related to the brief.
- Strong topic imagery is required. Never return a plain gradient unless the user explicitly asks for a type-only poster. Diwali -> diya/lamp/rangoli geometry; laundry -> washing machine/folded clothes/bubbles; SaaS -> abstract dashboard/nodes/flow; running event -> motion lines/route/finish; donation -> hands/heart/growth.
- If productMarketingMode is true, use a product-led ad structure: product hero, short benefit headline, key offer/spec facts only if supplied, and a clear CTA when appropriate. Do not drift into a generic brand awareness poster.
- VISUAL VALUE DIRECTION when requested or useful: premium conceptual style in the spirit of Visualize Value / Jack Butcher - one strong geometric metaphor, clean lines, arrows, grids, circles and simple shapes, high contrast plus one brand accent, disciplined negative space, one clear idea. Create an ORIGINAL concept; never copy any specific creator, course, template, or artwork.
- Your imagePrompt must describe the subject and mood clearly, but avoid over-specifying one exact fixed composition, one single camera angle, one object arrangement, or one exact pose. Leave room for creative interpretation so independent generations can vary naturally while staying on-topic.
- For multiple poster options, write distinct asset prompts per concept. Do not rely on n-sampling alone for variety; each concept needs its own angle, backdrop, visual metaphor, layout, and copy.

For each concept return this JSON object shape:
- title: short internal name.
- useCase: "ads-marketing".
- angle: one of benefit, emotional, direct-response, educational, authority, local.
- size: exact export size like "1080x1350px".
- language: "en", "te", or "hi".
- subject: one line describing what the poster is fundamentally about.
- sceneBackdrop: mandatory. Start with one of context photo:, designed motif:, or none/gradient: and then describe the exact visual scene/backdrop. This is the main visual direction for the poster.
- primaryText: exact headline text.
- secondaryText: exact subheadline text or empty string.
- ctaText: exact CTA text or empty string.
- footerContact: the exact supplied contact/phone (digits unchanged) or other facts given in the brief; empty string if none. Never invent a number.
- colors: { "bg": "#...", "ink": "#...", "muted": "#...", "accent": "#..." }.
- typography: font direction, max two families.
- layout: one of bottom, centered, band, facts.
- logoPlacement: one of top-left, top-right, bottom-left, bottom-right, top-center, bottom-center - the reserved zone for the app-overlaid logo.
- logoTreatment: one of plain, light-plate, dark-plate - based on the background contrast in the chosen zone.
- logoReason: short reason (max 16 words) for the placement/treatment choice.
- qrPlacement: when a QR overlay is requested, one of the six positions and different from logoPlacement; otherwise empty string.
- productImagePlacement: when productImage.available is true, one of left, right, top, bottom, center; otherwise empty string.
- productImageTreatment: when productImage.available is true, one of plain, soft-card; otherwise empty string.
- productImageReason: short reason (max 16 words) for the product hero zone choice.
- brandSignature: placement instruction matching logoPlacement, size, and light/dark contrast.
- avoid: concept-specific avoid list.
- imagePrompt: one paragraph, plain English, combining all of the above into a single generation-ready instruction. Include the exact primaryText/secondaryText/ctaText verbatim so the image model renders that exact wording, not a paraphrase. End the paragraph with: "Avoid: <avoid list>."

Return JSON shaped as: { "concepts": [ { "title": "", "useCase": "ads-marketing", "angle": "", "size": "", "language": "", "subject": "", "sceneBackdrop": "", "primaryText": "", "secondaryText": "", "ctaText": "", "footerContact": "", "colors": { "bg": "", "ink": "", "muted": "", "accent": "" }, "typography": "", "layout": "", "logoPlacement": "", "logoTreatment": "", "logoReason": "", "qrPlacement": "", "brandSignature": "", "avoid": "", "imagePrompt": "" } ] }.
`);

const workflow = {
  id: 'time2growPosterWorkflow2',
  name: workflowName,
  active: true,
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'responseNode',
        options: {},
      },
      id: 'poster-workflow-2-webhook',
      name: 'Poster Workflow 2 Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: webhookPath,
    },
    {
      parameters: { jsCode: normalizeRequestCode },
      id: 'normalize-poster-request',
      name: 'Normalize Poster Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [260, 0],
    },
    {
      parameters: {
        mode: 'expression',
        numberOutputs: 2,
        output: "={{ $json.mode === 'health' ? 1 : 0 }}",
      },
      id: 'route-health',
      name: 'Route Health',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3,
      position: [500, 0],
    },
    {
      parameters: { jsCode: healthResponseCode },
      id: 'health-payload',
      name: 'Health Payload',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [760, 260],
    },
    {
      parameters: {
        respondWith: 'firstIncomingItem',
        options: {},
      },
      id: 'respond-health',
      name: 'Respond Health',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [1020, 260],
    },
    {
      parameters: {
        model: 'deepseek-v4-flash',
        options: {
          temperature: 0.9,
          maxTokens: 2600,
          responseFormat: 'json_object',
          // Planning is fast text-only work. Keep its ceiling well under the
          // app's client wait (300s) so a slow/stuck plan surfaces as an error
          // in time instead of letting the app abort while n8n keeps running.
          timeout: 120000,
          maxRetries: 1,
        },
      },
      id: 'deepseek-chat-model',
      name: 'DeepSeek v4 Pro Model',
      type: '@n8n/n8n-nodes-langchain.lmChatDeepSeek',
      typeVersion: 1,
      position: [760, -280],
      credentials: {
        deepSeekApi: {
          id: 'nesRZqAoKg9gdsi2',
          name: 'DeepSeek account',
        },
      },
    },
    {
      parameters: {
        promptType: 'define',
        text: '={{ $json.agentInput }}',
        options: {
          systemMessage: posterConceptSystem,
        },
      },
      id: 'deepseek-poster-concepts-agent',
      name: 'DeepSeek Poster Concepts Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 3.1,
      position: [1020, 0],
    },
    {
      parameters: { jsCode: expandConceptsCode },
      id: 'expand-poster-concepts',
      name: 'Expand Poster Concepts',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1320, 0],
    },
    {
      parameters: {
        resource: 'image',
        operation: 'generate',
        modelId: {
          __rl: true,
          mode: 'id',
          value: 'gpt-image-2-2026-04-21',
        },
        prompt: '={{ $json.openAiPrompt }}',
        options: {
          quality: '={{ $json.imageQuality }}',
          size: '={{ $json.imageSize }}',
          n: '={{ $json.previewCount }}',
          binaryPropertyOutput: 'poster',
        },
      },
      id: 'openai-image-generator',
      name: 'OpenAI Poster Image Agent',
      type: '@n8n/n8n-nodes-langchain.openAi',
      typeVersion: 2.3,
      position: [1580, 0],
      onError: 'continueRegularOutput',
      credentials: {
        openAiApi: {
          id: 'gYxbG88vtm1ZV55L',
          name: 'OpenAI account',
        },
      },
    },
    {
      parameters: { jsCode: packageResponseCode },
      id: 'package-poster-response',
      name: 'Package Poster Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1840, 0],
    },
    {
      parameters: {
        respondWith: 'firstIncomingItem',
        options: {},
      },
      id: 'respond-poster',
      name: 'Respond Poster',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [2100, 0],
    },
    {
      parameters: {
        content: [
          'Workflow 2 endpoint:',
          'POST /webhook/time2grow-poster-workflow-2',
          '',
          'Frontend sends: brief/topic, objective, format, count (default 1), RGB palette, Business DNA, and brand/logo info.',
          '',
          'DeepSeek Chat plans N distinct FINISHED-poster concepts (exact text + full image prompt each). Expand Poster Concepts fans them out to one item per concept. The OpenAI image node (gpt-image-2-2026-04-21) renders one finished poster per concept by default; previewCount can request variants per concept when needed. Package Poster Response collects all binaries/URLs and returns { ok, mode: "poster_set", previews, concepts: [{ id, title, angle, imageDataUrl, copy, logo: { placement, treatment, reason } }] }. The app overlays the real logo per that AI-chosen placement/treatment.',
        ].join('\n'),
      },
      id: 'workflow-note',
      name: 'Workflow Notes',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [0, 300],
    },
  ],
  connections: {
    'Poster Workflow 2 Webhook': {
      main: [[{ node: 'Normalize Poster Request', type: 'main', index: 0 }]],
    },
    'Normalize Poster Request': {
      main: [[{ node: 'Route Health', type: 'main', index: 0 }]],
    },
    'Route Health': {
      main: [
        [{ node: 'DeepSeek Poster Concepts Agent', type: 'main', index: 0 }],
        [{ node: 'Health Payload', type: 'main', index: 0 }],
      ],
    },
    'Health Payload': {
      main: [[{ node: 'Respond Health', type: 'main', index: 0 }]],
    },
    'DeepSeek v4 Pro Model': {
      ai_languageModel: [[{ node: 'DeepSeek Poster Concepts Agent', type: 'ai_languageModel', index: 0 }]],
    },
    'DeepSeek Poster Concepts Agent': {
      main: [[{ node: 'Expand Poster Concepts', type: 'main', index: 0 }]],
    },
    'Expand Poster Concepts': {
      main: [[{ node: 'OpenAI Poster Image Agent', type: 'main', index: 0 }]],
    },
    'OpenAI Poster Image Agent': {
      main: [[{ node: 'Package Poster Response', type: 'main', index: 0 }]],
    },
    'Package Poster Response': {
      main: [[{ node: 'Respond Poster', type: 'main', index: 0 }]],
    },
  },
  pinData: {},
  settings: { executionOrder: 'v1' },
  staticData: null,
  triggerCount: 1,
  versionId: 'time2grow-poster-workflow-2-v2',
};

const outPath = path.join(root, 'time2grow-poster-workflow-2.workflow.json');
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Generated n8n/time2grow-poster-workflow-2.workflow.json');
