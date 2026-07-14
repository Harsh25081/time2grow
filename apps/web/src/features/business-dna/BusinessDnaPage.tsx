import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Dna, Globe, Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { ClientBrandManager } from './ClientBrandManager';
import { errorMessage, edgeFunctionErrorMessage } from './edgeError';
import type { Database, Json } from '../../types/database';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];

type ColorEntry = { label: string; value: string };

type LogoState = {
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  altText: string;
  previewUrl: string;
};

type FormState = {
  websiteUrl: string;
  contactPhone: string;
  contactEmail: string;
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
  logo: LogoState;
  qr: LogoState;
};

const defaultColors: ColorEntry[] = [
  { label: 'Primary', value: '' },
  { label: 'Accent', value: '' },
];

const emptyLogo: LogoState = {
  storageBucket: '',
  storagePath: '',
  fileName: '',
  mimeType: '',
  sizeBytes: null,
  altText: '',
  previewUrl: '',
};

const emptyForm: FormState = {
  websiteUrl: '',
  contactPhone: '',
  contactEmail: '',
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
  logo: emptyLogo,
  qr: emptyLogo,
};

const logoMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const qrMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const maxLogoBytes = 2 * 1024 * 1024;

type ExtractedLogo = {
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  altText?: string;
  imageUrl?: string;
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
  logo?: ExtractedLogo;
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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

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
        const nextForm = mapRowToForm(data);
        if (nextForm.logo.storageBucket && nextForm.logo.storagePath) {
          nextForm.logo.previewUrl = await createLogoPreviewUrl(nextForm.logo.storageBucket, nextForm.logo.storagePath);
        }
        if (nextForm.qr.storageBucket && nextForm.qr.storagePath) {
          nextForm.qr.previewUrl = await createLogoPreviewUrl(nextForm.qr.storageBucket, nextForm.qr.storagePath);
        }

        if (!active) return;
        setForm(nextForm);
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
    const websiteUrl = form.websiteUrl.trim();
    if (!websiteUrl) {
      setExtractError('Enter a website URL first.');
      return;
    }
    if (!supabase || !organization?.id) {
      setExtractError('Sign in and select a workspace before fetching from a website.');
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
      const fetchedLogo = extractFetchedLogo(dna.logo);
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
        logo: fetchedLogo ?? current.logo,
      }));
      setExtractMessage(fetchedLogo ? 'Pulled details, brand colors, and logo from the website. Review and save.' : 'Pulled details and brand colors from the website. Review and save.');
    } catch (fetchError) {
      setExtractError(errorMessage(fetchError, 'Could not fetch details from that website.'));
    } finally {
      setExtracting(false);
    }
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!supabase || !organization?.id || !user?.id) return;

    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setMessage('');
    setError('');

    if (!logoMimeTypes.includes(file.type)) {
      setError('Upload a PNG, JPG, WebP, or GIF logo.');
      return;
    }

    if (file.size > maxLogoBytes) {
      setError('Logo must be 2 MB or smaller.');
      return;
    }

    setUploadingLogo(true);

    try {
      const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
      const storagePath = `${organization.id}/brand-assets/logo/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('post-media').upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const previewUrl = await createLogoPreviewUrl('post-media', storagePath);
      setForm((current) => ({
        ...current,
        logo: {
          storageBucket: 'post-media',
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          altText: `${organization.name} logo`,
          previewUrl,
        },
      }));
      setMessage('Logo uploaded. Save Business DNA to keep it.');
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload logo.'));
    } finally {
      setUploadingLogo(false);
    }
  }

  function clearLogo() {
    setForm((current) => ({ ...current, logo: emptyLogo }));
    setMessage('Logo removed from Business DNA. Save to keep this change.');
  }

  async function handleQrUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!supabase || !organization?.id || !user?.id) return;

    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setMessage('');
    setError('');

    if (!qrMimeTypes.includes(file.type)) {
      setError('Upload a PNG, JPG, WebP, or SVG QR code.');
      return;
    }

    if (file.size > maxLogoBytes) {
      setError('QR code must be 2 MB or smaller.');
      return;
    }

    setUploadingQr(true);

    try {
      const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
      const storagePath = `${organization.id}/brand-assets/qr/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('post-media').upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const previewUrl = await createLogoPreviewUrl('post-media', storagePath);
      setForm((current) => ({
        ...current,
        qr: {
          storageBucket: 'post-media',
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          altText: `${organization.name} QR code`,
          previewUrl,
        },
      }));
      setMessage('QR code uploaded. Save Business DNA to keep it.');
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload QR code.'));
    } finally {
      setUploadingQr(false);
    }
  }

  function clearQr() {
    setForm((current) => ({ ...current, qr: emptyLogo }));
    setMessage('QR code removed from Business DNA. Save to keep this change.');
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
        contact_phone: form.contactPhone.trim() || null,
        contact_email: form.contactEmail.trim() || null,
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
        logo_storage_bucket: form.logo.storageBucket || null,
        logo_storage_path: form.logo.storagePath || null,
        logo_file_name: form.logo.fileName || null,
        logo_mime_type: form.logo.mimeType || null,
        logo_size_bytes: form.logo.sizeBytes,
        logo_alt_text: form.logo.altText || null,
        qr_storage_bucket: form.qr.storageBucket || null,
        qr_storage_path: form.qr.storagePath || null,
        qr_file_name: form.qr.fileName || null,
        qr_mime_type: form.qr.mimeType || null,
        qr_size_bytes: form.qr.sizeBytes,
        qr_alt_text: form.qr.altText || null,
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

  const hasLogo = Boolean(form.logo.storagePath || form.logo.previewUrl);
  const hasQr = Boolean(form.qr.storagePath || form.qr.previewUrl);

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

            <div className="poster-field-row">
              <label>
                <span>Contact phone</span>
                <input value={form.contactPhone} onChange={(event) => updateField('contactPhone', event.target.value)} placeholder="Example: +91 92769 69696" />
              </label>
              <label>
                <span>Contact email</span>
                <input value={form.contactEmail} onChange={(event) => updateField('contactEmail', event.target.value)} placeholder="Example: hello@yourbusiness.com" />
              </label>
            </div>

            <label>
              <span>Key metric</span>
              <input value={form.keyMetric} onChange={(event) => updateField('keyMetric', event.target.value)} placeholder="Example: Monthly recurring revenue" />
            </label>

            <div className="draft-body-field dna-logo-section">
              <span>Logo</span>
              <div className="dna-logo-field">
                <div className="dna-logo-preview">
                  {form.logo.previewUrl ? <img src={form.logo.previewUrl} alt={form.logo.altText || 'Business logo'} /> : <ImageIcon size={30} />}
                </div>
                <div className="dna-logo-actions">
                  <label className="icon-text-button dna-logo-upload">
                    {uploadingLogo ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
                    <span>{uploadingLogo ? 'Uploading' : 'Upload logo'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                  <button type="button" className="icon-text-button" onClick={clearLogo} disabled={!hasLogo || uploadingLogo}>
                    <Trash2 size={16} />
                    <span>Remove</span>
                  </button>
                  <span className="dna-logo-meta">{form.logo.fileName || 'No logo selected'}</span>
                </div>
              </div>
            </div>

            <div className="draft-body-field dna-logo-section">
              <span>QR code (optional)</span>
              <div className="dna-logo-field">
                <div className="dna-logo-preview">
                  {form.qr.previewUrl ? <img src={form.qr.previewUrl} alt={form.qr.altText || 'Business QR code'} /> : <ImageIcon size={30} />}
                </div>
                <div className="dna-logo-actions">
                  <label className="icon-text-button dna-logo-upload">
                    {uploadingQr ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
                    <span>{uploadingQr ? 'Uploading' : 'Upload QR code'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleQrUpload} disabled={uploadingQr} />
                  </label>
                  <button type="button" className="icon-text-button" onClick={clearQr} disabled={!hasQr || uploadingQr}>
                    <Trash2 size={16} />
                    <span>Remove</span>
                  </button>
                  <span className="dna-logo-meta">{form.qr.fileName || 'No QR code selected'}</span>
                </div>
              </div>
            </div>

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

      {organization?.org_type === 'agency' && organization?.id && user?.id ? (
        <ClientBrandManager orgId={organization.id} userId={user.id} />
      ) : null}
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

function extractFetchedLogo(value: unknown): LogoState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const storageBucket = stringValue(record.storageBucket);
  const storagePath = stringValue(record.storagePath);
  if (!storageBucket || !storagePath) return null;

  return {
    storageBucket,
    storagePath,
    fileName: stringValue(record.fileName) || 'website-logo',
    mimeType: stringValue(record.mimeType),
    sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : null,
    altText: stringValue(record.altText) || 'Business logo',
    previewUrl: stringValue(record.imageUrl),
  };
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
    contactPhone: row.contact_phone ?? '',
    contactEmail: row.contact_email ?? '',
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
    logo: {
      storageBucket: row.logo_storage_bucket ?? '',
      storagePath: row.logo_storage_path ?? '',
      fileName: row.logo_file_name ?? '',
      mimeType: row.logo_mime_type ?? '',
      sizeBytes: row.logo_size_bytes ?? null,
      altText: row.logo_alt_text ?? '',
      previewUrl: '',
    },
    qr: {
      storageBucket: row.qr_storage_bucket ?? '',
      storagePath: row.qr_storage_path ?? '',
      fileName: row.qr_file_name ?? '',
      mimeType: row.qr_mime_type ?? '',
      sizeBytes: row.qr_size_bytes ?? null,
      altText: row.qr_alt_text ?? '',
      previewUrl: '',
    },
  };
}

async function createLogoPreviewUrl(bucket: string, path: string) {
  if (!supabase || !bucket || !path) return '';
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? '';
}

function sanitizeFileName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'logo.png';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}