// Fetches performance insights (impressions/reach/likes/comments/etc.) and the comment list
// for a published post, directly from each connected platform, on demand - i.e. whenever the
// user opens the insights view for that post. Results are cached in `post_insights` /
// `post_comments` so subsequent page loads don't need a live call until the user hits Refresh.
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
} from "../_shared/youtube.ts";
import {
  oauthAccessToken,
  providerAccessToken,
  stringValue,
  type Provider,
} from "../_shared/provider_auth.ts";
import { redactProviderMessage } from "../_shared/security.ts";

type SupabaseClient = ReturnType<typeof serviceClient>;

type FetchedComment = {
  externalCommentId: string;
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  message: string;
  likeCount: number;
  externalCreatedAt: string | null;
  externalParentCommentId: string | null;
};

type FetchedInsights = {
  impressions: number;
  reach: number;
  likes: number;
  commentsCount: number;
  shares: number;
  saves: number;
  videoViews: number;
  raw: Record<string, unknown>;
};

Deno.serve(async (req) => {
  console.log(">>>>>> Entered Function.......");
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== "POST")
      return jsonResponse({ error: "Method not allowed." }, 405);

    const supabase = serviceClient();
    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    console.log(">>>>> the value of BODY is : ", body);
    const socialPostId = stringValue(body.socialPostId);
    const onlyTargetId = stringValue(body.publishTargetId);
    if (!socialPostId)
      return jsonResponse({ error: "Missing socialPostId." }, 400);

    const { data: post, error: postError } = await supabase
      .from("social_posts")
      .select("id, org_id")
      .eq("id", socialPostId)
      .single();
    if (postError || !post)
      throw new HttpError(404, postError?.message ?? "Post not found.");

    await assertOrgRole(supabase, post.org_id, user.id, [
      "owner",
      "admin",
      "editor",
      "viewer",
      "billing_admin",
    ]);

    let targetsQuery = supabase
      .from("publish_targets")
      .select("*")
      .eq("social_post_id", socialPostId)
      .eq("org_id", post.org_id)
      .eq("status", "published");
    if (onlyTargetId) targetsQuery = targetsQuery.eq("id", onlyTargetId);

    const { data: targets, error: targetsError } = await targetsQuery;
    if (targetsError)
      throw new HttpError(
        500,
        targetsError.message || "Could not load publish targets for this post.",
      );
    if (!targets?.length) {
      return jsonResponse({
        socialPostId,
        results: [],
        message: "No published targets to fetch insights for yet.",
      });
    }

    const handleIds = targets
      .map((target) => target.distribution_handle_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const handlesById = await loadHandles(supabase, post.org_id, handleIds);

    const results = [];
    for (const target of targets) {
      const handle = target.distribution_handle_id
        ? handlesById.get(target.distribution_handle_id)
        : undefined;
      const provider = target.provider as Provider;

      await supabase
        .from("post_insights")
        .upsert(
          {
            org_id: post.org_id,
            social_post_id: socialPostId,
            publish_target_id: target.id,
            provider,
            fetch_status: "fetching",
          },
          { onConflict: "publish_target_id" },
        );

      try {
        if (!target.external_post_id) {
          throw new HttpError(
            400,
            "This post has no external ID on the platform yet, so insights are not available.",
          );
        }

        const { insights, comments } = await fetchProviderData({
          supabase,
          provider,
          orgId: post.org_id,
          handle,
          externalPostId: target.external_post_id,
        });
        // console.log(">>>>>> the value of the INSIGHTS is : ",insights," and the value of COMMENTS is : ",comments);

        const engagementRate =
          insights.impressions > 0
            ? Number(
                (
                  ((insights.likes +
                    insights.commentsCount +
                    insights.shares +
                    insights.saves) /
                    insights.impressions) *
                  100
                ).toFixed(4),
              )
            : null;

        await supabase.from("post_insights").upsert(
          {
            org_id: post.org_id,
            social_post_id: socialPostId,
            publish_target_id: target.id,
            provider,
            impressions: insights.impressions,
            reach: insights.reach,
            likes: insights.likes,
            comments_count: insights.commentsCount,
            shares: insights.shares,
            saves: insights.saves,
            video_views: insights.videoViews,
            engagement_rate: engagementRate,
            raw_metrics: insights.raw,
            fetch_status: "ok",
            fetch_error: null,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "publish_target_id" },
        );

        await upsertComments(supabase, {
          orgId: post.org_id,
          socialPostId,
          publishTargetId: target.id,
          provider,
          comments,
        });

        const { data: storedComments } = await supabase
          .from("post_comments")
          .select("*")
          .eq("org_id", post.org_id)
          .eq("publish_target_id", target.id)
          .order("external_created_at", {
            ascending: false,
            nullsFirst: false,
          });

        results.push({
          publishTargetId: target.id,
          provider,
          targetLabel: target.target_label,
          status: "ok",
          insights: { ...insights, engagementRate },
          comments: storedComments ?? [],
        });
      } catch (error) {
        console.log(">>>>>> the error is : ", error);
        const message = safeErrorMessage(
          error,
          "Could not fetch insights from this platform.",
        );
        await supabase.from("post_insights").upsert(
          {
            org_id: post.org_id,
            social_post_id: socialPostId,
            publish_target_id: target.id,
            provider,
            fetch_status: "error",
            fetch_error: message,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "publish_target_id" },
        );

        results.push({
          publishTargetId: target.id,
          provider,
          targetLabel: target.target_label,
          status: "error",
          error: message,
        });
      }
    }

    return jsonResponse({ socialPostId, results });
  } catch (error) {
    return errorResponse(error);
  }
});

