import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function htmlResponse(title: string, message: string, status = 200, redirectTo?: string) {
  const redirectScript = redirectTo
    ? `<script>setTimeout(() => { window.location.href = ${JSON.stringify(redirectTo)}; }, 800);</script>`
    : '';

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family: system-ui, sans-serif; padding: 32px;"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${redirectScript}</body></html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

export function handleOptions(req: Request) {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders });
}

export function serviceClient() {
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getAuthenticatedUser(req: Request, supabase: ReturnType<typeof serviceClient>) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Sign in before connecting a channel.');

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Your session expired. Sign in again.');

  return data.user;
}

export async function assertOrgRole(
  supabase: ReturnType<typeof serviceClient>,
  orgId: string,
  userId: string,
  allowedRoles: string[],
) {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('role,status')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data || !allowedRoles.includes(data.role)) {
    throw new HttpError(403, 'You do not have permission to use this connection.');
  }
}

export function googleConfig() {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET') || Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  const fallbackRedirectUri = `${requiredEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/youtube-auth-callback`;
  const redirectUri =
    Deno.env.get('YOUTUBE_REDIRECT_URI') ||
    Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') ||
    fallbackRedirectUri;

  if (!clientId || !clientSecret) {
    throw new HttpError(500, 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Supabase secrets.');
  }

  return { clientId, clientSecret, redirectUri };
}

export function youtubeScopes() {
  return (
    Deno.env.get('YOUTUBE_REQUIRED_SCOPES') ||
    'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
  )
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token)));
  return `${toBase64(iv)}.${toBase64(cipher)}`;
}

export async function decryptToken(value: string) {
  const [ivValue, cipherValue] = value.split('.');
  if (!ivValue || !cipherValue) throw new HttpError(500, 'Stored OAuth token is invalid.');

  const key = await encryptionKey();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivValue) },
    key,
    fromBase64(cipherValue),
  );

  return decoder.decode(plain);
}

export async function exchangeCodeForToken(code: string) {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  return parseGoogleResponse(response, 'Google rejected the YouTube connection.');
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = googleConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  return parseGoogleResponse(response, 'Google rejected the saved YouTube token.');
}

export async function getYouTubeChannel(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;

  const body = await response.json();
  const channel = Array.isArray(body.items) ? body.items[0] : null;
  if (!channel) return null;

  return {
    id: typeof channel.id === 'string' ? channel.id : 'youtube-default',
    title: typeof channel.snippet?.title === 'string' ? channel.snippet.title : 'YouTube Channel',
  };
}

export async function uploadVideoToYouTube({
  accessToken,
  title,
  description,
  media,
  mimeType,
}: {
  accessToken: string;
  title: string;
  description: string;
  media: Blob;
  mimeType: string;
}) {
  const privacyStatus = Deno.env.get('YOUTUBE_DEFAULT_PRIVACY') || 'private';
  const metadata = {
    snippet: {
      title,
      description,
      categoryId: Deno.env.get('YOUTUBE_DEFAULT_CATEGORY_ID') || '22',
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  const startResponse = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(media.size),
        'X-Upload-Content-Type': mimeType,
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!startResponse.ok) {
    throw new HttpError(startResponse.status, await googleErrorMessage(startResponse, 'Could not start YouTube upload.'));
  }

  const uploadUrl = startResponse.headers.get('Location');
  if (!uploadUrl) throw new HttpError(502, 'YouTube did not return an upload URL.');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
      'Content-Length': String(media.size),
    },
    body: media,
  });

  if (!uploadResponse.ok) {
    throw new HttpError(uploadResponse.status, await googleErrorMessage(uploadResponse, 'Could not finish YouTube upload.'));
  }

  return uploadResponse.json();
}

export async function parseGoogleResponse(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof body?.error_description === 'string'
      ? body.error_description
      : typeof body?.error === 'string'
        ? body.error
        : fallback;
    throw new HttpError(response.status, message);
  }

  return body;
}

export async function googleErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  if (typeof body?.error?.message === 'string') return body.error.message;
  if (typeof body?.error_description === 'string') return body.error_description;
  if (typeof body?.error === 'string') return body.error;
  return fallback;
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Missing server secret: ${name}`);
  return value;
}

export function appReturnUrl(path = '/social?youtube=connected') {
  const appOrigin = Deno.env.get('APP_ORIGIN') || Deno.env.get('VITE_APP_URL') || '';
  if (!appOrigin) return '';
  return `${appOrigin.replace(/\/$/, '')}${path}`;
}

export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return jsonResponse({ error: message }, status);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));
}

async function encryptionKey() {
  const secret = Deno.env.get('OAUTH_TOKEN_ENCRYPTION_KEY') || Deno.env.get('INTERNAL_ADMIN_SECRET') || '';
  if (secret.length < 24) {
    throw new HttpError(500, 'Add OAUTH_TOKEN_ENCRYPTION_KEY to Supabase secrets. Use a long random value.');
  }

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
