import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, Palette as PaletteIcon, Save, Send, Sparkles, Upload, Wand2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { env } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { deriveBrandDisplayName } from '../business-dna/brandIdentity';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';
import {
  buildPalette,
  posterDimensions,
  PosterTemplate,
  EXPORT_PIXEL_RATIO,
  type BrandColor,
  type PosterContent,
  type PosterFormat,
  type PosterTemplateId,
  type Palette as PosterPalette,
} from './PosterTemplate';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];

type PosterConcept = {
  id: string;
  angle: string;
  template: PosterTemplateId;
  content: PosterContent;
};

type PosterAgentPayload = {
  ok?: boolean;
  error?: string;
  imageDataUrl?: string;
  imageUrl?: string;
  backgroundImageUrl?: string;
  copy?: Partial<PosterContent> & { message?: string };
  poster?: { imageUrl?: string; downloadUrl?: string; title?: string };
};

const posterObjectiveOptions = [
  'Generic poster',
  'Festive wishes',
  'Event announcement',
  'Hackathon promotion',
  'Runathon promotion',
  'Cycling club ride',
  'Donation camp',
  'NGO awareness',
  'Community invitation',
  'Lead generation',
  'Brand awareness',
  'Demo booking',
  'Product education',
  'Trust proof',
  'Offer conversion',
];

