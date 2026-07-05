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
        'A premium, minimalist Diwali greeting poster, portrait. Deep indigo background (#0C1A2E) with a single glowing gold (#C8A24C) diya and soft bokeh light in the lower right, generous negative space. Render the text exactly, spelled correctly: the large centered headline "Happy Diwali" in an elegant modern serif in warm gold, and a small line below it "Warm wishes from AD96" in clean white sans-serif. A small "AD96" wordmark in the top-left corner. High-end, editorial, Canva-quality, print-ready, high resolution. No watermark, no QR code, no extra or misspelled words, no stock-photo clutter.',
    },
  ],
};

function code(value) {
  return value.trim();
}

const normalizeRequestCode = code(`
const body = $json.body && typeof $json.body === 'object' ? $json.body : $json;
const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const oneOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const safeColors = object(body.palette);
const businessDna = object(body.businessDna);
const logo = object(body.logo);
const copy = object(body.copy);

const format = oneOf(text(body.format, 30), ['portrait', 'square', 'landscape', 'story', 'youtube'], 'portrait');
const topic = text(body.topic || body.rawBrief || body.userIdea || body.brief, 900) || 'Poster campaign';
const objective = text(body.objective, 120) || 'Generic poster';
const brandName = text(body.brandName || businessDna.brandName || logo.brandName, 120) || 'time2grow brand';
const count = Math.min(4, Math.max(1, Number(body.count) || 3));

const payloadForAgents = {
  workflow: 'time2grow-poster-workflow-2',
  topic,
  rawBrief: text(body.rawBrief || body.userIdea || body.brief, 1800),
  objective,
  preferredStyle: text(body.preferredStyle || body.style, 500),
  format,
  count,
  brandName,
  orgId: text(body.orgId, 90),
  userId: text(body.userId, 90),
  palette: safeColors,
  businessDna,
  logo: {
    url: text(logo.url || body.logoUrl, 2000),
    brandName,
    source: text(logo.source, 80) || 'business_dna',
  },
  currentCopy: {
    headline: text(copy.headline, 160),
    subheadline: text(copy.subheadline, 260),
    callToAction: text(copy.callToAction, 80),
  },
  learningContext: text(body.learningContext, 2000),
};

const agentInput = [
  'Return strict JSON only.',
  'Design exactly ' + count + ' distinct finished-poster concepts for this time2grow request.',
  'Each concept is a COMPLETE premium poster whose text will be rendered by an image model, so every imagePrompt must quote the exact text to display and demand correct spelling.',
  JSON.stringify(payloadForAgents, null, 2),
].join('\\n\\n');

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
const expandConceptsCode = code(`
function parseMaybeJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  const raw = value.trim().replace(/^\\\`\\\`\\\`json/i, '').replace(/^\\\`\\\`\\\`/, '').replace(/\\\`\\\`\\\`$/, '').trim();
  try { return JSON.parse(raw); } catch { return {}; }
}

const source = $('Normalize Poster Request').item.json.payloadForAgents;
const parsed = parseMaybeJson($json.output || $json.text || $json);
let concepts = Array.isArray(parsed.concepts) ? parsed.concepts : [];
concepts = concepts.slice(0, source.count || 3);
if (concepts.length === 0) throw new Error('Poster planner did not return any concepts.');

const sizeByFormat = {
  square: '1024x1024',
  portrait: '1024x1536',
  story: '1024x1536',
  landscape: '1536x1024',
  youtube: '1536x1024',
};

const paletteText = source.palette && Object.keys(source.palette).length
  ? Object.keys(source.palette).map(function (key) {
      const token = source.palette[key];
      const hex = token && typeof token === 'object' ? (token.hex || token.value || '') : token;
      return key + ' ' + hex;
    }).join(', ')
  : '';

return concepts.map(function (concept, index) {
  const primaryText = String(concept.primaryText || concept.headline || source.currentCopy.headline || source.topic || '').trim();
  const secondaryText = String(concept.secondaryText || concept.subheadline || '').trim();
  const ctaText = String(concept.ctaText || concept.callToAction || '').trim();
  const basePrompt = String(concept.imagePrompt || '').trim();

  const finalPrompt = [
    basePrompt || ('A premium, minimalist, high-end poster about ' + source.topic + '.'),
    'Render all text exactly and spelled correctly. Primary text: "' + primaryText + '".',
    secondaryText ? 'Secondary text: "' + secondaryText + '".' : 'No secondary text.',
    ctaText ? 'Call to action text: "' + ctaText + '".' : 'No call-to-action text.',
    'Show the brand wordmark "' + source.brandName + '" small and tasteful; do not invent any other logo.',
    paletteText ? 'Use this locked brand palette: ' + paletteText + '.' : '',
    'Format: ' + source.format + '. Style: premium, minimalist, high-contrast conceptual "visual value" design, disciplined negative space, one clear focal idea, refined typography, Canva-quality, print-ready, high resolution.',
    'Absolutely no misspelled or random words, no lorem ipsum, no watermark, no QR code, no fake phone numbers, no invented offers, no stock-photo clutter.',
  ].filter(Boolean).join('\\n');

  return {
    json: {
      workflow: 'time2grow-poster-workflow-2',
      index: index,
      conceptId: 'concept-' + (index + 1),
      title: String(concept.title || ('Concept ' + (index + 1))).trim(),
      angle: String(concept.angle || '').trim(),
      copy: { headline: primaryText, subheadline: secondaryText, callToAction: ctaText },
      openAiPrompt: finalPrompt,
      imageSize: sizeByFormat[source.format] || '1024x1536',
      imageQuality: 'high',
    },
  };
});
`);

// Runs once for all image items: collect every generated poster into one response.
const packageResponseCode = code(`
const items = $input.all();
const concepts = [];

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const binaryName = item.binary && item.binary.poster ? 'poster' : (item.binary && item.binary.data ? 'data' : '');
  let imageDataUrl = '';

  if (binaryName) {
    const buffer = await this.helpers.getBinaryDataBuffer(i, binaryName);
    const binary = item.binary[binaryName] || {};
    const mimeType = binary.mimeType || 'image/png';
    imageDataUrl = 'data:' + mimeType + ';base64,' + buffer.toString('base64');
  }

  concepts.push({
    id: item.json.conceptId || ('concept-' + (i + 1)),
    title: item.json.title || ('Concept ' + (i + 1)),
    angle: item.json.angle || '',
    imageDataUrl: imageDataUrl,
    copy: item.json.copy || {},
    imageSize: item.json.imageSize || '',
    prompt: item.json.openAiPrompt || '',
  });
}

const usable = concepts.filter(function (concept) { return concept.imageDataUrl; });
if (usable.length === 0) throw new Error('No poster images were generated.');

return [{
  json: {
    ok: true,
    workflow: 'time2grow-poster-workflow-2',
    mode: 'poster_set',
    source: 'n8n-ai-agent',
    concepts: usable,
    generatedAt: new Date().toISOString(),
  },
}];
`);

const healthResponseCode = code(`
return [{
  json: {
    ok: true,
    workflow: 'time2grow-poster-workflow-2',
    message: 'time2grow poster workflow 2 is ready.',
    models: {
      planner: 'deepseek-v4-pro',
      imageAgent: 'gpt-image-1',
    },
  },
}];
`);

const posterConceptSystem = code(`
You are a senior poster art director for time2grow. Reply with STRICT JSON only, no prose.

Your job: design the requested number of DISTINCT finished-poster concepts. Each concept is a complete, premium, minimalist, "Canva-quality" poster whose text is baked into the artwork by an image model.

Rules:
- Stay exactly on the user's topic/occasion. Detect greetings and festivals (Diwali, Christmas, New Year, Eid, Pongal, Sankranti, Ugadi, etc.) and write the correct greeting.
- Minimal words, maximum impact. NOT every poster is headline + subheadline + CTA. A single bold statement, a short quote, or one strong line can be the whole poster. Only include secondaryText or ctaText when it genuinely improves the poster; otherwise return them as empty strings.
- Premium "visual value" aesthetic: one clear concept, clean geometry, disciplined negative space, refined typography, high contrast, tasteful use of the brand accent color.
- Use the locked brand palette. Show the brand name as a small, tasteful wordmark. Never invent a separate logo mark or fake UI.
- Do NOT invent discounts, dates, prices, phone numbers, addresses, guarantees, awards, or testimonials.
- Make the concepts visually different from each other (different layout and idea), on the same locked palette and topic.

For each concept return an object with:
- title: short internal name.
- angle: one or two words describing the creative angle.
- primaryText: the main text to display (exact spelling).
- secondaryText: optional supporting line, or empty string.
- ctaText: optional call to action, or empty string.
- imagePrompt: a complete image-generation prompt for the WHOLE poster. It MUST quote the exact text to render, e.g. Render the text exactly: "Happy Diwali", and demand correct spelling with no extra, random, or misspelled words. Describe layout, composition, palette (use the hex values), typography style, mood, topic-relevant imagery, and where each text element sits. State: premium, minimalist, high resolution, print-ready, no watermark, no QR code, no stock-photo clutter.

Return JSON shaped as: { "concepts": [ { "title": "", "angle": "", "primaryText": "", "secondaryText": "", "ctaText": "", "imagePrompt": "" } ] }.
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
        model: 'deepseek-v4-pro',
        options: {
          temperature: 0.5,
          maxTokens: 2600,
          responseFormat: 'json_object',
          timeout: 360000,
          maxRetries: 2,
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
        sessionIdType: 'customKey',
        sessionKey: '={{ "poster-plan:" + ($node["Normalize Poster Request"].json.payloadForAgents.orgId || "no-org") + ":" + ($node["Normalize Poster Request"].json.payloadForAgents.userId || "anonymous") }}',
        contextWindowLength: 6,
      },
      id: 'deepseek-planning-memory',
      name: 'DeepSeek Planning Memory',
      type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
      typeVersion: 1.4,
      position: [620, -460],
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
          value: 'gpt-image-1',
        },
        prompt: '={{ $json.openAiPrompt }}',
        options: {
          quality: '={{ $json.imageQuality }}',
          size: '={{ $json.imageSize }}',
          binaryPropertyOutput: 'poster',
        },
      },
      id: 'openai-image-generator',
      name: 'OpenAI Poster Image Agent',
      type: '@n8n/n8n-nodes-langchain.openAi',
      typeVersion: 2.3,
      position: [1580, 0],
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
          'Frontend sends: brief/topic, objective, format, count (default 3), RGB palette, Business DNA, and brand/logo info.',
          '',
          'DeepSeek Chat plans N distinct FINISHED-poster concepts (exact text + full image prompt each). Expand Poster Concepts fans them out to one item per concept. The OpenAI image node (gpt-image-1) renders each concept as a complete poster with text baked in. Package Poster Response collects all images and returns { ok, mode: "poster_set", concepts: [{ id, title, angle, imageDataUrl, copy }] }.',
        ].join('\\n'),
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
    'DeepSeek Planning Memory': {
      ai_memory: [[{ node: 'DeepSeek Poster Concepts Agent', type: 'ai_memory', index: 0 }]],
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
