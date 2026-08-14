import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Send,
  Bookmark,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { edgeFunctionErrorMessage, errorMessage } from '../business-dna/edgeError';
import { providerMeta, type Provider } from '../social-hub/shared';
import type { Database } from '../../types/database';

type SocialPostRow = Pick<Database['public']['Tables']['social_posts']['Row'], 'id' | 'title' | 'body' | 'status' | 'created_at'>;
type PublishTargetRow = Database['public']['Tables']['publish_targets']['Row'];
type PostCommentRow = Database['public']['Tables']['post_comments']['Row'];

type InsightsFetchResult = {
  publishTargetId: string;
  provider: Provider;
  targetLabel: string;
  status: 'ok' | 'error';
  error?: string;
  insights?: {
    impressions: number;
    reach: number;
    likes: number;
    commentsCount: number;
    shares: number;
    saves: number;
    videoViews: number;
    engagementRate: number | null;
    raw?: { reactionsUnavailable?: string; insightsUnavailable?: string; commentsUnavailable?: string; [key: string]: unknown };
  };
  comments?: PostCommentRow[];
};

type PublishedPost = SocialPostRow & { targets: PublishTargetRow[] };

export function PostInsightsPage() {
  const { organization } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPostId = searchParams.get('postId');

  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPosts() {
      setLoadingPosts(true);
      setLoadError(null);

      if (!supabase || !organization?.id) {
        setPosts([]);
        setLoadingPosts(false);
        return;
      }

      const [postsResult, targetsResult] = await Promise.all([
        supabase
          .from('social_posts')
          .select('id, title, body, status, created_at')
          .eq('org_id', organization.id)
          .in('status', ['published', 'partial_failed'])
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('publish_targets')
          .select('*')
          .eq('org_id', organization.id)
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(400),
      ]);

      if (!active) return;

      if (postsResult.error || targetsResult.error) {
        setLoadError(errorMessage(postsResult.error ?? targetsResult.error, 'Could not load published posts.'));
        setPosts([]);
        setLoadingPosts(false);
        return;
      }

      const targetsByPost = new Map<string, PublishTargetRow[]>();
      for (const target of targetsResult.data ?? []) {
        const list = targetsByPost.get(target.social_post_id) ?? [];
        list.push(target);
        targetsByPost.set(target.social_post_id, list);
      }

      const withTargets = (postsResult.data ?? [])
        .map((post) => ({ ...post, targets: targetsByPost.get(post.id) ?? [] }))
        .filter((post) => post.targets.length > 0);

      setPosts(withTargets);
      setLoadingPosts(false);

      // Auto-select the most recent post the first time the list loads, unless the URL
      // already points at one (e.g. a "View insights" link from Social Hub).
      if (!selectedPostId && withTargets.length > 0) {
        setSearchParams({ postId: withTargets[0].id }, { replace: true });
      }
    }

    loadPosts();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const selectedPost = useMemo(() => posts.find((post) => post.id === selectedPostId) ?? null, [posts, selectedPostId]);

  return (
    <div className="page-stack post-insights-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Measure</p>
          <h2>Post Insights &amp; Comments</h2>
        </div>
        <span className="status-pill">{posts.length} published post{posts.length === 1 ? '' : 's'}</span>
      </header>

      <p className="page-subtext">
        Pick a post to pull live performance data straight from each platform and reply to its comments without leaving time2grow.
      </p>

      <section className="post-insights-layout">
        <aside className="post-insights-list" aria-label="Published posts">
          {loadingPosts ? (
            <div className="empty-state small"><Loader2 className="spin" size={20} /><span>Loading posts</span></div>
          ) : loadError ? (
            <div className="form-message warning">{loadError}</div>
          ) : posts.length === 0 ? (
            <div className="empty-state small">
              <MessageCircle size={20} />
              <span>No published posts yet. Publish something from Distribution Hub first.</span>
            </div>
          ) : (
            posts.map((post) => (
              <button
                key={post.id}
                type="button"
                className={`post-insights-list-item ${post.id === selectedPostId ? 'active' : ''}`}
                onClick={() => setSearchParams({ postId: post.id })}
              >
                <strong>{post.title || 'Untitled post'}</strong>
                <span className="post-insights-list-meta">
                  {post.targets.map((target) => providerMeta[target.provider as Provider]?.type ?? target.provider).join(' - ')}
                </span>
                <small>{formatDate(post.created_at)}</small>
              </button>
            ))
          )}
        </aside>

        <div className="post-insights-detail">
          {selectedPost ? (
            <PostInsightsPanel key={selectedPost.id} post={selectedPost} />
          ) : (
            <div className="empty-state">
              <BarChart3 size={28} />
              <h3>Select a post</h3>
              <span>Choose a published post on the left to see its insights and comments.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PostInsightsPanel({ post }: { post: PublishedPost }) {
  const [results, setResults] = useState<InsightsFetchResult[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadInsights = useCallback(async () => {
    if (!supabase) {
      setFetchError('Supabase is not configured.');
      return;
    }

    setFetching(true);
    setFetchError(null);

    const { data, error } = await supabase.functions.invoke('social-insights', {
      body: { socialPostId: post.id },
    });

    if (error) {
      setFetchError(await edgeFunctionErrorMessage(error, 'social-insights'));
      setFetching(false);
      return;
    }

    setResults((data?.results as InsightsFetchResult[]) ?? []);
    setFetching(false);
  }, [post.id]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  function handleReplySent(publishTargetId: string, reply: PostCommentRow) {
    setResults((current) =>
      (current ?? []).map((result) =>
        result.publishTargetId === publishTargetId
          ? { ...result, comments: [reply, ...(result.comments ?? [])] }
          : result,
      ),
    );
  }

  return (
    <div className="post-insights-panel">
      <div className="post-insights-panel-header">
        <div>
          <h3>{post.title || 'Untitled post'}</h3>
          {post.body ? <p className="post-insights-body-preview">{post.body}</p> : null}
        </div>
        <button type="button" className="button ghost" onClick={loadInsights} disabled={fetching}>
          {fetching ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          {fetching ? 'Refreshing' : 'Refresh insights'}
        </button>
      </div>

      {fetchError ? <div className="form-message warning">{fetchError}</div> : null}

      {!results ? (
        <div className="empty-state small"><Loader2 className="spin" size={20} /><span>Fetching insights from each platform</span></div>
      ) : results.length === 0 ? (
        <div className="empty-state small"><span>No published targets with insights yet.</span></div>
      ) : (
        <div className="post-insights-target-list">
          {results.map((result) => (
            <PlatformInsightsCard key={result.publishTargetId} result={result} onReplySent={handleReplySent} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformInsightsCard({
  result,
  onReplySent,
}: {
  result: InsightsFetchResult;
  onReplySent: (publishTargetId: string, reply: PostCommentRow) => void;
}) {
  const meta = providerMeta[result.provider];

  return (
    <article className="platform-insights-card">
      <div className="platform-insights-card-header">
        <span className={`provider-badge provider-${result.provider}`}>{meta?.detail ?? result.provider}</span>
        <span className="platform-insights-target-label">{result.targetLabel}</span>
      </div>

      {result.status === 'error' ? (
        <div className="form-message warning">{result.error}</div>
      ) : (
        <>
          <div className="insight-metric-grid">
            <InsightMetric icon={Eye} label="Impressions" value={result.insights?.impressions} />
            <InsightMetric icon={Eye} label="Reach" value={result.insights?.reach} />
            <InsightMetric icon={Eye} label="Video Views" value={result.insights?.videoViews} />
            <InsightMetric icon={Heart} label="Likes" value={result.insights?.likes} />
            <InsightMetric icon={MessageCircle} label="Comments" value={result.insights?.commentsCount} />
            <InsightMetric icon={Repeat2} label="Shares" value={result.insights?.shares} />
            <InsightMetric icon={Bookmark} label="Saves" value={result.insights?.saves} />
          </div>
          {typeof result.insights?.engagementRate === 'number' ? (
            <p className="engagement-rate">Engagement rate: {result.insights.engagementRate.toFixed(2)}%</p>
          ) : null}
          {result.insights?.raw?.reactionsUnavailable ? (
            <p className="insight-partial-note">Likes unavailable: {result.insights.raw.reactionsUnavailable}</p>
          ) : null}
          {result.insights?.raw?.insightsUnavailable ? (
            <p className="insight-partial-note">Reach/impressions unavailable: {result.insights.raw.insightsUnavailable}</p>
          ) : null}
          {result.insights?.raw?.commentsUnavailable ? (
            <p className="insight-partial-note">Comments unavailable: {result.insights.raw.commentsUnavailable}</p>
          ) : null}

          <CommentsList result={result} onReplySent={onReplySent} />
        </>
      )}
    </article>
  );
}

function InsightMetric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number | undefined }) {
  return (
    <div className="insight-metric">
      <Icon size={16} />
      <div>
        <strong>{formatNumber(value ?? 0)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function CommentsList({
  result,
  onReplySent,
}: {
  result: InsightsFetchResult;
  onReplySent: (publishTargetId: string, reply: PostCommentRow) => void;
}) {
  const comments = (result.comments ?? []).filter((comment) => comment.direction === 'inbound');
  const repliesByParent = new Map<string, PostCommentRow[]>();
  for (const comment of result.comments ?? []) {
    if (comment.direction !== 'outbound' || !comment.parent_comment_id) continue;
    const list = repliesByParent.get(comment.parent_comment_id) ?? [];
    list.push(comment);
    repliesByParent.set(comment.parent_comment_id, list);
  }

  if (comments.length === 0) {
    return <p className="no-comments">No comments on this post yet.</p>;
  }

  return (
    <div className="post-comments-list">
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          replies={repliesByParent.get(comment.id) ?? []}
          publishTargetId={result.publishTargetId}
          onReplySent={onReplySent}
        />
      ))}
    </div>
  );
}

function CommentRow({
  comment,
  replies,
  publishTargetId,
  onReplySent,
}: {
  comment: PostCommentRow;
  replies: PostCommentRow[];
  publishTargetId: string;
  onReplySent: (publishTargetId: string, reply: PostCommentRow) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sendReply() {
    if (!supabase) {
      setSendError('Supabase is not configured.');
      return;
    }
    if (!message.trim()) return;

    setSending(true);
    setSendError(null);

    const { data, error } = await supabase.functions.invoke('social-comment-reply', {
      body: { commentId: comment.id, message: message.trim() },
    });

    if (error) {
      setSendError(await edgeFunctionErrorMessage(error, 'social-comment-reply'));
      setSending(false);
      return;
    }

    const reply = data?.reply as PostCommentRow | undefined;
    if (reply) onReplySent(publishTargetId, reply);
    setMessage('');
    setReplying(false);
    setSending(false);
  }

  return (
    <div className="post-comment-row">
      <div className="post-comment-author">
        <strong>{comment.author_name || comment.author_handle || 'Someone'}</strong>
        <small>{formatDate(comment.external_created_at ?? comment.created_at)}</small>
      </div>
      <p className="post-comment-message">{comment.message}</p>
      {comment.like_count > 0 ? <span className="post-comment-likes"><Heart size={12} /> {comment.like_count}</span> : null}

      {replies.map((reply) => (
        <div className="post-comment-reply" key={reply.id}>
          <div className="post-comment-author">
            <strong>You</strong>
            <small>{formatDate(reply.created_at)}</small>
            {reply.status === 'failed' ? <span className="status-pill warning">Failed to send</span> : null}
          </div>
          <p className="post-comment-message">{reply.message}</p>
        </div>
      ))}

      {replying ? (
        <div className="post-comment-reply-form">
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Write a reply..."
            disabled={sending}
            onKeyDown={(event) => {
              if (event.key === 'Enter') sendReply();
            }}
          />
          <button type="button" className="button primary" onClick={sendReply} disabled={sending || !message.trim()}>
            {sending ? <Loader2 className="spin" size={14} /> : <Send size={14} />}
          </button>
          <button type="button" className="button ghost" onClick={() => setReplying(false)} disabled={sending}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="link-button" onClick={() => setReplying(true)}>
          Reply
        </button>
      )}
      {sendError ? <div className="form-message warning">{sendError}</div> : null}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
