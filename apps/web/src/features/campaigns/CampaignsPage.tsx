import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Target,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';

type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type CampaignStatus = CampaignRow['status'];
type CampaignType = CampaignRow['type'];
type CampaignFilter = 'all' | CampaignStatus;
type ContentItemRow = Pick<Database['public']['Tables']['content_items']['Row'], 'id' | 'campaign_id' | 'status'>;
type MarketingTaskRow = Pick<Database['public']['Tables']['marketing_tasks']['Row'], 'id' | 'campaign_id' | 'status'>;
type SocialPostRow = Pick<Database['public']['Tables']['social_posts']['Row'], 'id' | 'campaign_id' | 'status'>;

type CampaignForm = {
  name: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  objective: string;
};

type CampaignStats = {
  content: number;
  readyContent: number;
  tasks: number;
  openTasks: number;
  socialPosts: number;
  queuedPosts: number;
};

const writerRoles = ['owner', 'admin', 'editor'] as const;

const campaignTypes: Array<{ value: CampaignType; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'launch', label: 'Launch' },
  { value: 'evergreen', label: 'Evergreen' },
  { value: 'ads', label: 'Ads' },
  { value: 'influencer', label: 'Influencer' },
];

const statusOptions: Array<{ value: CampaignStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const statusFilters: Array<{ value: CampaignFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
];

const nextStatus: Partial<Record<CampaignStatus, CampaignStatus>> = {
  draft: 'active',
  active: 'completed',
  paused: 'active',
};

const emptyForm: CampaignForm = {
  name: '',
  campaignType: 'standard',
  status: 'draft',
  objective: '',
};

export function CampaignsPage() {
  const { organization, user, membership } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemRow[]>([]);
  const [tasks, setTasks] = useState<MarketingTaskRow[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPostRow[]>([]);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [statusFilter, setStatusFilter] = useState<CampaignFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canWrite = writerRoles.some((role) => role === membership?.role);
  const readOnly = Boolean(membership?.role) && !canWrite;

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setCampaigns([]);
        setContentItems([]);
        setTasks([]);
        setSocialPosts([]);
        setLoading(false);
        return;
      }

      const [
        { data: campaignData, error: campaignError },
        { data: contentData, error: contentError },
        { data: taskData, error: taskError },
        { data: postData, error: postError },
      ] = await Promise.all([
        supabase
          .from('campaigns')
          .select('*')
          .eq('org_id', organization.id)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(100),
        supabase
          .from('content_items')
          .select('id, campaign_id, status')
          .eq('org_id', organization.id)
          .not('campaign_id', 'is', null)
          .limit(500),
        supabase
          .from('marketing_tasks')
          .select('id, campaign_id, status')
          .eq('org_id', organization.id)
          .not('campaign_id', 'is', null)
          .limit(500),
        supabase
          .from('social_posts')
          .select('id, campaign_id, status')
          .eq('org_id', organization.id)
          .not('campaign_id', 'is', null)
          .limit(500),
      ]);

      if (!active) return;

      const errors = [campaignError, contentError, taskError, postError].filter(Boolean);
      if (errors.length > 0) setError(errorMessage(errors[0], 'Could not load campaigns.'));

      setCampaigns(campaignData ?? []);
      setContentItems(contentData ?? []);
      setTasks(taskData ?? []);
      setSocialPosts(postData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const counts = useMemo(() => {
    const map = new Map<CampaignFilter, number>([['all', campaigns.length]]);
    for (const campaign of campaigns) map.set(campaign.status, (map.get(campaign.status) ?? 0) + 1);
    return map;
  }, [campaigns]);

  const statsByCampaign = useMemo(() => {
    const map = new Map<string, CampaignStats>();
    for (const campaign of campaigns) {
      map.set(campaign.id, { content: 0, readyContent: 0, tasks: 0, openTasks: 0, socialPosts: 0, queuedPosts: 0 });
    }
    for (const item of contentItems) {
      const stats = item.campaign_id ? map.get(item.campaign_id) : null;
      if (!stats) continue;
      stats.content += 1;
      if (item.status === 'ready' || item.status === 'queued' || item.status === 'published') stats.readyContent += 1;
    }
    for (const task of tasks) {
      const stats = task.campaign_id ? map.get(task.campaign_id) : null;
      if (!stats) continue;
      stats.tasks += 1;
      if (!['approved', 'done', 'archived'].includes(task.status)) stats.openTasks += 1;
    }
    for (const post of socialPosts) {
      const stats = post.campaign_id ? map.get(post.campaign_id) : null;
      if (!stats) continue;
      stats.socialPosts += 1;
      if (post.status === 'queued' || post.status === 'publishing') stats.queuedPosts += 1;
    }
    return map;
  }, [campaigns, contentItems, socialPosts, tasks]);

  const visibleCampaigns = useMemo(() => {
    if (statusFilter === 'all') return campaigns;
    return campaigns.filter((campaign) => campaign.status === statusFilter);
  }, [campaigns, statusFilter]);

  function updateForm<K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) {
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

  function startEdit(campaign: CampaignRow) {
    if (!canWrite) return;
    setEditingId(campaign.id);
    setForm({
      name: campaign.name,
      campaignType: campaign.type,
      status: campaign.status,
      objective: campaign.objective ?? '',
    });
    setMessage('');
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;

    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage campaigns here.');
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setError('Enter a campaign name first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const payload = {
      name,
      type: form.campaignType,
      status: form.status,
      objective: form.objective.trim() || null,
    };

    try {
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('campaigns')
          .update(payload)
          .eq('id', editingId)
          .eq('org_id', organization.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        setCampaigns((current) => current.map((campaign) => (campaign.id === data.id ? data : campaign)));
        setMessage('Campaign updated.');
      } else {
        const { data, error: insertError } = await supabase
          .from('campaigns')
          .insert({ ...payload, org_id: organization.id, created_by: user.id })
          .select('*')
          .single();
        if (insertError) throw insertError;
        setCampaigns((current) => [data, ...current]);
        setMessage('Campaign created.');
      }
      resetForm();
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save campaign.'));
    } finally {
      setSaving(false);
    }
  }

  async function patchCampaign(campaign: CampaignRow, patch: Database['public']['Tables']['campaigns']['Update']) {
    if (!supabase || !organization?.id || !canWrite) return;
    setUpdatingId(campaign.id);
    setMessage('');
    setError('');
    try {
      const { data, error: updateError } = await supabase
        .from('campaigns')
        .update(patch)
        .eq('id', campaign.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      setCampaigns((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage('Campaign updated.');
    } catch (patchError) {
      setError(errorMessage(patchError, 'Could not update campaign.'));
    } finally {
      setUpdatingId('');
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Plan</p>
          <h2>Campaigns</h2>
        </div>
        <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>
          {readOnly ? 'Read only' : `${campaigns.length} campaigns`}
        </span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading campaigns">
          <Loader2 className="spin" size={28} />
          <h3>Loading campaigns</h3>
        </section>
      ) : (
        <div className="content-creator-grid">
          <section className="draft-panel creator-panel" aria-label="Create or edit campaign">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Campaign</p>
                <h3>{editingId ? 'Edit campaign' : 'New campaign'}</h3>
              </div>
              <Target size={21} />
            </div>

            {readOnly ? <p className="form-message warning">Ask an owner, admin, or editor to create and manage campaigns.</p> : null}

            <form className="draft-form creator-form" onSubmit={handleSubmit}>
              <label>
                <span>Name</span>
                <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Example: Diwali growth campaign" />
              </label>

              <label>
                <span>Type</span>
                <select value={form.campaignType} onChange={(event) => updateForm('campaignType', event.target.value as CampaignType)}>
                  {campaignTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>

              <label>
                <span>Status</span>
                <select value={form.status} onChange={(event) => updateForm('status', event.target.value as CampaignStatus)}>
                  {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>

              <label className="draft-body-field">
                <span>Objective</span>
                <textarea value={form.objective} onChange={(event) => updateForm('objective', event.target.value)} rows={4} placeholder="What should this campaign achieve?" />
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
                  <span>{saving ? 'Saving' : editingId ? 'Save changes' : 'Create campaign'}</span>
                </button>
              </div>
            </form>

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>

          <section className="draft-panel saved-content-panel" aria-label="Campaign list">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Board</p>
                <h3>Campaign pipeline</h3>
              </div>
              <div className="library-filter-tabs" aria-label="Filter campaigns by status">
                {statusFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={statusFilter === filter.value ? 'is-active' : ''}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    <span>{filter.label}</span>
                    <small>{counts.get(filter.value) ?? 0}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="saved-content-list">
              {visibleCampaigns.length > 0 ? visibleCampaigns.map((campaign) => {
                const stats = statsByCampaign.get(campaign.id) ?? emptyStats();
                const forward = nextStatus[campaign.status];
                const archived = campaign.status === 'archived';
                return (
                  <article className={`saved-content-row campaign-row ${archived ? 'is-archived' : ''}`} key={campaign.id}>
                    <div className="saved-content-row__main">
                      <strong>{campaign.name}</strong>
                      {campaign.objective ? <p>{campaign.objective}</p> : <p>No objective saved yet.</p>}
                      <div className="saved-content-row__meta">
                        <span>{campaignTypeLabel(campaign.type)}</span>
                        <span>{campaignStatusLabel(campaign.status)}</span>
                        <span>Updated {formatDate(campaign.updated_at)}</span>
                      </div>
                      <div className="campaign-metrics" aria-label="Campaign linked work">
                        <span><strong>{stats.content}</strong> content</span>
                        <span><strong>{stats.readyContent}</strong> ready</span>
                        <span><strong>{stats.openTasks}</strong> open tasks</span>
                        <span><strong>{stats.queuedPosts}</strong> queued posts</span>
                      </div>
                    </div>

                    <div className="saved-content-row__side">
                      <small>{formatDate(campaign.created_at)}</small>
                      {canWrite ? (
                        <div className="saved-content-row__actions">
                          {forward ? (
                            <button type="button" className="icon-text-button" disabled={updatingId === campaign.id} onClick={() => patchCampaign(campaign, { status: forward })}>
                              {updatingId === campaign.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                              <span>{campaignStatusLabel(forward)}</span>
                            </button>
                          ) : null}
                          <button type="button" className="icon-text-button" onClick={() => startEdit(campaign)}>
                            <Pencil size={16} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="icon-text-button"
                            disabled={updatingId === campaign.id}
                            onClick={() => patchCampaign(campaign, { status: archived ? 'draft' : 'archived' })}
                          >
                            {updatingId === campaign.id ? <Loader2 className="spin" size={16} /> : archived ? <RotateCcw size={16} /> : <Archive size={16} />}
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
                  <span>{campaigns.length > 0 ? 'No campaigns match this filter.' : 'No campaigns yet.'}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function emptyStats(): CampaignStats {
  return { content: 0, readyContent: 0, tasks: 0, openTasks: 0, socialPosts: 0, queuedPosts: 0 };
}

function campaignTypeLabel(value: CampaignType) {
  return campaignTypes.find((type) => type.value === value)?.label ?? value;
}

function campaignStatusLabel(value: CampaignStatus) {
  return statusOptions.find((status) => status.value === value)?.label ?? value.replace('_', ' ');
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
