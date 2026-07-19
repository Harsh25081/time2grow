import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarDays, CheckCircle2, Loader2, Pencil, RefreshCw, RotateCcw, Save, Target, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';
import { reportingSourceName, sourceStatusLabel } from '../analytics/reportingSources';
import { parseLeadFile, parseSourceLeads, type ParsedLead } from './leadImport';

type LeadRow = Database['public']['Tables']['leads']['Row'];
type LeadStatus = LeadRow['status'];
type LeadSource = LeadRow['source'];
type LeadFilter = 'all' | LeadStatus | 'follow_up';
type IntakeMode = 'none' | 'manual' | 'import' | 'sync';
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status' | 'client_business_dna_id'>;
type AnalyticsSourceRow = Database['public']['Tables']['analytics_sources']['Row'];

type LeadForm = {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  leadScore: string;
  estimatedValue: string;
  nextFollowUpAt: string;
  notes: string;
  brandSelectionId: string;
  campaignId: string;
};

const writerRoles = ['owner', 'admin', 'editor'] as const;

const statusOptions: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'archived', label: 'Archived' },
];

const sourceOptions: Array<{ value: LeadSource; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'website', label: 'Website' },
  { value: 'social', label: 'Social' },
  { value: 'ads', label: 'Ads' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referral', label: 'Referral' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

const filters: Array<{ value: LeadFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const nextStatus: Partial<Record<LeadStatus, LeadStatus>> = {
  new: 'contacted',
  contacted: 'qualified',
  qualified: 'proposal',
  proposal: 'won',
};

const emptyForm: LeadForm = {
  fullName: '',
  company: '',
  email: '',
  phone: '',
  source: 'manual',
  status: 'new',
  leadScore: '25',
  estimatedValue: '',
  nextFollowUpAt: '',
  notes: '',
  brandSelectionId: SELF_BRAND_ID,
  campaignId: '',
};

export function LeadsPage() {
  const { organization, user, membership } = useAuth();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [analyticsSources, setAnalyticsSources] = useState<AnalyticsSourceRow[]>([]);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [importBrandSelectionId, setImportBrandSelectionId] = useState(SELF_BRAND_ID);
  const [importCampaignId, setImportCampaignId] = useState('');
  const [importSource, setImportSource] = useState<LeadSource>('ads');
  const [importPreview, setImportPreview] = useState<ParsedLead[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importSkipped, setImportSkipped] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('none');
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canWrite = writerRoles.some((role) => role === membership?.role);
  const readOnly = Boolean(membership?.role) && !canWrite;
  const isAgency = organization?.org_type === 'agency';
  const { clients } = useBrandDna(organization?.id, isAgency);
  const clientNameById = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const campaignNameById = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])), [campaigns]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setLeads([]);
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const [
        { data: leadData, error: leadError },
        { data: campaignData, error: campaignError },
        { data: sourceData, error: sourceError },
      ] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .eq('org_id', organization.id)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(150),
        supabase
          .from('campaigns')
          .select('id, name, status, client_business_dna_id')
          .eq('org_id', organization.id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('analytics_sources')
          .select('*')
          .eq('org_id', organization.id)
          .order('updated_at', { ascending: false }),
      ]);

      if (!active) return;
      if (leadError) setError(errorMessage(leadError, 'Could not load leads.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      if (sourceError) setError(errorMessage(sourceError, 'Could not load connected marketing sources.'));
      setLeads(leadData ?? []);
      setCampaigns(campaignData ?? []);
      setAnalyticsSources(sourceData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const campaignOptions = useMemo(
    () => campaigns.filter((campaign) => campaignMatchesBrand(campaign, isAgency, form.brandSelectionId)),
    [campaigns, form.brandSelectionId, isAgency],
  );
  const importCampaignOptions = useMemo(
    () => campaigns.filter((campaign) => campaignMatchesBrand(campaign, isAgency, importBrandSelectionId)),
    [campaigns, importBrandSelectionId, isAgency],
  );
  const connectedLeadSources = useMemo(
    () => analyticsSources.filter((source) => ['connected', 'syncing'].includes(source.status)),
    [analyticsSources],
  );

  useEffect(() => {
    if (form.campaignId && !campaignOptions.some((campaign) => campaign.id === form.campaignId)) {
      updateForm('campaignId', '');
    }
  }, [campaignOptions, form.campaignId]);

  useEffect(() => {
    if (importCampaignId && !importCampaignOptions.some((campaign) => campaign.id === importCampaignId)) {
      setImportCampaignId('');
    }
  }, [importCampaignId, importCampaignOptions]);

  const counts = useMemo(() => {
    const next = new Map<LeadFilter, number>([['all', leads.length]]);
    for (const lead of leads) next.set(lead.status, (next.get(lead.status) ?? 0) + 1);
    next.set('follow_up', leads.filter((lead) => isFollowUpDue(lead)).length);
    return next;
  }, [leads]);

  const visibleLeads = useMemo(() => {
    if (filter === 'all') return leads;
    if (filter === 'follow_up') return leads.filter((lead) => isFollowUpDue(lead));
    return leads.filter((lead) => lead.status === filter);
  }, [filter, leads]);

  const summary = useMemo(() => {
    const open = leads.filter((lead) => !['won', 'lost', 'archived'].includes(lead.status)).length;
    const wonValue = leads.filter((lead) => lead.status === 'won').reduce((sum, lead) => sum + (lead.estimated_value ?? 0), 0);
    return { open, wonValue, followUps: counts.get('follow_up') ?? 0 };
  }, [counts, leads]);

  function updateForm<K extends keyof LeadForm>(key: K, value: LeadForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId('');
  }

  function startCreate() {
    resetForm();
    setIntakeMode('manual');
    setMessage('');
    setError('');
  }

  function startEdit(lead: LeadRow) {
    if (!canWrite) return;
    setIntakeMode('manual');
    setEditingId(lead.id);
    setForm({
      fullName: lead.full_name,
      company: lead.company ?? '',
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      source: lead.source,
      status: lead.status,
      leadScore: String(lead.lead_score),
      estimatedValue: lead.estimated_value === null ? '' : String(lead.estimated_value),
      nextFollowUpAt: lead.next_follow_up_at ? lead.next_follow_up_at.slice(0, 10) : '',
      notes: lead.notes ?? '',
      brandSelectionId: lead.client_business_dna_id ?? SELF_BRAND_ID,
      campaignId: lead.campaign_id ?? '',
    });
    setMessage('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;

    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage leads here.');
      return;
    }

    const fullName = form.fullName.trim();
    if (!fullName) {
      setError('Enter the lead name first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      full_name: fullName,
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      source: form.source,
      status: form.status,
      lead_score: boundedNumber(form.leadScore, 0, 100, 0),
      estimated_value: nullableMoney(form.estimatedValue),
      next_follow_up_at: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : null,
      notes: form.notes.trim() || null,
      client_business_dna_id: isAgency && form.brandSelectionId !== SELF_BRAND_ID ? form.brandSelectionId : null,
      campaign_id: form.campaignId || null,
    };

    try {
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('leads')
          .update(payload)
          .eq('id', editingId)
          .eq('org_id', organization.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        setLeads((current) => current.map((lead) => (lead.id === data.id ? data : lead)));
      setMessage('Lead updated.');
      } else {
        const { data, error: insertError } = await supabase
          .from('leads')
          .insert({ ...payload, org_id: organization.id, created_by: user.id })
          .select('*')
          .single();
        if (insertError) throw insertError;
        setLeads((current) => [data, ...current]);
        setMessage('Lead created.');
      }
      resetForm();
      setIntakeMode('none');
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save lead.'));
    } finally {
      setSaving(false);
    }
  }

  function openImport() {
    setIntakeMode('import');
    setMessage('');
    setError('');
  }

  function openSync() {
    setIntakeMode('sync');
    setMessage('');
    setError('');
  }

  async function patchLead(lead: LeadRow, patch: Database['public']['Tables']['leads']['Update']) {
    if (!supabase || !organization?.id || !canWrite) return;
    setUpdatingId(lead.id);
    setMessage('');
    setError('');
    try {
      const { data, error: updateError } = await supabase
        .from('leads')
        .update(patch)
        .eq('id', lead.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      setLeads((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage('Lead updated.');
    } catch (patchError) {
      setError(errorMessage(patchError, 'Could not update lead.'));
    } finally {
      setUpdatingId('');
    }
  }

  async function handleImportFile(file: File | null) {
    setMessage('');
    setError('');
    setImportPreview([]);
    setImportFileName('');
    setImportSkipped(0);

    if (!file) return;

    setImporting(true);
    try {
      const parsed = await parseLeadFile(file, importSource);
      setImportPreview(parsed.rows);
      setImportFileName(file.name);
      setImportSkipped(parsed.skipped);
      setMessage(`${parsed.rows.length} lead${parsed.rows.length === 1 ? '' : 's'} ready to import from ${file.name}.`);
    } catch (parseError) {
      setError(errorMessage(parseError, 'Could not read this lead sheet. Use .xlsx, .csv, or .tsv.'));
    } finally {
      setImporting(false);
    }
  }

  async function saveImportPreview() {
    if (!importFileName || importPreview.length === 0) {
      setError('Upload a lead sheet before importing.');
      return;
    }
    await saveParsedLeads(importPreview, {
      externalSourceKey: `file:${importFileName}`,
      successMessage: `${importPreview.length} lead${importPreview.length === 1 ? '' : 's'} imported from sheet.`,
      metadata: { importFile: importFileName, importMode: 'file' },
    });
    setImportPreview([]);
    setImportFileName('');
    setImportSkipped(0);
  }

  async function syncConnectedSource() {
    setMessage('');
    setError('');

    const source = analyticsSources.find((item) => item.id === selectedSourceId);
    if (!source) {
      setError('Choose a connected marketing source first.');
      return;
    }

    setSyncing(true);
    try {
      const parsed = parseSourceLeads(source.metadata, sourceKeyToLeadSource(source.source_key), source.source_key);
      if (parsed.rows.length === 0) {
        setError(`${source.display_name} is connected in Settings / Connections, but it has no lead-form rows available yet. Import the platform export sheet here until that provider starts sending lead payloads into this source.`);
        return;
      }

      await saveParsedLeads(parsed.rows, {
        externalSourceKey: source.source_key,
        successMessage: `${parsed.rows.length} lead${parsed.rows.length === 1 ? '' : 's'} synced from ${source.display_name}.`,
        metadata: { importMode: 'source_sync', analyticsSourceId: source.id, sourceKey: source.source_key },
      });
    } catch (syncError) {
      setError(errorMessage(syncError, 'Could not sync leads from this source.'));
    } finally {
      setSyncing(false);
    }
  }

  async function saveParsedLeads(rows: ParsedLead[], options: { externalSourceKey: string; successMessage: string; metadata: Record<string, Json> }) {
    if (!supabase || !organization?.id || !user?.id) return;
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to import leads.');
      return;
    }

    setImporting(true);
    setMessage('');
    setError('');

    const payload = rows.map((row) => ({
      org_id: organization.id,
      client_business_dna_id: isAgency && importBrandSelectionId !== SELF_BRAND_ID ? importBrandSelectionId : null,
      campaign_id: importCampaignId || campaignIdFromName(row.campaignName, importCampaignOptions) || null,
      full_name: row.fullName,
      company: row.company || null,
      email: row.email || null,
      phone: row.phone || null,
      source: row.source,
      status: row.status,
      lead_score: row.leadScore,
      estimated_value: row.estimatedValue,
      next_follow_up_at: row.nextFollowUpAt,
      notes: row.notes || null,
      external_source_key: options.externalSourceKey,
      external_lead_id: row.externalLeadId,
      metadata: { ...options.metadata, parsed: row.metadata } satisfies Json,
      created_by: user.id,
    }));

    try {
      const { data, error: upsertError } = await supabase
        .from('leads')
        .upsert(payload, { onConflict: 'org_id,external_source_key,external_lead_id' })
        .select('*');
      if (upsertError) throw upsertError;
      const nextRows = data ?? [];
      setLeads((current) => mergeLeads(current, nextRows));
      setMessage(options.successMessage);
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save imported leads.'));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page-stack leads-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Outcomes</p>
          <h2>Leads CRM</h2>
        </div>
        <div className="page-header-actions">
          <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>
            {readOnly ? 'Read only' : `${leads.length} leads`}
          </span>
          <button type="button" className="icon-text-button" onClick={startCreate} disabled={!canWrite}>
            <Target size={16} />
            <span>New lead</span>
          </button>
          <button type="button" className="icon-text-button" onClick={openImport} disabled={!canWrite}>
            <Upload size={16} />
            <span>Import sheet</span>
          </button>
          <button type="button" className="icon-text-button" onClick={openSync} disabled={!canWrite}>
            <RefreshCw size={16} />
            <span>Sync source</span>
          </button>
        </div>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading leads">
          <Loader2 className="spin" size={28} />
          <h3>Loading leads</h3>
        </section>
      ) : (
        <div className="leads-workspace">
          <section className="lead-summary-strip" aria-label="Lead outcomes">
            <article>
              <span>Open pipeline</span>
              <strong>{summary.open}</strong>
              <small>Active lead conversations</small>
            </article>
            <article>
              <span>Won value</span>
              <strong>{formatMoney(summary.wonValue)}</strong>
              <small>Tracked from closed leads</small>
            </article>
            <article>
              <span>Due follow-ups</span>
              <strong>{summary.followUps}</strong>
              <small>Today or overdue</small>
            </article>
          </section>

          {intakeMode === 'manual' ? (
          <section className="draft-panel lead-action-panel" aria-label="Create or edit lead">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Lead</p>
                <h3>{editingId ? 'Edit lead' : 'New lead'}</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => { resetForm(); setIntakeMode('none'); }} aria-label="Close lead form">
                <X size={16} />
              </button>
            </div>

            {readOnly ? <p className="form-message warning">Ask an owner, admin, or editor to create and manage leads.</p> : null}

            <form className="draft-form creator-form" onSubmit={handleSubmit}>
              {isAgency ? (
                <BrandDnaSelect
                  label="Lead for"
                  selfLabel={organization?.name ?? 'Agency brand'}
                  clients={clients}
                  value={form.brandSelectionId}
                  onChange={(id) => updateForm('brandSelectionId', id)}
                />
              ) : null}

              <CampaignSelect campaigns={campaignOptions} value={form.campaignId} onChange={(id) => updateForm('campaignId', id)} />

              <label>
                <span>Name</span>
                <input value={form.fullName} onChange={(event) => updateForm('fullName', event.target.value)} placeholder="Lead name" />
              </label>
              <label>
                <span>Company</span>
                <input value={form.company} onChange={(event) => updateForm('company', event.target.value)} placeholder="Company or brand" />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@example.com" />
              </label>
              <label>
                <span>Phone</span>
                <input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+91..." />
              </label>
              <label>
                <span>Source</span>
                <select value={form.source} onChange={(event) => updateForm('source', event.target.value as LeadSource)}>
                  {sourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={form.status} onChange={(event) => updateForm('status', event.target.value as LeadStatus)}>
                  {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
              <label>
                <span>Score</span>
                <input type="number" min={0} max={100} value={form.leadScore} onChange={(event) => updateForm('leadScore', event.target.value)} />
              </label>
              <label>
                <span>Value</span>
                <input type="number" min={0} step="0.01" value={form.estimatedValue} onChange={(event) => updateForm('estimatedValue', event.target.value)} placeholder="Estimated value" />
              </label>
              <label>
                <span>Next follow-up</span>
                <input type="date" value={form.nextFollowUpAt} onChange={(event) => updateForm('nextFollowUpAt', event.target.value)} />
              </label>
              <label className="draft-body-field">
                <span>Notes</span>
                <textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} placeholder="Need, budget, next step, objection, or outcome" />
              </label>

              <div className="creator-actions draft-body-field">
                {editingId ? (
                  <button type="button" className="icon-text-button" onClick={() => { resetForm(); setIntakeMode('none'); }}>
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                ) : null}
                <button className="primary-action" type="submit" disabled={saving || !canWrite}>
                  {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  <span>{saving ? 'Saving' : editingId ? 'Save changes' : 'Create lead'}</span>
                </button>
              </div>
            </form>

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>
          ) : null}

          {intakeMode === 'import' ? (
          <section className="draft-panel lead-action-panel lead-import-panel" aria-label="Import leads">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Import</p>
                <h3>Lead sheet</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setIntakeMode('none')} aria-label="Close import panel">
                <X size={16} />
              </button>
            </div>

            {isAgency ? (
              <BrandDnaSelect
                label="Import for"
                selfLabel={organization?.name ?? 'Agency brand'}
                clients={clients}
                value={importBrandSelectionId}
                onChange={setImportBrandSelectionId}
              />
            ) : null}

            <div className="lead-import-grid">
              <label>
                <span>Campaign</span>
                <select value={importCampaignId} onChange={(event) => setImportCampaignId(event.target.value)}>
                  <option value="">Match from sheet or leave blank</option>
                  {importCampaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </label>
              <label>
                <span>Default source</span>
                <select value={importSource} onChange={(event) => setImportSource(event.target.value as LeadSource)}>
                  {sourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </label>
            </div>

            <label className="lead-file-drop">
              <Upload size={18} />
              <span>{importFileName || 'Upload .xlsx, .csv, or .tsv lead sheet'}</span>
              <input type="file" accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => handleImportFile(event.target.files?.[0] ?? null)} disabled={!canWrite || importing} />
            </label>

            {importPreview.length > 0 ? (
              <div className="lead-import-preview">
                <div>
                  <strong>{importPreview.length} ready</strong>
                  <small>{importSkipped > 0 ? `${importSkipped} skipped` : 'No skipped rows'}</small>
                </div>
                <ul>
                  {importPreview.slice(0, 4).map((lead, index) => (
                    <li key={`${lead.fullName}-${index}`}>
                      <span>{lead.fullName}</span>
                      <small>{[lead.email, lead.phone, sourceLabel(lead.source)].filter(Boolean).join(' - ')}</small>
                    </li>
                  ))}
                </ul>
                <button type="button" className="primary-action" onClick={saveImportPreview} disabled={!canWrite || importing}>
                  {importing ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  <span>{importing ? 'Importing' : 'Import leads'}</span>
                </button>
              </div>
            ) : null}

          </section>
          ) : null}

          {intakeMode === 'sync' ? (
          <section className="draft-panel lead-action-panel lead-import-panel" aria-label="Sync connected lead source">
            <div className="section-heading">
              <div>
                <p className="eyebrow">From Connections</p>
                <h3>Marketing source</h3>
              </div>
              <button type="button" className="icon-button" onClick={() => setIntakeMode('none')} aria-label="Close source sync panel">
                <X size={16} />
              </button>
            </div>

            {isAgency ? (
              <BrandDnaSelect
                label="Sync for"
                selfLabel={organization?.name ?? 'Agency brand'}
                clients={clients}
                value={importBrandSelectionId}
                onChange={setImportBrandSelectionId}
              />
            ) : null}

            <div className="lead-import-grid">
              <label>
                <span>Campaign</span>
                <select value={importCampaignId} onChange={(event) => setImportCampaignId(event.target.value)}>
                  <option value="">No campaign selected</option>
                  {importCampaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
              </label>
              <label>
                <span>Marketing source</span>
                <select value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
                  <option value="">Choose source</option>
                  {analyticsSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.display_name || reportingSourceName(source.source_key)} - {sourceStatusLabel(source.status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="primary-action" onClick={syncConnectedSource} disabled={!canWrite || syncing || connectedLeadSources.length === 0}>
              {syncing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              <span>{syncing ? 'Syncing' : 'Sync leads'}</span>
            </button>
            {connectedLeadSources.length === 0 ? <p className="form-message warning">Connect marketing data sources in Settings / Connections first.</p> : null}
            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>
          ) : null}

          <section className="draft-panel leads-pipeline-panel" aria-label="Lead list">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h3>Lead outcomes</h3>
              </div>
              <div className="library-filter-tabs" aria-label="Filter leads">
                {filters.map((item) => (
                  <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>
                    <span>{item.label}</span>
                    <small>{counts.get(item.value) ?? 0}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="saved-content-list">
              {visibleLeads.length > 0 ? visibleLeads.map((lead) => {
                const forward = nextStatus[lead.status];
                const archived = lead.status === 'archived';
                return (
                  <article className={`saved-content-row lead-row ${archived ? 'is-archived' : ''}`} key={lead.id}>
                    <div className="saved-content-row__main">
                      <strong>{lead.full_name}</strong>
                      <p>{[lead.company, lead.email, lead.phone].filter(Boolean).join(' - ') || 'No contact details saved yet.'}</p>
                      <div className="saved-content-row__meta">
                        <span>{statusLabel(lead.status)}</span>
                        <span>{sourceLabel(lead.source)}</span>
                        {isAgency ? <span>{lead.client_business_dna_id ? clientNameById.get(lead.client_business_dna_id) ?? 'Client brand' : organization?.name ?? 'Agency brand'}</span> : null}
                        {lead.campaign_id ? <span>{campaignNameById.get(lead.campaign_id) ?? 'Campaign'}</span> : null}
                        <span>Score {lead.lead_score}</span>
                        {lead.estimated_value !== null ? <span>{formatMoney(lead.estimated_value)}</span> : null}
                        {lead.next_follow_up_at ? <span>Follow-up {formatDate(lead.next_follow_up_at)}</span> : null}
                      </div>
                      {lead.notes ? <p className="lead-notes">{lead.notes}</p> : null}
                    </div>

                    <div className="saved-content-row__side">
                      <small>Updated {formatDate(lead.updated_at)}</small>
                      {canWrite ? (
                        <div className="saved-content-row__actions">
                          {forward ? (
                            <button type="button" className="icon-text-button" disabled={updatingId === lead.id} onClick={() => patchLead(lead, { status: forward })}>
                              {updatingId === lead.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                              <span>{statusLabel(forward)}</span>
                            </button>
                          ) : null}
                          <label className="task-status-select">
                            <select value={lead.status} disabled={updatingId === lead.id} onChange={(event) => patchLead(lead, { status: event.target.value as LeadStatus })}>
                              {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                            </select>
                          </label>
                          <button type="button" className="icon-text-button" onClick={() => startEdit(lead)}>
                            <Pencil size={16} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="icon-text-button"
                            disabled={updatingId === lead.id}
                            onClick={() => patchLead(lead, { status: archived ? 'new' : 'archived' })}
                          >
                            {archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                            <span>{archived ? 'Restore' : 'Archive'}</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              }) : (
                <div className="queue-empty">
                  <CalendarDays size={20} />
                  <span>{leads.length > 0 ? 'No leads match this filter.' : 'No leads yet.'}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CampaignSelect({ campaigns, value, onChange }: { campaigns: CampaignRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span>Campaign</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">No campaign selected</option>
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
        ))}
      </select>
    </label>
  );
}

function campaignIdFromName(name: string, campaigns: CampaignRow[]) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return '';
  return campaigns.find((campaign) => campaign.name.trim().toLowerCase() === normalized)?.id ?? '';
}

function campaignMatchesBrand(campaign: CampaignRow, isAgency: boolean, brandSelectionId: string) {
  if (!isAgency) return true;
  if (brandSelectionId === SELF_BRAND_ID) return !campaign.client_business_dna_id;
  return campaign.client_business_dna_id === brandSelectionId;
}

function mergeLeads(current: LeadRow[], nextRows: LeadRow[]) {
  const map = new Map(current.map((lead) => [lead.id, lead]));
  for (const lead of nextRows) map.set(lead.id, lead);
  return Array.from(map.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

function sourceKeyToLeadSource(sourceKey: string): LeadSource {
  if (sourceKey.includes('meta') || sourceKey.includes('google') || sourceKey.includes('tiktok') || sourceKey.includes('linkedin')) return 'ads';
  if (sourceKey.includes('shopify')) return 'website';
  if (sourceKey.includes('youtube')) return 'social';
  return 'other';
}

function isFollowUpDue(lead: LeadRow) {
  if (!lead.next_follow_up_at || ['won', 'lost', 'archived'].includes(lead.status)) return false;
  return new Date(lead.next_follow_up_at).getTime() <= endOfToday().getTime();
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function nullableMoney(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || value.trim() === '') return null;
  return Math.max(0, parsed);
}

function statusLabel(value: LeadStatus) {
  return statusOptions.find((status) => status.value === value)?.label ?? value.replace('_', ' ');
}

function sourceLabel(value: LeadSource) {
  return sourceOptions.find((source) => source.value === value)?.label ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
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
