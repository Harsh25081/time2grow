import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Building2, Globe, Image as ImageIcon, Loader2, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Json } from '../../types/database';
import {
  createBrandDnaSignedUrl,
  deleteClientBrandDna,
  listClientBrandDna,
  parseBrandColorEntries,
  type ClientBusinessDnaRow,
  type ColorEntry,
} from './brandDna';
import { edgeFunctionErrorMessage, errorMessage } from './edgeError';

type LogoState = {
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  altText: string;
  previewUrl: string;
};

type ClientForm = {
  name: string;
  websiteUrl: string;
  contactPhone: string;
  contactEmail: string;
  mission: string;
  vision: string;
  positioning: string;
  values: string;
  audience: string;
  proofPoints: string;
  growthGoal: string;
  keyMetric: string;
  additionalNotes: string;
  colors: ColorEntry[];
  logo: LogoState;
};

const emptyLogo: LogoState = {
  storageBucket: '',
  storagePath: '',
  fileName: '',
  mimeType: '',
  sizeBytes: null,
  altText: '',
  previewUrl: '',
};

const emptyForm: ClientForm = {
  name: '',
  websiteUrl: '',
  contactPhone: '',
  contactEmail: '',
  mission: '',
  vision: '',
  positioning: '',
  values: '',
  audience: '',
  proofPoints: '',
  growthGoal: '',
  keyMetric: '',
  additionalNotes: '',
  colors: [{ label: 'Primary', value: '' }, { label: 'Accent', value: '' }],
  logo: emptyLogo,
};

const logoMimeTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const maxLogoBytes = 2 * 1024 * 1024;