export function PosterStudioAiPage() {
  const { organization, user } = useAuth();
  const [businessDna, setBusinessDna] = useState<BusinessDnaRow | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brief, setBrief] = useState('Happy Diwali wishes from AD96 with a warm premium festive look');
  const [objective, setObjective] = useState('Festive wishes');
  const [style, setStyle] = useState('Premium, high-contrast, minimal words, strong hierarchy');
  const [format, setFormat] = useState<PosterFormat>('portrait');

  const [concepts, setConcepts] = useState<PosterConcept[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [sharedBackgroundImage, setSharedBackgroundImage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);

  const stageRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  const brandName = useMemo(() => deriveBrandDisplayName(organization?.name, businessDna), [organization?.name, businessDna]);
  const brandColors = useMemo(() => parseBrandColors(businessDna), [businessDna]);
  const basePalette = useMemo(() => buildPalette(brandColors), [brandColors]);
  const palette = useMemo(() => applyOverrides(basePalette, accentColor, backgroundColor), [basePalette, accentColor, backgroundColor]);
  const colorSwatches = useMemo(() => buildColorSwatches(brandColors, basePalette.accent), [brandColors, basePalette.accent]);
  const dim = posterDimensions[format];
  const selectedConcept = useMemo(() => concepts.find((concept) => concept.id === selectedId) ?? concepts[0] ?? null, [concepts, selectedId]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase || !organization?.id) {
        setLoading(false);
        return;
      }

      const { data, error: dnaError } = await supabase
        .from('business_dna')
        .select('*')
        .eq('org_id', organization.id)
        .maybeSingle();

      const nextLogoUrl = data?.logo_storage_bucket && data.logo_storage_path
        ? await createStorageSignedUrl(data.logo_storage_bucket, data.logo_storage_path)
        : '';

      if (!active) return;
      if (dnaError) setError(errorMessage(dnaError, 'Could not load Business DNA.'));
      setBusinessDna(data ?? null);
      setLogoUrl(nextLogoUrl);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1.2, Math.max(0.22, el.clientWidth / dim.width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dim.width]);

  function updateSelectedContent<K extends keyof PosterContent>(key: K, value: PosterContent[K]) {
    if (!selectedConcept) return;
    const id = selectedConcept.id;
    setConcepts((current) => current.map((concept) => (concept.id === id ? { ...concept, content: { ...concept.content, [key]: value } } : concept)));
  }

  async function handleGenerate() {
    if (!brief.trim()) {
      setError('Enter a poster brief first.');
      return;
    }

    setGenerating(true);
    setMessage('');
    setError('');

    // Deterministic concepts render instantly and never depend on a live AI backend.
    const nextConcepts = buildConceptSet(brief, objective, brandName);
    setConcepts(nextConcepts);
    setSelectedId(nextConcepts[0]?.id ?? '');
    setSharedBackgroundImage('');

    // AI art / copy is an optional enhancement layered on top when a provider responds.
    try {
      const payload = await requestAiPoster({
        brief,
        objective,
        style,
        format,
        orgId: organization?.id ?? '',
        userId: user?.id ?? '',
        brandName,
        palette,
        businessDna,
        logoUrl,
      });

      if (payload && payload.ok !== false) {
        const image = firstImage(payload);
        if (image) setSharedBackgroundImage(image);

        const aiHeadline = stringValue(payload.copy?.headline);
        const aiSub = stringValue(payload.copy?.subheadline) || stringValue(payload.copy?.message);
        const aiCta = stringValue(payload.copy?.callToAction);
        if (aiHeadline || aiSub || aiCta) {
          setConcepts((current) => current.map((concept, index) => (index === 0
            ? {
                ...concept,
                content: {
                  ...concept.content,
                  headline: aiHeadline || concept.content.headline,
                  subheadline: aiSub || concept.content.subheadline,
                  callToAction: aiCta || concept.content.callToAction,
                },
              }
            : concept)));
        }

        setMessage(image ? 'Created 3 concepts with AI background art. Pick one below, edit, then Download or Save.' : 'Created 3 poster concepts. Pick one below, edit, then Download or Save.');
        return;
      }
    } catch {
      // fall through to deterministic-only result
    } finally {
      setGenerating(false);
    }

    setMessage('Created 3 poster concepts from your brief. Pick one below, edit, then Download or Save.');
  }

  async function renderPng(): Promise<{ dataUrl: string; blob: Blob }> {
    if (!posterRef.current) throw new Error('Poster is not ready yet.');
    await waitForPaint();
    const dataUrl = await toPng(posterRef.current, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      width: dim.width,
      height: dim.height,
      cacheBust: true,
      backgroundColor: palette.bg,
    });
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, blob };
  }

  async function handleDownload() {
    if (!selectedConcept) {
      setError('Generate concepts first.');
      return;
    }
    setError('');
    try {
      const { dataUrl } = await renderPng();
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName(selectedConcept.content.headline, dim.exportLabel);
      link.click();
      setMessage('Poster downloaded as PNG.');
    } catch (downloadError) {
      setError(errorMessage(downloadError, 'Could not export the poster.'));
    }
  }

  async function handleSave() {
    if (!supabase || !organization?.id || !user?.id || !selectedConcept) return;
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { blob } = await renderPng();
      const content = selectedConcept.content;
      const name = fileName(content.headline, dim.exportLabel);
      const storagePath = organization.id + '/poster-studio-ai/' + Date.now() + '-' + name;

      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(storagePath, blob, { cacheControl: '3600', contentType: 'image/png', upsert: false });
      if (uploadError) throw new Error(errorMessage(uploadError, 'Could not upload the poster.'));

      const { data: signed } = await supabase.storage.from('post-media').createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      const { error: contentError } = await supabase
        .from('content_items')
        .insert({
          org_id: organization.id,
          content_type: 'poster',
          title: content.headline,
          body: [content.headline, content.subheadline, content.offer, content.callToAction].filter(Boolean).join('\n'),
          media_url: signed?.signedUrl ?? null,
          status: 'ready',
          created_by: user.id,
        });
      if (contentError) throw new Error(errorMessage(contentError, 'Could not save the poster record.'));

      setMessage('Poster saved to your library and ready for Social Hub.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save the poster.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack poster-page ai-poster-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Create</p>
          <h2>AI Poster Studio</h2>
        </div>
        <div className="poster-page-tabs" aria-label="Poster Studio tabs">
          <Link to="/poster" className="poster-page-tab">Current Studio</Link>
          <Link to="/poster-ai" className="poster-page-tab is-active">AI Studio</Link>
        </div>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading AI Poster Studio">
          <Loader2 className="spin" size={28} />
          <h3>Loading AI Poster Studio</h3>
        </section>
      ) : (
        <div className="ai-poster-layout">
          <section className="draft-panel ai-poster-control" aria-label="AI Poster controls">
            <div className="poster-panel-head"><h3>Brief</h3><Wand2 size={18} /></div>
            <label className="poster-field">
              <span>Topic</span>
              <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4} />
            </label>
            <label className="poster-field">
              <span>Objective</span>
              <select value={objective} onChange={(event) => setObjective(event.target.value)}>
                {posterObjectiveOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="poster-field">
              <span>Style</span>
              <input value={style} onChange={(event) => setStyle(event.target.value)} />
            </label>
            <label className="poster-field">
              <span>Size</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as PosterFormat)}>
                <option value="portrait">Portrait - 1080x1350</option>
                <option value="square">Square - 1080x1080</option>
                <option value="landscape">Landscape - 1200x628</option>
                <option value="story">Story - 1080x1920</option>
                <option value="youtube">YouTube - 1280x720</option>
              </select>
            </label>
            <button type="button" className="primary-action" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              <span>{generating ? 'Creating 3 posters' : 'Generate 3 posters'}</span>
            </button>

            {selectedConcept ? (
              <>
                <div className="poster-panel-head"><h3>Edit selected</h3><Wand2 size={18} /></div>
                <label className="poster-field">
                  <span>Headline</span>
                  <textarea value={selectedConcept.content.headline} onChange={(event) => updateSelectedContent('headline', event.target.value)} rows={2} />
                </label>
                <label className="poster-field">
                  <span>Subheadline</span>
                  <textarea value={selectedConcept.content.subheadline} onChange={(event) => updateSelectedContent('subheadline', event.target.value)} rows={2} />
                </label>
                <div className="poster-field-row">
                  <label className="poster-field"><span>Offer</span><input value={selectedConcept.content.offer} onChange={(event) => updateSelectedContent('offer', event.target.value)} placeholder="Optional" /></label>
                  <label className="poster-field"><span>CTA</span><input value={selectedConcept.content.callToAction} onChange={(event) => updateSelectedContent('callToAction', event.target.value)} placeholder="Optional" /></label>
                </div>
              </>
            ) : null}

            <div className="poster-panel-head"><h3>Theme</h3><PaletteIcon size={18} /></div>
            <div className="poster-subhead">Accent color</div>
            <div className="poster-tool-swatches" aria-label="Accent color">
              <button type="button" className={!accentColor ? 'poster-color-swatch is-active' : 'poster-color-swatch'} title="Brand accent" style={{ background: basePalette.accent }} onClick={() => setAccentColor('')} />
              {colorSwatches.map((color) => (
                <button key={color} type="button" className={accentColor === color ? 'poster-color-swatch is-active' : 'poster-color-swatch'} title={color} style={{ background: color }} onClick={() => setAccentColor(color)} />
              ))}
              <input type="color" className="poster-color-input" title="Custom accent" aria-label="Custom accent color" value={accentColor || basePalette.accent} onChange={(event) => setAccentColor(event.target.value.toUpperCase())} />
            </div>
            <div className="poster-subhead">Background color</div>
            <div className="poster-tool-swatches" aria-label="Background color">
              <button type="button" className={!backgroundColor ? 'poster-color-swatch is-active' : 'poster-color-swatch'} title="Auto background" style={{ background: basePalette.bg }} onClick={() => setBackgroundColor('')} />
              {colorSwatches.map((color) => (
                <button key={`bg-${color}`} type="button" className={backgroundColor === color ? 'poster-color-swatch is-active' : 'poster-color-swatch'} title={color} style={{ background: color }} onClick={() => setBackgroundColor(color)} />
              ))}
              <input type="color" className="poster-color-input" title="Custom background" aria-label="Custom background color" value={backgroundColor || basePalette.bg} onChange={(event) => setBackgroundColor(event.target.value.toUpperCase())} />
            </div>

            {sharedBackgroundImage ? (
              <div className="poster-group-body">
                <span className="poster-group-note">AI background art applied to all concepts.</span>
                <button type="button" className="poster-tool-button" title="Remove AI background" onClick={() => setSharedBackgroundImage('')}><X size={16} /></button>
              </div>
            ) : null}
          </section>

          <section className="ai-poster-workspace" aria-label="AI Poster canvas">
            <div className="poster-preview-bar poster-canvas-topbar">
              <span className="poster-preview-label">{brandName} - {dim.exportLabel}</span>
              <div className="poster-actions">
                <button type="button" className="primary-action" onClick={handleDownload} disabled={!selectedConcept}><Download size={16} /><span>Download PNG</span></button>
                <button type="button" className="icon-text-button" onClick={handleSave} disabled={saving || !businessDna || !selectedConcept}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}<span>{saving ? 'Saving' : 'Save'}</span></button>
                <Link className="icon-text-button" to="/social"><Send size={16} /><span>Social Hub</span></Link>
              </div>
            </div>

            {selectedConcept ? (
              <>
                <div className="ai-poster-stage-wrap" ref={stageRef} style={{ minHeight: dim.height * scale + 28 }}>
                  <div style={{ transform: 'scale(' + scale + ')', transformOrigin: 'top center', width: dim.width, height: dim.height }}>
                    <PosterTemplate
                      ref={posterRef}
                      template={selectedConcept.template}
                      format={format}
                      content={selectedConcept.content}
                      palette={palette}
                      brandName={brandName}
                      logoUrl={logoUrl}
                      logoAlt={businessDna?.logo_alt_text ?? brandName + ' logo'}
                      backgroundImageUrl={sharedBackgroundImage}
                      backgroundOpacity={sharedBackgroundImage ? 1 : 0.72}
                    />
                  </div>
                </div>

                <div className="ai-poster-filmstrip" role="listbox" aria-label="Choose a poster concept">
                  {concepts.map((concept, index) => {
                    const thumbScale = 132 / dim.width;
                    const active = concept.id === selectedConcept.id;
                    return (
                      <button
                        key={concept.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={active ? 'ai-poster-thumb is-active' : 'ai-poster-thumb'}
                        onClick={() => setSelectedId(concept.id)}
                      >
                        <span className="ai-poster-thumb-frame" style={{ width: dim.width * thumbScale, height: dim.height * thumbScale }}>
                          <span className="ai-poster-thumb-scaler" style={{ transform: 'scale(' + thumbScale + ')', width: dim.width, height: dim.height }}>
                            <PosterTemplate
                              template={concept.template}
                              format={format}
                              content={concept.content}
                              palette={palette}
                              brandName={brandName}
                              logoUrl={logoUrl}
                              logoAlt={brandName + ' logo'}
                              backgroundImageUrl={sharedBackgroundImage}
                              backgroundOpacity={sharedBackgroundImage ? 1 : 0.72}
                            />
                          </span>
                        </span>
                        <span className="ai-poster-thumb-meta">
                          <strong>Option {index + 1}</strong>
                          <small>{concept.angle}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <section className="empty-state" aria-label="No concepts yet">
                <Sparkles size={26} />
                <h3>Generate 3 poster concepts</h3>
                <p>Enter a topic and objective, then Generate to see three premium options. Pick one from the bar to edit and export.</p>
              </section>
            )}

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>
        </div>
      )}
    </div>
  );
}

async function requestAiPoster(params: {
  brief: string;
  objective: string;
  style: string;
  format: PosterFormat;
  orgId: string;
  userId: string;
  brandName: string;
  palette: PosterPalette;
  businessDna: BusinessDnaRow | null;
  logoUrl: string;
}): Promise<PosterAgentPayload | null> {
  const n8n = await requestN8nPoster(params).catch(() => null);
  if (n8n) return n8n;

  if (supabase && params.orgId) {
    const { data, error } = await supabase.functions.invoke('ai-handler', {
      body: { action: 'generate_poster_art', orgId: params.orgId, brief: params.brief, format: params.format, quality: 'high' },
    });
    if (!error && data) return data as PosterAgentPayload;
  }

  return null;
}

async function requestN8nPoster(params: {
  brief: string;
  objective: string;
  style: string;
  format: PosterFormat;
  orgId: string;
  userId: string;
  brandName: string;
  palette: PosterPalette;
  businessDna: BusinessDnaRow | null;
  logoUrl: string;
}): Promise<PosterAgentPayload | null> {
  const url = env.n8nPosterWebhookUrl.trim();
  if (!url || !params.orgId) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'time2grow_poster_workflow_2',
        action: 'hybrid_poster',
        orgId: params.orgId,
        userId: params.userId,
        userIdea: params.brief,
        topic: cleanTopic(params.brief),
        objective: params.objective,
        preferredStyle: params.style,
        format: params.format,
        brandName: params.brandName,
        palette: params.palette,
        businessDna: buildBusinessDnaPayload(params.businessDna),
        logo: { url: params.logoUrl, brandName: params.brandName, source: params.logoUrl ? 'business_dna' : 'wordmark' },
      }),
    });
    if (!response.ok) return null;
    return (await response.json().catch(() => null)) as PosterAgentPayload | null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function firstImage(payload: PosterAgentPayload) {
  return stringValue(payload.imageDataUrl)
    || stringValue(payload.backgroundImageUrl)
    || stringValue(payload.imageUrl)
    || stringValue(payload.poster?.imageUrl)
    || stringValue(payload.poster?.downloadUrl);
}

