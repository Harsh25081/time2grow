import {
  assertOrgRole,
  decryptToken,
  encryptToken,
  errorResponse,
  getAuthenticatedUser,
  getYouTubeChannel,
  handleOptions,
  HttpError,
  jsonResponse,
  refreshAccessToken,
  serviceClient,
} from '../_shared/youtube.ts';

type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'google_ads' | 'whatsapp' | 'slack' | 'telegram';
type ServiceClient = ReturnType<typeof serviceClient>;

type DiscoveredHandle = {
  provider: Provider;
  displayName: string;
  externalHandleId: string;
  handleType: string;
};

const discoverableProviders: Provider[] = ['facebook', 'instagram', 'linkedin', 'youtube', 'slack', 'whatsapp'];

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    const supabase = serviceClient();
    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    const provider = providerValue(body.provider);

    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);
    if (!provider) return jsonResponse({ error: 'Choose a provider to discover handles.' }, 400);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin']);

    const result = await discoverProviderHandles(supabase, orgId, user.id, provider);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});

async function discoverProviderHandles(supabase: ServiceClient, orgId: string, userId: string, provider: Provider) {
  if (!discoverableProviders.includes(provider)) {
    return {
      provider,
      imported: 0,
      handles: [],
      message: provider === 'google_ads'
        ? 'Google Ads account discovery needs the Ads customer picker next.'
        : 'This provider does not expose automatic handle discovery yet. Add the handle manually.',
    };
  }

  if (provider === 'facebook' || provider === 'instagram') return discoverMetaHandles(supabase, orgId, userId, provider);
  if (provider === 'youtube') return discoverYouTubeHandles(supabase, orgId, userId);
  if (provider === 'linkedin') return discoverLinkedInHandles(supabase, orgId, userId);
  if (provider === 'slack') return discoverSlackHandles(supabase, orgId, userId);
  if (provider === 'whatsapp') return discoverWhatsAppHandle(supabase, orgId, userId);

  return { provider, imported: 0, handles: [], message: 'Add this handle manually.' };
}

async function discoverMetaHandles(supabase: ServiceClient, orgId: string, userId: string, requestedProvider: Provider) {
  const connection = await oauthConnection(supabase, orgId, 'facebook');
  const accessToken = await decryptToken(requiredString(connection.access_token_ciphertext, 'Connect Meta first.'));
  const account = await integrationAccountForConnection(supabase, orgId, connection, 'facebook', userId);

  const pages = await fetchJson(`${graphUrl('/me/accounts')}?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(accessToken)}`);
  const items = Array.isArray(pages.data) ? pages.data : [];
  const imported: DiscoveredHandle[] = [];
  const expiresAt = stringValue(connection.expires_at);
  const scopes = stringArray(connection.scopes);

  // Collect the external IDs we see from the API so we can disable stale ones
  const seenExternalIds = new Set<string>();

  for (const page of items) {
    const pageId = stringValue(page.id);
    const pageName = stringValue(page.name);
    const pageToken = stringValue(page.access_token);
    if (!pageId || !pageName || !pageToken) continue;

    if (requestedProvider === 'facebook') {
      seenExternalIds.add(pageId);
      const facebookHandle = await upsertHandle(supabase, {
        orgId,
        provider: 'facebook',
        integrationAccountId: account.id,
        handleType: 'facebook_page',
        displayName: pageName,
        externalHandleId: pageId,
        userId,
      });
      await upsertHandleCredential(supabase, { orgId, handleId: facebookHandle.id, provider: 'facebook', accessToken: pageToken, expiresAt, scopes, userId });
      imported.push({ provider: 'facebook', displayName: pageName, externalHandleId: pageId, handleType: 'facebook_page' });
    }

    const instagram = page.instagram_business_account;
    const instagramId = instagram && typeof instagram === 'object' ? stringValue(instagram.id) : null;
    if (!instagramId || requestedProvider !== 'instagram') continue;

    seenExternalIds.add(instagramId);
    const instagramName = instagram && typeof instagram === 'object'
      ? stringValue(instagram.username) ?? `${pageName} Instagram`
      : `${pageName} Instagram`;
    const instagramHandle = await upsertHandle(supabase, {
      orgId,
      provider: 'instagram',
      integrationAccountId: account.id,
      handleType: 'instagram_business',
      displayName: instagramName,
      externalHandleId: instagramId,
      userId,
    });
    await upsertHandleCredential(supabase, { orgId, handleId: instagramHandle.id, provider: 'instagram', accessToken: pageToken, expiresAt, scopes, userId });
    imported.push({ provider: 'instagram', displayName: instagramName, externalHandleId: instagramId, handleType: 'instagram_business' });
  }

  // Disable handles that the current token no longer has access to
  const disabled = await disableStaleHandles(supabase, orgId, requestedProvider, seenExternalIds);

  await markAccountSynced(supabase, account.id);

  const parts: string[] = [];
  if (imported.length > 0) {
    parts.push(`${imported.length} ${requestedProvider === 'facebook' ? 'Facebook Page' : 'Instagram Business account'} handle${imported.length === 1 ? '' : 's'} imported.`);
  }
  if (disabled > 0) {
    parts.push(`${disabled} handle${disabled === 1 ? '' : 's'} removed (no longer accessible with this account).`);
  }

  return {
    provider: requestedProvider,
    imported: imported.length,
    disabled,
    handles: imported,
    message: parts.length > 0
      ? parts.join(' ')
      : `No ${requestedProvider === 'facebook' ? 'Facebook Pages' : 'Instagram Business accounts'} were available for this connected Meta login.`,
  };
}

