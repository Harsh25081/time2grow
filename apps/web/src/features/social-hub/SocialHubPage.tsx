import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  CheckSquare,
  Clock3,
  FileUp,
  Send,
  Square,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Database } from '../../types/database';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';
import {
  channels,
  edgeFunctionErrorMessage,
  errorMessage,
  mapRowToHandle,
  normalizeConnectionsResponse,
  seedHandles,
  statusLabel,
  type ConnectionStatus,
  type Handle,
  type Provider,
} from './shared';

type PostStatus = 'draft' | 'queued' | 'publishing' | 'published' | 'partial_failed' | 'failed' | 'cancelled';
type SocialPostRow = Database['public']['Tables']['social_posts']['Row'];
type PublishTargetInsert = Database['public']['Tables']['publish_targets']['Insert'];
type MediaAssetInsert = Database['public']['Tables']['social_media_assets']['Insert'];
type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type ContentItemRow = Database['public']['Tables']['content_items']['Row'];

type DraftForm = {
  title: string;
  body: string;
  mediaUrl: string;
  scheduledAt: string;
};

type QueueRun = {
  id: string;
  title: string;
  targetCount: number;
  status: PostStatus | 'local';
  createdAt: string;
  targetLabels: string[];
};

type PublishResult = {
  postStatus?: PostStatus;
  published?: number;
  failed?: number;
  results?: Array<{
    provider?: Provider;
    label?: string;
    status?: string;
    error?: string;
  }>;
};

const mediaAccept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';

const liveRequirements = [
  'Connected provider account or server token',
  'Saved real handle selected for each destination',
  'Provider approval where the platform requires it',
];

const initialHandles = supabase ? [] : seedHandles;
const defaultSelected = new Set(initialHandles.filter((handle) => handle.status === 'ready').map((handle) => handle.id));

