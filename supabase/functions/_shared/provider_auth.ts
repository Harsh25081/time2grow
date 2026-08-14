import { HttpError, decryptToken, refreshAccessToken, serviceClient } from './youtube.ts';

export type Provider = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'google_ads' | 'whatsapp' | 'slack' | 'telegram';

/**
 * Resolves a usable access token for a given provider + org (+ optional saved handle),
 * refreshing an expired token when a refresh token is available. This is the single
 * source of truth for token retrieval used by publishing, insights, and comment replies.
 */
export async function providerAccessToken(
  supabase: ReturnType<typeof serviceClient>,
  provider: Provider,
  orgId: string,
  handle?: Record<string, unknown>,
) {
  const handleId = stringValue(handle?.id);
  if (handleId) {
    const { data, error } = await supabase
      .from('provider_handle_credentials')
      .select('*')
      .eq('org_id', orgId)
      .eq('provider', provider)
      .eq('distribution_handle_id', handleId)
      .maybeSingle();

    if (error) throw error;
    if (data?.access_token_ciphertext && tokenStillUsable(data.expires_at)) {
      return decryptToken(data.access_token_ciphertext);
    }
  }

  const oauthProvider = provider === 'instagram' ? 'facebook' : provider;
  try {
    return await oauthAccessToken(supabase, oauthProvider, orgId);
  } catch (error) {
    if (provider === 'youtube') throw error;
  }

  return providerToken(provider);
}

export async function oauthAccessToken(supabase: ReturnType<typeof serviceClient>, provider: Provider, orgId: string) {
  const { data, error } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(400, `Connect ${provider} before requesting data from it.`);

  if (data.access_token_ciphertext && tokenStillUsable(data.expires_at)) {
    return decryptToken(data.access_token_ciphertext);
  }

  if (!data.refresh_token_ciphertext) {
    throw new HttpError(400, `${provider} token expired. Reconnect ${provider} in Social Distribution Hub.`);
  }

  const refreshToken = await decryptToken(data.refresh_token_ciphertext);
  const refreshed = await refreshAccessToken(refreshToken);
  const accessToken = stringValue(refreshed.access_token);
  if (!accessToken) throw new HttpError(400, `Could not refresh ${provider} token.`);

  return accessToken;
}

export function tokenStillUsable(expiresAt: unknown) {
  const value = stringValue(expiresAt);
  return !value || Date.parse(value) > Date.now() + 60_000;
}

export function providerToken(provider: Provider) {
  const tokenByProvider: Record<Provider, string[]> = {
    facebook: ['FACEBOOK_PAGE_ACCESS_TOKEN', 'META_ACCESS_TOKEN'],
    instagram: ['INSTAGRAM_ACCESS_TOKEN', 'META_ACCESS_TOKEN'],
    linkedin: ['LINKEDIN_ACCESS_TOKEN'],
    youtube: [],
    google_ads: [],
    whatsapp: ['WHATSAPP_ACCESS_TOKEN'],
    slack: ['SLACK_BOT_TOKEN'],
    telegram: ['TELEGRAM_BOT_TOKEN'],
  };

  for (const key of tokenByProvider[provider]) {
    const value = Deno.env.get(key);
    if (value) return value;
  }

  throw new HttpError(400, `${provider} is not configured. Add the required server token in Supabase secrets.`);
}

export function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
