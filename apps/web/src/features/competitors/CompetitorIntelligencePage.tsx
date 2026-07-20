import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, BarChart3, Bot, Globe2, Loader2, Megaphone, Plus, RefreshCw, Save, Search, ShieldAlert, Sparkles, Target, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';
import { edgeFunctionErrorMessage } from '../business-dna/edgeError';

type CompetitorRow = Database['public']['Tables']['competitors']['Row'];
type CompetitorEventRow = Database['public']['Tables']['competitor_events']['Row'];
type CompetitorStatus = CompetitorRow['status'];
type CompetitorTrend = CompetitorRow['trend'];
type RefreshSchedule = CompetitorRow['refresh_schedule'];
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'client_business_dna_id'>;
type CompetitorFilter = 'active' | CompetitorStatus;

type CompetitorForm = {
  brandSelectionId: string;
  name: string;
  industry: string;
  websiteUrl: string;
  logoUrl: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  youtube: string;
  x: string;
  activityScore: string;
  googleRating: string;
  runningAds: boolean;
  trend: CompetitorTrend;
  refreshSchedule: RefreshSchedule;
  websiteNotes: string;
  socialNotes: string;
  contentNotes: string;
  adsNotes: string;
  reviewNotes: string;
  offerNotes: string;
  seoNotes: string;
  analyticsNotes: string;
};

type Strategy = {
  summary: string;
  recommendations: string[];
  campaignSuggestions: string[];
  opportunities: string[];
  threats: string[];
  swot: Record<'strengths' | 'weaknesses' | 'opportunities' | 'threats', string[]>;
  whyWinning: {
    reasons: string[];
    estimatedImpact: string;
    recommendedActions: string[];
  };
};

const writerRoles = ['owner', 'admin', 'editor'] as const;
const sections = ['Overview', 'Website', 'Social Media', 'Content', 'Ads', 'Reviews', 'Offers', 'SEO', 'Analytics', 'AI Insights'] as const;

const emptyForm: CompetitorForm = {
  brandSelectionId: SELF_BRAND_ID,
  name: '',
  industry: '',
  websiteUrl: '',
  logoUrl: '',
  instagram: '',
  facebook: '',
  linkedin: '',
  youtube: '',
  x: '',
  activityScore: '50',
  googleRating: '',
  runningAds: false,
  trend: 'stable',
  refreshSchedule: 'weekly',
  websiteNotes: '',
  socialNotes: '',
  contentNotes: '',
  adsNotes: '',
  reviewNotes: '',
  offerNotes: '',
  seoNotes: '',
  analyticsNotes: '',
};

