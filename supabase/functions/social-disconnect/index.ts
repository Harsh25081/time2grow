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

    console.log(`[social-disconnect] Disconnecting ${provider} for org ${orgId}`);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin']);

    // Delete OAuth connection tokens for this provider
    const { error: oauthDeleteError } = await supabase
      .from('oauth_connections')
      .delete()
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (oauthDeleteError) {
      console.error('[social-disconnect] OAuth delete error:', oauthDeleteError);
      throw oauthDeleteError;
    }

    // Update integration account status to disabled (not 'disconnected' - that's not in the CHECK constraint)
    const { error: accountUpdateError } = await supabase
      .from('integration_accounts')
      .update({
        status: 'disabled',
        token_status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (accountUpdateError) {
      console.error('[social-disconnect] Account update error:', accountUpdateError);
      throw accountUpdateError;
    }

    // Delete per-handle credentials for this provider
    const { error: credentialsDeleteError } = await supabase
      .from('provider_handle_credentials')
      .delete()
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (credentialsDeleteError) {
      console.error('[social-disconnect] Credentials delete error:', credentialsDeleteError);
      throw credentialsDeleteError;
    }

    // Disable distribution handles so stale pages don't persist after reconnect
    const { error: handlesDisableError } = await supabase
      .from('distribution_handles')
      .update({ is_enabled: false, metadata: { source: 'disconnect', disabled_at: new Date().toISOString() } })
      .eq('org_id', orgId)
      .eq('provider', provider);

    if (handlesDisableError) {
      console.error('[social-disconnect] Handles disable error:', handlesDisableError);
      throw handlesDisableError;
    }

    // For Instagram, also clean up if it was connected via Facebook
    if (provider === 'instagram') {
      const { error: instagramCredentialsError } = await supabase
        .from('provider_handle_credentials')
        .delete()
        .eq('org_id', orgId)
        .eq('provider', 'instagram');

      if (instagramCredentialsError) {
        console.error('[social-disconnect] Instagram credentials cleanup error:', instagramCredentialsError);
        throw instagramCredentialsError;
      }
    }

    // For Facebook, also clean up Instagram credentials and handles
    if (provider === 'facebook') {
      const { error: instagramCredentialsError } = await supabase
        .from('provider_handle_credentials')
        .delete()
        .eq('org_id', orgId)
        .eq('provider', 'instagram');

      if (instagramCredentialsError) {
        console.error('[social-disconnect] Instagram credentials cleanup error:', instagramCredentialsError);
        throw instagramCredentialsError;
      }

      // Also disable Instagram handles since they depend on the Facebook connection
      const { error: instagramHandlesError } = await supabase
        .from('distribution_handles')
        .update({ is_enabled: false, metadata: { source: 'disconnect', disabled_at: new Date().toISOString() } })
        .eq('org_id', orgId)
        .eq('provider', 'instagram');

      if (instagramHandlesError) {
        console.error('[social-disconnect] Instagram handles disable error:', instagramHandlesError);
        throw instagramHandlesError;
      }
    }

    console.log(`[social-disconnect] Successfully disconnected ${provider} for org ${orgId}`);

    return jsonResponse({
      success: true,
      message: `${provider} connection has been disconnected. All stored tokens have been deleted.`,
    });
  } catch (error) {
    console.error('[social-disconnect] Error:', error);
    return errorResponse(error);
  }
});