async function loadHandles(
  supabase: SupabaseClient,
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
  if (error)
    throw new HttpError(
      500,
      error.message || "Could not load saved account handles.",
    );
  for (const handle of data ?? []) handlesById.set(handle.id, handle);
  return handlesById;
}

async function fetchProviderData({
  supabase,
  provider,
  orgId,
  handle,
  externalPostId,
}: {
  supabase: SupabaseClient;
  provider: Provider;
  orgId: string;
  handle?: Record<string, unknown>;
  externalPostId: string;
}): Promise<{ insights: FetchedInsights; comments: FetchedComment[] }> {
  switch (provider) {
    case "facebook":
      return fetchFacebook(supabase, orgId, handle, externalPostId);
    case "instagram":
      return fetchInstagram(supabase, orgId, handle, externalPostId);
    case "linkedin":
      return fetchLinkedIn(supabase, orgId, handle, externalPostId);
    case "youtube":
      return fetchYouTube(supabase, orgId, externalPostId);
    default:
      throw new HttpError(
        400,
        `Insights are not supported for ${provider} yet.`,
      );
  }
}

const emptyInsights = (): FetchedInsights => ({
  impressions: 0,
  reach: 0,
  likes: 0,
  commentsCount: 0,
  shares: 0,
  saves: 0,
  videoViews: 0,
  raw: {},
});

// --- Facebook -------------------------------------------------------------