type BriefFacts = {
  greeting: string;
  festivalNoun: string;
  brand: string;
  subject: string;
};

const FESTIVALS: Array<{ test: RegExp; greeting: string; noun: string }> = [
  { test: /\b(diwali|deepavali|deepawali|deepwali)\b/i, greeting: 'Happy Diwali', noun: 'Diwali' },
  { test: /\bholi\b/i, greeting: 'Happy Holi', noun: 'Holi' },
  { test: /\b(christmas|xmas)\b/i, greeting: 'Merry Christmas', noun: 'Christmas' },
  { test: /\bnew year\b/i, greeting: 'Happy New Year', noun: 'New Year' },
  { test: /\beid\b/i, greeting: 'Eid Mubarak', noun: 'Eid' },
  { test: /\bpongal\b/i, greeting: 'Happy Pongal', noun: 'Pongal' },
  { test: /\b(makar\s+)?sankranti\b/i, greeting: 'Happy Sankranti', noun: 'Sankranti' },
  { test: /\b(dussehra|dasara|vijayadashami)\b/i, greeting: 'Happy Dussehra', noun: 'Dussehra' },
  { test: /\b(ganesh chaturthi|vinayaka chavithi|vinayaka)\b/i, greeting: 'Happy Ganesh Chaturthi', noun: 'Ganesh Chaturthi' },
  { test: /\bugadi\b/i, greeting: 'Happy Ugadi', noun: 'Ugadi' },
  { test: /\bnavratri\b/i, greeting: 'Happy Navratri', noun: 'Navratri' },
  { test: /\bonam\b/i, greeting: 'Happy Onam', noun: 'Onam' },
  { test: /\b(raksha bandhan|rakhi)\b/i, greeting: 'Happy Raksha Bandhan', noun: 'Raksha Bandhan' },
  { test: /\b(ramadan|ramzan)\b/i, greeting: 'Ramadan Kareem', noun: 'Ramadan' },
  { test: /\beaster\b/i, greeting: 'Happy Easter', noun: 'Easter' },
  { test: /\bvalentine/i, greeting: "Happy Valentine's Day", noun: "Valentine's Day" },
  { test: /\bindependence day\b/i, greeting: 'Happy Independence Day', noun: 'Independence Day' },
  { test: /\brepublic day\b/i, greeting: 'Happy Republic Day', noun: 'Republic Day' },
  { test: /\banniversary\b/i, greeting: 'Happy Anniversary', noun: 'Anniversary' },
  { test: /\bbirthday\b/i, greeting: 'Happy Birthday', noun: 'Birthday' },
];

