// Posts a reply to a specific comment on the originating platform (Facebook, Instagram,
// LinkedIn, or YouTube) and records the outcome as an outbound row in `post_comments`, linked
// to the inbound comment it replies to via `parent_comment_id`.
import {
  assertOrgRole,
  corsHeaders,
  errorResponse,
  getAuthenticatedUser,
  googleErrorMessage,
  handleOptions,
  HttpError,
  jsonResponse,
  serviceClient,
} from '../_shared/youtube.ts';
import { oauthAccessToken, providerAccessToken, stringValue, type Provider } from '../_shared/provider_auth.ts';
import { redactProviderMessage } from '../_shared/security.ts';

type SupabaseClient = ReturnType<typeof serviceClient>;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  let pendingReplyId: string | null = null;
  const supabase = serviceClient();

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const commentId = stringValue(body.commentId);
    const message = stringValue(body.message);
    if (!commentId) return jsonResponse({ error: 'Missing commentId.' }, 400);
    if (!message) return jsonResponse({ error: 'Reply message cannot be empty.' }, 400);

    const { data: parentComment, error: parentError } = await supabase
      .from('post_comments')
      .select('*')
      .eq('id', commentId)
      .single();
    if (parentError || !parentComment) throw new HttpError(404, parentError?.message ?? 'Comment not found.');
    if (!parentComment.external_comment_id) {
      throw new HttpError(400, 'This comment has no platform ID yet, so a reply cannot be sent.');
    }

    await assertOrgRole(supabase, parentComment.org_id, user.id, ['owner', 'admin', 'editor']);

    const { data: target, error: targetError } = await supabase
      .from('publish_targets')
      .select('*')
      .eq('id', parentComment.publish_target_id)
      .eq('org_id', parentComment.org_id)
      .single();
    if (targetError || !target) throw new HttpError(404, 'The original post target could not be found.');

    let handle: Record<string, unknown> | undefined;
    if (target.distribution_handle_id) {
      const { data: handleRow } = await supabase
        .from('distribution_handles')
        .select('*')
        .eq('id', target.distribution_handle_id)
        .eq('org_id', parentComment.org_id)
        .maybeSingle();
      handle = handleRow ?? undefined;
    }

    const provider = parentComment.provider as Provider;

    const { data: pendingReply, error: pendingError } = await supabase
      .from('post_comments')
      .insert({
        org_id: parentComment.org_id,
        social_post_id: parentComment.social_post_id,
        publish_target_id: parentComment.publish_target_id,
        provider,
        direction: 'outbound',
        parent_comment_id: parentComment.id,
        external_parent_comment_id: parentComment.external_comment_id,
        message,
        status: 'sending',
        created_by: user.id,
      })
      .select('*')
      .single();
    if (pendingError || !pendingReply) throw pendingError ?? new HttpError(500, 'Could not create the reply record.');
    pendingReplyId = pendingReply.id;

    const result = await sendReply({ supabase, provider, orgId: parentComment.org_id, handle, parentComment, message });

    const { data: finalReply, error: finalError } = await supabase
      .from('post_comments')
      .update({ status: 'sent', external_comment_id: result.externalCommentId, error_message: null })
      .eq('id', pendingReply.id)
      .select('*')
      .single();
    if (finalError) throw finalError;

    // Nudge the cached comment count on post_insights up by one so the UI feels responsive;
    // the next "Refresh insights" call reconciles it with the platform's real count.
    await bumpCachedCommentCount(supabase, parentComment.publish_target_id as string);

    return jsonResponse({ reply: finalReply });
  } catch (error) {
    if (pendingReplyId) {
      const message = safeErrorMessage(error, 'Could not send the reply.');
      // supabase-js query builders are "thenable" (awaitable) but not real native Promises, so
      // they don't have a `.catch()` method - chaining one directly throws a TypeError. Wrap in
      // try/catch instead; this is already best-effort cleanup, so a failure here is swallowed
      // either way.
      try {
        await supabase.from('post_comments').update({ status: 'failed', error_message: message }).eq('id', pendingReplyId);
      } catch {
        // Non-fatal - the original error is what gets returned to the caller below.
      }
    }
    return errorResponse(error);
  }
});

async function sendReply({
  supabase,
  provider,
  orgId,
  handle,
  parentComment,
  message,
}: {
  supabase: SupabaseClient;
  provider: Provider;
  orgId: string;
  handle?: Record<string, unknown>;
  parentComment: Record<string, unknown>;
  message: string;
}): Promise<{ externalCommentId: string }> {
  switch (provider) {
    case 'facebook':
      return replyFacebook(supabase, orgId, handle, parentComment, message);
    case 'instagram':
      return replyInstagram(supabase, orgId, handle, parentComment, message);
    case 'linkedin':
      return replyLinkedIn(supabase, orgId, handle, parentComment, message);
    case 'youtube':
      return replyYouTube(supabase, orgId, parentComment, message);
    default:
      throw new HttpError(400, `Replying to comments is not supported for ${provider} yet.`);
  }
}