export function ClientBrandManager({ orgId, userId, canWrite }: { orgId: string; userId: string; canWrite: boolean }) {
  const [clients, setClients] = useState<ClientBusinessDnaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null=list, 'new'=add, id=edit
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [extractMessage, setExtractMessage] = useState('');
  const [extractError, setExtractError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const rows = await listClientBrandDna(orgId);
        if (active) setClients(rows);
      } catch (loadError) {
        if (active) setError(errorMessage(loadError, 'Could not load client brands.'));
      } finally {
        if (active) setLoading(false);
      }
    }
    if (orgId) load();
    return () => {
      active = false;
    };
  }, [orgId]);

  async function reload() {
    try {
      setClients(await listClientBrandDna(orgId));
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not reload client brands.'));
    }
  }

  function startAdd() {
    if (!canWrite) return;
    setForm(emptyForm);
    setEditingId('new');
    setMessage('');
    setError('');
    setExtractMessage('');
    setExtractError('');
  }

  async function startEdit(row: ClientBusinessDnaRow) {
    if (!canWrite) return;
    setMessage('');
    setError('');
    setExtractMessage('');
    setExtractError('');
    const previewUrl = await createBrandDnaSignedUrl(row.logo_storage_bucket, row.logo_storage_path);
    setForm({
      name: row.name,
      websiteUrl: row.website_url ?? '',
      contactPhone: row.contact_phone ?? '',
      contactEmail: row.contact_email ?? '',
      mission: row.mission ?? '',
      vision: row.vision ?? '',
      positioning: row.positioning ?? '',
      values: row.values ?? '',
      audience: row.audience ?? '',
      proofPoints: row.proof_points ?? '',
      growthGoal: row.growth_goal ?? '',
      keyMetric: row.key_metric ?? '',
      additionalNotes: row.additional_notes ?? '',
      colors: (() => {
        const parsed = parseBrandColorEntries(row.brand_colors);
        return parsed.length > 0 ? parsed : emptyForm.colors;
      })(),
      logo: {
        storageBucket: row.logo_storage_bucket ?? '',
        storagePath: row.logo_storage_path ?? '',
        fileName: row.logo_file_name ?? '',
        mimeType: row.logo_mime_type ?? '',
        sizeBytes: row.logo_size_bytes ?? null,
        altText: row.logo_alt_text ?? '',
        previewUrl,
      },
    });
    setEditingId(row.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setExtractMessage('');
    setExtractError('');
  }

  function updateField<K extends keyof ClientForm>(key: K, value: ClientForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateColor(index: number, field: keyof ColorEntry, value: string) {
    setForm((current) => ({
      ...current,
      colors: current.colors.map((color, i) => (i === index ? { ...color, [field]: value } : color)),
    }));
  }

  async function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    if (!canWrite) {
      event.target.value = '';
      setError('Ask an owner, admin, or editor to update client brands.');
      return;
    }
    if (!supabase || !orgId) return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
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
      const storagePath = `${orgId}/client-dna/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(storagePath, file, { cacheControl: '3600', contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const previewUrl = await createBrandDnaSignedUrl('post-media', storagePath);
      setForm((current) => ({
        ...current,
        logo: {
          storageBucket: 'post-media',
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          altText: `${current.name || 'Client'} logo`,
          previewUrl,
        },
      }));
    } catch (uploadError) {
      setError(errorMessage(uploadError, 'Could not upload logo.'));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleFetchFromWebsite() {
    if (!canWrite) {
      setExtractError('Ask an owner, admin, or editor to update client brands.');
      return;
    }
    const websiteUrl = form.websiteUrl.trim();
    if (!websiteUrl) {
      setExtractError('Enter the client website URL first.');
      return;
    }
    if (!supabase || !orgId) {
      setExtractError('Sign in and select a workspace before fetching from a website.');
      return;
    }

    setExtracting(true);
    setExtractMessage('');
    setExtractError('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: { action: 'extract_dna', orgId, websiteUrl },
      });

      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));

      const dna = data?.dna as ExtractedDna | undefined;
      if (!dna) throw new Error('The AI did not return any details for that website.');

      const fetchedColors = parseFetchedColors(dna.colors);
      const fetchedLogo = mapFetchedLogo(dna.logo);
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
        colors: fetchedColors.length > 0 ? fetchedColors : current.colors,
        logo: fetchedLogo ?? current.logo,
      }));
      setExtractMessage(fetchedLogo ? 'Pulled client details, brand colors, and logo. Review and save.' : 'Pulled client details and brand colors. Review and save.');
    } catch (fetchError) {
      setExtractError(errorMessage(fetchError, 'Could not fetch details from that website.'));
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to update client brands.');
      return;
    }
    if (!supabase || !orgId || !userId) return;
    if (!form.name.trim()) {
      setError('Enter a client name.');
      return;
    }
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const fields = {
        name: form.name.trim(),
        website_url: form.websiteUrl.trim() || null,
        contact_phone: form.contactPhone.trim() || null,
        contact_email: form.contactEmail.trim() || null,
        mission: form.mission.trim() || null,
        vision: form.vision.trim() || null,
        positioning: form.positioning.trim() || null,
        values: form.values.trim() || null,
        audience: form.audience.trim() || null,
        proof_points: form.proofPoints.trim() || null,
        growth_goal: form.growthGoal.trim() || null,
        key_metric: form.keyMetric.trim() || null,
        additional_notes: form.additionalNotes.trim() || null,
        brand_colors: form.colors
          .map((color) => ({ label: color.label.trim(), value: color.value.trim() }))
          .filter((color) => color.label || color.value) as Json,
        logo_storage_bucket: form.logo.storageBucket || null,
        logo_storage_path: form.logo.storagePath || null,
        logo_file_name: form.logo.fileName || null,
        logo_mime_type: form.logo.mimeType || null,
        logo_size_bytes: form.logo.sizeBytes,
        logo_alt_text: form.logo.altText || null,
      };

      if (editingId && editingId !== 'new') {
        const { error: updateError } = await supabase.from('client_business_dna').update(fields).eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('client_business_dna')
          .insert({ org_id: orgId, created_by: userId, ...fields });
        if (insertError) throw insertError;
      }

      await reload();
      setEditingId(null);
      setForm(emptyForm);
      setMessage('Client brand saved.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save client brand.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ClientBusinessDnaRow) {
    if (!canWrite) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete client brand "${row.name}"?`)) return;
    setError('');
    try {
      await deleteClientBrandDna(row.id);
      await reload();
      if (editingId === row.id) cancelEdit();
      setMessage('Client brand deleted.');
    } catch (deleteError) {
      setError(errorMessage(deleteError, 'Could not delete client brand.'));
    }
  }

  const hasLogo = Boolean(form.logo.previewUrl || form.logo.storagePath);

  return (
    <section className="draft-panel" aria-label="Client brands">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Agency</p>
          <h3>Client brands</h3>
        </div>
        <Building2 size={21} />
      </div>

      {!canWrite ? <p className="form-message warning">You can view client brands. Ask an owner, admin, or editor to make changes.</p> : null}

      {editingId === null ? (
        <>
          {loading ? (
            <p className="form-message">Loading client brands…</p>
          ) : clients.length === 0 ? (
            <p className="form-message">No client brands yet. Add one to design posters and content in that client's brand.</p>
          ) : (
            <ul className="client-brand-list">
              {clients.map((client) => (
                <li key={client.id} className="client-brand-row">
                  <span className="client-brand-mark">
                    <ImageIcon size={18} />
                  </span>
                  <span className="client-brand-meta">
                    <strong>{client.name}</strong>
                    <small>{[client.website_url, client.contact_phone].filter(Boolean).join(' · ') || 'No contact set'}</small>
                  </span>
                  {canWrite ? <button type="button" className="icon-text-button" onClick={() => startEdit(client)}>
                    <Pencil size={16} />
                    <span>Edit</span>
                  </button> : null}
                  {canWrite ? <button type="button" className="icon-text-button" onClick={() => handleDelete(client)}>
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button> : null}
                </li>
              ))}
            </ul>
          )}

          {message ? <p className="form-message success">{message}</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}

          {canWrite ? <button type="button" className="primary-action" onClick={startAdd}>
            <Plus size={18} />
            <span>Add client brand</span>
          </button> : null}
        </>
      ) : (
        <form className="draft-form" onSubmit={handleSubmit}>
          <fieldset className="role-gated-fieldset" disabled={!canWrite}>
          <label>
            <span>Client name</span>
            <input value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Example: LG, Sunrise School, Green Foundation" />
          </label>

          <label>
            <span>Website URL</span>
            <div className="dna-website-row">
              <input value={form.websiteUrl} onChange={(event) => updateField('websiteUrl', event.target.value)} placeholder="https://client.com" />
              <button type="button" className="icon-text-button" onClick={handleFetchFromWebsite} disabled={extracting}>
                {extracting ? <Loader2 className="spin" size={16} /> : <Globe size={16} />}
                <span>{extracting ? 'Fetching' : 'Fetch from website'}</span>
              </button>
            </div>
          </label>
          {extractMessage ? <p className="form-message success">{extractMessage}</p> : null}
          {extractError ? <p className="form-message error">{extractError}</p> : null}

          <div className="poster-field-row">
            <label>
              <span>Contact phone</span>
              <input value={form.contactPhone} onChange={(event) => updateField('contactPhone', event.target.value)} placeholder="+91 92769 69696" />
            </label>
            <label>
              <span>Contact email</span>
              <input value={form.contactEmail} onChange={(event) => updateField('contactEmail', event.target.value)} placeholder="hello@client.com" />
            </label>
          </div>

          <div className="draft-body-field dna-logo-section">
            <span>Client logo</span>
            <div className="dna-logo-field">
              <div className="dna-logo-preview">
                {form.logo.previewUrl ? <img src={form.logo.previewUrl} alt={form.logo.altText || 'Client logo'} /> : <ImageIcon size={30} />}
              </div>
              <div className="dna-logo-actions">
                <label className="icon-text-button dna-logo-upload">
                  {uploadingLogo ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
                  <span>{uploadingLogo ? 'Uploading' : 'Upload logo'}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleLogoUpload} disabled={uploadingLogo} />
                </label>
                <button type="button" className="icon-text-button" onClick={() => updateField('logo', emptyLogo)} disabled={!hasLogo || uploadingLogo}>
                  <Trash2 size={16} />
                  <span>Remove</span>
                </button>
                <span className="dna-logo-meta">{form.logo.fileName || 'No logo selected'}</span>
              </div>
            </div>
          </div>

          <label className="draft-body-field">
            <span>Key metric</span>
            <input value={form.keyMetric} onChange={(event) => updateField('keyMetric', event.target.value)} placeholder="Example: Monthly active customers" />
          </label>
          <label className="draft-body-field">
            <span>Mission</span>
            <textarea value={form.mission} onChange={(event) => updateField('mission', event.target.value)} rows={2} placeholder="Why this client's business exists" />
          </label>
          <label className="draft-body-field">
            <span>Vision</span>
            <textarea value={form.vision} onChange={(event) => updateField('vision', event.target.value)} rows={2} placeholder="Where the client is headed" />
          </label>
          <label className="draft-body-field">
            <span>Positioning</span>
            <textarea value={form.positioning} onChange={(event) => updateField('positioning', event.target.value)} rows={2} placeholder="What makes this client different" />
          </label>
          <label className="draft-body-field">
            <span>Values</span>
            <textarea value={form.values} onChange={(event) => updateField('values', event.target.value)} rows={2} placeholder="Principles that shape the client's tone" />
          </label>
          <label className="draft-body-field">
            <span>Audience</span>
            <textarea value={form.audience} onChange={(event) => updateField('audience', event.target.value)} rows={2} placeholder="Who the client serves" />
          </label>
          <label className="draft-body-field">
            <span>Proof points</span>
            <textarea value={form.proofPoints} onChange={(event) => updateField('proofPoints', event.target.value)} rows={2} placeholder="Results, testimonials, credentials" />
          </label>
          <label className="draft-body-field">
            <span>Growth goal</span>
            <textarea value={form.growthGoal} onChange={(event) => updateField('growthGoal', event.target.value)} rows={2} placeholder="What growth looks like for this client" />
          </label>
          <label className="draft-body-field">
            <span>Anything else to know</span>
            <textarea value={form.additionalNotes} onChange={(event) => updateField('additionalNotes', event.target.value)} rows={2} placeholder="Tone, offers, or notes for this client" />
          </label>

          <label className="draft-body-field">
            <span>Brand colors</span>
            <div className="dna-color-list">
              {form.colors.map((color, index) => (
                <div className="dna-color-row" key={index}>
                  <input value={color.label} onChange={(event) => updateColor(index, 'label', event.target.value)} placeholder="Label, e.g. Primary" />
                  <input value={color.value} onChange={(event) => updateColor(index, 'value', event.target.value)} placeholder="#E11C6B" />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove color"
                    onClick={() => updateField('colors', form.colors.filter((_, i) => i !== index))}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="icon-text-button" onClick={() => updateField('colors', [...form.colors, { label: '', value: '' }])}>
              <Plus size={16} />
              <span>Add color</span>
            </button>
          </label>

          {message ? <p className="form-message success draft-body-field">{message}</p> : null}
          {error ? <p className="form-message error draft-body-field">{error}</p> : null}

          <div className="poster-actions draft-body-field">
            <button className="primary-action" type="submit" disabled={saving}>
              {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
              <span>{saving ? 'Saving' : 'Save client brand'}</span>
            </button>
            <button type="button" className="icon-text-button" onClick={cancelEdit} disabled={saving}>
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}

function sanitizeFileName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'logo.png';
}

type ExtractedDna = {
  mission?: string;
  vision?: string;
  positioning?: string;
  values?: string;
  audience?: string;
  proofPoints?: string;
  growthGoal?: string;
  keyMetric?: string;
  colors?: unknown;
  logo?: unknown;
};

function parseFetchedColors(value: unknown): ColorEntry[] {
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

function mapFetchedLogo(value: unknown): LogoState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const str = (key: string) => (typeof record[key] === 'string' ? (record[key] as string).trim() : '');
  const storageBucket = str('storageBucket');
  const storagePath = str('storagePath');
  if (!storageBucket || !storagePath) return null;
  return {
    storageBucket,
    storagePath,
    fileName: str('fileName') || 'website-logo',
    mimeType: str('mimeType'),
    sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : null,
    altText: str('altText') || 'Client logo',
    previewUrl: str('imageUrl'),
  };
}