const filters: Array<{ value: CompetitorFilter; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

export function CompetitorIntelligencePage() {
  const { organization, user, membership } = useAuth();
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [events, setEvents] = useState<CompetitorEventRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [form, setForm] = useState<CompetitorForm>(emptyForm);
  const [filter, setFilter] = useState<CompetitorFilter>('active');
  const [selectedBrandId, setSelectedBrandId] = useState(SELF_BRAND_ID);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState('');
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]>('Overview');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState('');
  const [campaigningId, setCampaigningId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canWrite = writerRoles.some((role) => role === membership?.role);
  const readOnly = Boolean(membership?.role) && !canWrite;
  const isAgency = organization?.org_type === 'agency';
  const { clients } = useBrandDna(organization?.id, isAgency);
  const clientNameById = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setCompetitors([]);
        setEvents([]);
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const [
        { data: competitorData, error: competitorError },
        { data: eventData, error: eventError },
        { data: campaignData, error: campaignError },
      ] = await Promise.all([
        supabase.from('competitors').select('*').eq('org_id', organization.id).order('updated_at', { ascending: false }).limit(120),
        supabase.from('competitor_events').select('*').eq('org_id', organization.id).order('event_at', { ascending: false }).limit(150),
        supabase.from('campaigns').select('id, name, client_business_dna_id').eq('org_id', organization.id).neq('status', 'archived').order('updated_at', { ascending: false }).limit(100),
      ]);

      if (!active) return;
      if (competitorError) setError(errorMessage(competitorError, 'Could not load competitors.'));
      if (eventError) setError(errorMessage(eventError, 'Could not load competitor timeline.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      setCompetitors(competitorData ?? []);
      setEvents(eventData ?? []);
      setCampaigns(campaignData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const visibleCompetitors = useMemo(() => {
    return competitors.filter((competitor) => {
      if (isAgency && selectedBrandId !== SELF_BRAND_ID && competitor.client_business_dna_id !== selectedBrandId) return false;
      if (isAgency && selectedBrandId === SELF_BRAND_ID && competitor.client_business_dna_id) return false;
      if (filter === 'active') return competitor.status !== 'archived';
      return competitor.status === filter;
    });
  }, [competitors, filter, isAgency, selectedBrandId]);

  const selectedCompetitor = useMemo(
    () => competitors.find((competitor) => competitor.id === selectedCompetitorId) ?? visibleCompetitors[0] ?? null,
    [competitors, selectedCompetitorId, visibleCompetitors],
  );
  const selectedEvents = useMemo(
    () => events.filter((event) => event.competitor_id === selectedCompetitor?.id).slice(0, 12),
    [events, selectedCompetitor?.id],
  );
  const strategy = useMemo(() => parseStrategy(selectedCompetitor?.ai_insights), [selectedCompetitor?.ai_insights]);
  const summary = useMemo(() => {
    const active = competitors.filter((competitor) => competitor.status !== 'archived').length;
    const runningAds = competitors.filter((competitor) => competitor.running_ads && competitor.status !== 'archived').length;
    const threats = events.filter((event) => ['threat', 'alert'].includes(event.severity)).length;
    const averageScore = active ? Math.round(competitors.filter((competitor) => competitor.status !== 'archived').reduce((sum, competitor) => sum + competitor.activity_score, 0) / active) : 0;
    return { active, runningAds, threats, averageScore };
  }, [competitors, events]);

  useEffect(() => {
    if (!selectedCompetitor) {
      setSelectedCompetitorId('');
      return;
    }
    if (selectedCompetitor.id !== selectedCompetitorId) setSelectedCompetitorId(selectedCompetitor.id);
  }, [selectedCompetitor, selectedCompetitorId]);

  function updateForm<K extends keyof CompetitorForm>(key: K, value: CompetitorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm({ ...emptyForm, brandSelectionId: selectedBrandId });
    setEditingId('');
    setShowForm(true);
    setMessage('');
    setError('');
  }

  function startEdit(competitor: CompetitorRow) {
    const social = safeRecord(competitor.social_accounts);
    setForm({
      brandSelectionId: competitor.client_business_dna_id ?? SELF_BRAND_ID,
      name: competitor.name,
      industry: competitor.industry ?? '',
      websiteUrl: competitor.website_url ?? '',
      logoUrl: competitor.logo_url ?? '',
      instagram: stringField(social.instagram),
      facebook: stringField(social.facebook),
      linkedin: stringField(social.linkedin),
      youtube: stringField(social.youtube),
      x: stringField(social.x),
      activityScore: String(competitor.activity_score),
      googleRating: competitor.google_rating ? String(competitor.google_rating) : '',
      runningAds: competitor.running_ads,
      trend: competitor.trend,
      refreshSchedule: competitor.refresh_schedule,
      websiteNotes: snapshotText(competitor.website_snapshot),
      socialNotes: snapshotText(competitor.social_snapshot),
      contentNotes: snapshotText(competitor.content_snapshot),
      adsNotes: snapshotText(competitor.ads_snapshot),
      reviewNotes: snapshotText(competitor.review_snapshot),
      offerNotes: snapshotText(competitor.offer_snapshot),
      seoNotes: snapshotText(competitor.seo_snapshot),
      analyticsNotes: snapshotText(competitor.analytics_snapshot),
    });
    setEditingId(competitor.id);
    setShowForm(true);
    setMessage('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage Competitor Intelligence.');
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setError('Enter the competitor name first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      client_business_dna_id: isAgency && form.brandSelectionId !== SELF_BRAND_ID ? form.brandSelectionId : null,
      name,
      industry: form.industry.trim() || null,
      website_url: form.websiteUrl.trim() || null,
      logo_url: form.logoUrl.trim() || null,
      social_accounts: {
        instagram: form.instagram.trim(),
        facebook: form.facebook.trim(),
        linkedin: form.linkedin.trim(),
        youtube: form.youtube.trim(),
        x: form.x.trim(),
      } satisfies Json,
      activity_score: boundedNumber(form.activityScore, 0, 100, 50),
      trend: form.trend,
      google_rating: form.googleRating ? boundedNumber(form.googleRating, 0, 5, 0) : null,
      running_ads: form.runningAds,
      refresh_schedule: form.refreshSchedule,
      website_snapshot: snapshotFromText(form.websiteNotes, 'Website Monitor'),
      social_snapshot: snapshotFromText(form.socialNotes, 'Social Media Monitor'),
      content_snapshot: snapshotFromText(form.contentNotes, 'Content Analysis'),
      ads_snapshot: snapshotFromText(form.adsNotes, 'Ad Intelligence'),
      review_snapshot: snapshotFromText(form.reviewNotes, 'Review Intelligence'),
      offer_snapshot: snapshotFromText(form.offerNotes, 'Offer Tracker'),
      seo_snapshot: snapshotFromText(form.seoNotes, 'SEO Insights'),
      analytics_snapshot: snapshotFromText(form.analyticsNotes, 'Benchmark Analytics'),
    };

    try {
      if (editingId) {
        const { data, error: updateError } = await supabase.from('competitors').update(payload).eq('id', editingId).eq('org_id', organization.id).select('*').single();
        if (updateError) throw updateError;
        setCompetitors((current) => current.map((competitor) => (competitor.id === data.id ? data : competitor)));
        setMessage('Competitor updated.');
      } else {
        const { data, error: insertError } = await supabase.from('competitors').insert({ ...payload, org_id: organization.id, created_by: user.id }).select('*').single();
        if (insertError) throw insertError;
        const { data: eventData } = await supabase.from('competitor_events').insert({
          org_id: organization.id,
          competitor_id: data.id,
          event_type: 'insight',
          severity: 'info',
          title: 'Competitor added',
          details: `${data.name} is now tracked in Competitor Intelligence.`,
          created_by: user.id,
        }).select('*').single();
        setCompetitors((current) => [data, ...current]);
        if (eventData) setEvents((current) => [eventData, ...current]);
        setSelectedCompetitorId(data.id);
        setMessage('Competitor added.');
      }
      setForm(emptyForm);
      setEditingId('');
      setShowForm(false);
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save this competitor.'));
    } finally {
      setSaving(false);
    }
  }

  async function patchCompetitor(competitor: CompetitorRow, patch: Database['public']['Tables']['competitors']['Update']) {
    if (!supabase || !organization?.id || !canWrite) return;
    setMessage('');
    setError('');
    try {
      const { data, error: updateError } = await supabase.from('competitors').update(patch).eq('id', competitor.id).eq('org_id', organization.id).select('*').single();
      if (updateError) throw updateError;
      setCompetitors((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage('Competitor updated.');
    } catch (patchError) {
      setError(errorMessage(patchError, 'Could not update this competitor.'));
    }
  }

  async function runAnalysis(competitor: CompetitorRow) {
    if (!supabase || !organization?.id || !canWrite) return;
    setAnalyzingId(competitor.id);
    setMessage('');
    setError('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: { action: 'analyze_competitor_intelligence', orgId: organization.id, competitorId: competitor.id },
      });
      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));
      const result = safeRecord(data as Json);
      const updated = result.competitor as CompetitorRow | undefined;
      if (!updated?.id) throw new Error('Maya did not return the updated competitor.');
      setCompetitors((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await reloadEvents();
      setMessage('Maya strategy updated.');
    } catch (analysisError) {
      setError(errorMessage(analysisError, 'Could not analyze this competitor.'));
    } finally {
      setAnalyzingId('');
    }
  }

  async function reloadEvents() {
    if (!supabase || !organization?.id) return;
    const { data } = await supabase.from('competitor_events').select('*').eq('org_id', organization.id).order('event_at', { ascending: false }).limit(150);
    setEvents(data ?? []);
  }

  async function createCampaignFromCompetitor(competitor: CompetitorRow) {
    if (!supabase || !organization?.id || !user?.id || !canWrite) return;
    const currentStrategy = parseStrategy(competitor.ai_insights);
    const campaignName = currentStrategy.campaignSuggestions[0] || `${competitor.name} gap response`;
    setCampaigningId(competitor.id);
    setMessage('');
    setError('');

    try {
      const { data, error: campaignError } = await supabase.from('campaigns').insert({
        org_id: organization.id,
        client_business_dna_id: competitor.client_business_dna_id,
        name: campaignName,
        type: competitor.running_ads ? 'ads' : 'standard',
        status: 'draft',
        objective: [
          `Competitor: ${competitor.name}`,
          currentStrategy.summary,
          ...currentStrategy.recommendations.map((item) => `Action: ${item}`),
          ...currentStrategy.opportunities.map((item) => `Opportunity: ${item}`),
        ].filter(Boolean).join('\n'),
        created_by: user.id,
      }).select('id, name, client_business_dna_id').single();
      if (campaignError) throw campaignError;
      setCampaigns((current) => [data, ...current]);
      setMessage('Campaign created from competitor gap.');
    } catch (campaignError) {
      setError(errorMessage(campaignError, 'Could not create campaign.'));
    } finally {
      setCampaigningId('');
    }
  }

  return (
    <div className="page-stack competitor-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Competitor Intelligence</h2>
        </div>
        <div className="page-header-actions">
          <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>{readOnly ? 'Read only' : `${competitors.length} competitors`}</span>
          <button type="button" className="icon-text-button" onClick={openCreate} disabled={!canWrite}>
            <Plus size={16} />
            <span>Add competitor</span>
          </button>
        </div>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading competitors">
          <Loader2 className="spin" size={28} />
          <h3>Loading Competitor Intelligence</h3>
        </section>
      ) : (
        <div className="competitor-workspace">
          <section className="lead-summary-strip" aria-label="Competitor summary">
            <article><span>Active competitors</span><strong>{summary.active}</strong><small>Monitoring or paused</small></article>
            <article><span>Average activity</span><strong>{summary.averageScore}</strong><small>Overall growth signal</small></article>
            <article><span>Running ads</span><strong>{summary.runningAds}</strong><small>Public ad signals</small></article>
            <article><span>Alerts</span><strong>{summary.threats}</strong><small>Threats and spikes</small></article>
          </section>

          {showForm ? (
            <section className="draft-panel competitor-form-panel" aria-label="Add or edit competitor">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Competitor</p>
                  <h3>{editingId ? 'Edit competitor' : 'Add competitor'}</h3>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Close competitor form"><X size={16} /></button>
              </div>
              <form className="draft-form competitor-form" onSubmit={handleSubmit}>
                {isAgency ? <BrandDnaSelect label="Track for" selfLabel={organization?.name ?? 'Agency brand'} clients={clients} value={form.brandSelectionId} onChange={(id) => updateForm('brandSelectionId', id)} /> : null}
                <label><span>Company name</span><input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="ABC Dental Clinic" /></label>
                <label><span>Industry</span><input value={form.industry} onChange={(event) => updateForm('industry', event.target.value)} placeholder="Dental clinic" /></label>
                <label><span>Website</span><input value={form.websiteUrl} onChange={(event) => updateForm('websiteUrl', event.target.value)} placeholder="https://..." /></label>
                <label><span>Logo URL</span><input value={form.logoUrl} onChange={(event) => updateForm('logoUrl', event.target.value)} placeholder="https://..." /></label>
                <label><span>Instagram</span><input value={form.instagram} onChange={(event) => updateForm('instagram', event.target.value)} placeholder="@handle or URL" /></label>
                <label><span>Facebook</span><input value={form.facebook} onChange={(event) => updateForm('facebook', event.target.value)} placeholder="Page URL" /></label>
                <label><span>LinkedIn</span><input value={form.linkedin} onChange={(event) => updateForm('linkedin', event.target.value)} placeholder="Page URL" /></label>
                <label><span>YouTube</span><input value={form.youtube} onChange={(event) => updateForm('youtube', event.target.value)} placeholder="Channel URL" /></label>
                <label><span>X</span><input value={form.x} onChange={(event) => updateForm('x', event.target.value)} placeholder="@handle or URL" /></label>
                <label><span>Activity score</span><input type="number" min={0} max={100} value={form.activityScore} onChange={(event) => updateForm('activityScore', event.target.value)} /></label>
                <label><span>Google rating</span><input type="number" min={0} max={5} step="0.1" value={form.googleRating} onChange={(event) => updateForm('googleRating', event.target.value)} placeholder="4.8" /></label>
                <label><span>Trend</span><select value={form.trend} onChange={(event) => updateForm('trend', event.target.value as CompetitorTrend)}><option value="growing">Growing</option><option value="stable">Stable</option><option value="declining">Declining</option><option value="unknown">Unknown</option></select></label>
                <label><span>Refresh</span><select value={form.refreshSchedule} onChange={(event) => updateForm('refreshSchedule', event.target.value as RefreshSchedule)}><option value="manual">Manual</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
                <label className="toggle-field"><input type="checkbox" checked={form.runningAds} onChange={(event) => updateForm('runningAds', event.target.checked)} /><span>Running Ads</span></label>
                {[
                  ['websiteNotes', 'Website Monitor', 'Homepage, services, pricing, offers, blogs, new pages, contact or team changes'],
                  ['socialNotes', 'Social Media Monitor', 'Followers, posting frequency, engagement, hashtags, reels, content categories'],
                  ['contentNotes', 'Content Analysis', 'Educational, promotional, testimonials, events, recruitment, seasonal content'],
                  ['adsNotes', 'Ad Intelligence', 'Meta ads, Google public signals, YouTube ads, landing pages, CTA, creative style'],
                  ['reviewNotes', 'Review Intelligence', 'Ratings, positive themes, complaints, frequently mentioned services'],
                  ['offerNotes', 'Offer Tracker', 'Discounts, bundles, free consultation, coupons, memberships, festival offers'],
                  ['seoNotes', 'SEO Insights', 'Keywords, top pages, backlinks, blogs, search visibility, questions answered'],
                  ['analyticsNotes', 'Benchmark Dashboard', 'Followers, engagement, campaign volume, lead sources, growth score'],
                ].map(([key, label, placeholder]) => (
                  <label className="draft-body-field" key={key}>
                    <span>{label}</span>
                    <textarea value={form[key as keyof CompetitorForm] as string} onChange={(event) => updateForm(key as keyof CompetitorForm, event.target.value as never)} rows={2} placeholder={placeholder} />
                  </label>
                ))}
                <div className="creator-actions draft-body-field">
                  <button type="button" className="icon-text-button" onClick={() => setShowForm(false)}><X size={16} /><span>Cancel</span></button>
                  <button className="primary-action" type="submit" disabled={saving || !canWrite}>{saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}<span>{saving ? 'Saving' : 'Save competitor'}</span></button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="competitor-layout" aria-label="Competitor Intelligence workspace">
            <div className="draft-panel competitor-list-panel">
              <div className="section-heading content-library-heading">
                <div><p className="eyebrow">Dashboard</p><h3>Competitor Summary</h3></div>
                {isAgency ? <BrandDnaSelect label="Brand" selfLabel={organization?.name ?? 'Agency brand'} clients={clients} value={selectedBrandId} onChange={setSelectedBrandId} /> : null}
              </div>
              <div className="library-filter-tabs" aria-label="Filter competitors">
                {filters.map((item) => (
                  <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="competitor-card-list">
                {visibleCompetitors.length > 0 ? visibleCompetitors.map((competitor) => (
                  <button type="button" className={competitor.id === selectedCompetitor?.id ? 'competitor-card is-active' : 'competitor-card'} key={competitor.id} onClick={() => setSelectedCompetitorId(competitor.id)}>
                    <span className="competitor-logo">{competitor.logo_url ? <img src={competitor.logo_url} alt="" /> : competitor.name.slice(0, 2).toUpperCase()}</span>
                    <strong>{competitor.name}</strong>
                    <small>{competitor.industry || 'Industry not set'}</small>
                    <span>{competitor.website_url || 'No website'}</span>
                    <div>
                      <b>{competitor.activity_score}</b>
                      <small>{trendLabel(competitor.trend)} · {competitor.running_ads ? 'Ads running' : 'No ads signal'}</small>
                    </div>
                  </button>
                )) : (
                  <div className="queue-empty"><Search size={20} /><span>No competitors match this filter.</span></div>
                )}
              </div>
            </div>

            <div className="draft-panel competitor-profile-panel">
              {selectedCompetitor ? (
                <>
                  <div className="competitor-profile-header">
                    <div>
                      <p className="eyebrow">Competitor Profile</p>
                      <h3>{selectedCompetitor.name}</h3>
                      <div className="saved-content-row__meta">
                        <span>{selectedCompetitor.industry || 'Industry not set'}</span>
                        <span>Score {selectedCompetitor.activity_score}</span>
                        <span>{trendLabel(selectedCompetitor.trend)}</span>
                        <span>Refresh {selectedCompetitor.refresh_schedule}</span>
                        {selectedCompetitor.google_rating ? <span>Google {selectedCompetitor.google_rating}</span> : null}
                        {isAgency ? <span>{selectedCompetitor.client_business_dna_id ? clientNameById.get(selectedCompetitor.client_business_dna_id) ?? 'Client brand' : organization?.name ?? 'Agency brand'}</span> : null}
                      </div>
                    </div>
                    {canWrite ? (
                      <div className="saved-content-row__actions">
                        <button type="button" className="icon-text-button" onClick={() => runAnalysis(selectedCompetitor)} disabled={analyzingId === selectedCompetitor.id}>
                          {analyzingId === selectedCompetitor.id ? <Loader2 className="spin" size={16} /> : <Bot size={16} />}
                          <span>Refresh Now</span>
                        </button>
                        <button type="button" className="icon-text-button" onClick={() => createCampaignFromCompetitor(selectedCompetitor)} disabled={campaigningId === selectedCompetitor.id}>
                          {campaigningId === selectedCompetitor.id ? <Loader2 className="spin" size={16} /> : <Target size={16} />}
                          <span>Create Campaign</span>
                        </button>
                        <button type="button" className="icon-text-button" onClick={() => startEdit(selectedCompetitor)}><Save size={16} /><span>Edit</span></button>
                        <button type="button" className="icon-text-button" onClick={() => patchCompetitor(selectedCompetitor, { status: selectedCompetitor.status === 'archived' ? 'monitoring' : 'archived' })}>
                          <Archive size={16} /><span>{selectedCompetitor.status === 'archived' ? 'Restore' : 'Archive'}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="library-filter-tabs competitor-section-tabs" aria-label="Competitor profile sections">
                    {sections.map((section) => (
                      <button type="button" key={section} className={activeSection === section ? 'is-active' : ''} onClick={() => setActiveSection(section)}>
                        <span>{section}</span>
                      </button>
                    ))}
                  </div>

                  <div className="competitor-section-body">
                    {activeSection === 'Overview' ? <Overview competitor={selectedCompetitor} strategy={strategy} campaigns={campaigns} /> : null}
                    {activeSection === 'Website' ? <SignalPanel icon={<Globe2 size={18} />} title="Website Monitor" snapshot={selectedCompetitor.website_snapshot} bullets={['Homepage', 'Services', 'Pricing', 'Offers', 'New pages', 'Blogs']} /> : null}
                    {activeSection === 'Social Media' ? <SignalPanel icon={<BarChart3 size={18} />} title="Social Media Monitor" snapshot={selectedCompetitor.social_snapshot} bullets={['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'X', 'Growth trend']} /> : null}
                    {activeSection === 'Content' ? <SignalPanel icon={<Sparkles size={18} />} title="Content Analysis" snapshot={selectedCompetitor.content_snapshot} bullets={['Educational', 'Promotional', 'Testimonials', 'Events', 'Offers', 'Behind the scenes']} /> : null}
                    {activeSection === 'Ads' ? <SignalPanel icon={<Megaphone size={18} />} title="Ad Intelligence" snapshot={selectedCompetitor.ads_snapshot} bullets={['Meta Ads', 'Google signals', 'YouTube Ads', 'Landing pages', 'Offers', 'CTA']} /> : null}
                    {activeSection === 'Reviews' ? <SignalPanel icon={<ShieldAlert size={18} />} title="Review Intelligence" snapshot={selectedCompetitor.review_snapshot} bullets={['Google', 'Facebook', 'Positive themes', 'Negative themes', 'Complaints', 'Services']} /> : null}
                    {activeSection === 'Offers' ? <SignalPanel icon={<Target size={18} />} title="Offer Tracker" snapshot={selectedCompetitor.offer_snapshot} bullets={['Discounts', 'Bundles', 'Free consultation', 'Festival offers', 'Coupons', 'Limited-time deals']} /> : null}
                    {activeSection === 'SEO' ? <SignalPanel icon={<Search size={18} />} title="SEO Insights" snapshot={selectedCompetitor.seo_snapshot} bullets={['Keywords', 'Top pages', 'Backlinks', 'Blog frequency', 'Search visibility', 'Questions answered']} /> : null}
                    {activeSection === 'Analytics' ? <Benchmark competitor={selectedCompetitor} /> : null}
                    {activeSection === 'AI Insights' ? <AiInsights strategy={strategy} /> : null}
                  </div>

                  <section className="competitor-timeline" aria-label="Competitor Timeline">
                    <div className="section-heading"><div><p className="eyebrow">Timeline</p><h3>Alerts and changes</h3></div></div>
                    {selectedEvents.length > 0 ? selectedEvents.map((event) => (
                      <article key={event.id} className={`competitor-event ${event.severity}`}>
                        <span>{eventTypeLabel(event.event_type)}</span>
                        <div><strong>{event.title}</strong>{event.details ? <p>{event.details}</p> : null}</div>
                        <small>{formatDate(event.event_at)}</small>
                      </article>
                    )) : (
                      <div className="queue-empty"><RefreshCw size={20} /><span>Run Maya analysis to start the competitor timeline.</span></div>
                    )}
                  </section>
                </>
              ) : (
                <div className="queue-empty"><Search size={20} /><span>Add a competitor to start monitoring.</span></div>
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

function Overview({ competitor, strategy, campaigns }: { competitor: CompetitorRow; strategy: Strategy; campaigns: CampaignRow[] }) {
  return (
    <div className="competitor-overview-grid">
      <SignalPanel icon={<Globe2 size={18} />} title="Public signals" snapshot={competitor.website_snapshot} bullets={[competitor.website_url || 'Website not set', competitor.running_ads ? 'Running Ads: Yes' : 'Running Ads: No', competitor.google_rating ? `Google Rating: ${competitor.google_rating}` : 'Google Rating not set']} />
      <SignalPanel icon={<Sparkles size={18} />} title="Maya Recommendation" snapshot={{ summary: strategy.summary || 'Run Maya analysis for strategic recommendations.' }} bullets={strategy.recommendations.length > 0 ? strategy.recommendations : ['Refresh Now to generate strategy']} />
      <SignalPanel icon={<Target size={18} />} title="Campaign Suggestions" snapshot={{ summary: campaigns.length ? `${campaigns.length} workspace campaigns available.` : 'No linked campaign yet.' }} bullets={strategy.campaignSuggestions.length > 0 ? strategy.campaignSuggestions : ['Create Campaign after analysis']} />
    </div>
  );
}

function SignalPanel({ icon, title, snapshot, bullets }: { icon: JSX.Element; title: string; snapshot: Json; bullets: string[] }) {
  return (
    <article className="competitor-signal-panel">
      <div><span>{icon}</span><strong>{title}</strong></div>
      <p>{snapshotText(snapshot) || 'No signal notes saved yet.'}</p>
      <ul>{bullets.filter(Boolean).slice(0, 6).map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
    </article>
  );
}

function Benchmark({ competitor }: { competitor: CompetitorRow }) {
  const analytics = safeRecord(competitor.analytics_snapshot);
  const rows = [
    ['Followers', stringField(analytics.followers) || 'Track from social monitor'],
    ['Engagement', stringField(analytics.engagement) || 'Track reactions and comments'],
    ['Posting Frequency', stringField(analytics.postingFrequency) || 'Track weekly posts'],
    ['Reviews', competitor.google_rating ? `Google ${competitor.google_rating}` : 'Track review count and rating'],
    ['Campaigns', competitor.running_ads ? 'Ads signal active' : 'No ad signal saved'],
    ['Overall Growth Score', `${competitor.activity_score}/100`],
  ];
  return <div className="competitor-benchmark">{rows.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>;
}

function AiInsights({ strategy }: { strategy: Strategy }) {
  return (
    <div className="competitor-ai-grid">
      <article><strong>AI Strategy</strong><p>{strategy.summary || 'Run Maya analysis to summarize competitor movement.'}</p></article>
      <InsightList title="Why Are They Winning?" items={strategy.whyWinning.reasons} fallback="Maya will explain the competitor advantage here." />
      <InsightList title="Recommended actions" items={strategy.whyWinning.recommendedActions} fallback="Run analysis for next actions." />
      <InsightList title="Opportunity Finder" items={strategy.opportunities} fallback="Untapped topics, services, locations, and complaints appear here." />
      <InsightList title="Threats" items={strategy.threats} fallback="Pricing, ads, review spikes, and content threats appear here." />
      <article><strong>Estimated impact</strong><p>{strategy.whyWinning.estimatedImpact || 'Not estimated yet.'}</p></article>
      {(['strengths', 'weaknesses', 'opportunities', 'threats'] as const).map((key) => <InsightList key={key} title={`SWOT ${titleCase(key)}`} items={strategy.swot[key]} fallback="Run analysis to populate SWOT." />)}
    </div>
  );
}

function InsightList({ title, items, fallback }: { title: string; items: string[]; fallback: string }) {
  return <article><strong>{title}</strong>{items.length > 0 ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{fallback}</p>}</article>;
}

function parseStrategy(value: Json | undefined): Strategy {
  const record = safeRecord(value);
  const swot = safeRecord(record.swot);
  const whyWinning = safeRecord(record.whyWinning);
  return {
    summary: stringField(record.summary),
    recommendations: stringArray(record.recommendations),
    campaignSuggestions: stringArray(record.campaignSuggestions),
    opportunities: stringArray(record.opportunities),
    threats: stringArray(record.threats),
    swot: {
      strengths: stringArray(swot.strengths),
      weaknesses: stringArray(swot.weaknesses),
      opportunities: stringArray(swot.opportunities),
      threats: stringArray(swot.threats),
    },
    whyWinning: {
      reasons: stringArray(whyWinning.reasons),
      estimatedImpact: stringField(whyWinning.estimatedImpact),
      recommendedActions: stringArray(whyWinning.recommendedActions),
    },
  };
}

function snapshotFromText(summary: string, label: string): Json {
  return { label, summary: summary.trim(), updatedAt: new Date().toISOString() };
}

function snapshotText(value: Json | undefined) {
  const record = safeRecord(value);
  return stringField(record.summary);
}

function safeRecord(value: Json | unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8) : [];
}

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function trendLabel(value: CompetitorTrend) {
  return { growing: 'Growing', stable: 'Stable', declining: 'Declining', unknown: 'Unknown' }[value];
}

function eventTypeLabel(value: CompetitorEventRow['event_type']) {
  return value.replace('_', ' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : 'Unknown';
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
