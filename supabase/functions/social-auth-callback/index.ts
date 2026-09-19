import {
  appReturnUrl,
  encryptToken,
  getYouTubeChannel,
  htmlResponse,
  HttpError,
  requiredEnv,
  safeAppReturnUrl,
  serviceClient,
  youtubeScopes,
} from '../_shared/youtube.ts';

type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'slack';

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url);
  const error = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');
  const queryProvider = requestUrl.searchParams.get('provider');

  if (error) {
    return htmlResponse('Connection failed', error, 400, appReturnUrl('/social?connected=failed'));
  }

  if (!code || !state) {
    return htmlResponse('Connection failed', 'The platform did not return the required authorization values.', 400, appReturnUrl('/social?connected=failed'));
  }

  try {
    const supabase = serviceClient();
    const now = new Date().toISOString();
    const { data: stateRow, error: stateError } = await supabase
      .from('social_oauth_states')
      .select('*')
      .eq('state_token', state)
      .is('used_at', null)
      .gt('expires_at', now)
      .single();

    if (stateError || !stateRow) {
      return htmlResponse('Connection expired', 'Start the connection again from Social Distribution Hub.', 400, appReturnUrl('/social?connected=expired'));
    }

    const provider = stateRow.provider as Provider;
    if (queryProvider && queryProvider !== provider && !(provider === 'instagram' && queryProvider === 'facebook')) {
      throw new HttpError(400, 'Connection provider mismatch.');
    }

    if (provider === 'youtube') await finishYouTube(supabase, code, stateRow);
    else if (provider === 'facebook' || provider === 'instagram') await finishMeta(supabase, code, stateRow);
    else if (provider === 'linkedin') await finishLinkedIn(supabase, code, stateRow);
    else if (provider === 'slack') await finishSlack(supabase, code, stateRow);
    else throw new HttpError(400, 'Unsupported provider.');

    await supabase
      .from('social_oauth_states')
      .update({ used_at: now })
      .eq('state_token', state);

    const returnTo = safeAppReturnUrl(stateRow.return_to, `/social?connected=${provider}`);

    return htmlResponse('Connected', 'Returning to time2grow...', 200, returnTo);
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : 'Unexpected connection error.';
    return htmlResponse('Connection failed', message, 500, appReturnUrl('/social?connected=failed'));
  }
});

async function finishYouTube(supabase: ReturnType<typeof serviceClient>, code: string, stateRow: Record<string, unknown>) {
  const orgId = requiredString(stateRow.org_id, 'Missing organization.');
  const userId = requiredString(stateRow.user_id, 'Missing user.');
  const tokenBody = await exchangeToken('youtube', code, 'https://oauth2.googleapis.com/token', {
    client_id: requiredEnv('GOOGLE_CLIENT_ID'),
    client_secret: requiredEnv('GOOGLE_CLIENT_SECRET'),
    redirect_uri: callbackUrl('youtube'),
    grant_type: 'authorization_code',
  });

  const accessToken = requiredString(tokenBody.access_token, 'Google did not return an access token.');
  const refreshToken = requiredString(tokenBody.refresh_token, 'Google did not return a refresh token. Remove app access in Google, then connect again.');
  const channel = await getYouTubeChannel(accessToken);
  const channelId = channel?.id ?? 'youtube-default';
  const channelName = channel?.title ?? 'YouTube Channel';
  const expiresAt = expiresAtFromToken(tokenBody);
  const scopes = scopesFromToken(tokenBody, youtubeScopes());

  const account = await upsertIntegrationAccount(supabase, {
    orgId,
    provider: 'youtube',
    displayName: channelName,
    externalId: channelId,
    scopes,
    userId,
  });

  await upsertOAuthConnection(supabase, {
    orgId,
    provider: 'youtube',
    integrationAccountId: account.id,
    accessToken,
    refreshToken,
    expiresAt,
    scopes,
    userId,
  });

  await upsertHandle(supabase, {
    orgId,
    provider: 'youtube',
    integrationAccountId: account.id,
    handleType: 'youtube_channel',
    displayName: channelName,
    externalHandleId: channelId,
    userId,
  });
}

