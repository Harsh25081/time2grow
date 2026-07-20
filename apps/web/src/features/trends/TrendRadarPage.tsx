import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Loader2, Radar, RotateCcw, Save, Sparkles, Target, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';

type TrendRow = Database['public']['Tables']['trend_radar_items']['Row'];
type TrendSource = TrendRow['source'];
type TrendStatus = TrendRow['status'];
type TrendFilter = 'all' | TrendStatus;
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'client_business_dna_id'>;

type TrendForm = {
  brandSelectionId: string;
  source: TrendSource;
  topic: string;
  signal: string;
  changePercent: string;
  confidenceScore: string;
  status: TrendStatus;
  recommendedCampaign: string;
  opportunity: string;
  sourceUrl: string;
  detectedAt: string;
};

const writerRoles = ['owner', 'admin', 'editor'] as const;

const emptyForm: TrendForm = {
  brandSelectionId: SELF_BRAND_ID,
  source: 'google_trends',
  topic: '',
  signal: '',
  changePercent: '38',
  confidenceScore: '70',
  status: 'new',
  recommendedCampaign: '',
  opportunity: '',
  sourceUrl: '',
  detectedAt: todayInputValue(),
};

const sourceOptions: Array<{ value: TrendSource; label: string }> = [
  { value: 'google_trends', label: 'Google Trends' },
  { value: 'instagram', label: 'Instagram Trends' },
  { value: 'youtube', label: 'YouTube Trends' },
  { value: 'linkedin', label: 'LinkedIn Trends' },
  { value: 'competitor', label: 'Competitor Trends' },
  { value: 'ai_opportunity', label: 'AI Opportunities' },
  { value: 'manual', label: 'Manual' },
  { value: 'other', label: 'Other' },
];

const statusOptions: Array<{ value: TrendStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'campaign_generated', label: 'Campaign generated' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'archived', label: 'Archived' },
];

const filters: Array<{ value: TrendFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'campaign_generated', label: 'Generated' },
  { value: 'dismissed', label: 'Dismissed' },
];

