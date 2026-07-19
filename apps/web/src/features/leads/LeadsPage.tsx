import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarDays, CheckCircle2, Loader2, Pencil, RotateCcw, Save, Target, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';

type LeadRow = Database['public']['Tables']['leads']['Row'];
type LeadStatus = LeadRow['status'];
type LeadSource = LeadRow['source'];
type LeadFilter = 'all' | LeadStatus | 'follow_up';
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status' | 'client_business_dna_id'>;

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
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

      const [{ data: leadData, error: leadError }, { data: campaignData, error: campaignError }] = await Promise.all([
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
      ]);

      if (!active) return;
      if (leadError) setError(errorMessage(leadError, 'Could not load leads.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      setLeads(leadData ?? []);
      setCampaigns(campaignData ?? []);
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

  useEffect(() => {
    if (form.campaignId && !campaignOptions.some((campaign) => campaign.id === form.campaignId)) {
      updateForm('campaignId', '');
    }
  }, [campaignOptions, form.campaignId]);

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
    setMessage('');
    setError('');
  }

  function startEdit(lead: LeadRow) {
    if (!canWrite) return;
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
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save lead.'));
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="page-stack leads-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Outcomes</p>
          <h2>Leads CRM</h2>
        </div>
        <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>
          {readOnly ? 'Read only' : `${leads.length} leads`}
        </span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading leads">
          <Loader2 className="spin" size={28} />
          <h3>Loading leads</h3>
        </section>
      ) : (
        <div className="content-creator-grid">
          <section className="stats-grid lead-stats" aria-label="Lead outcomes">
            <article className="stat-card">
              <span>Open pipeline</span>
              <strong>{summary.open}</strong>
              <small>Active lead conversations</small>
            </article>
            <article className="stat-card">
              <span>Won value</span>
              <strong>{formatMoney(summary.wonValue)}</strong>
              <small>Tracked from closed leads</small>
            </article>
            <article className="stat-card">
              <span>Due follow-ups</span>
              <strong>{summary.followUps}</strong>
              <small>Today or overdue</small>
            </article>
          </section>

          <section className="draft-panel creator-panel" aria-label="Create or edit lead">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Lead</p>
                <h3>{editingId ? 'Edit lead' : 'New lead'}</h3>
              </div>
              <Target size={21} />
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
                  <button type="button" className="icon-text-button" onClick={startCreate}>
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

          <section className="draft-panel saved-content-panel" aria-label="Lead list">
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

function campaignMatchesBrand(campaign: CampaignRow, isAgency: boolean, brandSelectionId: string) {
  if (!isAgency) return true;
  if (brandSelectionId === SELF_BRAND_ID) return !campaign.client_business_dna_id;
  return campaign.client_business_dna_id === brandSelectionId;
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