async function fetchFacebook(
  supabase: SupabaseClient,
  orgId: string,
  handle: Record<string, unknown> | undefined,
  postId: string,
) {
  const token = await providerAccessToken(supabase, "facebook", orgId, handle);
  const graph = graphBase();
  const insights = emptyInsights();

  // Meta requires a page-scoped ID ("{page-id}_{node-id}") for the /reactions, /comments, and
  // /insights edges on anything that isn't already in that format - a bare node ID (e.g. a raw
  // Video ID) throws "(#100) nonexisting field" on all of them. Text/feed and Photo posts
  // already come back from publishing in the composite format, so `postId` already has an
  // underscore for those and is left untouched. Only a bare ID (no underscore - i.e. a Video)
  // needs the Page ID prefixed on. We already have the Page ID saved on the connected handle,
  // so this is a plain string join, not an extra API call or a lookup that can itself fail.
  //
  // The one exception is /video_insights, which is a Video-specific edge that takes the bare
  // Video ID directly (confirmed against Meta's own Video API example) - so that call below
  // deliberately keeps using `postId`, not the page-scoped id.
  const pageId = stringValue(handle?.external_handle_id);
  const scopedId =
    postId.includes("_") || !pageId ? postId : `${pageId}_${postId}`;

  try {
    const reactionsResponse = await fetchJson(
      `${graph}/${scopedId}/reactions?summary=true&limit=0&access_token=${encodeURIComponent(token)}`,
    );
    // console.log(">>>>> the value of the REACTIONS response is : ",reactionsResponse);
    insights.likes =
      typeof reactionsResponse.summary?.total_count === "number"
        ? reactionsResponse.summary.total_count
        : 0;
    insights.raw = { ...insights.raw, reactions: reactionsResponse.summary };
  } catch (error) {
    insights.raw = {
      ...insights.raw,
      reactionsUnavailable: safeErrorMessage(
        error,
        "Reactions are unavailable for this post.",
      ),
    };
  }

  try {
    // `shares` genuinely only exists as a field on Page-Post objects, and even there only once
    // the post has at least one share - so any failure here is expected and benign.
    const sharesResponse = await fetchJson(
      `${graph}/${scopedId}?fields=shares&access_token=${encodeURIComponent(token)}`,
    );
    // console.log(">>>>>> the value of the SHARES response is : ",sharesResponse);
    insights.shares =
      typeof sharesResponse.shares?.count === "number"
        ? sharesResponse.shares.count
        : 0;
  } catch {
    insights.shares = 0;
  }

  // Impressions/reach/views: Meta now publishes almost all Page video uploads as *Reels* by
  // default (confirmed against the Page's own Insights UI for this exact post), and Reels expose
  // a completely different metric set on `/video_insights` than classic Videos do - `total_video_views`
  // simply isn't a valid metric for a Reel, and Graph API silently returns HTTP 200 with `{ data: [] }`
  // for that mismatch rather than an error.
  //
  // On top of that, Meta deprecated the Reels reach/impressions metric (`post_impressions_unique`,
  // publicly "Reels Unique Impressions") on June 15, 2026 - per Meta's own migration notice, "Reels
  // play count" (`blue_reels_play_count`) is now the *only* Reels-level metric that still exists;
  // there is no reach equivalent left at all. Requesting a deprecated metric name doesn't just omit
  // that one field either - Graph API rejects the *entire* multi-metric call with "(#100) The value
  // must be a valid insights metric" if even one name in the comma-separated list is invalid. That's
  // why bundling `blue_reels_play_count,post_impressions_unique,...` in one call failed outright.
  //
  // So every metric below is fetched in its own isolated request: one bad/deprecated name can now
  // never take a good one down with it, and this stays resilient to Meta deprecating individual
  // metrics again in the future - each probe just quietly returns null and the next one is tried.
  //
  // `/video_insights` always takes the *bare* video ID (never the pageId_postId composite) per
  // Meta's Video API docs. Text/photo/link Page Posts don't support `/video_insights` at all and
  // use the page-scoped `/insights` edge instead.
  const isLikelyVideoNode = !postId.includes("_");

  const probeMetric = async (url: string): Promise<number | null> => {
    try {
      const response = await fetchJson(url);
      // console.log(">>>>>>> the value of the  RESPONSE in Probe Metric function is : ",response);
      const row = (response.data ?? [])[0] as
        | Record<string, unknown>
        | undefined;
      const value = (
        row?.values as Array<Record<string, unknown>> | undefined
      )?.[0]?.value;
      return typeof value === "number" ? value : null;
    } catch (err) {
      console.log(">>>>>>> the ERROR in the Probe Metric function is : ", err);
      return null;
    }
  };

  const videoInsightsUrl = (metric: string) =>
    // `${graph}/${postId}/video_insights&access_token=${encodeURIComponent(token)}`;
    `${graph}/${postId}/video_insights?metric=${metric}&period=lifetime&access_token=${encodeURIComponent(token)}`;
  const postInsightsUrl = (metric: string) =>
    `${graph}/${scopedId}/insights?metric=${metric}&access_token=${encodeURIComponent(token)}`;

  const tryPostLevelImpressions = async () => {
    const [postImpressions, postImpressionsUnique] = await Promise.all([
      probeMetric(postInsightsUrl("post_impressions")),
      probeMetric(postInsightsUrl("post_impressions_unique")),
    ]);
    if (postImpressions === null && postImpressionsUnique === null)
      return false;
    insights.impressions = postImpressions ?? 0;
    insights.reach = postImpressionsUnique ?? 0;
    insights.raw = {
      ...insights.raw,
      metricSource: "post_impressions",
      post_impressions: postImpressions,
      post_impressions_unique: postImpressionsUnique,
    };
    return true;
  };

  let resolved = false;

  if (isLikelyVideoNode) {
    // console.log(">>>>> this is the Video play node .......");
    const reelsPlays = await probeMetric(
      videoInsightsUrl("blue_reels_play_count"),
    );
    // console.log(">>>>> the value of the REELS PLAYS is : ",reelsPlays);
    if (reelsPlays !== null) {
      // console.log(">>>>>>> this is the REELS play .........");
      // No reach/impressions equivalent remains for Reels since Meta's June 2026 deprecation -
      // `insights.reach` stays 0 here, which is accurate, not a bug.
      const [totalViews, uniqueImpressions] = await Promise.all([
        probeMetric(videoInsightsUrl("fb_reels_total_plays")),
        probeMetric(videoInsightsUrl("post_impressions_unique")),
      ]);
      // console.log(">>>>>>??? the value of the TOTAL VIEWS is : ",totalViews," and UNIQUE Impressions is : ",uniqueImpressions);
      insights.videoViews = totalViews;
      insights.impressions = uniqueImpressions ?? totalViews ?? 0;
      insights.reach = reelsPlays ?? 0;
      insights.raw = {
        ...insights.raw,
        metricSource: "reels_play_count",
        blue_reels_play_count: reelsPlays,
      };
      resolved = true;
    } else {
      // console.log(">>>>>>>> this is the NoN REEL Video Play");
      const [totalViews, uniqueViews] = await Promise.all([
        probeMetric(videoInsightsUrl("total_video_views")),
        probeMetric(videoInsightsUrl("total_video_views_unique")),
      ]);
      if (totalViews !== null || uniqueViews !== null) {
        insights.videoViews = totalViews ?? 0;
        insights.impressions = totalViews ?? 0;
        insights.reach = uniqueViews ?? 0;
        insights.raw = {
          ...insights.raw,
          metricSource: "total_video_views",
          total_video_views: totalViews,
          total_video_views_unique: uniqueViews,
        };
        resolved = true;
      } else {
        resolved = await tryPostLevelImpressions();
      }
    }
  } else {
    resolved = await tryPostLevelImpressions();
  }

  if (!resolved) {
    // None of the Reels/Video/Post metric sets returned data (commonly: read_insights or
    // pages_manage_engagement missing, or the Page is under Meta's ~100-follower insights
    // threshold). Reactions/comments above still came through, so just note this instead of
    // failing the whole platform.
    insights.raw = {
      ...insights.raw,
      insightsUnavailable:
        "Impressions/reach/views are unavailable for this post - Meta returned no data for the Reels, Video, or Post metric sets.",
    };
  }

  let comments: FetchedComment[] = [];
  try {
    const commentsResponse = await fetchJson(
      `${graph}/${scopedId}/comments?fields=id,from,message,created_time,like_count,parent&summary=true&order=reverse_chronological&access_token=${encodeURIComponent(token)}`,
    );
    comments = (commentsResponse.data ?? []).map(
      (comment: Record<string, unknown>) => ({
        externalCommentId: String(comment.id),
        authorName:
          stringValue(
            (comment.from as Record<string, unknown> | undefined)?.name,
          ) ?? null,
        authorHandle:
          stringValue(
            (comment.from as Record<string, unknown> | undefined)?.id,
          ) ?? null,
        authorAvatarUrl: null,
        message: stringValue(comment.message) ?? "",
        likeCount:
          typeof comment.like_count === "number" ? comment.like_count : 0,
        externalCreatedAt: stringValue(comment.created_time),
        externalParentCommentId: stringValue(
          (comment.parent as Record<string, unknown> | undefined)?.id,
        ),
      }),
    );
    insights.commentsCount =
      typeof commentsResponse.summary?.total_count === "number"
        ? commentsResponse.summary.total_count
        : comments.length;
  } catch (error) {
    insights.raw = {
      ...insights.raw,
      commentsUnavailable: safeErrorMessage(
        error,
        "Comments are unavailable for this post.",
      ),
    };
  }
  // console.log(">>>>>>> the value of the INSIGHTS is : ",insights);

  return { insights, comments };
}

