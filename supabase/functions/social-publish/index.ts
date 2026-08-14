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
  uploadVideoToYouTube,
} from "../_shared/youtube.ts";
import { redactProviderMessage } from "../_shared/security.ts";
import {
  oauthAccessToken,
  providerAccessToken,
} from "../_shared/provider_auth.ts";

type Provider =
  | "facebook"
  | "instagram"
  | "linkedin"
  | "youtube"
  | "google_ads"
  | "whatsapp"
  | "slack"
  | "telegram";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  let activeClaim: { postId: string; claimId: string } | null = null;

  try {
    if (req.method !== "POST")
      return jsonResponse({ error: "Method not allowed." }, 405);

    const supabase = serviceClient();
    const body = await req.json().catch(() => ({}));
    const postId = typeof body.postId === "string" ? body.postId : "";
    const schedulerClaimId =
      typeof body.claimId === "string" ? body.claimId : "";
    if (!postId) return jsonResponse({ error: "Missing postId." }, 400);

    const schedulerRequest = isSchedulerRequest(req);
    const user = schedulerRequest
      ? null
      : await getAuthenticatedUser(req, supabase);

    const { data: post, error: postError } = await supabase
      .from("social_posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (postError || !post)
      throw new HttpError(404, postError?.message ?? "Post not found.");
    if (schedulerRequest) {
      if (
        !schedulerClaimId ||
        post.status !== "publishing" ||
        post.delivery_claim_id !== schedulerClaimId
      ) {
        throw new HttpError(
          409,
          "This scheduled delivery claim is no longer active.",
        );
      }
      activeClaim = { postId, claimId: schedulerClaimId };
    } else {
      await assertOrgRole(supabase, post.org_id, user!.id, [
        "owner",
        "admin",
        "editor",
      ]);
    }

    const scheduledAt =
      typeof post.scheduled_at === "string"
        ? new Date(post.scheduled_at)
        : null;
    if (
      !schedulerRequest &&
      scheduledAt &&
      !Number.isNaN(scheduledAt.getTime()) &&
      scheduledAt.getTime() > Date.now()
    ) {
      throw new HttpError(
        409,
        "This post is scheduled for " +
          scheduledAt.toISOString() +
          " and cannot be published early.",
      );
    }

    if (!schedulerRequest) {
      const manualClaimId = crypto.randomUUID();
      const { data: claimedPost, error: claimError } = await supabase
        .from("social_posts")
        .update({
          status: "publishing",
          delivery_claim_id: manualClaimId,
          delivery_claimed_at: new Date().toISOString(),
        })
        .eq("id", postId)
        .in("status", ["draft", "queued", "failed", "partial_failed"])
        .is("delivery_claim_id", null)
        .select("id")
        .maybeSingle();

      if (claimError) throw claimError;
      if (!claimedPost)
        throw new HttpError(
          409,
          "This post is already publishing or has already been published.",
        );
      activeClaim = { postId, claimId: manualClaimId };
    }

    const { data: targets, error: targetsError } = await supabase
      .from("publish_targets")
      .select("*")
      .eq("social_post_id", postId)
      .eq("org_id", post.org_id)
      .eq("status", "queued");

    if (targetsError) throw targetsError;
    if (!targets?.length)
      throw new HttpError(
        400,
        "No queued publish targets found for this post.",
      );

    const handleIds = targets
      .map((target) => target.distribution_handle_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const handlesById = await loadHandles(supabase, post.org_id, handleIds);
    const asset = await loadMediaAsset(supabase, post);
    const results = [];

    for (const target of targets) {
      const handle = target.distribution_handle_id
        ? handlesById.get(target.distribution_handle_id)
        : null;
      const provider = target.provider as Provider;

      await supabase
        .from("publish_targets")
        .update({
          status: "publishing",
          attempts: (target.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", target.id);

      try {
        if (!handle) {
          throw new HttpError(
            400,
            "This is a demo target. Add and select a saved real handle before publishing.",
          );
        }

        const result = await publishProvider({
          supabase,
          provider,
          post,
          target,
          handle,
          asset,
        });

        await supabase
          .from("publish_targets")
          .update({
            status: "published",
            external_post_id: result.externalId ?? null,
            provider_response: result.response ?? {},
            published_at: new Date().toISOString(),
          })
          .eq("id", target.id);

        results.push({
          targetId: target.id,
          provider,
          label: target.target_label,
          status: "published",
          externalId: result.externalId ?? null,
        });
      } catch (error) {
        console.log(">>>>>>>> the error in MAIN function is : ", error);
        const message = safeErrorMessage(error, "Publish failed.");
        await supabase
          .from("publish_targets")
          .update({
            status: "failed",
            error_message: message,
            provider_response: { error: message },
          })
          .eq("id", target.id);

        results.push({
          targetId: target.id,
          provider,
          label: target.target_label,
          status: "failed",
          error: message,
        });
      }
    }

    const failed = results.filter(
      (result) => result.status === "failed",
    ).length;
    const postStatus =
      failed === 0
        ? "published"
        : failed === results.length
          ? "failed"
          : "partial_failed";
    const completedClaim = activeClaim;
    if (!completedClaim)
      throw new HttpError(
        409,
        "The active delivery claim was lost. Try publishing again.",
      );
    const { data: finalizedPost, error: finalizeError } = await supabase
      .from("social_posts")
      .update({
        status: postStatus,
        delivery_claim_id: null,
        delivery_claimed_at: null,
      })
      .eq("id", postId)
      .eq("delivery_claim_id", completedClaim.claimId)
      .select("id")
      .maybeSingle();

    if (finalizeError) throw finalizeError;
    if (!finalizedPost)
      throw new HttpError(
        409,
        "The delivery claim expired before publishing completed.",
      );

    activeClaim = null;

    return jsonResponse({
      postId,
      postStatus,
      published: results.length - failed,
      failed,
      results,
    });
  } catch (error) {
    if (activeClaim)
      await failActiveClaim(activeClaim, error).catch(() => undefined);
    return errorResponse(error);
  }
});

function isSchedulerRequest(req: Request) {
  const expected = Deno.env.get("SCHEDULED_JOBS_SECRET") ?? "";
  const actual = req.headers.get("x-scheduled-jobs-secret") ?? "";
  if (!expected || !actual) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(actual);
  const b = encoder.encode(expected);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (a[index % Math.max(a.length, 1)] ?? 0) ^
      (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return difference === 0;
}

async function loadHandles(
  supabase: ReturnType<typeof serviceClient>,
  orgId: string,
  handleIds: string[],
) {
  const handlesById = new Map<string, Record<string, unknown>>();
  if (handleIds.length === 0) return handlesById;

  const { data, error } = await supabase
    .from("distribution_handles")
    .select("*")
    .eq("org_id", orgId)
    .in("id", handleIds);
  if (error) throw error;

  for (const handle of data ?? []) {
    handlesById.set(handle.id, handle);
  }

  return handlesById;
}

async function loadMediaAsset(
  supabase: ReturnType<typeof serviceClient>,
  post: Record<string, unknown>,
) {
  const postId = stringValue(post.id);
  if (postId) {
    const { data, error } = await supabase
      .from("social_media_assets")
      .select("*")
      .eq("social_post_id", postId)
      .eq("org_id", stringValue(post.org_id) ?? "")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const contentItemId = stringValue(post.content_item_id);
  if (!contentItemId) return null;

  const { data, error } = await supabase
    .from("social_media_assets")
    .select("*")
    .eq("content_item_id", contentItemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function publishProvider({
  supabase,
  provider,
  post,
  target,
  handle,
  asset,
}: {
  supabase: ReturnType<typeof serviceClient>;
  provider: Provider;
  post: Record<string, unknown>;
  target: Record<string, unknown>;
  handle: Record<string, unknown>;
  asset: Record<string, unknown> | null;
}) {
  switch (provider) {
    case "facebook":
      return publishFacebook(post, handle, asset, supabase);
    case "instagram":
      return publishInstagram(post, handle, asset, supabase);
    case "linkedin":
      return publishLinkedIn(post, handle, asset, supabase);
    case "youtube":
      return publishYouTube(post, asset, supabase);
    case "whatsapp":
      return publishWhatsApp(post, handle, asset, supabase);
    case "slack":
      return publishSlack(post, target, handle, asset, supabase);
    case "telegram":
      return publishTelegram(post, handle, asset, supabase);
    case "google_ads":
      throw new HttpError(
        400,
        "Google Ads is not a social post target. Build this from the Ads campaign flow with budget, objective, assets, and policy review.",
      );
    default:
      throw new HttpError(400, `Unsupported provider: ${provider}`);
  }
}

// async function publishFacebook(post: Record<string, unknown>, handle: Record<string, unknown>, asset: Record<string, unknown> | null, supabase: ReturnType<typeof serviceClient>) {
//   const pageId = externalId(handle, 'Facebook Page ID');
//   const token = await providerAccessToken(supabase, 'facebook', stringValue(post.org_id) ?? '', handle);
//   const graph = graphBase();
//   const message = postMessage(post);

//   if (!asset) {
//     const response = await formPost(`${graph}/${pageId}/feed`, { message, access_token: token });
//     return { externalId: stringValue(response.id), response };
//   }

//   const media = await downloadMedia(supabase, asset);
//   const endpoint = media.mimeType.startsWith('video/') ? 'videos' : 'photos';
//   const form = new FormData();
//   form.set('access_token', token);
//   form.set(media.mimeType.startsWith('video/') ? 'description' : 'caption', message);
//   form.set('source', media.blob, media.fileName);
//   const response = await fetchJson(`${graph}/${pageId}/${endpoint}`, { method: 'POST', body: form });

//   // Photos: Meta's creation response includes `post_id` directly (the composite Page-Post ID).
//   // Videos: only the video's own `id` is returned - and that's fine to store as-is, because
//   // social-insights queries reactions/comments/video_insights via generic Graph API edges that
//   // work directly on a raw node ID, without needing a composite Post ID at all.
//   const mediaExternalId = stringValue(response.post_id) ?? stringValue(response.id);
//   if (!mediaExternalId) throw new HttpError(502, 'Facebook did not return an ID for the uploaded media.');

//   return { externalId: mediaExternalId, response };
// }

async function publishFacebook(
  post: Record<string, unknown>,
  handle: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  const pageId = externalId(handle, "Facebook Page ID");
  const token = await providerAccessToken(
    supabase,
    "facebook",
    stringValue(post.org_id) ?? "",
    handle,
  );
  const graph = graphBase(); // https://facebook.com
  const message = postMessage(post);

  if (!asset) {
    const response = await formPost(`${graph}/${pageId}/feed`, {
      message,
      access_token: token,
    });
    return { externalId: stringValue(response.id), response };
  }

  const media = await downloadMedia(supabase, asset);
  const isVideo = media.mimeType.startsWith("video/");

  // Photos: Keep your working logic
  if (!isVideo) {
    const form = new FormData();
    form.set("access_token", token);
    form.set("caption", message);
    form.set("source", media.blob, media.fileName);
    const response = await fetchJson(`${graph}/${pageId}/photos`, {
      method: "POST",
      body: form,
    });

    const mediaExternalId =
      stringValue(response.post_id) ?? stringValue(response.id);
    if (!mediaExternalId)
      throw new HttpError(
        502,
        "Facebook did not return an ID for the uploaded photo.",
      );
    return { externalId: mediaExternalId, response };
  }

  // Videos/Reels: 3-step publishing flow with required upload metadata headers
  try {
    // Step 1: Initialize the upload session using uppercase 'START'
    const initUrl = `${graph}/${pageId}/video_reels`;
    const initResponse = await fetchJson(initUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "START",
        access_token: token,
      }),
    });

    const videoId = stringValue(initResponse.video_id);
    const uploadUrl = stringValue(initResponse.upload_url);

    if (!videoId || !uploadUrl) {
      throw new HttpError(
        502,
        "Failed to initialize Facebook Reel session. Check token permissions.",
      );
    }

    // Determine accurate byte size from the file blob
    const fileSizeStr = String(media.blob.size);

    // Step 2: Stream binary video payload with exact metadata specification headers
    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`, // Meta rupload protocol expects 'OAuth' keyword
        offset: "0",
        file_size: fileSizeStr, // Absolute byte length required by Meta server
        "X-Entity-Type": media.mimeType, // Maps the data stream codec container
        "Content-Type": "application/octet-stream", // Standard header signature for raw binary bodies
      },
      body: media.blob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new HttpError(
        502,
        `Binary video upload stream failed: ${errorText}`,
      );
    }

    // Step 3: Finish and publish the processed Reel
    const publishUrl = `${graph}/${pageId}/video_reels`;
    const publishResponse = await fetchJson(publishUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_phase: "FINISH",
        video_id: videoId,
        video_state: "PUBLISHED",
        description: message,
        access_token: token,
      }),
    });

    if (!publishResponse.success && publishResponse.id === undefined) {
      throw new HttpError(
        502,
        `Meta rejected finalizing the publication: ${JSON.stringify(publishResponse)}`,
      );
    }

    // Return the verified video ID for metrics tracking pipelines
    return { externalId: videoId, response: publishResponse };
  } catch (error: any) {
    console.log(
      ">>>>>>> the error in the PUBLISH FACEBOOK function is : ",
      error,
    );
    throw new HttpError(500, `Facebook Reel upload failed: ${error.message}`);
  }
}

async function publishInstagram(
  post: Record<string, unknown>,
  handle: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  if (!asset)
    throw new HttpError(
      400,
      "Instagram publishing requires an image or video file.",
    );

  const igUserId = externalId(handle, "Instagram Business Account ID");
  const token = await providerAccessToken(
    supabase,
    "instagram",
    stringValue(post.org_id) ?? "",
    handle,
  );
  const graph = graphBase();
  const mediaUrl = await signedMediaUrl(supabase, asset);
  const isVideo = mimeType(asset).startsWith("video/");
  const createPayload: Record<string, string> = {
    access_token: token,
    caption: postMessage(post),
  };

  if (isVideo) {
    createPayload.media_type = "REELS";
    createPayload.video_url = mediaUrl;
  } else {
    createPayload.image_url = mediaUrl;
  }

  const container = await formPost(`${graph}/${igUserId}/media`, createPayload);
  const creationId = stringValue(container.id);
  if (!creationId)
    throw new HttpError(502, "Instagram did not return a media container ID.");

  if (isVideo) await waitForInstagramContainer(graph, creationId, token);
  const published = await formPost(`${graph}/${igUserId}/media_publish`, {
    access_token: token,
    creation_id: creationId,
  });

  return { externalId: stringValue(published.id), response: published };
}

async function publishLinkedIn(
  post: Record<string, unknown>,
  handle: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  const token = await providerAccessToken(
    supabase,
    "linkedin",
    stringValue(post.org_id) ?? "",
    handle,
  );
  const author = linkedInAuthor(handle);
  const content: Record<string, unknown> = {};

  if (asset) {
    const media = await downloadMedia(supabase, asset);
    if (media.mimeType.startsWith("video/")) {
      throw new HttpError(
        400,
        "LinkedIn video upload needs the Videos API finalize flow. Use poster/text now or add the video flow next.",
      );
    }

    const imageUrn = await uploadLinkedInImage(token, author, media.blob);
    content.media = { id: imageUrn, altText: title(post) };
  }

  const body: Record<string, unknown> = {
    author,
    commentary: postMessage(post),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (Object.keys(content).length > 0) body.content = content;

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok)
    throw new HttpError(
      response.status,
      await responseText(response, "LinkedIn publish failed."),
    );

  return {
    externalId: response.headers.get("x-restli-id"),
    response: {
      id: response.headers.get("x-restli-id"),
      status: response.status,
    },
  };
}

async function publishYouTube(
  post: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  if (!asset || !mimeType(asset).startsWith("video/")) {
    throw new HttpError(400, "YouTube publishing requires a video file.");
  }

  const token = await oauthAccessToken(
    supabase,
    "youtube",
    stringValue(post.org_id) ?? "",
  );
  const media = await downloadMedia(supabase, asset);
  const response = await uploadVideoToYouTube({
    accessToken: token,
    title: title(post),
    description: body(post),
    media: media.blob,
    mimeType: media.mimeType,
  });

  return { externalId: stringValue(response.id), response };
}

async function publishWhatsApp(
  post: Record<string, unknown>,
  handle: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  const token = await providerAccessToken(
    supabase,
    "whatsapp",
    stringValue(post.org_id) ?? "",
    handle,
  );
  const senderPhoneNumberId = envValue("WHATSAPP_PHONE_NUMBER_ID");
  const to = externalId(handle, "recipient WhatsApp number");
  const graph = graphBase();

  if (!asset) {
    const response = await fetchJson(
      `${graph}/${senderPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: bearerJsonHeaders(token),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: true, body: postMessage(post) },
        }),
      },
    );
    return { externalId: firstMessageId(response), response };
  }

  const media = await downloadMedia(supabase, asset);
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("file", media.blob, media.fileName);
  const upload = await fetchJson(`${graph}/${senderPhoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const mediaId = stringValue(upload.id);
  if (!mediaId) throw new HttpError(502, "WhatsApp did not return a media ID.");

  const type = media.mimeType.startsWith("video/") ? "video" : "image";
  const response = await fetchJson(`${graph}/${senderPhoneNumberId}/messages`, {
    method: "POST",
    headers: bearerJsonHeaders(token),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type,
      [type]: { id: mediaId, caption: postMessage(post) },
    }),
  });

  return { externalId: firstMessageId(response), response };
}

async function publishSlack(
  post: Record<string, unknown>,
  target: Record<string, unknown>,
  handle: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  const token = await providerAccessToken(
    supabase,
    "slack",
    stringValue(post.org_id) ?? "",
    handle,
  );
  const channel =
    stringValue(handle.external_handle_id) || stringValue(target.target_label);
  if (!channel) throw new HttpError(400, "Slack channel ID is missing.");

  const text = asset
    ? `${postMessage(post)}\n${await signedMediaUrl(supabase, asset)}`
    : postMessage(post);
  const response = await fetchJson("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: bearerJsonHeaders(token),
    body: JSON.stringify({
      channel,
      text,
      unfurl_links: true,
      unfurl_media: true,
    }),
  });

  if (response.ok !== true)
    throw new HttpError(
      400,
      `Slack rejected the message: ${stringValue(response.error) ?? "unknown_error"}`,
    );
  return { externalId: stringValue(response.ts), response };
}

async function publishTelegram(
  post: Record<string, unknown>,
  handle: Record<string, unknown>,
  asset: Record<string, unknown> | null,
  supabase: ReturnType<typeof serviceClient>,
) {
  const token = await providerAccessToken(
    supabase,
    "telegram",
    stringValue(post.org_id) ?? "",
    handle,
  );
  const chatId = externalId(handle, "Telegram chat/channel ID");
  const baseUrl = `https://api.telegram.org/bot${token}`;

  if (!asset) {
    const response = await fetchJson(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: postMessage(post) }),
    });
    return { externalId: telegramMessageId(response), response };
  }

  const media = await downloadMedia(supabase, asset);
  const isVideo = media.mimeType.startsWith("video/");
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", postMessage(post));
  form.set(isVideo ? "video" : "photo", media.blob, media.fileName);

  const response = await fetchJson(
    `${baseUrl}/${isVideo ? "sendVideo" : "sendPhoto"}`,
    {
      method: "POST",
      body: form,
    },
  );

  return { externalId: telegramMessageId(response), response };
}

