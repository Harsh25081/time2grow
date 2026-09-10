import {
  assertOrgRole,
  errorResponse,
  getAuthenticatedUser,
  handleOptions,
  jsonResponse,
  serviceClient,
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

    if (!provider) return jsonResponse({ error: 'Unsupported provider.' }, 400);
    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin']);

    // Delete OAuth connection tokens for this provider
    const { error: oauthDeleteError } = await supabase
      .from('oauth_connections')
      .delete()
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (oauthDeleteError) throw oauthDeleteError;

    // Update integration account status to disconnected
    const { error: accountUpdateError } = await supabase
      .from('integration_accounts')
      .update({
        status: 'disconnected',
        token_status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (accountUpdateError) throw accountUpdateError;

    // Delete per-handle credentials for this provider
    const { error: credentialsDeleteError } = await supabase
      .from('provider_handle_credentials')
      .delete()
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (credentialsDeleteError) throw credentialsDeleteError;

    // For Instagram, also clean up if it was connected via Facebook
    if (provider === 'instagram') {
      const { error: instagramCredentialsError } = await supabase
        .from('provider_handle_credentials')
        .delete()
        .eq('org_id', orgId)
        .eq('provider', 'instagram');

      if (instagramCredentialsError) throw instagramCredentialsError;
    }

    // For Facebook, also clean up Instagram credentials if they exist
    if (provider === 'facebook') {
      const { error: instagramCredentialsError } = await supabase
        .from('provider_handle_credentials')
        .delete()
        .eq('org_id', orgId)
        .eq('provider', 'instagram');

      if (instagramCredentialsError) throw instagramCredentialsError;
    }

    return jsonResponse({
      success: true,
      message: `${provider} connection has been disconnected. All stored tokens have been deleted.`,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