export function SocialHubPage() {
  const { organization, user } = useAuth();
  const [accountHandles, setAccountHandles] = useState<Handle[]>(initialHandles);
  const [selectedHandleIds, setSelectedHandleIds] = useState<Set<string>>(defaultSelected);
  const [draft, setDraft] = useState<DraftForm>({
    title: 'Launch offer post',
    body: 'Write the message here. Live publishing will stay gated until OAuth and provider review are complete.',
    mediaUrl: '',
    scheduledAt: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [queueRuns, setQueueRuns] = useState<QueueRun[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemRow[]>([]);
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedContentItemId, setSelectedContentItemId] = useState('');
  const [brandSelectionId, setBrandSelectionId] = useState(SELF_BRAND_ID);
  const [queueMessage, setQueueMessage] = useState('');
  const [queueError, setQueueError] = useState('');
  const [queueing, setQueueing] = useState(false);
  const isAgency = organization?.org_type === 'agency';
  const { clients } = useBrandDna(organization?.id, isAgency);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  useEffect(() => {
    let active = true;

    async function loadHandles() {
      if (!supabase || !organization?.id) return;

      const { data, error } = await supabase
        .from('distribution_handles')
        .select('*')
        .eq('org_id', organization.id)
        .eq('is_enabled', true)
        .order('created_at', { ascending: false });

      if (!active) return;

      if (error) {
        setQueueError(errorMessage(error, 'Run the social distribution migration before loading saved handles.'));
        return;
      }

      const savedHandles = (data ?? []).map(mapRowToHandle);
      setAccountHandles(savedHandles);
      setSelectedHandleIds(new Set(savedHandles.filter((handle) => handle.status === 'ready').map((handle) => handle.id)));
    }

    async function loadConnections() {
      if (!supabase || !organization?.id) return;

      try {
        const { data, error } = await supabase.functions.invoke('social-connections-status', {
          body: { orgId: organization.id },
        });

        if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-connections-status'));
        if (!active) return;
        setConnections(normalizeConnectionsResponse(data).connections ?? []);
      } catch {
        // Connection status is advisory here; the Connections page is the source of truth for setup errors.
      }
    }

    async function loadSources() {
      if (!supabase || !organization?.id) return;

      const [{ data: campaignData }, { data: contentData }] = await Promise.all([
        supabase.from('campaigns').select('*').eq('org_id', organization.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('content_items').select('*').eq('org_id', organization.id).order('created_at', { ascending: false }).limit(30),
      ]);

      if (!active) return;
      setCampaigns(campaignData ?? []);
      setContentItems(contentData ?? []);
    }

    async function loadQueueRuns() {
      if (!supabase || !organization?.id) return;

      const { data, error } = await supabase
        .from('social_posts')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(8);

      if (!active) return;

      if (error) {
        setQueueError(errorMessage(error, 'Run the social distribution migration before loading publishing history.'));
        return;
      }

      const posts = data ?? [];
      const targetsByPost = await loadTargetsForPosts(posts.map((post) => post.id));
      setQueueRuns(posts.map((post) => mapPostToQueueRun(post, targetsByPost.get(post.id) ?? [])));
    }

    loadHandles();
    loadConnections();
    loadSources();
    loadQueueRuns();

    return () => {
      active = false;
    };
  }, [organization?.id]);

  const selectedContentItem = useMemo(
    () => contentItems.find((item) => item.id === selectedContentItemId) ?? null,
    [contentItems, selectedContentItemId],
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const selectedHandles = useMemo(
    () => accountHandles.filter((handle) => selectedHandleIds.has(handle.id)),
    [accountHandles, selectedHandleIds],
  );

  const hasDemoTargets = selectedHandles.some((handle) => !handle.persisted);

  const connectionByProvider = useMemo(
    () => new Map(connections.map((connection) => [connection.provider, connection])),
    [connections],
  );

  function needsOAuthConnection(handle: Handle) {
    const connection = connectionByProvider.get(handle.provider);
    return connection?.authMode === 'oauth' && connection.status !== 'connected';
  }

  const hasUnlinkedOAuthTargets = selectedHandles.some(needsOAuthConnection);

  const groupedHandles = useMemo(
    () => channels.map((channel) => ({ ...channel, handles: accountHandles.filter((handle) => handle.provider === channel.provider) })),
    [accountHandles],
  );

  function applyContentItem(contentItemId: string) {
    setSelectedContentItemId(contentItemId);
    const contentItem = contentItems.find((item) => item.id === contentItemId);
    if (!contentItem) return;

    setSelectedCampaignId(contentItem.campaign_id ?? '');
    setBrandSelectionId(contentItem.client_business_dna_id ?? SELF_BRAND_ID);
    setDraft((current) => ({
      ...current,
      title: contentItem.title,
      body: contentItem.body ?? '',
      mediaUrl: contentItem.media_url ?? '',
    }));
    setSelectedFile(null);
  }

  function applyCampaign(campaignId: string) {
    setSelectedCampaignId(campaignId);
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign || selectedContentItemId) return;
    setBrandSelectionId(campaign.client_business_dna_id ?? SELF_BRAND_ID);

    setDraft((current) => ({
      ...current,
      title: campaign.name,
      body: campaign.objective ?? current.body,
    }));
  }

  function clearSource() {
    setSelectedCampaignId('');
    setSelectedContentItemId('');
    setBrandSelectionId(SELF_BRAND_ID);
  }

  async function handleQueueSelected() {
    setQueueMessage('');
    setQueueError('');

    const title = draft.title.trim();
    const body = draft.body.trim();
    const mediaUrl = draft.mediaUrl.trim();
    const scheduledAt = parseScheduledAt(draft.scheduledAt);

    if (draft.scheduledAt && !scheduledAt) {
      setQueueError('Choose a valid schedule date and time.');
      return;
    }

    const isScheduled = Boolean(scheduledAt && scheduledAt.getTime() > Date.now());

    if (!title) {
      setQueueError('Enter a post title before publishing.');
      return;
    }

    if (selectedHandles.length === 0) {
      setQueueError('Select at least one handle.');
      return;
    }

    if (supabase && hasDemoTargets) {
      setQueueError('Only saved handles with real platform IDs can publish.');
      return;
    }

    setQueueing(true);

    try {
      if (supabase && organization?.id && user?.id) {
        const sourceCampaignId = selectedContentItem?.campaign_id ?? selectedCampaign?.id ?? null;
        const sourceContentItemId = selectedContentItem?.id ?? null;

        const postInsert = {
          org_id: organization.id,
          title,
          body: body || null,
          media_url: mediaUrl || null,
          content_type: 'post' as const,
          campaign_id: sourceCampaignId,
          content_item_id: sourceContentItemId,
          client_business_dna_id: isAgency && brandSelectionId !== SELF_BRAND_ID ? brandSelectionId : null,
          scheduled_at: scheduledAt?.toISOString() ?? null,
          status: 'queued' as const,
          created_by: user.id,
        };

        let sourceLinkSkipped = false;
        let { data: post, error: postError } = await supabase
          .from('social_posts')
          .insert(postInsert)
          .select('*')
          .single();

        if (postError && isMissingSocialPostSourceColumn(postError)) {
          sourceLinkSkipped = sourceCampaignId !== null || sourceContentItemId !== null;
          const fallbackPostInsert = {
            org_id: organization.id,
            title,
            body: body || null,
            media_url: mediaUrl || null,
            content_type: 'post' as const,
            client_business_dna_id: isAgency && brandSelectionId !== SELF_BRAND_ID ? brandSelectionId : null,
            scheduled_at: scheduledAt?.toISOString() ?? null,
            status: 'queued' as const,
            created_by: user.id,
          };
          const fallbackPost = await supabase
            .from('social_posts')
            .insert(fallbackPostInsert)
            .select('*')
            .single();
          post = fallbackPost.data;
          postError = fallbackPost.error;
        }

        if (postError || !post) throw postError ?? new Error('Could not create social post.');

        if (selectedFile) {
          await uploadMediaAsset({
            orgId: organization.id,
            userId: user.id,
            postId: post.id,
            file: selectedFile,
          });
        }

        const targetRows: PublishTargetInsert[] = selectedHandles.map((handle) => ({
          org_id: organization.id,
          social_post_id: post.id,
          distribution_handle_id: handle.persisted ? handle.id : null,
          provider: handle.provider,
          target_label: handle.label,
          status: 'queued' as const,
          provider_response: { mode: 'live_publish', source: handle.persisted ? 'workspace_handle' : 'local_preview' },
        }));

        const { data: targets, error: targetError } = await supabase.from('publish_targets').insert(targetRows).select('*');
        if (targetError) throw targetError;

        const sourceNote = sourceLinkSkipped ? ' Source link skipped until the database migration is applied.' : '';

        if (isScheduled && scheduledAt) {
          setQueueRuns((current) => [mapPostToQueueRun({ ...post, status: 'queued' }, targets ?? []), ...current]);
          setQueueMessage('Scheduled "' + title + '" for ' + formatDate(scheduledAt.toISOString()) + '.' + sourceNote);
        } else {
          const publishResult = await publishPostNow(post.id);
          const nextStatus = publishResult.postStatus ?? 'queued';
          setQueueRuns((current) => [mapPostToQueueRun({ ...post, status: nextStatus }, targets ?? []), ...current]);

          if ((publishResult.failed ?? 0) > 0) {
            setQueueError(publishResultSummary(publishResult) + sourceNote);
          } else {
            setQueueMessage('Published "' + title + '" to ' + (publishResult.published ?? selectedHandles.length) + ' selected handles.' + sourceNote);
          }
        }
      } else {
        const localRun: QueueRun = {
          id: `local-run-${Date.now()}`,
          title,
          targetCount: selectedHandles.length,
          status: 'local',
          createdAt: new Date().toISOString(),
          targetLabels: selectedHandles.map((handle) => handle.label),
        };
        setQueueRuns((current) => [localRun, ...current]);
        setQueueMessage('Preview saved locally. Connect Supabase and provider credentials for real publishing.');
      }
    } catch (error) {
      setQueueError(errorMessage(error, 'Could not publish post.'));
    } finally {
      setQueueing(false);
    }
  }

  async function publishPostNow(postId: string): Promise<PublishResult> {
    if (!supabase) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase.functions.invoke('social-publish', {
      body: { postId },
    });

    if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-publish'));
    return normalizePublishResult(data);
  }

  function toggleHandle(handleId: string) {
    setSelectedHandleIds((current) => {
      const next = new Set(current);
      if (next.has(handleId)) next.delete(handleId);
      else next.add(handleId);
      return next;
    });
  }

  function setProviderSelection(provider: Provider, selected: boolean) {
    setSelectedHandleIds((current) => {
      const next = new Set(current);
      accountHandles.filter((handle) => handle.provider === provider).forEach((handle) => {
        if (selected) next.add(handle.id);
        else next.delete(handle.id);
      });
      return next;
    });
  }

  function selectReadyHandles() {
    setSelectedHandleIds(new Set(accountHandles.filter((handle) => handle.status === 'ready' && (!supabase || handle.persisted) && !needsOAuthConnection(handle)).map((handle) => handle.id)));
  }

  function selectAllHandles() {
    setSelectedHandleIds(new Set(accountHandles.filter((handle) => !supabase || handle.persisted).map((handle) => handle.id)));
  }

  function clearHandles() {
    setSelectedHandleIds(new Set());
  }

  return (
    <div className="page-stack social-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2>Social Distribution Hub</h2>
        </div>
        <span className={selectedHandles.length > 0 ? 'status-pill success' : 'status-pill warning'}>{selectedHandles.length > 0 ? `${selectedHandles.length} selected` : 'Select handles'}</span>
      </header>

      <section className="source-panel" aria-label="Select source from content or campaign">
        <div>
          <p className="eyebrow">Source</p>
          <h3>Use content or campaign</h3>
        </div>
        <div className="source-grid">
          <label>
            <span>Campaign</span>
            <select value={selectedCampaignId} onChange={(event) => applyCampaign(event.target.value)}>
              <option value="">No campaign selected</option>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </label>
          <label>
            <span>Content Studio item</span>
            <select value={selectedContentItemId} onChange={(event) => applyContentItem(event.target.value)}>
              <option value="">No content selected</option>
              {contentItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          {isAgency ? (
            <BrandDnaSelect
              label="Publish for"
              selfLabel={organization?.name ?? 'Agency brand'}
              clients={clients}
              value={brandSelectionId}
              onChange={setBrandSelectionId}
            />
          ) : null}
          <button type="button" onClick={clearSource}>Clear source</button>
        </div>
      </section>
      <section className="draft-panel" aria-label="Post draft">
        <div>
          <p className="eyebrow">Post draft</p>
          <h3>Publish content</h3>
        </div>

        <div className="draft-form">
          <label>
            <span>Title</span>
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>

          <label>
            <span>Schedule</span>
            <input type="datetime-local" min={localDateTimeInputValue(new Date())} value={draft.scheduledAt} onChange={(event) => setDraft((current) => ({ ...current, scheduledAt: event.target.value }))} />
          </label>
          <label className="draft-body-field">
            <span>Message</span>
            <textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} rows={4} />
          </label>
        </div>

        <div className="media-picker">
          <label className="media-upload-box">
            <FileUp size={24} />
            <strong>{selectedFile ? selectedFile.name : 'Upload media'}</strong>
            <span>{selectedFile ? `${formatBytes(selectedFile.size)} - ${selectedFile.type || 'file'}` : 'Images for posters/posts, videos for reels/shorts/uploads.'}</span>
            <input
              type="file"
              accept={mediaAccept}
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="media-preview" aria-label="Selected media preview">
            {previewUrl ? renderPreview(previewUrl, selectedFile?.type ?? '') : <span>No file selected</span>}
          </div>
        </div>

        <div className="composer-actions">
          <button className="primary-action composer-send" type="button" disabled={selectedHandles.length === 0 || queueing || (Boolean(supabase) && (hasDemoTargets || hasUnlinkedOAuthTargets))} onClick={handleQueueSelected}>
            <Send size={18} />
            <span>{queueing ? (hasFutureSchedule(draft.scheduledAt) ? 'Scheduling' : 'Publishing') : (hasFutureSchedule(draft.scheduledAt) ? 'Schedule post' : 'Publish now')}</span>
          </button>
          <span>{selectedHandles.length === 0 ? 'Select at least one handle before publishing.' : `Ready for ${selectedHandles.length} selected handles.`}</span>
        </div>

        {Boolean(supabase) && hasDemoTargets ? <p className="form-message warning">Only saved handles with real platform IDs can publish.</p> : null}
        {Boolean(supabase) && hasUnlinkedOAuthTargets ? <p className="form-message warning">A selected handle isn&apos;t backed by a real connection yet. Connect that channel on the Connections page before publishing.</p> : null}
        {queueMessage ? <p className="form-message success">{queueMessage}</p> : null}
        {queueError ? <p className="form-message error">{queueError}</p> : null}
      </section>

      <section className="target-toolbar" aria-label="Handle selection shortcuts">
        <button type="button" onClick={selectReadyHandles}>Select ready</button>
        <button type="button" onClick={selectAllHandles}>Select all</button>
        <button type="button" onClick={clearHandles}>Clear selection</button>
      </section>

      <section className="handle-selector" aria-label="Select distribution handles">
        {groupedHandles.map((channel) => {
          const Icon = channel.icon;
          const providerSelected = channel.handles.length > 0 && channel.handles.every((handle) => selectedHandleIds.has(handle.id));
          const providerCount = channel.handles.filter((handle) => selectedHandleIds.has(handle.id)).length;

          return (
            <article className={`handle-group ${channel.accent}`} key={channel.provider}>
              <div className="handle-group__header">
                <div className="channel-title">
                  <span className="channel-icon"><Icon size={21} /></span>
                  <div>
                    <h3>{channel.name}</h3>
                    <p>{channel.mode}</p>
                  </div>
                </div>
                <div className="handle-group__actions">
                  <span>{providerCount}/{channel.handles.length}</span>
                  <button type="button" onClick={() => setProviderSelection(channel.provider, !providerSelected)}>{providerSelected ? 'Clear' : 'All'}</button>
                </div>
              </div>
              <div className="handle-list">
                {channel.handles.length === 0 ? (
                  <p className="handle-list-empty">No handles yet. Add one on the Connections page.</p>
                ) : channel.handles.map((handle) => {
                  const selected = selectedHandleIds.has(handle.id);
                  const CheckIcon = selected ? CheckSquare : Square;
                  const unlinked = needsOAuthConnection(handle);
                  return (
                    <button className={`handle-row handle-row--select ${selected ? 'is-selected' : ''}`} type="button" key={handle.id} onClick={() => toggleHandle(handle.id)} aria-pressed={selected}>
                      <CheckIcon size={19} />
                      <div>
                        <strong>{handle.label}</strong>
                        <span>{handle.detail}{handle.persisted ? ' - saved' : ''}</span>
                      </div>
                      <span className={`handle-status ${unlinked ? 'needs_setup' : handle.status}`}>{unlinked ? 'Connect first' : statusLabel(handle.status)}</span>
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      <section className="distribution-layout">
        <article className="queue-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Runs</p>
              <h3>Publishing history</h3>
            </div>
            <BadgeCheck size={21} />
          </div>
          <div className="selected-preview" aria-label="Selected handles preview">
            {selectedHandles.length === 0 ? <span>No handles selected</span> : selectedHandles.map((handle) => <span key={handle.id}>{handle.label}</span>)}
          </div>
          <div className="queue-list">
            {queueRuns.length === 0 ? (
              <div className="queue-empty"><Clock3 size={22} /><span>No publishing runs yet</span></div>
            ) : queueRuns.map((row) => (
              <div className="queue-row" key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <span>{row.targetCount} targets - {row.targetLabels.slice(0, 3).join(', ')}{row.targetLabels.length > 3 ? '...' : ''}</span>
                </div>
                <div>
                  <span>{statusText(row.status)}</span>
                  <small>{formatDate(row.createdAt)}</small>
                  {row.status === 'published' || row.status === 'partial_failed' ? (
                    <Link className="link-button" to={`/analytics/posts?postId=${row.id}`}>
                      View insights &amp; comments
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="readiness-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live gate</p>
              <h3>Before real sending</h3>
            </div>
            <AlertTriangle size={21} />
          </div>
          <ul>{liveRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
        </article>
      </section>
    </div>
  );
}

async function loadTargetsForPosts(postIds: string[]) {
  const targetsByPost = new Map<string, { target_label: string }[]>();
  if (!supabase || postIds.length === 0) return targetsByPost;

  const { data, error } = await supabase.from('publish_targets').select('social_post_id,target_label').in('social_post_id', postIds);
  if (error) return targetsByPost;

  for (const target of data ?? []) {
    const targets = targetsByPost.get(target.social_post_id) ?? [];
    targets.push({ target_label: target.target_label });
    targetsByPost.set(target.social_post_id, targets);
  }

  return targetsByPost;
}

async function uploadMediaAsset({ orgId, userId, postId, file }: { orgId: string; userId: string; postId: string; file: File }) {
  if (!supabase) throw new Error('Supabase is not configured.');

  const storagePath = `${orgId}/${postId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from('post-media').upload(storagePath, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });

  if (uploadError) throw new Error(errorMessage(uploadError, 'Could not upload media.'));

  const asset: MediaAssetInsert = {
    org_id: orgId,
    social_post_id: postId,
    media_type: file.type.startsWith('video/') ? 'video' : 'image',
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_bucket: 'post-media',
    storage_path: storagePath,
    created_by: userId,
  };

  const { error: assetError } = await supabase.from('social_media_assets').insert(asset);
  if (assetError) throw new Error(errorMessage(assetError, 'Could not save media asset.'));
}

function isMissingSocialPostSourceColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const record = error as Record<string, unknown>;
  const text = [record.message, record.details, record.hint, record.code]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return text.includes('pgrst204')
    && text.includes('social_posts')
    && (text.includes('campaign_id') || text.includes('content_item_id'));
}

function normalizePublishResult(value: unknown): PublishResult {
  if (!value || typeof value !== 'object') return {};
  const result = value as PublishResult;
  return {
    postStatus: isPostStatus(result.postStatus) ? result.postStatus : undefined,
    published: typeof result.published === 'number' ? result.published : undefined,
    failed: typeof result.failed === 'number' ? result.failed : undefined,
    results: Array.isArray(result.results) ? result.results : undefined,
  };
}

function publishResultSummary(result: PublishResult) {
  const failedResults = (result.results ?? []).filter((item) => item.status === 'failed');
  const firstErrors = failedResults
    .slice(0, 3)
    .map((item) => `${item.label ?? item.provider ?? 'Target'}: ${item.error ?? 'failed'}`);
  const detail = firstErrors.length > 0 ? ` ${firstErrors.join(' | ')}` : '';
  return `Published ${result.published ?? 0}, failed ${result.failed ?? failedResults.length}.${detail}`;
}

function isPostStatus(value: unknown): value is PostStatus {
  return value === 'draft'
    || value === 'queued'
    || value === 'publishing'
    || value === 'published'
    || value === 'partial_failed'
    || value === 'failed'
    || value === 'cancelled';
}

function mapPostToQueueRun(post: SocialPostRow, targets: { target_label: string }[]): QueueRun {
  return { id: post.id, title: post.title, targetCount: targets.length, status: post.status, createdAt: post.created_at, targetLabels: targets.map((target) => target.target_label) };
}

function renderPreview(url: string, mimeType: string) {
  if (mimeType.startsWith('video/')) {
    return <video src={url} controls />;
  }
  return <img src={url} alt="Selected media preview" />;
}

function sanitizeFileName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
}

function statusText(status: QueueRun['status']) {
  if (status === 'local') return 'Local preview';
  return status.replace('_', ' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function parseScheduledAt(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasFutureSchedule(value: string) {
  const date = parseScheduledAt(value);
  return Boolean(date && date.getTime() > Date.now());
}

function localDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