// --- Instagram --------------------------------------------------------------

async function fetchInstagram(
  supabase: SupabaseClient,
  orgId: string,
  handle: Record<string, unknown> | undefined,
  mediaId: string,
) {
  // console.log(">>>>> ENtered the Fetch Instagram function .......");
  const token = await providerAccessToken(supabase, "instagram", orgId, handle);
  const graph = graphBase();

  const media = await fetchJson(
    `${graph}/${mediaId}?fields=media_type,like_count,comments_count&access_token=${encodeURIComponent(token)}`,
  );
  // console.log(">>>>>> the value of the MEDIA is : ",media);

  const isVideo = media.media_type === "VIDEO" || media.media_type === "REELS";
  const metricList = isVideo
    ? "views,reach,saved,shares,total_interactions"
    : "impressions,reach,saved,shares,total_interactions";

  const insights = emptyInsights();
  // console.log(">>>>>>> the value of INSIGHts is : ",insights);
  try {
    // console.log(">>>>>>> Before INSIGHT RESPONSE calllinnnngggggg........");
    const insightsResponse = await fetchJson(
      `${graph}/${mediaId}/insights?metric=${metricList}&access_token=${encodeURIComponent(token)}`,
    );
    // console.log(">>>>> the value of the INSIGHT RESPONSE is : ",insightsResponse);
    const metricValues: Record<string, number> = {};
    for (const row of insightsResponse.data ?? []) {
      const value = row.values?.[0]?.value ?? row.total_value?.value;
      if (typeof value === "number") metricValues[row.name] = value;
    }
    // console.log(">>>>> the value of the METRIC VALUE is : ",metricValues);
    insights.impressions = metricValues.impressions ?? metricValues.views ?? 0;
    insights.videoViews = metricValues.views ?? 0;
    insights.reach = metricValues.reach ?? 0;
    insights.saves = metricValues.saved ?? 0;
    insights.shares = metricValues.shares ?? 0;
    insights.raw = insightsResponse;
  } catch (error) {
    // console.log(">>>>>> the error while fetching INSIGHTS RESPONSE is : ",error);
    // Some media types/ad accounts restrict certain metrics; fall back to the basic counts below.
    insights.raw = {
      insightsError: safeErrorMessage(
        error,
        "Instagram insights partially unavailable.",
      ),
    };
  }

  insights.likes = typeof media.like_count === "number" ? media.like_count : 0;
  insights.commentsCount =
    typeof media.comments_count === "number" ? media.comments_count : 0;

  let comments: FetchedComment[] = [];
  try {
    const commentsResponse = await fetchJson(
      `${graph}/${mediaId}/comments?fields=id,username,text,timestamp,like_count&access_token=${encodeURIComponent(token)}`,
    );
    // console.log(">>>>> the value of the COMMENTS RESPONSE is : ",commentsResponse);
    comments = (commentsResponse.data ?? []).map(
      (comment: Record<string, unknown>) => ({
        externalCommentId: String(comment.id),
        authorName: stringValue(comment.username),
        authorHandle: stringValue(comment.username),
        authorAvatarUrl: null,
        message: stringValue(comment.text) ?? "",
        likeCount:
          typeof comment.like_count === "number" ? comment.like_count : 0,
        externalCreatedAt: stringValue(comment.timestamp),
        externalParentCommentId: null,
      }),
    );
  } catch (error) {
    // console.log(">>>>> the error while fetching COMMMENTS RESPONSE is : ",error);
    // Usually missing instagram_manage_comments permission on the connected token - the stats
    // above still came through, so don't fail the whole platform over this.
    insights.raw = {
      ...insights.raw,
      commentsUnavailable: safeErrorMessage(
        error,
        "Comments are unavailable for this post.",
      ),
    };
  }

  return { insights, comments };
}

