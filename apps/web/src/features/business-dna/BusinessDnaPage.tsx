import { FormEvent, useEffect, useState } from 'react';
import { Dna, Globe, Loader2, Plus, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];

type ColorEntry = { label: string; value: string };

type FormState = {
  websiteUrl: string;
  keyMetric: string;
  mission: string;
  vision: string;
  positioning: string;
  values: string;
  audience: string;
  proofPoints: string;
  growthGoal: string;
  additionalNotes: string;
  colors: ColorEntry[];
};

const defaultColors: ColorEntry[] = [
  { label: 'Primary', value: '' },
  { label: 'Accent', value: '' },
];

const emptyForm: FormState = {
  websiteUrl: '',
  keyMetric: '',
  mission: '',
  vision: '',
  positioning: '',
  values: '',
  audience: '',
  proofPoints: '',
  growthGoal: '',
  additionalNotes: '',
  colors: defaultColors,
};

type ExtractedDna = {
  mission: string;
  vision: string;
  positioning: string;
  values: string;
  audience: string;
  proofPoints: string;
  growthGoal: string;
  keyMetric: string;
  colors?: ColorEntry[];
};
export function BusinessDnaPage() {
  const { organization, user } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractMessage, setExtractMessage] = useState('');
  const [extractError, setExtractError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase || !organization?.id) {
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('business_dna')
        .select('*')
        .eq('org_id', organization.id)
        .maybeSingle();

      if (!active) return;

      if (loadError) {
        setError(errorMessage(loadError, 'Could not load Business DNA.'));
        setLoading(false);
        return;
      }

      if (data) {
        setForm(mapRowToForm(data));
        setRecordId(data.id);
      }

      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateColor(index: number, field: keyof ColorEntry, value: string) {
    setForm((current) => ({
      ...current,
      colors: current.colors.map((color, colorIndex) => (colorIndex === index ? { ...color, [field]: value } : color)),
    }));
  }

  function addColor() {
    setForm((current) => ({ ...current, colors: [...current.colors, { label: '', value: '' }] }));
  }

  function removeColor(index: number) {
    setForm((current) => ({ ...current, colors: current.colors.filter((_, colorIndex) => colorIndex !== index) }));
  }

  async function handleFetchFromWebsite() {
    if (!supabase || !organization?.id) return;

    const websiteUrl = form.websiteUrl.trim();
    if (!websiteUrl) {
      setExtractError('Enter a website URL first.');
      return;
    }

    setExtracting(true);
    setExtractMessage('');
    setExtractError('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: { action: 'extract_dna', orgId: organization.id, websiteUrl },
      });

      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));

      const dna = data?.dna as ExtractedDna | undefined;
      if (!dna) throw new Error('The AI did not return any details for that website.');

      const fetchedColors = extractFetchedColors(dna.colors);
      setForm((current) => ({
        ...current,
        mission: dna.mission || current.mission,
        vision: dna.vision || current.vision,
        positioning: dna.positioning || current.positioning,
        values: dna.values || current.values,
        audience: dna.audience || current.audience,
        proofPoints: dna.proofPoints || current.proofPoints,
        growthGoal: dna.growthGoal || current.growthGoal,
        keyMetric: dna.keyMetric || current.keyMetric,
        colors: fetchedColors.length > 0 ? mergeFetchedColors(current.colors, fetchedColors) : current.colors,
      }));
      setExtractMessage('Pulled details and brand colors from the website. Review the fields below, edit anything, then save.');
    } catch (fetchError) {
      setExtractError(errorMessage(fetchError, 'Could not fetch details from that website.'));
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        org_id: organization.id,
        website_url: form.websiteUrl.trim() || null,
        key_metric: form.keyMetric.trim() || null,
        mission: form.mission.trim() || null,
        vision: form.vision.trim() || null,
        positioning: form.positioning.trim() || null,
        values: form.values.trim() || null,
        audience: form.audience.trim() || null,
        proof_points: form.proofPoints.trim() || null,
        growth_goal: form.growthGoal.trim() || null,
        additional_notes: form.additionalNotes.trim() || null,
        brand_colors: form.colors
          .map((color) => ({ label: color.label.trim(), value: color.value.trim() }))
          .filter((color) => color.label || color.value) satisfies Json,
        created_by: user.id,
      };

      const { data, error: saveError } = await supabase
        .from('business_dna')
        .upsert(payload, { onConflict: 'org_id' })
        .select('*')
        .single();

      if (saveError) throw saveError;

      setRecordId(data.id);
      setMessage('Business DNA saved.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save Business DNA.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Foundation</p>
          <h2>Business DNA</h2>
        </div>
        <span className={recordId ? 'status-pill success' : 'status-pill warning'}>{recordId ? 'Captured' : 'Not set up yet'}</span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading Business DNA">
          <Loader2 className="spin" size={28} />
          <h3>Loading Business DNA</h3>
        </section>
      ) : (
        <section className="draft-panel" aria-label="Business DNA">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Positioning &amp; audience</p>
              <h3>What Content Studio and Maya will use</h3>
            </div>
            <Dna size={21} />
          </div>

          <form className="draft-form" onSubmit={handleSubmit}>
            <label>
              <span>Website URL</span>
              <div className="dna-website-row">
                <input value={form.websiteUrl} onChange={(event) => updateField('websiteUrl', event.target.value)} placeholder="https://yourbusiness.com" />
                <button type="button" className="icon-text-button" onClick={handleFetchFromWebsite} disabled={extracting}>
                  {extracting ? <Loader2 className="spin" size={16} /> : <Globe size={16} />}
                  <span>{extracting ? 'Fetching' : 'Fetch from website'}</span>
                </button>
              </div>
            </label>

            <label>
              <span>Key metric</span>
              <input value={form.keyMetric} onChange={(event) => updateField('keyMetric', event.target.value)} placeholder="Example: Monthly recurring revenue" />
            </label>

            {extractMessage ? <p className="form-message success draft-body-field">{extractMessage}</p> : null}
            {extractError ? <p className="form-message error draft-body-field">{extractError}</p> : null}

            <label className="draft-body-field">
              <span>Mission</span>
              <textarea value={form.mission} onChange={(event) => updateField('mission', event.target.value)} rows={2} placeholder="Why this business exists" />
            </label>

            <label className="draft-body-field">
              <span>Vision</span>
              <textarea value={form.vision} onChange={(event) => updateField('vision', event.target.value)} rows={2} placeholder="Where it's headed" />
            </label>

            <label className="draft-body-field">
              <span>Positioning</span>
              <textarea value={form.positioning} onChange={(event) => updateField('positioning', event.target.value)} rows={2} placeholder="What makes it different from alternatives" />
            </label>

            <label className="draft-body-field">
              <span>Values</span>
              <textarea value={form.values} onChange={(event) => updateField('values', event.target.value)} rows={2} placeholder="Principles that shape decisions and tone" />
            </label>

            <label className="draft-body-field">
              <span>Audience</span>
              <textarea value={form.audience} onChange={(event) => updateField('audience', event.target.value)} rows={2} placeholder="Who this is built for" />
            </label>

            <label className="draft-body-field">
              <span>Proof points</span>
              <textarea value={form.proofPoints} onChange={(event) => updateField('proofPoints', event.target.value)} rows={2} placeholder="Results, testimonials, credentials" />
            </label>

            <label className="draft-body-field">
              <span>Growth goal</span>
              <textarea value={form.growthGoal} onChange={(event) => updateField('growthGoal', event.target.value)} rows={2} placeholder="What growing looks like over the next few months" />
            </label>

            <label className="draft-body-field">
              <span>Anything else Maya and Content Studio should know</span>
              <textarea value={form.additionalNotes} onChange={(event) => updateField('additionalNotes', event.target.value)} rows={3} placeholder="Explain your business in your own words - anything the fields above don't capture" />
            </label>

            <label className="draft-body-field">
              <span>Brand colors</span>
              <div className="dna-color-list">
                {form.colors.map((color, index) => (
                  <div className="dna-color-row" key={index}>
                    <input value={color.label} onChange={(event) => updateColor(index, 'label', event.target.value)} placeholder="Label, e.g. Primary" />
                    <input value={color.value} onChange={(event) => updateColor(index, 'value', event.target.value)} placeholder="#E11C6B" />
                    <button type="button" className="icon-button" aria-label="Remove color" onClick={() => removeColor(index)}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="icon-text-button" onClick={addColor}>
                <Plus size={16} />
                <span>Add color</span>
              </button>
            </label>

            {message ? <p className="form-message success draft-body-field">{message}</p> : null}
            {error ? <p className="form-message error draft-body-field">{error}</p> : null}

            <button className="primary-action draft-body-field" type="submit" disabled={saving || !organization?.id}>
              {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              <span>{saving ? 'Saving' : 'Save Business DNA'}</span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function extractFetchedColors(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label.trim() : '';
      const colorValue = typeof record.value === 'string' ? record.value.trim().toUpperCase() : '';
      if (!/^#[0-9A-F]{6}$/.test(colorValue)) return null;
      return { label: label || 'Brand color', value: colorValue };
    })
    .filter((entry): entry is ColorEntry => Boolean(entry))
    .slice(0, 8);
}

function mergeFetchedColors(current: ColorEntry[], fetched: ColorEntry[]) {
  const currentWithValues = current.filter((color) => color.value.trim());
  if (currentWithValues.length === 0) return fetched;

  const existing = new Set(currentWithValues.map((color) => color.value.trim().toUpperCase()));
  const additions = fetched.filter((color) => !existing.has(color.value.trim().toUpperCase()));
  return [...currentWithValues, ...additions].slice(0, 8);
}
function isColorRecord(value: Json): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapRowToForm(row: BusinessDnaRow): FormState {
  const colors = Array.isArray(row.brand_colors)
    ? row.brand_colors
        .filter(isColorRecord)
        .map((color) => ({
          label: typeof color.label === 'string' ? color.label : '',
          value: typeof color.value === 'string' ? color.value : '',
        }))
    : [];

  return {
    websiteUrl: row.website_url ?? '',
    keyMetric: row.key_metric ?? '',
    mission: row.mission ?? '',
    vision: row.vision ?? '',
    positioning: row.positioning ?? '',
    values: row.values ?? '',
    audience: row.audience ?? '',
    proofPoints: row.proof_points ?? '',
    growthGoal: row.growth_goal ?? '',
    additionalNotes: row.additional_notes ?? '',
    colors: colors.length > 0 ? colors : defaultColors,
  };
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

async function edgeFunctionErrorMessage(error: unknown, functionName: string) {
  const response = edgeFunctionResponse(error);
  if (response) {
    const detail = await response
      .clone()
      .json()
      .then((body) => {
        if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
        if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
        return '';
      })
      .catch(() => response.clone().text().catch(() => ''));

    if (detail.trim()) return detail.trim();
  }

  const message = errorMessage(error, '');
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('failed to send a request to the edge function') || lowerMessage.includes('failed to fetch')) {
    return `Could not reach the ${functionName} Edge Function. Deploy ${functionName} in Supabase Edge Functions for this project, then refresh and try again.`;
  }

  if (lowerMessage.includes('edge function returned a non-2xx status code')) {
    return `${functionName} returned an error. Check the Supabase Edge Function logs for the exact provider or secret issue.`;
  }

  return message || `Could not call the ${functionName} Edge Function.`;
}

function edgeFunctionResponse(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const context = (error as Record<string, unknown>).context;
  return context instanceof Response ? context : null;
}