export function TrendRadarPage() {
  const { organization, user, membership } = useAuth();
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [form, setForm] = useState<TrendForm>(emptyForm);
  const [filter, setFilter] = useState<TrendFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<TrendSource | 'all'>('all');
  const [selectedBrandId, setSelectedBrandId] = useState(SELF_BRAND_ID);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
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
        setTrends([]);
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const [
        { data: trendData, error: trendError },
        { data: campaignData, error: campaignError },
      ] = await Promise.all([
        supabase
          .from('trend_radar_items')
          .select('*')
          .eq('org_id', organization.id)
          .order('detected_at', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(150),
        supabase
          .from('campaigns')
          .select('id, name, client_business_dna_id')
          .eq('org_id', organization.id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);

      if (!active) return;
      if (trendError) setError(errorMessage(trendError, 'Could not load Trend Radar.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      setTrends(trendData ?? []);
      setCampaigns(campaignData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const counts = useMemo(() => {
    const next = new Map<TrendFilter, number>([['all', trends.length]]);
    for (const trend of trends) next.set(trend.status, (next.get(trend.status) ?? 0) + 1);
    return next;
  }, [trends]);

  const visibleTrends = useMemo(() => {
    return trends.filter((trend) => {
      if (isAgency && selectedBrandId !== SELF_BRAND_ID && trend.client_business_dna_id !== selectedBrandId) return false;
      if (isAgency && selectedBrandId === SELF_BRAND_ID && trend.client_business_dna_id) return false;
      if (filter !== 'all' && trend.status !== filter) return false;
      if (sourceFilter !== 'all' && trend.source !== sourceFilter) return false;
      return true;
    });
  }, [filter, isAgency, selectedBrandId, sourceFilter, trends]);

  const summary = useMemo(() => {
    const active = trends.filter((trend) => !['dismissed', 'archived', 'campaign_generated'].includes(trend.status)).length;
    const avgGrowth = trends.length ? trends.reduce((sum, trend) => sum + Number(trend.change_percent || 0), 0) / trends.length : 0;
    const ready = trends.filter((trend) => ['new', 'approved'].includes(trend.status) && !trend.campaign_id).length;
    return { active, avgGrowth, ready };
  }, [trends]);

  function updateForm<K extends keyof TrendForm>(key: K, value: TrendForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm({ ...emptyForm, brandSelectionId: selectedBrandId, detectedAt: todayInputValue() });
    setEditingId('');
    setShowForm(true);
    setMessage('');
    setError('');
  }

  function startEdit(trend: TrendRow) {
    if (!canWrite) return;
    setForm({
      brandSelectionId: trend.client_business_dna_id ?? SELF_BRAND_ID,
      source: trend.source,
      topic: trend.topic,
      signal: trend.signal ?? '',
      changePercent: String(Number(trend.change_percent ?? 0)),
      confidenceScore: String(trend.confidence_score),
      status: trend.status,
      recommendedCampaign: trend.recommended_campaign ?? '',
      opportunity: trend.opportunity ?? '',
      sourceUrl: trend.source_url ?? '',
      detectedAt: trend.detected_at.slice(0, 10),
    });
    setEditingId(trend.id);
    setShowForm(true);
    setMessage('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage Trend Radar.');
      return;
    }

    const topic = form.topic.trim();
    if (!topic) {
      setError('Enter the trend topic first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      client_business_dna_id: isAgency && form.brandSelectionId !== SELF_BRAND_ID ? form.brandSelectionId : null,
      source: form.source,
      topic,
      signal: form.signal.trim() || null,
      change_percent: boundedNumber(form.changePercent, -100, 999, 0),
      confidence_score: boundedNumber(form.confidenceScore, 0, 100, 50),
      status: form.status,
      recommended_campaign: form.recommendedCampaign.trim() || null,
      opportunity: form.opportunity.trim() || null,
      source_url: form.sourceUrl.trim() || null,
      detected_at: form.detectedAt ? new Date(form.detectedAt).toISOString() : new Date().toISOString(),
      metadata: { source: 'trend_radar_ui' } satisfies Json,
    };

    try {
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('trend_radar_items')
          .update(payload)
          .eq('id', editingId)
          .eq('org_id', organization.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        setTrends((current) => current.map((trend) => (trend.id === data.id ? data : trend)));
        setMessage('Trend updated.');
      } else {
        const { data, error: insertError } = await supabase
          .from('trend_radar_items')
          .insert({ ...payload, org_id: organization.id, created_by: user.id })
          .select('*')
          .single();
        if (insertError) throw insertError;
        setTrends((current) => [data, ...current]);
        setMessage('Trend added.');
      }
      setForm(emptyForm);
      setEditingId('');
      setShowForm(false);
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save this trend.'));
    } finally {
      setSaving(false);
    }
  }

  async function patchTrend(trend: TrendRow, patch: Database['public']['Tables']['trend_radar_items']['Update']) {
    if (!supabase || !organization?.id || !canWrite) return;
    setUpdatingId(trend.id);
    setMessage('');
    setError('');
    try {
      const { data, error: updateError } = await supabase
        .from('trend_radar_items')
        .update(patch)
        .eq('id', trend.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      setTrends((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage('Trend updated.');
    } catch (patchError) {
      setError(errorMessage(patchError, 'Could not update trend.'));
    } finally {
      setUpdatingId('');
    }
  }

  async function generateCampaign(trend: TrendRow) {
    if (!supabase || !organization?.id || !user?.id || !canWrite) return;
    setUpdatingId(trend.id);
    setMessage('');
    setError('');

    const name = trend.recommended_campaign?.trim() || `${trend.topic} campaign`;
    const objective = [
      `Trend detected: ${trend.topic}`,
      trend.change_percent ? `Growth signal: ${formatPercent(trend.change_percent)}` : '',
      trend.signal ? `Signal: ${trend.signal}` : '',
      trend.opportunity ? `Opportunity: ${trend.opportunity}` : '',
    ].filter(Boolean).join('\n');

    try {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          org_id: organization.id,
          client_business_dna_id: trend.client_business_dna_id,
          name,
          type: trend.source === 'ai_opportunity' ? 'evergreen' : 'launch',
          status: 'draft',
          objective,
          created_by: user.id,
        })
        .select('id, name, client_business_dna_id')
        .single();
      if (campaignError) throw campaignError;

      const { data: updatedTrend, error: updateError } = await supabase
        .from('trend_radar_items')
        .update({ campaign_id: campaign.id, status: 'campaign_generated' })
        .eq('id', trend.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      setCampaigns((current) => [campaign, ...current]);
      setTrends((current) => current.map((item) => (item.id === updatedTrend.id ? updatedTrend : item)));
      setMessage('Campaign generated from trend.');
    } catch (generateError) {
      setError(errorMessage(generateError, 'Could not generate a campaign.'));
    } finally {
      setUpdatingId('');
    }
  }

  return (
    <div className="page-stack trend-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Opportunity</p>
          <h2>Trend Radar</h2>
        </div>
        <div className="page-header-actions">
          <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>
            {readOnly ? 'Read only' : `${trends.length} trends`}
          </span>
          <button type="button" className="icon-text-button" onClick={openCreate} disabled={!canWrite}>
            <Radar size={16} />
            <span>Add trend</span>
          </button>
        </div>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading Trend Radar">
          <Loader2 className="spin" size={28} />
          <h3>Loading Trend Radar</h3>
        </section>
      ) : (
        <div className="trend-workspace">
          <section className="lead-summary-strip" aria-label="Trend summary">
            <article>
              <span>Active signals</span>
              <strong>{summary.active}</strong>
              <small>Ready for review</small>
            </article>
            <article>
              <span>Average lift</span>
              <strong>{formatPercent(summary.avgGrowth)}</strong>
              <small>Across saved trends</small>
            </article>
            <article>
              <span>Campaign ready</span>
              <strong>{summary.ready}</strong>
              <small>Waiting for action</small>
            </article>
          </section>

          {showForm ? (
            <section className="draft-panel trend-action-panel" aria-label="Add or edit trend">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Trend</p>
                  <h3>{editingId ? 'Edit trend' : 'New signal'}</h3>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close trend form">
                  <X size={16} />
                </button>
              </div>

              {readOnly ? <p className="form-message warning">Ask an owner, admin, or editor to manage Trend Radar.</p> : null}

              <form className="draft-form creator-form" onSubmit={handleSubmit}>
                {isAgency ? (
                  <BrandDnaSelect
                    label="Trend for"
                    selfLabel={organization?.name ?? 'Agency brand'}
                    clients={clients}
                    value={form.brandSelectionId}
                    onChange={(id) => updateForm('brandSelectionId', id)}
                  />
                ) : null}
                <label>
                  <span>Source</span>
                  <select value={form.source} onChange={(event) => updateForm('source', event.target.value as TrendSource)}>
                    {sourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Topic</span>
                  <input value={form.topic} onChange={(event) => updateForm('topic', event.target.value)} placeholder="AI Patient Education" />
                </label>
                <label>
                  <span>Growth</span>
                  <input type="number" step="0.1" value={form.changePercent} onChange={(event) => updateForm('changePercent', event.target.value)} />
                </label>
                <label>
                  <span>Confidence</span>
                  <input type="number" min={0} max={100} value={form.confidenceScore} onChange={(event) => updateForm('confidenceScore', event.target.value)} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => updateForm('status', event.target.value as TrendStatus)}>
                    {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Detected</span>
                  <input type="date" value={form.detectedAt} onChange={(event) => updateForm('detectedAt', event.target.value)} />
                </label>
                <label>
                  <span>Source URL</span>
                  <input value={form.sourceUrl} onChange={(event) => updateForm('sourceUrl', event.target.value)} placeholder="https://..." />
                </label>
                <label className="draft-body-field">
                  <span>Signal</span>
                  <textarea value={form.signal} onChange={(event) => updateForm('signal', event.target.value)} rows={2} placeholder="What changed and where it is visible" />
                </label>
                <label className="draft-body-field">
                  <span>Recommended campaign</span>
                  <input value={form.recommendedCampaign} onChange={(event) => updateForm('recommendedCampaign', event.target.value)} placeholder="Patient education explainer campaign" />
                </label>
                <label className="draft-body-field">
                  <span>Opportunity</span>
                  <textarea value={form.opportunity} onChange={(event) => updateForm('opportunity', event.target.value)} rows={3} placeholder="Why this should become a campaign now" />
                </label>
                <div className="creator-actions draft-body-field">
                  <button type="button" className="icon-text-button" onClick={() => setShowForm(false)}>
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                  <button className="primary-action" type="submit" disabled={saving || !canWrite}>
                    {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                    <span>{saving ? 'Saving' : editingId ? 'Save changes' : 'Save trend'}</span>
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="draft-panel trend-list-panel" aria-label="Trend list">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Radar</p>
                <h3>Detected trends</h3>
              </div>
              <div className="trend-filter-row">
                {isAgency ? (
                  <BrandDnaSelect
                    label="Brand"
                    selfLabel={organization?.name ?? 'Agency brand'}
                    clients={clients}
                    value={selectedBrandId}
                    onChange={setSelectedBrandId}
                  />
                ) : null}
                <label>
                  <span>Source</span>
                  <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as TrendSource | 'all')}>
                    <option value="all">All sources</option>
                    {sourceOptions.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="library-filter-tabs" aria-label="Filter trends">
              {filters.map((item) => (
                <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>
                  <span>{item.label}</span>
                  <small>{counts.get(item.value) ?? 0}</small>
                </button>
              ))}
            </div>

            <div className="saved-content-list">
              {visibleTrends.length > 0 ? visibleTrends.map((trend) => {
                const archived = trend.status === 'archived';
                const generatedCampaign = trend.campaign_id ? campaignNameById.get(trend.campaign_id) ?? 'Campaign generated' : '';
                return (
                  <article className={`saved-content-row trend-row ${archived ? 'is-archived' : ''}`} key={trend.id}>
                    <div className="saved-content-row__main">
                      <div className="trend-title-line">
                        <strong>{trend.topic}</strong>
                        <span className={Number(trend.change_percent) >= 0 ? 'trend-lift positive' : 'trend-lift negative'}>{formatPercent(trend.change_percent)}</span>
                      </div>
                      {trend.signal ? <p>{trend.signal}</p> : <p>No signal note saved yet.</p>}
                      <div className="saved-content-row__meta">
                        <span>{sourceLabel(trend.source)}</span>
                        <span>{statusLabel(trend.status)}</span>
                        <span>Confidence {trend.confidence_score}</span>
                        {isAgency ? <span>{trend.client_business_dna_id ? clientNameById.get(trend.client_business_dna_id) ?? 'Client brand' : organization?.name ?? 'Agency brand'}</span> : null}
                        {generatedCampaign ? <span>{generatedCampaign}</span> : null}
                      </div>
                      {trend.recommended_campaign || trend.opportunity ? (
                        <div className="trend-recommendation">
                          <Sparkles size={16} />
                          <div>
                            <span>{trend.recommended_campaign || 'Recommended campaign'}</span>
                            {trend.opportunity ? <small>{trend.opportunity}</small> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="saved-content-row__side">
                      <small>Detected {formatDate(trend.detected_at)}</small>
                      {canWrite ? (
                        <div className="saved-content-row__actions">
                          {!trend.campaign_id && trend.status !== 'archived' ? (
                            <button type="button" className="icon-text-button" disabled={updatingId === trend.id} onClick={() => generateCampaign(trend)}>
                              {updatingId === trend.id ? <Loader2 className="spin" size={16} /> : <Target size={16} />}
                              <span>Generate now</span>
                            </button>
                          ) : null}
                          {trend.status === 'new' ? (
                            <button type="button" className="icon-text-button" disabled={updatingId === trend.id} onClick={() => patchTrend(trend, { status: 'approved' })}>
                              <CheckCircle2 size={16} />
                              <span>Approve</span>
                            </button>
                          ) : null}
                          <button type="button" className="icon-text-button" onClick={() => startEdit(trend)}>
                            <Radar size={16} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="icon-text-button"
                            disabled={updatingId === trend.id}
                            onClick={() => patchTrend(trend, { status: archived ? 'new' : 'archived' })}
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
                  <Radar size={20} />
                  <span>{trends.length > 0 ? 'No trends match this filter.' : 'No trends yet.'}</span>
                </div>
              )}
            </div>
          </section>

          {message ? <p className="form-message success">{message}</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function sourceLabel(value: TrendSource) {
  return sourceOptions.find((source) => source.value === value)?.label ?? value.replace('_', ' ');
}

function statusLabel(value: TrendStatus) {
  return statusOptions.find((status) => status.value === value)?.label ?? value.replace('_', ' ');
}

function formatPercent(value: number) {
  const numeric = Number(value) || 0;
  return `${numeric > 0 ? '+' : ''}${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(numeric)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
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