async function downloadMedia(
  supabase: ReturnType<typeof serviceClient>,
  asset: Record<string, unknown>,
) {
  const bucket = stringValue(asset.storage_bucket) ?? "post-media";
  const path = stringValue(asset.storage_path);
  if (!path) throw new HttpError(400, "Media storage path is missing.");

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data)
    throw new HttpError(400, error?.message ?? "Could not download media.");

  return {
    blob: data,
    fileName: stringValue(asset.file_name) ?? "upload",
    mimeType:
      stringValue(asset.mime_type) ?? (data.type || "application/octet-stream"),
  };
}

async function signedMediaUrl(
  supabase: ReturnType<typeof serviceClient>,
  asset: Record<string, unknown>,
) {
  const bucket = stringValue(asset.storage_bucket) ?? "post-media";
  const path = stringValue(asset.storage_path);
  if (!path) throw new HttpError(400, "Media storage path is missing.");

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl)
    throw new HttpError(400, error?.message ?? "Could not create media URL.");
  return data.signedUrl;
}

async function waitForInstagramContainer(
  graph: string,
  containerId: string,
  token: string,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await fetchJson(
      `${graph}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR")
      throw new HttpError(400, "Instagram could not process this video.");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new HttpError(
    408,
    "Instagram video is still processing. Try publishing again in a minute.",
  );
}

async function uploadLinkedInImage(token: string, owner: string, blob: Blob) {
  const init = await fetchJson(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: linkedInHeaders(token),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    },
  );

  const uploadUrl = stringValue(init.value?.uploadUrl);
  const image = stringValue(init.value?.image);
  if (!uploadUrl || !image)
    throw new HttpError(502, "LinkedIn did not return an image upload URL.");

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: blob,
  });

  if (!upload.ok)
    throw new HttpError(
      upload.status,
      await responseText(upload, "LinkedIn image upload failed."),
    );
  return image;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : typeof json?.message === "string"
          ? json.message
          : await googleErrorMessage(
              response,
              "The publishing provider rejected the request.",
            );
    throw new HttpError(response.status, redactProviderError(message));
  }

  return json;
}

async function failActiveClaim(
  claim: { postId: string; claimId: string },
  error: unknown,
) {
  const supabase = serviceClient();
  const message = safeErrorMessage(
    error,
    "Publishing failed before delivery started.",
  );
  await supabase
    .from("social_posts")
    .update({
      status: "failed",
      delivery_claim_id: null,
      delivery_claimed_at: null,
    })
    .eq("id", claim.postId)
    .eq("delivery_claim_id", claim.claimId);
  console.error(
    JSON.stringify({ level: "error", postId: claim.postId, message }),
  );
}

function safeErrorMessage(error: unknown, fallback: string) {
  return redactProviderMessage(error, fallback, configuredProviderSecrets());
}

function redactProviderError(value: string) {
  return redactProviderMessage(
    value,
    "Provider request failed.",
    configuredProviderSecrets(),
  );
}

function configuredProviderSecrets() {
  return [
    "TELEGRAM_BOT_TOKEN",
    "META_ACCESS_TOKEN",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "INSTAGRAM_ACCESS_TOKEN",
    "LINKEDIN_ACCESS_TOKEN",
    "WHATSAPP_ACCESS_TOKEN",
    "SLACK_BOT_TOKEN",
  ]
    .map((name) => Deno.env.get(name) ?? "")
    .filter(Boolean);
}

async function formPost(url: string, payload: Record<string, string>) {
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(payload),
  });
}

function postMessage(post: Record<string, unknown>) {
  return [title(post), body(post)].filter(Boolean).join("\n\n").trim();
}

function title(post: Record<string, unknown>) {
  return stringValue(post.title) ?? "Untitled post";
}

function body(post: Record<string, unknown>) {
  return stringValue(post.body) ?? "";
}

function mimeType(asset: Record<string, unknown>) {
  return stringValue(asset.mime_type) ?? "application/octet-stream";
}

function graphBase() {
  return `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v21.0"}`;
}

function linkedInHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Linkedin-Version": Deno.env.get("LINKEDIN_VERSION") || "202606",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function linkedInAuthor(handle: Record<string, unknown>) {
  const value = externalId(handle, "LinkedIn organization URN");
  return value.startsWith("urn:li:") ? value : `urn:li:organization:${value}`;
}

function bearerJsonHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function envValue(name: string) {
  const value = Deno.env.get(name);
  if (!value)
    throw new HttpError(400, `${name} is not configured in Supabase secrets.`);
  return value;
}

function externalId(handle: Record<string, unknown>, label: string) {
  const value = stringValue(handle.external_handle_id);
  if (!value) throw new HttpError(400, `${label} is missing on this handle.`);
  return value;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function firstMessageId(response: Record<string, unknown>) {
  const messages = Array.isArray(response.messages) ? response.messages : [];
  return stringValue(messages[0]?.id);
}

function telegramMessageId(response: Record<string, unknown>) {
  const id =
    response.result && typeof response.result === "object"
      ? (response.result as Record<string, unknown>).message_id
      : null;
  return typeof id === "number" ? String(id) : stringValue(id);
}

async function responseText(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  return text || fallback;
}
