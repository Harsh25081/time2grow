import {
  assertOrgRole,
  corsHeaders,
  errorResponse,
  getAuthenticatedUser,
  googleConfig,
  handleOptions,
  jsonResponse,
  safeAppReturnPath,
  serviceClient,
  youtubeScopes,
} from '../_shared/youtube.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    const supabase = serviceClient();
    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    const returnTo = safeAppReturnPath(body.returnTo, '/connections');

    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);
    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin']);

    const stateToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: stateError } = await supabase.from('youtube_oauth_states').insert({
      state_token: stateToken,
      org_id: orgId,
      user_id: user.id,
      return_to: returnTo,
      expires_at: expiresAt,
    });

    if (stateError) throw stateError;

    const { clientId, redirectUri } = googleConfig();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', youtubeScopes().join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', stateToken);

    return jsonResponse({ authUrl: authUrl.toString(), expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
});
