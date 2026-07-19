import { errorResponse, HttpError, jsonResponse, serviceClient } from '../_shared/youtube.ts';

type ClaimedPost = { post_id: string; claim_id: string };

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
    assertSchedulerRequest(req);

    const supabase = serviceClient();
    const requestedLimit = Number(new URL(req.url).searchParams.get('limit') ?? 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.trunc(requestedLimit), 25)) : 10;
    const { data, error } = await supabase.rpc('claim_due_social_posts', { p_limit: limit });
    if (error) throw new HttpError(500, error.message);

    const claimed = (data ?? []) as ClaimedPost[];
    const results = [];
    for (const post of claimed) {
      try {
        results.push(await deliver(post));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduled delivery request failed.';
        results.push({ postId: post.post_id, ok: false, status: 0, body: { error: message } });
      }
    }

    return jsonResponse({ claimed: claimed.length, results });
  } catch (error) {
    return errorResponse(error);
  }
});

function assertSchedulerRequest(req: Request) {
  const expected = Deno.env.get('SCHEDULED_JOBS_SECRET') ?? '';
  const actual = req.headers.get('x-scheduled-jobs-secret') ?? '';
  if (!expected || !actual || !constantTimeEqual(actual, expected)) {
    throw new HttpError(401, 'Invalid scheduler credentials.');
  }
}

async function deliver(post: ClaimedPost) {
  const url = `${requiredEnv('SUPABASE_URL').replace(/\/$/, '')}/functions/v1/social-publish`;
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
      'x-scheduled-jobs-secret': requiredEnv('SCHEDULED_JOBS_SECRET'),
    },
    body: JSON.stringify({ postId: post.post_id, claimId: post.claim_id }),
  });
  const body = await response.json().catch(() => ({ error: `Publisher returned HTTP ${response.status}.` }));
  return { postId: post.post_id, ok: response.ok, status: response.status, body };
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name) ?? '';
  if (!value) throw new HttpError(500, `${name} is not configured.`);
  return value;
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % Math.max(a.length, 1)] ?? 0) ^ (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return difference === 0;
}
