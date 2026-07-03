import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckSquare,
  Clock3,
  FileUp,
  Image,
  Megaphone,
  MessageCircle,
  PlaySquare,
  Plus,
  RefreshCw,
  Send,
  Share2,
  Smartphone,
  Square,
  Video,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';

type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'google_ads' | 'whatsapp' | 'slack' | 'telegram';
type HandleType = 'facebook_page' | 'instagram_business' | 'linkedin_page' | 'youtube_channel' | 'google_ads_customer' | 'whatsapp_phone_number' | 'slack_channel' | 'telegram_channel';
type HandleStatus = 'ready' | 'review' | 'needs_setup';
type ContentType = 'post' | 'poster' | 'video';
type PostStatus = 'draft' | 'queued' | 'publishing' | 'published' | 'partial_failed' | 'failed' | 'cancelled';
type DistributionHandleRow = Database['public']['Tables']['distribution_handles']['Row'];
type SocialPostRow = Database['public']['Tables']['social_posts']['Row'];
type PublishTargetInsert = Database['public']['Tables']['publish_targets']['Insert'];
type MediaAssetInsert = Database['public']['Tables']['social_media_assets']['Insert'];
type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type ContentItemRow = Database['public']['Tables']['content_items']['Row'];

type Channel = {
  provider: Provider;
  name: string;
  status: string;
  mode: string;
  accent: string;
  icon: typeof Share2;
};

type Handle = {
  id: string;
  provider: Provider;
  label: string;
  detail: string;
  type: string;
  status: HandleStatus;
  persisted: boolean;
};

type AddHandleForm = {
  provider: Provider;
  label: string;
  externalId: string;
  status: HandleStatus;
};