async function discoverYouTubeHandles(supabase: ServiceClient, orgId: string, userId: string) {
  const connection = await oauthConnection(supabase, orgId, 'youtube');
  const accessToken = await usableGoogleAccessToken(supabase, connection);
  const channel = await getYouTubeChannel(accessToken);
  if (!channel?.id) return { provider: 'youtube', imported: 0, handles: [], message: 'No YouTube channel was available for this Google login.' };

  const account = await integrationAccountForConnection(supabase, orgId, connection, 'youtube', userId, channel.title, channel.id);
  const handle = await upsertHandle(supabase, {
    orgId,
    provider: 'youtube',
    integrationAccountId: account.id,
    handleType: 'youtube_channel',
    displayName: channel.title,
    externalHandleId: channel.id,
    userId,
  });
  await markAccountSynced(supabase, account.id);

  return {
    provider: 'youtube',
    imported: 1,
    handles: [{ provider: 'youtube', displayName: handle.display_name, externalHandleId: handle.external_handle_id, handleType: handle.handle_type }],
    message: 'YouTube channel imported.',
  };
}

async function discoverLinkedInHandles(supabase: ServiceClient, orgId: string, userId: string) {
  const connection = await oauthConnection(supabase, orgId, 'linkedin');
  const accessToken = await decryptToken(requiredString(connection.access_token_ciphertext, 'Connect LinkedIn first.'));
  const account = await integrationAccountForConnection(supabase, orgId, connection, 'linkedin', userId);
  const body = await fetchJson(
    'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))',
    { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } },
  );
  const elements = Array.isArray(body.elements) ? body.elements : [];
  const imported: DiscoveredHandle[] = [];

  for (const element of elements) {
    const organization = element && typeof element === 'object' ? (element as Record<string, unknown>)['organization~'] : null;
    const orgRecord = organization && typeof organization === 'object' ? organization as Record<string, unknown> : {};
    const organizationId = stringValue(orgRecord.id);
    const organizationName = stringValue(orgRecord.localizedName);
    if (!organizationId || !organizationName) continue;

    await upsertHandle(supabase, {
      orgId,
      provider: 'linkedin',
      integrationAccountId: account.id,
      handleType: 'linkedin_page',
      displayName: organizationName,
      externalHandleId: organizationId,
      userId,
    });
    imported.push({ provider: 'linkedin', displayName: organizationName, externalHandleId: organizationId, handleType: 'linkedin_page' });
  }

  await markAccountSynced(supabase, account.id);
  return {
    provider: 'linkedin',
    imported: imported.length,
    handles: imported,
    message: imported.length > 0 ? `${imported.length} LinkedIn Page handle${imported.length === 1 ? '' : 's'} imported.` : 'No LinkedIn Pages were available for this login and scope.',
  };
}

