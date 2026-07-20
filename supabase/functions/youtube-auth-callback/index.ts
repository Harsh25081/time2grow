import {
  appReturnUrl,
  encryptToken,
  exchangeCodeForToken,
  getYouTubeChannel,
  htmlResponse,
  safeAppReturnUrl,
  serviceClient,
  youtubeScopes,
} from '../_shared/youtube.ts';

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url);
  const error = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');

  if (error) {
    return htmlResponse('YouTube connection failed', error, 400, appReturnUrl('/social?youtube=failed'));
  }

  if (!code || !state) {
    return htmlResponse('YouTube connection failed', 'Google did not return the required OAuth values.', 400, appReturnUrl('/social?youtube=failed'));
  }

  try {
    const supabase = serviceClient();
    const now = new Date().toISOString();
    const { data: stateRow, error: stateError } = await supabase
      .from('youtube_oauth_states')
      .select('*')
      .eq('state_token', state)
      .is('used_at', null)
      .gt('expires_at', now)
      .single();

    if (stateError || !stateRow) {
      return htmlResponse('YouTube connection expired', 'Start the YouTube connection again from Social Distribution Hub.', 400, appReturnUrl('/social?youtube=expired'));
    }

    const tokenBody = await exchangeCodeForToken(code);
    const accessToken = tokenBody.access_token;
    const refreshToken = tokenBody.refresh_token;

    if (typeof accessToken !== 'string') {
      return htmlResponse('YouTube connection failed', 'Google did not return an access token.', 400, appReturnUrl('/social?youtube=failed'));
    }

    if (typeof refreshToken !== 'string') {
      return htmlResponse(
        'YouTube connection failed',
        'Google did not return a refresh token. Remove the app from your Google account permissions, then connect again.',
        400,
        appReturnUrl('/social?youtube=failed'),
      );
    }

    const channel = await getYouTubeChannel(accessToken);
    const channelId = channel?.id ?? 'youtube-default';
    const channelName = channel?.title ?? 'Connected YouTube Channel';
    const scopes = typeof tokenBody.scope === 'string' ? tokenBody.scope.split(/\s+/).filter(Boolean) : youtubeScopes();
    const expiresAt = typeof tokenBody.expires_in === 'number'
      ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString()
      : null;

    const { data: existingAccount } = await supabase
      .from('integration_accounts')
      .select('*')
      .eq('org_id', stateRow.org_id)
      .eq('provider', 'youtube')
      .limit(1)
      .maybeSingle();

    const accountPayload = {
      org_id: stateRow.org_id,
      provider: 'youtube',
      display_name: channelName,
      external_account_id: channelId,
      status: 'connected',
      scopes,
      token_status: 'active',
      last_sync_at: now,
      created_by: stateRow.user_id,
    };

    const accountResult = existingAccount
      ? await supabase.from('integration_accounts').update(accountPayload).eq('id', existingAccount.id).select('*').single()
      : await supabase.from('integration_accounts').insert(accountPayload).select('*').single();

    if (accountResult.error) throw accountResult.error;

    const tokenPayload = {
      org_id: stateRow.org_id,
      integration_account_id: accountResult.data.id,
      provider: 'youtube',
      access_token_ciphertext: await encryptToken(accessToken),
      refresh_token_ciphertext: await encryptToken(refreshToken),
      token_type: typeof tokenBody.token_type === 'string' ? tokenBody.token_type : 'Bearer',
      expires_at: expiresAt,
      scopes,
      created_by: stateRow.user_id,
    };

    const { error: tokenError } = await supabase
      .from('oauth_connections')
      .upsert(tokenPayload, { onConflict: 'org_id,provider' });

    if (tokenError) throw tokenError;

    const handlePayload = {
      org_id: stateRow.org_id,
      integration_account_id: accountResult.data.id,
      provider: 'youtube',
      handle_type: 'youtube_channel',
      display_name: channelName,
      external_handle_id: channelId,
      is_enabled: true,
      default_for_provider: true,
      metadata: { source: 'youtube_oauth', connected_at: now, ui_status: 'ready' },
      created_by: stateRow.user_id,
    };

    const { data: existingHandle } = await supabase
      .from('distribution_handles')
      .select('id')
      .eq('org_id', stateRow.org_id)
      .eq('provider', 'youtube')
      .eq('default_for_provider', true)
      .limit(1)
      .maybeSingle();

    const handleResult = existingHandle
      ? await supabase.from('distribution_handles').update(handlePayload).eq('id', existingHandle.id)
      : await supabase.from('distribution_handles').insert(handlePayload);

    if (handleResult.error) throw handleResult.error;

    await supabase
      .from('youtube_oauth_states')
      .update({ used_at: now })
      .eq('state_token', state);

    const returnTo = safeAppReturnUrl(stateRow.return_to, '/social?youtube=connected');

    return htmlResponse('YouTube connected', `${channelName} is connected. Returning to time2grow...`, 200, returnTo);
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : 'Unexpected YouTube connection error.';
    return htmlResponse('YouTube connection failed', message, 500, appReturnUrl('/social?youtube=failed'));
  }
});