async function replyFacebook(supabase: SupabaseClient, orgId: string, handle: Record<string, unknown> | undefined, parentComment: Record<string, unknown>, message: string) {
  const token = await providerAccessToken(supabase, 'facebook', orgId, handle);
  const graph = graphBase();
  const commentId = String(parentComment.external_comment_id);

  const response = await fetchJson(`${graph}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: token }),
  });

  const externalCommentId = stringValue(response.id);
  if (!externalCommentId) throw new HttpError(502, 'Facebook did not return a reply ID.');
  return { externalCommentId };
}

async function replyInstagram(supabase: SupabaseClient, orgId: string, handle: Record<string, unknown> | undefined, parentComment: Record<string, unknown>, message: string) {
  const token = await providerAccessToken(supabase, 'instagram', orgId, handle);
  const graph = graphBase();
  const commentId = String(parentComment.external_comment_id);

  const response = await fetchJson(`${graph}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: token }),
  });

  const externalCommentId = stringValue(response.id);
  if (!externalCommentId) throw new HttpError(502, 'Instagram did not return a reply ID.');
  return { externalCommentId };
}

async function replyLinkedIn(supabase: SupabaseClient, orgId: string, handle: Record<string, unknown> | undefined, parentComment: Record<string, unknown>, message: string) {
  const token = await oauthAccessToken(supabase, 'linkedin', orgId).catch(() => providerAccessToken(supabase, 'linkedin', orgId, handle));
  const author = handle ? linkedInAuthor(handle) : null;
  if (!author) throw new HttpError(400, 'A saved LinkedIn organization handle is required to reply as your page.');

  const commentUrn = String(parentComment.external_comment_id);
  const shareUrn = commentUrn.split(',')[0] || commentUrn;

  const response = await fetch(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(shareUrn)}/comments`, {
    method: 'POST',
    headers: linkedInHeaders(token),
    body: JSON.stringify({ actor: author, message: { text: message }, parentComment: commentUrn }),
  });

  if (!response.ok) throw new HttpError(response.status, await responseText(response, 'LinkedIn reply failed.'));
  const externalCommentId = response.headers.get('x-restli-id') ?? `${shareUrn}-reply-${Date.now()}`;
  return { externalCommentId };
}

async function replyYouTube(supabase: SupabaseClient, orgId: string, parentComment: Record<string, unknown>, message: string) {
  const token = await oauthAccessToken(supabase, 'youtube', orgId);

  const response = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snippet: {
        parentId: String(parentComment.external_comment_id),
        textOriginal: message,
      },
    }),
  });

  if (!response.ok) throw new HttpError(response.status, await googleErrorMessage(response, 'YouTube reply failed.'));
  const body = await response.json();
  const externalCommentId = stringValue(body.id);
  if (!externalCommentId) throw new HttpError(502, 'YouTube did not return a reply ID.');
  return { externalCommentId };
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.error?.message === 'string' ? json.error.message : 'The platform rejected the reply.';
    throw new HttpError(response.status, redactProviderMessage(message));
  }
  return json;
}

async function responseText(response: Response, fallback: string) {
  const text = await response.text().catch(() => '');
  return redactProviderMessage(text || fallback);
}

function graphBase() {
  return `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') || 'v21.0'}`;
}

function linkedInHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Linkedin-Version': Deno.env.get('LINKEDIN_VERSION') || '202606',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

function linkedInAuthor(handle: Record<string, unknown>) {
  const value = stringValue(handle.external_handle_id);
  if (!value) throw new HttpError(400, 'LinkedIn organization URN is missing on this handle.');
  return value.startsWith('urn:li:') ? value : `urn:li:organization:${value}`;
}

function safeErrorMessage(error: unknown, fallback: string) {
  return redactProviderMessage(error instanceof Error ? error.message : error, fallback);
}

async function bumpCachedCommentCount(supabase: SupabaseClient, publishTargetId: string) {
  try {
    const { data: existing } = await supabase
      .from('post_insights')
      .select('comments_count')
      .eq('publish_target_id', publishTargetId)
      .maybeSingle();
    if (!existing) return;
    await supabase
      .from('post_insights')
      .update({ comments_count: (existing.comments_count ?? 0) + 1 })
      .eq('publish_target_id', publishTargetId);
  } catch {
    // Non-fatal - the count will self-correct on the next insights refresh.
  }
}