// --- LinkedIn -----------------------------------------------------------------
// Organic post analytics on LinkedIn require the Community Management API product, which is a
// separate approval from basic posting access. This uses the Social Actions API, which returns
// like/comment totals for a share URN and is available on the same access tier as posting.

async function fetchLinkedIn(
  supabase: SupabaseClient,
  orgId: string,
  handle: Record<string, unknown> | undefined,
  shareUrn: string,
) {
  const token = await oauthAccessToken(supabase, "linkedin", orgId).catch(() =>
    providerAccessToken(supabase, "linkedin", orgId, handle),
  );
  const urn = shareUrn.startsWith("urn:li:")
    ? shareUrn
    : `urn:li:share:${shareUrn}`;
  const encodedUrn = encodeURIComponent(urn);

  const social = await fetchJson(
    `https://api.linkedin.com/rest/socialActions/${encodedUrn}`,
    { headers: linkedInHeaders(token) },
  );

  const insights = emptyInsights();
  insights.likes =
    typeof social.likesSummary?.totalLikes === "number"
      ? social.likesSummary.totalLikes
      : 0;
  insights.commentsCount =
    typeof social.commentsSummary?.totalFirstLevelComments === "number"
      ? social.commentsSummary.totalFirstLevelComments
      : 0;
  insights.raw = social;

  const commentsResponse = await fetchJson(
    `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`,
    { headers: linkedInHeaders(token) },
  );
  const comments: FetchedComment[] = (commentsResponse.elements ?? []).map(
    (comment: Record<string, unknown>) => ({
      externalCommentId: String(comment.$URN ?? comment.id),
      authorName: stringValue(comment.actor),
      authorHandle: stringValue(comment.actor),
      authorAvatarUrl: null,
      message:
        stringValue(
          (comment.message as Record<string, unknown> | undefined)?.text,
        ) ?? "",
      likeCount: 0,
      externalCreatedAt:
        typeof comment.created === "object"
          ? stringValue((comment.created as Record<string, unknown>).time)
          : null,
      externalParentCommentId: null,
    }),
  );

  return { insights, comments };
}

