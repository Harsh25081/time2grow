import {
  assertOrgRole,
  errorResponse,
  getAuthenticatedUser,
  handleOptions,
  jsonResponse,
  serviceClient,
} from '../_shared/youtube.ts';

type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'google_ads' | 'whatsapp' | 'slack' | 'telegram';

const providers: Provider[] = ['facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram'];

const providerConfig: Record<Provider, {
  authMode: 'oauth' | 'server_token' | 'ads_setup';
  requiredSecrets: string[];
  connectable: boolean;
}> = {
  facebook: { authMode: 'oauth', requiredSecrets: ['META_CLIENT_ID', 'META_CLIENT_SECRET'], connectable: true },
  instagram: { authMode: 'oauth', requiredSecrets: ['META_CLIENT_ID', 'META_CLIENT_SECRET'], connectable: true },
  linkedin: { authMode: 'oauth', requiredSecrets: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'], connectable: true },
  youtube: { authMode: 'oauth', requiredSecrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], connectable: true },
  google_ads: { authMode: 'ads_setup', requiredSecrets: ['GOOGLE_ADS_DEVELOPER_TOKEN'], connectable: false },
  whatsapp: { authMode: 'server_token', requiredSecrets: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'], connectable: false },
  slack: { authMode: 'oauth', requiredSecrets: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'], connectable: true },
  telegram: { authMode: 'server_token', requiredSecrets: ['TELEGRAM_BOT_TOKEN'], connectable: false },
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    const supabase = serviceClient();
    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'editor', 'viewer']);

    const [{ data: accounts, error: accountsError }, { data: handles, error: handlesError }] = await Promise.all([
      supabase.from('integration_accounts').select('provider,status,token_status,last_sync_at,display_name').eq('org_id', orgId),
      supabase.from('distribution_handles').select('provider,is_enabled').eq('org_id', orgId).eq('is_enabled', true),
    ]);

    if (accountsError) throw accountsError;
    if (handlesError) throw handlesError;

    const accountByProvider = new Map<string, Record<string, unknown>>();
    for (const account of accounts ?? []) {
      if (!accountByProvider.has(account.provider)) accountByProvider.set(account.provider, account);
    }

    const handleCountByProvider = new Map<string, number>();
    for (const handle of handles ?? []) {
      handleCountByProvider.set(handle.provider, (handleCountByProvider.get(handle.provider) ?? 0) + 1);
    }

    const connections = providers.map((provider) => {
      const account = provider === 'instagram'
        ? accountByProvider.get('instagram') ?? accountByProvider.get('facebook')
        : accountByProvider.get(provider);
      const config = providerConfig[provider];
      const secretsConfigured = config.requiredSecrets.every((name) => Boolean(Deno.env.get(name)));
      const handleCount = handleCountByProvider.get(provider) ?? 0;
      const accountStatus = typeof account?.status === 'string' ? account.status : null;
      const oauthConnected = accountStatus === 'connected' && (provider !== 'instagram' || handleCount > 0);
      const needsReconnect = accountStatus === 'expired' || accountStatus === 'disabled' || (accountStatus === 'connected' && account?.token_status === 'revoked');
      const connected = oauthConnected || (
        config.authMode === 'server_token' && secretsConfigured && handleCount > 0
      );

      return {
        provider,
        status: connected ? 'connected' : needsReconnect ? 'needs_reconnect' : secretsConfigured ? 'ready_to_connect' : 'needs_setup',
        authMode: config.authMode,
        connectable: config.connectable,
        secretsConfigured,
        handleCount,
        displayName: typeof account?.display_name === 'string' ? account.display_name : null,
        tokenStatus: typeof account?.token_status === 'string' ? account.token_status : null,
        lastSyncAt: typeof account?.last_sync_at === 'string' ? account.last_sync_at : null,
        accountStatus,
      };
    });

    return jsonResponse({ connections });
  } catch (error) {
    return errorResponse(error);
  }
});