async function finishMeta(supabase: ReturnType<typeof serviceClient>, code: string, stateRow: Record<string, unknown>) {
  const orgId = requiredString(stateRow.org_id, 'Missing organization.');
  const userId = requiredString(stateRow.user_id, 'Missing user.');
  const tokenBody = await exchangeToken('facebook', code, graphUrl('/oauth/access_token'), {
    client_id: requiredEnv('META_CLIENT_ID'),
    client_secret: requiredEnv('META_CLIENT_SECRET'),
    redirect_uri: callbackUrl('facebook'),
    grant_type: 'authorization_code',
  });

  let accessToken = requiredString(tokenBody.access_token, 'Meta did not return an access token.');
  const longLived = await fetchJson(graphUrl('/oauth/access_token'), {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: requiredEnv('META_CLIENT_ID'),
      client_secret: requiredEnv('META_CLIENT_SECRET'),
      fb_exchange_token: accessToken,
    }),
  }).catch(() => null);

  if (longLived?.access_token) accessToken = String(longLived.access_token);
  const expiresAt = expiresAtFromToken(longLived ?? tokenBody);
  const scopes = scopesFromToken(tokenBody, scopesFromEnv('FACEBOOK_REQUIRED_SCOPES'));
  const me = await fetchJson(`${graphUrl('/me')}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
  const displayName = stringValue(me.name) ?? 'Meta Account';
  const externalId = stringValue(me.id) ?? 'meta-account';

  const account = await upsertIntegrationAccount(supabase, {
    orgId,
    provider: 'facebook',
    displayName,
    externalId,
    scopes,
    userId,
  });

  await upsertOAuthConnection(supabase, {
    orgId,
    provider: 'facebook',
    integrationAccountId: account.id,
    accessToken,
    refreshToken: null,
    expiresAt,
    scopes,
    userId,
  });

  await syncMetaHandles(supabase, {
    orgId,
    userId,
    integrationAccountId: account.id,
    accessToken,
    scopes,
    expiresAt,
  });
}

async function finishLinkedIn(supabase: ReturnType<typeof serviceClient>, code: string, stateRow: Record<string, unknown>) {
  const orgId = requiredString(stateRow.org_id, 'Missing organization.');
  const userId = requiredString(stateRow.user_id, 'Missing user.');
  const tokenBody = await exchangeToken('linkedin', code, 'https://www.linkedin.com/oauth/v2/accessToken', {
    client_id: requiredEnv('LINKEDIN_CLIENT_ID'),
    client_secret: requiredEnv('LINKEDIN_CLIENT_SECRET'),
    redirect_uri: callbackUrl('linkedin'),
    grant_type: 'authorization_code',
  });

  const accessToken = requiredString(tokenBody.access_token, 'LinkedIn did not return an access token.');
  const scopes = scopesFromToken(tokenBody, scopesFromEnv('LINKEDIN_REQUIRED_SCOPES'));
  const expiresAt = expiresAtFromToken(tokenBody);
  const account = await upsertIntegrationAccount(supabase, {
    orgId,
    provider: 'linkedin',
    displayName: 'LinkedIn Account',
    externalId: 'linkedin-account',
    scopes,
    userId,
  });

  await upsertOAuthConnection(supabase, {
    orgId,
    provider: 'linkedin',
    integrationAccountId: account.id,
    accessToken,
    refreshToken: null,
    expiresAt,
    scopes,
    userId,
  });
}

async function finishSlack(supabase: ReturnType<typeof serviceClient>, code: string, stateRow: Record<string, unknown>) {
  const orgId = requiredString(stateRow.org_id, 'Missing organization.');
  const userId = requiredString(stateRow.user_id, 'Missing user.');
  const tokenBody = await exchangeToken('slack', code, 'https://slack.com/api/oauth.v2.access', {
    client_id: requiredEnv('SLACK_CLIENT_ID'),
    client_secret: requiredEnv('SLACK_CLIENT_SECRET'),
    redirect_uri: callbackUrl('slack'),
  });

  if (tokenBody.ok === false) throw new HttpError(400, `Slack rejected the connection: ${stringValue(tokenBody.error) ?? 'unknown_error'}`);

  const accessToken = requiredString(tokenBody.access_token, 'Slack did not return a bot token.');
  const teamId = stringValue(tokenBody.team?.id) ?? 'slack-workspace';
  const teamName = stringValue(tokenBody.team?.name) ?? 'Slack Workspace';
  const scopes = scopesFromToken(tokenBody, scopesFromEnv('SLACK_REQUIRED_SCOPES'));
  const account = await upsertIntegrationAccount(supabase, {
    orgId,
    provider: 'slack',
    displayName: teamName,
    externalId: teamId,
    scopes,
    userId,
  });

  await upsertOAuthConnection(supabase, {
    orgId,
    provider: 'slack',
    integrationAccountId: account.id,
    accessToken,
    refreshToken: null,
    expiresAt: null,
    scopes,
    userId,
  });
}

async function syncMetaHandles(supabase: ReturnType<typeof serviceClient>, args: {
  orgId: string;
  userId: string;
  integrationAccountId: string;
  accessToken: string;
  scopes: string[];
  expiresAt: string | null;
}) {
  const pages = await fetchJson(`${graphUrl('/me/accounts')}?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(args.accessToken)}`);
  const items = Array.isArray(pages.data) ? pages.data : [];

  // Track which external IDs we see from the API
  const seenFacebookIds = new Set<string>();
  const seenInstagramIds = new Set<string>();

  for (const page of items) {
    const pageId = stringValue(page.id);
    const pageName = stringValue(page.name);
    const pageToken = stringValue(page.access_token);
    if (!pageId || !pageName || !pageToken) continue;

    seenFacebookIds.add(pageId);

    const facebookHandle = await upsertHandle(supabase, {
      orgId: args.orgId,
      provider: 'facebook',
      integrationAccountId: args.integrationAccountId,
      handleType: 'facebook_page',
      displayName: pageName,
      externalHandleId: pageId,
      userId: args.userId,
    });

    await upsertHandleCredential(supabase, {
      orgId: args.orgId,
      handleId: facebookHandle.id,
      provider: 'facebook',
      accessToken: pageToken,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
      userId: args.userId,
    });

    const instagram = page.instagram_business_account;
    const instagramId = instagram && typeof instagram === 'object' ? stringValue(instagram.id) : null;
    if (!instagramId) continue;

    seenInstagramIds.add(instagramId);

    const instagramName = instagram && typeof instagram === 'object'
      ? stringValue(instagram.username) ?? `${pageName} Instagram`
      : `${pageName} Instagram`;
    const instagramHandle = await upsertHandle(supabase, {
      orgId: args.orgId,
      provider: 'instagram',
      integrationAccountId: args.integrationAccountId,
      handleType: 'instagram_business',
      displayName: instagramName,
      externalHandleId: instagramId,
      userId: args.userId,
    });

    await upsertHandleCredential(supabase, {
      orgId: args.orgId,
      handleId: instagramHandle.id,
      provider: 'instagram',
      accessToken: pageToken,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
      userId: args.userId,
    });
  }

  // Disable Facebook handles that the new token no longer grants access to
  await disableStaleHandles(supabase, args.orgId, 'facebook', seenFacebookIds);
  // Disable Instagram handles that the new token no longer grants access to
  await disableStaleHandles(supabase, args.orgId, 'instagram', seenInstagramIds);
}

async function upsertIntegrationAccount(supabase: ReturnType<typeof serviceClient>, args: {
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

async function upsertOAuthConnection(supabase: ReturnType<typeof serviceClient>, args: {
  orgId: string;
  provider: string;
  integrationAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  userId: string;
}) {
  const payload = {
    org_id: args.orgId,
    integration_account_id: args.integrationAccountId,
    provider: args.provider,
    access_token_ciphertext: await encryptToken(args.accessToken),
    refresh_token_ciphertext: args.refreshToken ? await encryptToken(args.refreshToken) : null,
    token_type: 'Bearer',
    expires_at: args.expiresAt,
    scopes: args.scopes,
    created_by: args.userId,
  };

  const { error } = await supabase.from('oauth_connections').upsert(payload, { onConflict: 'org_id,provider' });
  if (error) throw error;
}

async function upsertHandle(supabase: ReturnType<typeof serviceClient>, args: {
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
    metadata: { source: 'oauth', ui_status: 'ready', connected_at: new Date().toISOString() },
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

async function upsertHandleCredential(supabase: ReturnType<typeof serviceClient>, args: {
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

async function disableStaleHandles(supabase: ReturnType<typeof serviceClient>, orgId: string, provider: string, seenExternalIds: Set<string>) {
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
    .filter((h: Record<string, unknown>) => h.external_handle_id && !seenExternalIds.has(String(h.external_handle_id)))
    .map((h: Record<string, unknown>) => h.id);

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
    .update({ is_enabled: false, metadata: { source: 'reconnect_cleanup', disabled_at: new Date().toISOString() } })
    .in('id', staleIds);

  if (disableError) throw disableError;
  return staleIds.length;
}

async function exchangeToken(provider: Provider, code: string, url: string, values: Record<string, string>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: provider === 'slack' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, ...values }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new HttpError(response.status || 400, stringValue(body.error_description) ?? stringValue(body.error) ?? `${provider} token exchange failed.`);
  }

  return body;
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

function callbackUrl(provider: Provider) {
  const configured = Deno.env.get('SOCIAL_OAUTH_REDIRECT_URI');
  if (configured) return configured;
  return `${requiredEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/social-auth-callback?provider=${provider}`;
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v21.0'}${path}`;
}

function scopesFromToken(body: Record<string, unknown>, fallback: string[]) {
  const authedUser = body.authed_user;
  const authedScope = authedUser && typeof authedUser === 'object'
    ? (authedUser as Record<string, unknown>).scope
    : null;
  const scope = stringValue(body.scope) ?? stringValue(authedScope);
  return scope ? scope.split(/[\s,]+/).filter(Boolean) : fallback;
}

function scopesFromEnv(name: string) {
  return (Deno.env.get(name) ?? '').split(/[\s,]+/).filter(Boolean);
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