// --- YouTube --------------------------------------------------------------

async function fetchYouTube(
  supabase: SupabaseClient,
  orgId: string,
  videoId: string,
) {
  const token = await oauthAccessToken(supabase, "youtube", orgId);

  const statsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!statsResponse.ok)
    throw new HttpError(
      statsResponse.status,
      await youTubeErrorMessage(statsResponse, "Could not load YouTube stats."),
    );
  const statsBody = await statsResponse.json();
  console.log(">>>>> the value of the STATS BODY is : ", statsBody);
  const stats = statsBody.items?.[0]?.statistics ?? {};
  console.log(">>>>>> the value of the youTUBE STATS is : ", stats);

  const insights = emptyInsights();
  insights.videoViews = Number(stats.viewCount ?? 0);
  insights.impressions = Number(stats.viewCount ?? 0);
  insights.likes = Number(stats.likeCount ?? 0);
  insights.commentsCount = Number(stats.commentCount ?? 0);
  insights.raw = { stats };

  let comments: FetchedComment[] = [];
  try {
    const commentsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&order=time&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!commentsResponse.ok)
      throw new HttpError(
        commentsResponse.status,
        await youTubeErrorMessage(
          commentsResponse,
          "Could not load YouTube comments.",
        ),
      );
    const commentsBody = await commentsResponse.json();
    comments = (commentsBody.items ?? [])
      .map((item: Record<string, unknown>) => {
        const snippet = (item.snippet as Record<string, unknown>)
          ?.topLevelComment as Record<string, unknown> | undefined;
        const inner = snippet?.snippet as Record<string, unknown> | undefined;
        return {
          externalCommentId: stringValue(snippet?.id) ?? "",
          authorName: stringValue(inner?.authorDisplayName),
          authorHandle: stringValue(
            inner?.authorChannelId &&
              (inner.authorChannelId as Record<string, unknown>).value,
          ),
          authorAvatarUrl: stringValue(inner?.authorProfileImageUrl),
          message: stringValue(inner?.textDisplay) ?? "",
          likeCount: typeof inner?.likeCount === "number" ? inner.likeCount : 0,
          externalCreatedAt: stringValue(inner?.publishedAt),
          externalParentCommentId: null,
        };
      })
      .filter((comment) => comment.externalCommentId);
  } catch (error) {
    // View/like/comment counts above still came through even if comments themselves failed
    // (most commonly: the token was granted before youtube.force-ssl was required - reconnect
    // YouTube from Distribution Hub to re-grant it).
    insights.raw = {
      ...insights.raw,
      commentsUnavailable: safeErrorMessage(
        error,
        "Comments are unavailable for this video.",
      ),
    };
  }

  return { insights, comments };
}