const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'from', 'with', 'by', 'our', 'your', 'their', 'us', 'we',
  'wishes', 'wish', 'wishing', 'greetings', 'greeting', 'poster', 'posters', 'create', 'make', 'design', 'designed',
  'need', 'want', 'give', 'please', 'warm', 'premium', 'festive', 'festival', 'look', 'looks', 'style', 'styled',
  'modern', 'minimal', 'clean', 'elegant', 'luxury', 'luxurious', 'vibrant', 'colorful', 'colourful', 'high', 'contrast',
  'conceptual', 'message', 'brand', 'safe', 'beautiful', 'nice', 'good', 'simple', 'professional', 'best', 'image',
  'picture', 'graphic', 'social', 'media', 'post', 'ad', 'advertisement', 'creative', 'flyer',
]);

// Pull a likely brand name out of the brief ("... from AD96", "by Acme Labs").
function extractBrandFromBrief(brief: string) {
  const match = brief.match(/\b(?:from|by|for)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,2})/);
  return match ? match[1].trim() : '';
}

function detectFestival(brief: string) {
  return FESTIVALS.find((festival) => festival.test.test(brief)) ?? null;
}

// A short, clean, title-cased subject with brief filler/style words removed.
function cleanSubject(brief: string) {
  const words = brief
    .replace(/[^A-Za-z0-9&\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !FILLER_WORDS.has(word.toLowerCase()));
  const trimmed = words.slice(0, 6);
  if (trimmed.length === 0) return '';
  return trimmed
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function analyzeBrief(brief: string, brandName: string): BriefFacts {
  const festival = detectFestival(brief);
  const brand = extractBrandFromBrief(brief) || (brandName.trim() || 'us');
  return {
    greeting: festival?.greeting ?? '',
    festivalNoun: festival?.noun ?? '',
    brand,
    subject: cleanSubject(brief),
  };
}

// Three visually distinct, on-brand concepts from one brief. The theme (palette)
// is applied by the caller and locked across the whole set. Copy is written from
// the parsed occasion/brand/subject - never echoed verbatim from the raw brief.
function buildConceptSet(brief: string, objective: string, brandName: string): PosterConcept[] {
  const facts = analyzeBrief(brief, brandName);
  const lower = objective.toLowerCase();

  if (facts.greeting) {
    const { greeting, festivalNoun: noun, brand } = facts;
    return [
      {
        id: 'concept-benefit',
        angle: 'Warm greeting',
        template: 'spotlight',
        content: { headline: greeting, subheadline: `Warm wishes from ${brand} for a bright and joyful ${noun}.`, offer: '', callToAction: '' },
      },
      {
        id: 'concept-direct',
        angle: 'Celebration',
        template: 'bold',
        content: { headline: greeting, subheadline: `May your ${noun} sparkle with joy, prosperity, and togetherness.`, offer: "Season's greetings", callToAction: '' },
      },
      {
        id: 'concept-premium',
        angle: 'Premium wishes',
        template: 'premium',
        content: { headline: greeting, subheadline: `${brand} wishes you and your family a warm and prosperous ${noun}.`, offer: '', callToAction: '' },
      },
    ];
  }

  const headline = facts.subject || defaultHeadline(objective);
  const cta = ctaForObjective(lower);
  const eyebrow = eyebrowForObjective(objective, lower);
  const educational = isEducational(lower);

  return [
    {
      id: 'concept-benefit',
      angle: 'Benefit spotlight',
      template: 'spotlight',
      content: { headline, subheadline: 'A clear, benefit-led message with strong hierarchy and one confident action.', offer: '', callToAction: cta },
    },
    {
      id: 'concept-direct',
      angle: 'Direct response',
      template: 'bold',
      content: { headline, subheadline: 'One strong message, one clear action - designed to get a response.', offer: eyebrow, callToAction: cta },
    },
    {
      id: 'concept-premium',
      angle: educational ? 'Educational' : 'Premium editorial',
      template: educational ? 'educational' : 'premium',
      content: { headline, subheadline: educational ? 'A structured, easy-to-follow layout that builds trust and understanding.' : 'A refined, premium layout with generous space and a controlled accent.', offer: educational ? 'Useful guide' : '', callToAction: cta },
    },
  ];
}

function isEducational(lower: string) {
  return lower.includes('educat') || lower.includes('guide') || lower.includes('how') || lower.includes('awareness');
}

function defaultHeadline(objective: string) {
  const lower = objective.toLowerCase();
  if (lower.includes('donation')) return 'Give a little, change a lot';
  if (lower.includes('ngo') || lower.includes('awareness')) return 'Together we can do more';
  if (lower.includes('demo')) return 'See it in action';
  if (lower.includes('lead')) return 'Grow with us';
  if (lower.includes('offer')) return 'A better deal, today';
  if (lower.includes('education')) return 'Learn something useful';
  return objective && objective !== 'Generic poster' ? objective : 'Your campaign';
}

function eyebrowForObjective(objective: string, lower: string) {
  if (lower.includes('donation')) return 'Donation drive';
  if (lower.includes('ngo') || lower.includes('awareness')) return 'Awareness';
  if (lower.includes('hackathon')) return 'Hackathon';
  if (lower.includes('runathon')) return 'Runathon';
  if (lower.includes('cycling')) return 'Club ride';
  if (lower.includes('event') || lower.includes('community') || lower.includes('invitation')) return 'You are invited';
  if (lower.includes('demo')) return 'Book a demo';
  if (lower.includes('offer')) return 'Featured';
  return objective === 'Generic poster' ? 'Featured' : objective;
}

function ctaForObjective(lower: string) {
  if (lower.includes('donation')) return 'Donate now';
  if (lower.includes('ngo') || lower.includes('awareness')) return 'Support the cause';
  if (lower.includes('hackathon')) return 'Register now';
  if (lower.includes('runathon')) return 'Join the run';
  if (lower.includes('cycling')) return 'Join the ride';
  if (lower.includes('event') || lower.includes('community') || lower.includes('invitation')) return 'Join us';
  if (lower.includes('demo')) return 'Book a demo';
  if (lower.includes('education')) return 'Learn more';
  if (lower.includes('offer')) return 'Claim offer';
  return 'Get started';
}

function cleanTopic(value: string) {
  const withoutObjective = value
    .replace(/\bobjective\s*:\s*[^.;\n]+/gi, '')
    .replace(/\bgoal\s*:\s*[^.;\n]+/gi, '')
    .replace(/\bintent\s*:\s*[^.;\n]+/gi, '');
  const first = withoutObjective.split(/[;\n]/)[0]?.trim() || withoutObjective.trim() || 'Your campaign';
  return first
    .replace(/^create\s+/i, '')
    .replace(/^make\s+/i, '')
    .replace(/^a\s+poster\s+for\s+/i, '')
    .replace(/^poster\s+for\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Your campaign';
}

function parseBrandColors(dna: BusinessDnaRow | null): BrandColor[] {
  const raw = dna?.brand_colors as Json | undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label : '';
      const value = typeof record.value === 'string' ? record.value : '';
      if (!value) return null;
      return { label: label || 'Brand', value } satisfies BrandColor;
    })
    .filter((item): item is BrandColor => Boolean(item));
}

function buildColorSwatches(brandColors: BrandColor[], baseAccent: string) {
  const values = [...brandColors.map((color) => color.value), baseAccent, '#0C1A2E', '#2563EB', '#C8A24C', '#E11C6B', '#0F766E', '#F97316'];
  const seen = new Set<string>();
  return values
    .map((value) => normalizeHex(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .slice(0, 7);
}

function applyOverrides(palette: PosterPalette, accentColor: string, backgroundColor: string): PosterPalette {
  const accent = normalizeHex(accentColor);
  const bg = normalizeHex(backgroundColor);
  return {
    ...palette,
    accent: accent || palette.accent,
    onAccent: accent ? readableOn(accent) : palette.onAccent,
    bg: bg || palette.bg,
  };
}

function buildBusinessDnaPayload(dna: BusinessDnaRow | null) {
  if (!dna) return null;
  return {
    websiteUrl: dna.website_url,
    mission: dna.mission,
    positioning: dna.positioning,
    audience: dna.audience,
    brandColors: dna.brand_colors,
    logoStorageBucket: dna.logo_storage_bucket,
    logoStoragePath: dna.logo_storage_path,
  };
}

async function createStorageSignedUrl(bucket: string, path: string) {
  if (!supabase || !bucket || !path) return '';
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? '';
}

function normalizeHex(value: string) {
  const match = value.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return '';
  const hex = match[1].length === 3 ? match[1].split('').map((char) => char + char).join('') : match[1];
  return '#' + hex.toUpperCase();
}

function readableOn(hex: string) {
  return luminance(hex) > 0.52 ? '#111827' : '#FFFFFF';
}

function luminance(hex: string) {
  const h = hex.replace('#', '');
  const rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  const values = rgb.map((value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function waitForPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function fileName(title: string, exportLabel: string) {
  const slug = (title || 'poster').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'poster';
  return slug + '-' + exportLabel + '.png';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