type DraftForm = {
  contentType: ContentType;
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

type ConnectionStatus = {
  provider: Provider;
  status: 'connected' | 'ready_to_connect' | 'needs_setup';
  authMode: 'oauth' | 'server_token' | 'ads_setup';
  connectable: boolean;
  secretsConfigured: boolean;
  handleCount: number;
  displayName: string | null;
  tokenStatus: string | null;
  lastSyncAt: string | null;
};

type ConnectionsResponse = {
  connections?: ConnectionStatus[];
};

const providerMeta: Record<Provider, { handleType: HandleType; type: string; detail: string; externalLabel: string }> = {
  facebook: { handleType: 'facebook_page', type: 'Page', detail: 'Facebook Page', externalLabel: 'Facebook Page ID' },
  instagram: { handleType: 'instagram_business', type: 'IG', detail: 'Instagram Business', externalLabel: 'Instagram Business Account ID' },
  linkedin: { handleType: 'linkedin_page', type: 'LI', detail: 'LinkedIn Page', externalLabel: 'LinkedIn Page ID' },
  youtube: { handleType: 'youtube_channel', type: 'YT', detail: 'YouTube Channel', externalLabel: 'YouTube Channel ID' },
  google_ads: { handleType: 'google_ads_customer', type: 'Ads', detail: 'Google Ads Customer', externalLabel: 'Google Ads Customer ID' },
  whatsapp: { handleType: 'whatsapp_phone_number', type: 'WA', detail: 'WhatsApp recipient', externalLabel: 'Recipient phone number' },
  slack: { handleType: 'slack_channel', type: 'Slack', detail: 'Slack Channel', externalLabel: 'Slack Channel ID' },
  telegram: { handleType: 'telegram_channel', type: 'TG', detail: 'Telegram Channel', externalLabel: 'Telegram Channel ID' },
};

const contentTypes: Array<{ value: ContentType; label: string; icon: typeof FileUp; accept: string }> = [
  { value: 'post', label: 'Post', icon: FileUp, accept: 'image/*,video/*' },
  { value: 'poster', label: 'Poster', icon: Image, accept: 'image/png,image/jpeg,image/webp,image/gif' },
  { value: 'video', label: 'Video', icon: Video, accept: 'video/mp4,video/webm,video/quicktime' },
];

const channels: Channel[] = [
  { provider: 'facebook', name: 'Facebook Pages', status: 'OAuth required', mode: 'Feed posts, reels later', accent: 'blue', icon: Share2 },
  { provider: 'instagram', name: 'Instagram Business', status: 'App review required', mode: 'Reels, images, carousels', accent: 'pink', icon: Smartphone },
  { provider: 'linkedin', name: 'LinkedIn Pages', status: 'OAuth required', mode: 'Company and brand posts', accent: 'neutral', icon: Share2 },
  { provider: 'youtube', name: 'YouTube Channels', status: 'Upload audit needed', mode: 'Videos and Shorts', accent: 'red', icon: PlaySquare },
  { provider: 'google_ads', name: 'Google Ads', status: 'Developer token required', mode: 'Campaign builder required', accent: 'green', icon: Megaphone },
  { provider: 'whatsapp', name: 'WhatsApp Business', status: 'Template rules apply', mode: 'Opt-in messages', accent: 'teal', icon: MessageCircle },
  { provider: 'slack', name: 'Slack Channels', status: 'Bot token required', mode: 'Workspace channels', accent: 'neutral', icon: MessageCircle },
  { provider: 'telegram', name: 'Telegram Channels', status: 'Bot token required', mode: 'Channel messages', accent: 'neutral', icon: Send },
];

const seedHandles: Handle[] = [
  { id: 'seed-fb-main', provider: 'facebook', label: 'Ad96 Main Page', detail: 'Facebook Page', type: 'Page', status: 'ready', persisted: false },
  { id: 'seed-fb-local', provider: 'facebook', label: 'Local Offers Page', detail: 'Facebook Page', type: 'Page', status: 'ready', persisted: false },
  { id: 'seed-fb-growth', provider: 'facebook', label: 'Growth Tips Page', detail: 'Facebook Page', type: 'Page', status: 'review', persisted: false },
  { id: 'seed-ig-main', provider: 'instagram', label: '@ad96growth', detail: 'Instagram Business', type: 'IG', status: 'ready', persisted: false },
  { id: 'seed-ig-reels', provider: 'instagram', label: '@ad96reels', detail: 'Instagram Business', type: 'IG', status: 'ready', persisted: false },
  { id: 'seed-ig-offers', provider: 'instagram', label: '@localofferhub', detail: 'Instagram Business', type: 'IG', status: 'needs_setup', persisted: false },
  { id: 'seed-li-main', provider: 'linkedin', label: 'Ad96 Company Page', detail: 'LinkedIn Page', type: 'LI', status: 'ready', persisted: false },
  { id: 'seed-li-founder', provider: 'linkedin', label: 'Founder Updates', detail: 'LinkedIn Page', type: 'LI', status: 'review', persisted: false },
  { id: 'seed-yt-main', provider: 'youtube', label: 'Ad96 Marketing', detail: 'YouTube Channel', type: 'YT', status: 'ready', persisted: false },
  { id: 'seed-yt-shorts', provider: 'youtube', label: 'Ad96 Shorts', detail: 'YouTube Channel', type: 'YT', status: 'review', persisted: false },
  { id: 'seed-ads-main', provider: 'google_ads', label: 'Ad96 Ads Account', detail: 'Customer ID ending 2194', type: 'Ads', status: 'ready', persisted: false },
  { id: 'seed-ads-local', provider: 'google_ads', label: 'Local Campaigns MCC', detail: 'Manager account', type: 'Ads', status: 'needs_setup', persisted: false },
  { id: 'seed-wa-main', provider: 'whatsapp', label: 'Ad96 Support Number', detail: 'WhatsApp Business', type: 'WA', status: 'ready', persisted: false },
  { id: 'seed-wa-sales', provider: 'whatsapp', label: 'Sales Broadcast Number', detail: 'WhatsApp Business', type: 'WA', status: 'review', persisted: false },
  { id: 'seed-slack-growth', provider: 'slack', label: '#growth-updates', detail: 'Slack Channel', type: 'Slack', status: 'ready', persisted: false },
  { id: 'seed-slack-sales', provider: 'slack', label: '#sales-alerts', detail: 'Slack Channel', type: 'Slack', status: 'review', persisted: false },
  { id: 'seed-tg-main', provider: 'telegram', label: 'Ad96 Telegram Channel', detail: 'Telegram Channel', type: 'TG', status: 'ready', persisted: false },
  { id: 'seed-tg-offers', provider: 'telegram', label: 'Offer Broadcast Channel', detail: 'Telegram Channel', type: 'TG', status: 'needs_setup', persisted: false },
];

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
  const [form, setForm] = useState<AddHandleForm>({ provider: 'facebook', label: '', externalId: '', status: 'ready' });
  const [draft, setDraft] = useState<DraftForm>({
    contentType: 'post',
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
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [connectingProvider, setConnectingProvider] = useState<Provider | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedContentItemId, setSelectedContentItemId] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [queueMessage, setQueueMessage] = useState('');
  const [queueError, setQueueError] = useState('');
  const [saving, setSaving] = useState(false);
  const [queueing, setQueueing] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  async function loadConnectionStatus() {
    if (!supabase || !organization?.id) {
      setConnections([]);
      return;
    }

    setConnectionsLoading(true);
    setConnectionError('');

    try {
      const { data, error } = await supabase.functions.invoke('social-connections-status', {
        body: { orgId: organization.id },
      });

      if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-publish'));
      setConnections(normalizeConnectionsResponse(data).connections ?? []);
    } catch (error) {
      setConnectionError(errorMessage(error, 'Could not load connection status.'));
    } finally {
      setConnectionsLoading(false);
    }
  }
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
        setFormError(errorMessage(error, 'Run the social distribution migration before loading saved handles.'));
        return;
      }

      const savedHandles = (data ?? []).map(mapRowToHandle);
      setAccountHandles(savedHandles);
      setSelectedHandleIds(new Set(savedHandles.filter((handle) => handle.status === 'ready').map((handle) => handle.id)));
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
    loadSources();
    loadQueueRuns();
    loadConnectionStatus();

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
  const liveHandleCount = accountHandles.filter((handle) => handle.persisted).length;

  const connectionByProvider = useMemo(
    () => new Map(connections.map((connection) => [connection.provider, connection])),
    [connections],
  );

  const groupedHandles = useMemo(
    () => channels.map((channel) => ({ ...channel, handles: accountHandles.filter((handle) => handle.provider === channel.provider) })),
    [accountHandles],
  );

  const activeContentType = contentTypes.find((item) => item.value === draft.contentType) ?? contentTypes[0];

  function applyContentItem(contentItemId: string) {
    setSelectedContentItemId(contentItemId);
    const contentItem = contentItems.find((item) => item.id === contentItemId);
    if (!contentItem) return;

    setSelectedCampaignId(contentItem.campaign_id ?? '');
    setDraft((current) => ({
      ...current,
      contentType: contentItem.content_type,
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

    setDraft((current) => ({
      ...current,
      title: campaign.name,
      body: campaign.objective ?? current.body,
    }));
  }

  function clearSource() {
    setSelectedCampaignId('');
    setSelectedContentItemId('');
  }

  async function handleConnectProvider(provider: Provider) {
    setConnectionMessage('');
    setConnectionError('');

    const status = connectionByProvider.get(provider);
    if (!supabase || !organization?.id) {
      setConnectionError('Connect Supabase before adding live channels.');
      return;
    }

    if (!status?.secretsConfigured) {
      setConnectionError(`${channelName(provider)} needs server setup before users can connect it.`);
      return;
    }

    if (!status.connectable) {
      setForm((current) => ({ ...current, provider }));
      setConnectionMessage(`${channelName(provider)} is configured by server token. Add the destination handle below, then publish.`);
      return;
    }

    setConnectingProvider(provider);

    try {
      const { data, error } = await supabase.functions.invoke('social-auth-start', {
        body: {
          provider,
          orgId: organization.id,
          returnTo: `${window.location.origin}/social`,
        },
      });

      if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-publish'));
      const authUrl = getAuthUrl(data);
      if (!authUrl) throw new Error('Connection URL was not returned.');
      window.location.assign(authUrl);
    } catch (error) {
      setConnectionError(errorMessage(error, `Could not connect ${channelName(provider)}.`));
      setConnectingProvider(null);
    }
  }
  async function handleAddHandle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage('');
    setFormError('');

    const label = form.label.trim();
    const externalId = form.externalId.trim();
    if (!label) {
      setFormError('Enter a handle name.');
      return;
    }

    const meta = providerMeta[form.provider];
    setSaving(true);

    try {
      let nextHandle: Handle;

      if (supabase && organization?.id && user?.id) {
        const { data, error } = await supabase
          .from('distribution_handles')
          .insert({
            org_id: organization.id,
            provider: form.provider,
            handle_type: meta.handleType,
            display_name: label,
            external_handle_id: externalId || null,
            metadata: { ui_status: form.status, source: 'manual' } satisfies Json,
            created_by: user.id,
          })
          .select('*')
          .single();

        if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-publish'));

        nextHandle = mapRowToHandle(data);
        setFormMessage('Handle added to this workspace.');
      } else {
        nextHandle = createLocalHandle(form.provider, label, externalId, form.status);
        setFormMessage('Handle added locally. Connect Supabase to save it to the workspace.');
      }

      setAccountHandles((current) => [nextHandle, ...current]);
      setSelectedHandleIds((current) => new Set(current).add(nextHandle.id));
      setForm({ provider: form.provider, label: '', externalId: '', status: 'ready' });
      loadConnectionStatus();
    } catch (error) {
      setFormError(errorMessage(error, 'Could not add handle.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleQueueSelected() {
    setQueueMessage('');
    setQueueError('');

    const title = draft.title.trim();
    const body = draft.body.trim();
    const mediaUrl = draft.mediaUrl.trim();

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
          content_type: draft.contentType,
          campaign_id: sourceCampaignId,
          content_item_id: sourceContentItemId,
          scheduled_at: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
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
            content_type: draft.contentType,
            scheduled_at: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
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
            contentType: draft.contentType,
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

        const publishResult = await publishPostNow(post.id);
        const nextStatus = publishResult.postStatus ?? 'queued';
        setQueueRuns((current) => [mapPostToQueueRun({ ...post, status: nextStatus }, targets ?? []), ...current]);

        const sourceNote = sourceLinkSkipped ? ' Source link skipped until the database migration is applied.' : '';
        if ((publishResult.failed ?? 0) > 0) {
          setQueueError(`${publishResultSummary(publishResult)}${sourceNote}`);
        } else {
          setQueueMessage(`Published "${title}" to ${publishResult.published ?? selectedHandles.length} selected handles.${sourceNote}`);
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
    setSelectedHandleIds(new Set(accountHandles.filter((handle) => handle.status === 'ready' && (!supabase || handle.persisted)).map((handle) => handle.id)));
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
          <h2>Social Hub</h2>
        </div>
        <span className={liveHandleCount > 0 ? 'status-pill success' : 'status-pill warning'}>{liveHandleCount > 0 ? 'Live handles' : 'Setup needed'}</span>
      </header>

      <section className="connections-panel" aria-label="Connect publishing channels">
        <div className="section-heading connections-heading">
          <div>
            <p className="eyebrow">Connections</p>
            <h3>Accounts</h3>
          </div>
          <button type="button" className="icon-text-button" onClick={loadConnectionStatus} disabled={connectionsLoading}>
            <RefreshCw size={16} className={connectionsLoading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="connections-grid">
          {channels.map((channel) => {
            const connection = connectionByProvider.get(channel.provider);
            const Icon = channel.icon;
            const connected = connection?.status === 'connected';
            const connecting = connectingProvider === channel.provider;

            return (
              <article className={`connection-card ${connected ? 'is-connected' : ''}`} key={channel.provider}>
                <div className="connection-card__top">
                  <span className="channel-icon"><Icon size={20} /></span>
                  <span className={`connection-status ${connectionBadgeClass(connection)}`}>{connectionStatusText(connection)}</span>
                </div>
                <div>
                  <h4>{channel.name}</h4>
                  <p>{connectionHelperText(connection, channel.provider)}</p>
                </div>
                <div className="connection-card__bottom">
                  <span>{connection?.handleCount ?? accountHandles.filter((handle) => handle.provider === channel.provider && handle.persisted).length} handles</span>
                  <button type="button" onClick={() => handleConnectProvider(channel.provider)} disabled={connecting || connectionsLoading}>
                    {connecting ? 'Connecting' : connectionActionText(connection)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {connectionMessage ? <p className="form-message success">{connectionMessage}</p> : null}
        {connectionError ? <p className="form-message error">{connectionError}</p> : null}
      </section>

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
          <button type="button" onClick={clearSource}>Clear source</button>
        </div>
      </section>
      <section className="draft-panel" aria-label="Post draft">
        <div>
          <p className="eyebrow">Post draft</p>
          <h3>Publish content</h3>
        </div>

        <div className="content-type-control" role="radiogroup" aria-label="Content type">
          {contentTypes.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                className={draft.contentType === item.value ? 'is-active' : ''}
                onClick={() => {
                  setDraft((current) => ({ ...current, contentType: item.value }));
                  setSelectedFile(null);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="draft-form">
          <label>
            <span>Title</span>
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>

          <label>
            <span>Schedule</span>
            <input type="datetime-local" value={draft.scheduledAt} onChange={(event) => setDraft((current) => ({ ...current, scheduledAt: event.target.value }))} />
          </label>
          <label className="draft-body-field">
            <span>Message</span>
            <textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} rows={4} />
          </label>
        </div>

        <div className="media-picker">
          <label className="media-upload-box">
            <FileUp size={24} />
            <strong>{selectedFile ? selectedFile.name : `Upload ${activeContentType.label.toLowerCase()} media`}</strong>
            <span>{selectedFile ? `${formatBytes(selectedFile.size)} - ${selectedFile.type || 'file'}` : 'Images for posters/posts, videos for reels/shorts/uploads.'}</span>
            <input
              type="file"
              accept={activeContentType.accept}
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="media-preview" aria-label="Selected media preview">
            {previewUrl ? renderPreview(previewUrl, selectedFile?.type ?? '') : <span>No file selected</span>}
          </div>
        </div>

        <div className="composer-actions">
          <button className="primary-action composer-send" type="button" disabled={selectedHandles.length === 0 || queueing || (Boolean(supabase) && hasDemoTargets)} onClick={handleQueueSelected}>
            <Send size={18} />
            <span>{queueing ? 'Publishing' : 'Publish now'}</span>
          </button>
          <span>{selectedHandles.length === 0 ? 'Select at least one handle before publishing.' : `Ready for ${selectedHandles.length} selected handles.`}</span>
        </div>

        {Boolean(supabase) && hasDemoTargets ? <p className="form-message warning">Only saved handles with real platform IDs can publish.</p> : null}
        {queueMessage ? <p className="form-message success">{queueMessage}</p> : null}
        {queueError ? <p className="form-message error">{queueError}</p> : null}
      </section>

      <section className="add-handle-panel" aria-label="Add handle to account">
        <div>
          <p className="eyebrow">Account handles</p>
          <h3>Add manual handle</h3>
        </div>
        <form className="add-handle-form" onSubmit={handleAddHandle}>
          <label>
            <span>Platform</span>
            <select value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as Provider }))}>
              {channels.map((channel) => <option key={channel.provider} value={channel.provider}>{channel.name}</option>)}
            </select>
          </label>
          <label>
            <span>Handle name</span>
            <input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Example: Brand Main Page" />
          </label>
          <label>
            <span>{providerMeta[form.provider].externalLabel}</span>
            <input value={form.externalId} onChange={(event) => setForm((current) => ({ ...current, externalId: event.target.value }))} placeholder={providerHandlePlaceholder(form.provider)} />
          </label>
          <label>
            <span>Status</span>
            <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as HandleStatus }))}>
              <option value="ready">Ready</option>
              <option value="review">Review</option>
              <option value="needs_setup">Needs setup</option>
            </select>
          </label>
          <button className="primary-action add-handle-submit" type="submit" disabled={saving}>
            <Plus size={18} />
            <span>{saving ? 'Adding' : 'Add handle'}</span>
          </button>
        </form>
        {formMessage ? <p className="form-message success">{formMessage}</p> : null}
        {formError ? <p className="form-message error">{formError}</p> : null}
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
                {channel.handles.map((handle) => {
                  const selected = selectedHandleIds.has(handle.id);
                  const CheckIcon = selected ? CheckSquare : Square;
                  return (
                    <button className={`handle-row ${selected ? 'is-selected' : ''}`} type="button" key={handle.id} onClick={() => toggleHandle(handle.id)} aria-pressed={selected}>
                      <CheckIcon size={19} />
                      <div>
                        <strong>{handle.label}</strong>
                        <span>{handle.detail}{handle.persisted ? ' - saved' : ''}</span>
                      </div>
                      <span className={`handle-status ${handle.status}`}>{statusLabel(handle.status)}</span>
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

async function uploadMediaAsset({ orgId, userId, postId, contentType, file }: { orgId: string; userId: string; postId: string; contentType: ContentType; file: File }) {
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
    media_type: file.type.startsWith('video/') ? 'video' : contentType === 'poster' ? 'poster' : 'image',
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

async function edgeFunctionErrorMessage(error: unknown, functionName: string) {
  const response = edgeFunctionResponse(error);
  if (response) {
    const detail = await response.clone().json().then((body) => {
      if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
      if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
      return '';
    }).catch(() => response.clone().text().catch(() => ''));

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
function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) return parts.join(' ');
  }

  return fallback;
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
function normalizeConnectionsResponse(value: unknown): ConnectionsResponse {
  if (!value || typeof value !== 'object') return {};
  const record = value as ConnectionsResponse;
  return { connections: Array.isArray(record.connections) ? record.connections.filter(isConnectionStatus) : [] };
}

function isConnectionStatus(value: unknown): value is ConnectionStatus {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return isProvider(record.provider)
    && (record.status === 'connected' || record.status === 'ready_to_connect' || record.status === 'needs_setup')
    && (record.authMode === 'oauth' || record.authMode === 'server_token' || record.authMode === 'ads_setup')
    && typeof record.connectable === 'boolean'
    && typeof record.secretsConfigured === 'boolean'
    && typeof record.handleCount === 'number';
}

function isProvider(value: unknown): value is Provider {
  return value === 'facebook'
    || value === 'instagram'
    || value === 'linkedin'
    || value === 'youtube'
    || value === 'google_ads'
    || value === 'whatsapp'
    || value === 'slack'
    || value === 'telegram';
}

function getAuthUrl(value: unknown) {
  if (value && typeof value === 'object') {
    const authUrl = (value as Record<string, unknown>).authUrl;
    if (typeof authUrl === 'string' && authUrl.startsWith('http')) return authUrl;
  }
  return '';
}

function channelName(provider: Provider) {
  return channels.find((channel) => channel.provider === provider)?.name ?? provider;
}

function connectionStatusText(connection?: ConnectionStatus) {
  if (!connection) return 'Unknown';
  if (connection.status === 'connected') return 'Connected';
  if (connection.status === 'ready_to_connect') return 'Ready';
  return 'Setup';
}

function connectionBadgeClass(connection?: ConnectionStatus) {
  if (!connection) return 'needs_setup';
  if (connection.status === 'connected') return 'ready';
  if (connection.status === 'ready_to_connect') return 'review';
  return 'needs_setup';
}

function connectionActionText(connection?: ConnectionStatus) {
  if (!connection) return 'Check';
  if (!connection.secretsConfigured) return 'Setup';
  if (connection.authMode === 'server_token') return 'Add handle';
  if (connection.authMode === 'ads_setup') return 'Ads setup';
  return connection.status === 'connected' ? 'Reconnect' : 'Connect';
}

function connectionHelperText(connection: ConnectionStatus | undefined, provider: Provider) {
  if (!connection) return 'Status not loaded';
  if (!connection.secretsConfigured) return 'Server setup required';
  if (connection.status === 'connected') return connection.displayName ?? 'Ready to publish';
  if (connection.authMode === 'server_token') return 'Server token ready';
  if (provider === 'google_ads') return 'Use Ads campaign flow';
  return 'Connect account';
}

function providerHandlePlaceholder(provider: Provider) {
  const placeholders: Record<Provider, string> = {
    facebook: 'Facebook Page ID',
    instagram: 'Instagram Business Account ID',
    linkedin: 'LinkedIn organization URN or ID',
    youtube: 'YouTube Channel ID',
    google_ads: 'Google Ads Customer ID',
    whatsapp: 'Recipient phone number with country code',
    slack: 'Slack channel ID, e.g. C0123ABC',
    telegram: 'Telegram chat/channel ID',
  };
  return placeholders[provider];
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
function mapRowToHandle(row: DistributionHandleRow): Handle {
  const meta = providerMeta[row.provider];
  const uiStatus = getMetadataStatus(row.metadata);
  return {
    id: row.id,
    provider: row.provider,
    label: row.display_name,
    detail: row.external_handle_id ? `${meta.detail} - ${row.external_handle_id}` : meta.detail,
    type: meta.type,
    status: uiStatus,
    persisted: true,
  };
}

function mapPostToQueueRun(post: SocialPostRow, targets: { target_label: string }[]): QueueRun {
  return { id: post.id, title: post.title, targetCount: targets.length, status: post.status, createdAt: post.created_at, targetLabels: targets.map((target) => target.target_label) };
}

function createLocalHandle(provider: Provider, label: string, externalId: string, status: HandleStatus): Handle {
  const meta = providerMeta[provider];
  return { id: `local-${Date.now()}`, provider, label, detail: externalId ? `${meta.detail} - ${externalId}` : meta.detail, type: meta.type, status, persisted: false };
}

function getMetadataStatus(metadata: Json): HandleStatus {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = metadata.ui_status;
    if (value === 'ready' || value === 'review' || value === 'needs_setup') return value;
  }
  return 'ready';
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

function statusLabel(status: HandleStatus) {
  if (status === 'ready') return 'Ready';
  if (status === 'review') return 'Review';
  return 'Setup';
}

function statusText(status: QueueRun['status']) {
  if (status === 'local') return 'Local preview';
  return status.replace('_', ' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}