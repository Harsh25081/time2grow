import { Megaphone, MessageCircle, PlaySquare, Send, Share2, Smartphone } from 'lucide-react';
import type { Database, Json } from '../../types/database';

export type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'google_ads' | 'whatsapp' | 'slack' | 'telegram';
export type HandleType = 'facebook_page' | 'instagram_business' | 'linkedin_page' | 'youtube_channel' | 'google_ads_customer' | 'whatsapp_phone_number' | 'slack_channel' | 'telegram_channel';
export type HandleStatus = 'ready' | 'review' | 'needs_setup';
export type DistributionHandleRow = Database['public']['Tables']['distribution_handles']['Row'];

export type Channel = {
  provider: Provider;
  name: string;
  status: string;
  mode: string;
  accent: string;
  icon: typeof Share2;
};

export type Handle = {
  id: string;
  provider: Provider;
  label: string;
  detail: string;
  type: string;
  status: HandleStatus;
  persisted: boolean;
};

export type ConnectionStatus = {
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

export type ConnectionsResponse = {
  connections?: ConnectionStatus[];
};

export const providerMeta: Record<Provider, { handleType: HandleType; type: string; detail: string; externalLabel: string }> = {
  facebook: { handleType: 'facebook_page', type: 'Page', detail: 'Facebook Page', externalLabel: 'Facebook Page ID' },
  instagram: { handleType: 'instagram_business', type: 'IG', detail: 'Instagram Business', externalLabel: 'Instagram Business Account ID' },
  linkedin: { handleType: 'linkedin_page', type: 'LI', detail: 'LinkedIn Page', externalLabel: 'LinkedIn Page ID' },
  youtube: { handleType: 'youtube_channel', type: 'YT', detail: 'YouTube Channel', externalLabel: 'YouTube Channel ID' },
  google_ads: { handleType: 'google_ads_customer', type: 'Ads', detail: 'Google Ads Customer', externalLabel: 'Google Ads Customer ID' },
  whatsapp: { handleType: 'whatsapp_phone_number', type: 'WA', detail: 'WhatsApp recipient', externalLabel: 'Recipient phone number' },
  slack: { handleType: 'slack_channel', type: 'Slack', detail: 'Slack Channel', externalLabel: 'Slack Channel ID' },
  telegram: { handleType: 'telegram_channel', type: 'TG', detail: 'Telegram Channel', externalLabel: 'Telegram Channel ID' },
};

export const channels: Channel[] = [
  { provider: 'facebook', name: 'Facebook Pages', status: 'OAuth required', mode: 'Feed posts, reels later', accent: 'blue', icon: Share2 },
  { provider: 'instagram', name: 'Instagram Business', status: 'App review required', mode: 'Reels, images, carousels', accent: 'pink', icon: Smartphone },
  { provider: 'linkedin', name: 'LinkedIn Pages', status: 'OAuth required', mode: 'Company and brand posts', accent: 'neutral', icon: Share2 },
  { provider: 'youtube', name: 'YouTube Channels', status: 'Upload audit needed', mode: 'Videos and Shorts', accent: 'red', icon: PlaySquare },
  { provider: 'google_ads', name: 'Google Ads', status: 'Developer token required', mode: 'Campaign builder required', accent: 'green', icon: Megaphone },
  { provider: 'whatsapp', name: 'WhatsApp Business', status: 'Template rules apply', mode: 'Opt-in messages', accent: 'teal', icon: MessageCircle },
  { provider: 'slack', name: 'Slack Channels', status: 'Bot token required', mode: 'Workspace channels', accent: 'neutral', icon: MessageCircle },
  { provider: 'telegram', name: 'Telegram Channels', status: 'Bot token required', mode: 'Channel messages', accent: 'neutral', icon: Send },
];

export const seedHandles: Handle[] = [
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

export function mapRowToHandle(row: DistributionHandleRow): Handle {
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

export function createLocalHandle(provider: Provider, label: string, externalId: string, status: HandleStatus): Handle {
  const meta = providerMeta[provider];
  return { id: `local-${Date.now()}`, provider, label, detail: externalId ? `${meta.detail} - ${externalId}` : meta.detail, type: meta.type, status, persisted: false };
}

export function getMetadataStatus(metadata: Json): HandleStatus {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = metadata.ui_status;
    if (value === 'ready' || value === 'review' || value === 'needs_setup') return value;
  }
  return 'ready';
}

export function statusLabel(status: HandleStatus) {
  if (status === 'ready') return 'Ready';
  if (status === 'review') return 'Review';
  return 'Setup';
}

export function channelName(provider: Provider) {
  return channels.find((channel) => channel.provider === provider)?.name ?? provider;
}

export function connectionStatusText(connection?: ConnectionStatus) {
  if (!connection) return 'Unknown';
  if (connection.status === 'connected') return 'Connected';
  if (connection.status === 'ready_to_connect') return 'Ready';
  return 'Setup';
}

export function connectionBadgeClass(connection?: ConnectionStatus) {
  if (!connection) return 'needs_setup';
  if (connection.status === 'connected') return 'ready';
  if (connection.status === 'ready_to_connect') return 'review';
  return 'needs_setup';
}

export function connectionActionText(connection?: ConnectionStatus) {
  if (!connection) return 'Check';
  if (!connection.secretsConfigured) return 'Setup';
  if (connection.authMode === 'server_token') return 'Add handle';
  if (connection.authMode === 'ads_setup') return 'Ads setup';
  return connection.status === 'connected' ? 'Reconnect' : 'Connect';
}

export function connectionHelperText(connection: ConnectionStatus | undefined, provider: Provider) {
  if (!connection) return 'Status not loaded';
  if (!connection.secretsConfigured) return 'Server setup required';
  if (connection.status === 'connected') return connection.displayName ?? 'Ready to publish';
  if (connection.authMode === 'server_token') return 'Server token ready';
  if (provider === 'google_ads') return 'Use Ads campaign flow';
  return 'Connect account';
}

export function normalizeConnectionsResponse(value: unknown): ConnectionsResponse {
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

export function isProvider(value: unknown): value is Provider {
  return value === 'facebook'
    || value === 'instagram'
    || value === 'linkedin'
    || value === 'youtube'
    || value === 'google_ads'
    || value === 'whatsapp'
    || value === 'slack'
    || value === 'telegram';
}

export function getAuthUrl(value: unknown) {
  if (value && typeof value === 'object') {
    const authUrl = (value as Record<string, unknown>).authUrl;
    if (typeof authUrl === 'string' && authUrl.startsWith('http')) return authUrl;
  }
  return '';
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) return parts.join(' ');
  }

  return fallback;
}

export async function edgeFunctionErrorMessage(error: unknown, functionName: string) {
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