async function discoverSlackHandles(supabase: ServiceClient, orgId: string, userId: string) {
  const connection = await oauthConnection(supabase, orgId, 'slack');
  const accessToken = await decryptToken(requiredString(connection.access_token_ciphertext, 'Connect Slack first.'));
  const account = await integrationAccountForConnection(supabase, orgId, connection, 'slack', userId);
  const body = await fetchJson('https://slack.com/api/conversations.list?exclude_archived=true&limit=200&types=public_channel,private_channel', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (body.ok === false) throw new HttpError(400, `Slack rejected discovery: ${stringValue(body.error) ?? 'unknown_error'}`);

  const channels = Array.isArray(body.channels) ? body.channels : [];
  const imported: DiscoveredHandle[] = [];
  for (const channel of channels) {
    const channelId = stringValue(channel.id);
    const channelName = stringValue(channel.name);
    if (!channelId || !channelName) continue;
    await upsertHandle(supabase, {
      orgId,
      provider: 'slack',
      integrationAccountId: account.id,
      handleType: 'slack_channel',
      displayName: `#${channelName}`,
      externalHandleId: channelId,
      userId,
    });
    imported.push({ provider: 'slack', displayName: `#${channelName}`, externalHandleId: channelId, handleType: 'slack_channel' });
  }

  await markAccountSynced(supabase, account.id);
  return {
    provider: 'slack',
    imported: imported.length,
    handles: imported,
    message: imported.length > 0 ? `${imported.length} Slack channel handle${imported.length === 1 ? '' : 's'} imported.` : 'No Slack channels were available for this bot token.',
  };
}

async function discoverWhatsAppHandle(supabase: ServiceClient, orgId: string, userId: string) {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  if (!phoneNumberId) return { provider: 'whatsapp', imported: 0, handles: [], message: 'WhatsApp server token is not configured yet.' };
  const account = await upsertIntegrationAccount(supabase, {
    orgId,
    provider: 'whatsapp',
    displayName: 'WhatsApp Business',
    externalId: phoneNumberId,
    scopes: [],
    userId,
  });
  const handle = await upsertHandle(supabase, {
    orgId,
    provider: 'whatsapp',
    integrationAccountId: account.id,
    handleType: 'whatsapp_phone_number',
    displayName: 'WhatsApp Business Number',
    externalHandleId: phoneNumberId,
    userId,
  });
  return {
    provider: 'whatsapp',
    imported: 1,
    handles: [{ provider: 'whatsapp', displayName: handle.display_name, externalHandleId: handle.external_handle_id, handleType: handle.handle_type }],
    message: 'WhatsApp Business number imported from server setup.',
  };
}

async function oauthConnection(supabase: ServiceClient, orgId: string, provider: string) {
  const { data, error } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(400, `Connect ${providerLabel(provider)} first, then discover handles.`);
  return data;
}

async function usableGoogleAccessToken(supabase: ServiceClient, connection: Record<string, unknown>) {
  const accessTokenCiphertext = stringValue(connection.access_token_ciphertext);
  if (accessTokenCiphertext && tokenStillUsable(stringValue(connection.expires_at))) return decryptToken(accessTokenCiphertext);

  const refreshTokenCiphertext = stringValue(connection.refresh_token_ciphertext);
  if (!refreshTokenCiphertext) {
    if (accessTokenCiphertext) return decryptToken(accessTokenCiphertext);
    throw new HttpError(400, 'Connect YouTube first.');
  }

  const refreshToken = await decryptToken(refreshTokenCiphertext);
  const refreshed = await refreshAccessToken(refreshToken);
  const accessToken = requiredString(refreshed.access_token, 'Google did not return a refreshed token.');
  const expiresAt = expiresAtFromToken(refreshed);
  await supabase
    .from('oauth_connections')
    .update({
      access_token_ciphertext: await encryptToken(accessToken),
      expires_at: expiresAt,
      token_type: 'Bearer',
    })
    .eq('id', connection.id);
  return accessToken;
}

async function integrationAccountForConnection(
  supabase: ServiceClient,
  orgId: string,
  connection: Record<string, unknown>,
  provider: Provider,
  userId: string,
  fallbackName = '',
  fallbackExternalId = '',
) {
  const existingId = stringValue(connection.integration_account_id);
  if (existingId) {
    const { data, error } = await supabase.from('integration_accounts').select('*').eq('id', existingId).eq('org_id', orgId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return upsertIntegrationAccount(supabase, {
    orgId,
    provider,
    displayName: fallbackName || providerLabel(provider),
    externalId: fallbackExternalId || `${provider}-account`,
    scopes: stringArray(connection.scopes),
    userId,
  });
}

async function upsertIntegrationAccount(supabase: ServiceClient, args: {
  orgId: string;
  provider: string;
  displayName: string;
  externalId: string;
  scopes: string[];
  userId: string;
}) {
  const now = new Date().toISOString();
  const payload = {
    org_id: args.orgId,
    provider: args.provider,
    display_name: args.displayName,
    external_account_id: args.externalId,
    status: 'connected',
    scopes: args.scopes,
    token_status: 'active',
    last_sync_at: now,
    created_by: args.userId,
  };

  const { data: existing, error: existingError } = await supabase
    .from('integration_accounts')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('provider', args.provider)
    .eq('external_account_id', args.externalId)
    .maybeSingle();

  if (existingError) throw existingError;

  const result = existing
    ? await supabase.from('integration_accounts').update(payload).eq('id', existing.id).select('*').single()
    : await supabase.from('integration_accounts').insert(payload).select('*').single();

  if (result.error) throw result.error;
  return result.data;
}

async function upsertHandle(supabase: ServiceClient, args: {
  orgId: string;
  provider: string;
  integrationAccountId: string;
  handleType: string;
  displayName: string;
  externalHandleId: string;
  userId: string;
}) {
  const payload = {
    org_id: args.orgId,
    integration_account_id: args.integrationAccountId,
    provider: args.provider,
    handle_type: args.handleType,
    display_name: args.displayName,
    external_handle_id: args.externalHandleId,
    is_enabled: true,
    default_for_provider: true,
    metadata: { source: 'discovery', ui_status: 'ready', discovered_at: new Date().toISOString() },
    created_by: args.userId,
  };

  const { data: existing, error: existingError } = await supabase
    .from('distribution_handles')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('provider', args.provider)
    .eq('external_handle_id', args.externalHandleId)
    .maybeSingle();

  if (existingError) throw existingError;

  const result = existing
    ? await supabase.from('distribution_handles').update(payload).eq('id', existing.id).select('*').single()
    : await supabase.from('distribution_handles').insert(payload).select('*').single();

  if (result.error) throw result.error;
  return result.data;
}

async function upsertHandleCredential(supabase: ServiceClient, args: {
  orgId: string;
  handleId: string;
  provider: string;
  accessToken: string;
  expiresAt: string | null;
  scopes: string[];
  userId: string;
}) {
  const payload = {
    org_id: args.orgId,
    distribution_handle_id: args.handleId,
    provider: args.provider,
    access_token_ciphertext: await encryptToken(args.accessToken),
    refresh_token_ciphertext: null,
    token_type: 'Bearer',
    expires_at: args.expiresAt,
    scopes: args.scopes,
    created_by: args.userId,
  };

  const { error } = await supabase
    .from('provider_handle_credentials')
    .upsert(payload, { onConflict: 'distribution_handle_id,provider' });

  if (error) throw error;
}

async function markAccountSynced(supabase: ServiceClient, integrationAccountId: string) {
  await supabase.from('integration_accounts').update({ last_sync_at: new Date().toISOString(), status: 'connected', token_status: 'active' }).eq('id', integrationAccountId);
}

async function disableStaleHandles(supabase: ServiceClient, orgId: string, provider: Provider, seenExternalIds: Set<string>) {
  if (seenExternalIds.size === 0) return 0;

  // Find all currently-enabled handles for this provider in this org
  const { data: existingHandles, error } = await supabase
    .from('distribution_handles')
    .select('id,external_handle_id')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('is_enabled', true);

  if (error) throw error;
  if (!existingHandles || existingHandles.length === 0) return 0;

  // Disable handles whose external_handle_id is not in the set of IDs the API returned
  const staleIds = existingHandles
    .filter((h) => h.external_handle_id && !seenExternalIds.has(h.external_handle_id))
    .map((h) => h.id);

  if (staleIds.length === 0) return 0;

  // Delete credentials for stale handles first
  for (const staleId of staleIds) {
    await supabase
      .from('provider_handle_credentials')
      .delete()
      .eq('distribution_handle_id', staleId)
      .eq('provider', provider);
  }

  // Disable the stale handles
  const { error: disableError } = await supabase
    .from('distribution_handles')
    .update({ is_enabled: false, metadata: { source: 'discovery_cleanup', disabled_at: new Date().toISOString() } })
    .in('id', staleIds);

  if (disableError) throw disableError;
  return staleIds.length;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const errorValue = body.error;
    const nestedMessage = errorValue && typeof errorValue === 'object'
      ? (errorValue as Record<string, unknown>).message
      : null;
    const message = stringValue(nestedMessage) ?? stringValue(body.message) ?? stringValue(errorValue) ?? 'Provider request failed.';
    throw new HttpError(response.status || 400, message);
  }
  return body;
}

function providerValue(value: unknown): Provider | '' {
  return typeof value === 'string' && isProvider(value) ? value : '';
}

function isProvider(value: string): value is Provider {
  return value === 'facebook'
    || value === 'instagram'
    || value === 'linkedin'
    || value === 'youtube'
    || value === 'google_ads'
    || value === 'whatsapp'
    || value === 'slack'
    || value === 'telegram';
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v21.0'}${path}`;
}

function tokenStillUsable(expiresAt: string | null) {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() > Date.now() + 60_000;
}

function expiresAtFromToken(body: Record<string, unknown>) {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : Number(body.expires_in);
  return Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

function requiredString(value: unknown, message: string) {
  const next = stringValue(value);
  if (!next) throw new HttpError(400, message);
  return next;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function providerLabel(provider: string) {
  return {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    youtube: 'YouTube',
    google_ads: 'Google Ads',
    whatsapp: 'WhatsApp',
    slack: 'Slack',
    telegram: 'Telegram',
  }[provider] ?? provider;
}
