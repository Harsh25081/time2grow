import {
  assertOrgRole,
  errorResponse,
  getAuthenticatedUser,
  handleOptions,
  HttpError,
  jsonResponse,
  requiredEnv,
  safeAppReturnPath,
  serviceClient,
  youtubeScopes,
} from '../_shared/youtube.ts';

type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'slack';

const providers = ['facebook', 'instagram', 'linkedin', 'youtube', 'slack'];

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    const supabase = serviceClient();
    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const provider = typeof body.provider === 'string' && providers.includes(body.provider) ? body.provider as Provider : null;
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    const returnTo = safeAppReturnPath(body.returnTo, '/connections');

    if (!provider) return jsonResponse({ error: 'Unsupported provider.' }, 400);
    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin']);

    const stateToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: stateError } = await supabase.from('social_oauth_states').insert({
      state_token: stateToken,
      provider,
      org_id: orgId,
      user_id: user.id,
      return_to: returnTo,
      expires_at: expiresAt,
    });

    if (stateError) throw stateError;

    return jsonResponse({ authUrl: buildAuthUrl(provider, stateToken), expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
});

function buildAuthUrl(provider: Provider, stateToken: string) {
  if (provider === 'youtube') return youtubeAuthUrl(stateToken);
  if (provider === 'facebook' || provider === 'instagram') return metaAuthUrl(stateToken);
  if (provider === 'linkedin') return linkedInAuthUrl(stateToken);
  if (provider === 'slack') return slackAuthUrl(stateToken);
  throw new HttpError(400, 'Unsupported provider.');
}

function callbackUrl(provider: Provider) {
  const configured = Deno.env.get('SOCIAL_OAUTH_REDIRECT_URI');
  if (configured) return configured;
  return `${requiredEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/social-auth-callback?provider=${provider}`;
}

function youtubeAuthUrl(stateToken: string) {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', requiredEnv('GOOGLE_CLIENT_ID'));
  authUrl.searchParams.set('redirect_uri', callbackUrl('youtube'));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', youtubeScopes().join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('state', stateToken);
  return authUrl.toString();
}

function metaAuthUrl(stateToken: string) {
  const scopes = Deno.env.get('FACEBOOK_REQUIRED_SCOPES') || 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish,leads_retrieval,pages_manage_ads';
  const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  authUrl.searchParams.set('client_id', requiredEnv('META_CLIENT_ID'));
  authUrl.searchParams.set('redirect_uri', callbackUrl('facebook'));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', stateToken);
  return authUrl.toString();
}

function linkedInAuthUrl(stateToken: string) {
  const scopes = Deno.env.get('LINKEDIN_REQUIRED_SCOPES') || 'w_member_social,w_organization_social,rw_organization_admin';
  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('client_id', requiredEnv('LINKEDIN_CLIENT_ID'));
  authUrl.searchParams.set('redirect_uri', callbackUrl('linkedin'));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.replace(/,/g, ' '));
  authUrl.searchParams.set('state', stateToken);
  return authUrl.toString();
}

function slackAuthUrl(stateToken: string) {
  const scopes = Deno.env.get('SLACK_REQUIRED_SCOPES') || 'chat:write,channels:read,groups:read';
  const authUrl = new URL('https://slack.com/oauth/v2/authorize');
  authUrl.searchParams.set('client_id', requiredEnv('SLACK_CLIENT_ID'));
  authUrl.searchParams.set('redirect_uri', callbackUrl('slack'));
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', stateToken);
  return authUrl.toString();
}
