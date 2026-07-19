import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';
import {
  channelName,
  channels,
  connectionActionText,
  connectionBadgeClass,
  connectionHelperText,
  connectionStatusText,
  createLocalHandle,
  edgeFunctionErrorMessage,
  errorMessage,
  getAuthUrl,
  mapRowToHandle,
  normalizeConnectionsResponse,
  providerMeta,
  statusLabel,
  type ConnectionStatus,
  type Handle,
  type HandleStatus,
  type Provider,
} from '../social-hub/shared';
import { ReportingSourcesPanel } from '../analytics/ReportingSourcesPanel';

type DistributionHandleRow = Database['public']['Tables']['distribution_handles']['Row'];

type AddHandleForm = {
  provider: Provider;
  label: string;
  externalId: string;
  status: HandleStatus;
};

type DiscoveryResponse = {
  imported?: number;
  message?: string;
};

const discoverableProviders = new Set<Provider>(['facebook', 'instagram', 'linkedin', 'youtube', 'slack', 'whatsapp']);

export function ConnectionsPage() {
  const { organization, user, membership } = useAuth();
  const canManageConnections = membership?.role === 'owner' || membership?.role === 'admin';
  const [accountHandles, setAccountHandles] = useState<Handle[]>([]);
  const [form, setForm] = useState<AddHandleForm>({ provider: 'facebook', label: '', externalId: '', status: 'ready' });
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [connectingProvider, setConnectingProvider] = useState<Provider | null>(null);
  const [discoveringProvider, setDiscoveringProvider] = useState<Provider | null>(null);
  const [formMessage, setFormMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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

      if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-connections-status'));
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

      setAccountHandles((data ?? []).map(mapRowToHandle));
    }

    loadHandles();
    loadConnectionStatus();

    return () => {
      active = false;
    };
  }, [organization?.id]);

  const connectionByProvider = useMemo(
    () => new Map(connections.map((connection) => [connection.provider, connection])),
    [connections],
  );

  function needsOAuthConnection(handle: Handle) {
    const connection = connectionByProvider.get(handle.provider);
    return connection?.authMode === 'oauth' && connection.status !== 'connected';
  }

  const liveHandleCount = accountHandles.filter((handle) => handle.persisted).length;

  const groupedHandles = useMemo(
    () => channels.map((channel) => ({ ...channel, handles: accountHandles.filter((handle) => handle.provider === channel.provider) })),
    [accountHandles],
  );

  async function handleConnectProvider(provider: Provider) {
    setConnectionMessage('');
    if (!canManageConnections) {
      setConnectionError('Ask a workspace owner or admin to manage connections.');
      return;
    }
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
      setConnectionMessage(`${channelName(provider)} is configured by server token. Add the destination handle below.`);
      return;
    }

    setConnectingProvider(provider);

    try {
      const { data, error } = await supabase.functions.invoke('social-auth-start', {
        body: {
          provider,
          orgId: organization.id,
          returnTo: '/connections',
        },
      });

      if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-auth-start'));
      const authUrl = getAuthUrl(data);
      if (!authUrl) throw new Error('Connection URL was not returned.');
      window.location.assign(authUrl);
    } catch (error) {
      setConnectionError(errorMessage(error, `Could not connect ${channelName(provider)}.`));
      setConnectingProvider(null);
    }
  }

  function canDiscoverProvider(provider: Provider, connection: ConnectionStatus | undefined) {
    if (!discoverableProviders.has(provider) || !connection?.secretsConfigured) return false;
    if (connection.status === 'connected') return true;
    if (connection.authMode === 'server_token') return true;
    if (provider === 'instagram') return connectionByProvider.get('facebook')?.status === 'connected';
    return false;
  }

  async function handleDiscoverProvider(provider: Provider) {
    setConnectionMessage('');
    setConnectionError('');

    if (!canManageConnections) {
      setConnectionError('Ask a workspace owner or admin to discover handles.');
      return;
    }

    if (!supabase || !organization?.id) {
      setConnectionError('Connect Supabase before discovering handles.');
      return;
    }

    setDiscoveringProvider(provider);
    try {
      const { data, error } = await supabase.functions.invoke('social-discover-handles', {
        body: { orgId: organization.id, provider },
      });
      if (error) throw new Error(await edgeFunctionErrorMessage(error, 'social-discover-handles'));
      const result = normalizeDiscoveryResponse(data);
      setConnectionMessage(result.message || `${result.imported ?? 0} handle${result.imported === 1 ? '' : 's'} imported.`);
      await reloadHandlesAndStatus();
    } catch (error) {
      setConnectionError(errorMessage(error, `Could not discover ${channelName(provider)} handles.`));
    } finally {
      setDiscoveringProvider(null);
    }
  }

  async function reloadHandlesAndStatus() {
    if (!supabase || !organization?.id) return;
    const { data, error } = await supabase
      .from('distribution_handles')
      .select('*')
      .eq('org_id', organization.id)
      .eq('is_enabled', true)
      .order('created_at', { ascending: false });

    if (error) setFormError(errorMessage(error, 'Could not reload saved handles.'));
    else setAccountHandles((data ?? []).map(mapRowToHandle));

    await loadConnectionStatus();
  }

  async function handleAddHandle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage('');
    if (!canManageConnections) {
      setFormError('Ask a workspace owner or admin to add handles.');
      return;
    }
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

        if (error) throw new Error(await edgeFunctionErrorMessage(error, 'add-handle'));

        nextHandle = mapRowToHandle(data as DistributionHandleRow);
        setFormMessage('Handle added to this workspace.');
      } else {
        nextHandle = createLocalHandle(form.provider, label, externalId, form.status);
        setFormMessage('Handle added locally. Connect Supabase to save it to the workspace.');
      }

      setAccountHandles((current) => [nextHandle, ...current]);
      setForm({ provider: form.provider, label: '', externalId: '', status: 'ready' });
      loadConnectionStatus();
    } catch (error) {
      setFormError(errorMessage(error, 'Could not add handle.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHandle(handle: Handle) {
    if (!canManageConnections) {
      setFormError('Ask a workspace owner or admin to remove handles.');
      return;
    }
    if (!window.confirm(`Remove "${handle.label}"? This can't be undone.`)) return;

    setFormMessage('');
    setFormError('');

    if (supabase && handle.persisted) {
      const { error } = await supabase.from('distribution_handles').delete().eq('id', handle.id);
      if (error) {
        setFormError(errorMessage(error, 'Could not remove handle.'));
        return;
      }
    }

    setAccountHandles((current) => current.filter((item) => item.id !== handle.id));
    setFormMessage('Handle removed.');
  }

  return (
    <div className="page-stack social-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Distribution</p>
          <h2>Connections</h2>
        </div>
        <span className={liveHandleCount > 0 ? 'status-pill success' : 'status-pill warning'}>{liveHandleCount > 0 ? 'Live handles' : 'Setup needed'}</span>
      </header>

      <section className="connections-panel" aria-label="Connect publishing channels">
        <div className="section-heading connections-heading">
          <div>
            <p className="eyebrow">Connections</p>
            <h3>Accounts</h3>
            <p className="section-description">Use these for publishing. Connect a platform account, then discover handles to import available pages, channels, or destinations automatically.</p>
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
            const discovering = discoveringProvider === channel.provider;
            const discoveryAvailable = canDiscoverProvider(channel.provider, connection);

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
                  <div className="connection-card__actions">
                    <button type="button" onClick={() => handleConnectProvider(channel.provider)} disabled={!canManageConnections || connecting || connectionsLoading || discovering} title={!canManageConnections ? 'Only workspace owners and admins can manage connections' : undefined}>
                      {connecting ? 'Connecting' : connectionActionText(connection)}
                    </button>
                    <button type="button" onClick={() => handleDiscoverProvider(channel.provider)} disabled={!canManageConnections || !discoveryAvailable || discovering || connecting || connectionsLoading} title={!discoveryAvailable ? 'Connect this provider first, then discover handles' : undefined}>
                      {discovering ? 'Discovering' : 'Discover handles'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {connectionMessage ? <p className="form-message success">{connectionMessage}</p> : null}
        {connectionError ? <p className="form-message error">{connectionError}</p> : null}
      </section>

      <ReportingSourcesPanel
        eyebrow="Reporting"
        title="Marketing data sources"
        description="Connect reporting sources like Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, YouTube, and Shopify so Analytics can query them in one place."
      />

      <section className="add-handle-panel" aria-label="Add handle to account">
        <div>
          <p className="eyebrow">Account handles</p>
          <h3>Add manual handle</h3>
        </div>
        {!canManageConnections ? <p className="form-message warning">You can view saved handles. Ask a workspace owner or admin to make connection changes.</p> : null}
        <form className="add-handle-form" onSubmit={handleAddHandle}>
          <label>
            <span>Platform</span>
            <select value={form.provider} disabled={!canManageConnections} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as Provider }))}>
              {channels.map((channel) => <option key={channel.provider} value={channel.provider}>{channel.name}</option>)}
            </select>
          </label>
          <label>
            <span>Handle name</span>
            <input value={form.label} disabled={!canManageConnections} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Example: Brand Main Page" />
          </label>
          <label>
            <span>{providerMeta[form.provider].externalLabel}</span>
            <input value={form.externalId} disabled={!canManageConnections} onChange={(event) => setForm((current) => ({ ...current, externalId: event.target.value }))} placeholder={providerHandlePlaceholder(form.provider)} />
          </label>
          <label>
            <span>Status</span>
            <select value={form.status} disabled={!canManageConnections} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as HandleStatus }))}>
              <option value="ready">Ready</option>
              <option value="review">Review</option>
              <option value="needs_setup">Needs setup</option>
            </select>
          </label>
          <button className="primary-action add-handle-submit" type="submit" disabled={!canManageConnections || saving}>
            <Plus size={18} />
            <span>{saving ? 'Adding' : 'Add handle'}</span>
          </button>
        </form>
        {formMessage ? <p className="form-message success">{formMessage}</p> : null}
        {formError ? <p className="form-message error">{formError}</p> : null}
      </section>

      <section className="handle-selector" aria-label="Saved distribution handles">
        {groupedHandles.map((channel) => {
          const Icon = channel.icon;

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
                  <span>{channel.handles.length} saved</span>
                </div>
              </div>
              <div className="handle-list">
                {channel.handles.length === 0 ? (
                  <p className="handle-list-empty">No handles yet for this channel.</p>
                ) : channel.handles.map((handle) => {
                  const unlinked = needsOAuthConnection(handle);
                  return (
                    <div className="handle-row" key={handle.id}>
                      <div className="handle-row__info">
                        <div>
                          <strong>{handle.label}</strong>
                          <span>{handle.detail}{handle.persisted ? ' - saved' : ''}</span>
                        </div>
                        <span className={`handle-status ${unlinked ? 'needs_setup' : handle.status}`}>{unlinked ? 'Connect first' : statusLabel(handle.status)}</span>
                      </div>
                      {canManageConnections ? (
                        <button type="button" className="icon-button" aria-label={'Remove ' + handle.label} onClick={() => handleDeleteHandle(handle)}>
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
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

function normalizeDiscoveryResponse(value: unknown): DiscoveryResponse {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    imported: typeof record.imported === 'number' ? record.imported : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}