async function youTubeErrorMessage(response: Response, fallback: string) {
  const message = await googleErrorMessage(response, fallback);
  if (
    response.status === 401 ||
    response.status === 403 ||
    /insufficient.*scope/i.test(message)
  ) {
    return "YouTube needs additional permission to read comments. Reconnect YouTube from Distribution Hub to grant access, then try again.";
  }
  return message;
}

// --- shared helpers ---------------------------------------------------------

async function upsertComments(
  supabase: SupabaseClient,
  {
    orgId,
    socialPostId,
    publishTargetId,
    provider,
    comments,
  }: {
    orgId: string;
    socialPostId: string;
    publishTargetId: string;
    provider: Provider;
    comments: FetchedComment[];
  },
) {
  if (!comments.length) return;

  const rows = comments
    .filter((comment) => comment.externalCommentId)
    .map((comment) => ({
      org_id: orgId,
      social_post_id: socialPostId,
      publish_target_id: publishTargetId,
      provider,
      direction: "inbound" as const,
      external_comment_id: comment.externalCommentId,
      external_parent_comment_id: comment.externalParentCommentId,
      author_name: comment.authorName,
      author_handle: comment.authorHandle,
      author_avatar_url: comment.authorAvatarUrl,
      message: comment.message,
      like_count: comment.likeCount,
      status: "received" as const,
      external_created_at: comment.externalCreatedAt,
    }));

  const { error } = await supabase
    .from("post_comments")
    .upsert(rows, { onConflict: "org_id,provider,external_comment_id" });
  if (error)
    throw new HttpError(
      500,
      error.message || "Could not save fetched comments.",
    );
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : "The platform rejected the insights request.";
    throw new HttpError(response.status, redactProviderMessage(message));
  }
  return json;
}

function graphBase() {
  return `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") || "v21.0"}`;
}

// Resolves a Photo/Video node ID to its real Page-Post ID via Meta's `page_story_id` field.
// Needed because photo/video Page posts published before the publishFacebook fix had their
// Photo/Video node ID saved as external_post_id instead of the actual Post ID - and only a real
// Post ID supports reactions/comments/shares/insights. Safe no-op for posts that already have
// the correct ID: requesting `page_story_id` on a genuine Post node fails, and that failure just
// means the given ID was already right, so we fall back to using it unchanged.
function linkedInHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Linkedin-Version": Deno.env.get("LINKEDIN_VERSION") || "202606",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function safeErrorMessage(error: unknown, fallback: string) {
  return redactProviderMessage(
    error instanceof Error ? error.message : error,
    fallback,
  );
}
