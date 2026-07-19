import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  MousePointerClick,
  Target,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';

type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status' | 'updated_at'>;
type ContentItemRow = Pick<Database['public']['Tables']['content_items']['Row'], 'id' | 'campaign_id' | 'content_type' | 'metadata' | 'status' | 'created_at'>;
type MarketingTaskRow = Pick<Database['public']['Tables']['marketing_tasks']['Row'], 'id' | 'campaign_id' | 'status' | 'due_at' | 'recurrence' | 'created_at'>;
type SocialPostRow = Pick<Database['public']['Tables']['social_posts']['Row'], 'id' | 'campaign_id' | 'status' | 'scheduled_at' | 'created_at'>;
type AnalyticsMetricRow = Database['public']['Tables']['analytics_metrics']['Row'];
type AnalyticsSourceRow = Database['public']['Tables']['analytics_sources']['Row'];

type LoadError = {
  area: string;
  message: string;
};

type CampaignRollup = {
  id: string;
  name: string;
  status: CampaignRow['status'];
  updatedAt: string;
  content: number;
  approvedContent: number;
  tasks: number;
  openTasks: number;
  posts: number;
  livePosts: number;
  spend: number;
  revenue: number;
};

const completedTaskStatuses: MarketingTaskRow['status'][] = ['approved', 'done', 'archived'];
const approvedContentStatuses: ContentItemRow['status'][] = ['ready', 'queued', 'published'];
const livePostStatuses: SocialPostRow['status'][] = ['queued', 'publishing', 'published'];

export function AnalyticsPage() {
  const { organization } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemRow[]>([]);
  const [tasks, setTasks] = useState<MarketingTaskRow[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPostRow[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetricRow[]>([]);
  const [sources, setSources] = useState<AnalyticsSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<LoadError[]>([]);

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      setLoading(true);
      setErrors([]);

      if (!supabase || !organization?.id) {
        setCampaigns([]);
        setContentItems([]);
        setTasks([]);
        setSocialPosts([]);
        setMetrics([]);
        setSources([]);
        setLoading(false);
        return;
      }

      const [
        campaignResult,
        contentResult,
        taskResult,
        postResult,
        metricResult,
        sourceResult,
      ] = await Promise.all([
        supabase
          .from('campaigns')
          .select('id, name, status, updated_at')
          .eq('org_id', organization.id)
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('content_items')
          .select('id, campaign_id, content_type, metadata, status, created_at')
          .eq('org_id', organization.id)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('marketing_tasks')
          .select('id, campaign_id, status, due_at, recurrence, created_at')
          .eq('org_id', organization.id)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('social_posts')
          .select('id, campaign_id, status, scheduled_at, created_at')
          .eq('org_id', organization.id)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('analytics_metrics')
          .select('*')
          .eq('org_id', organization.id)
          .order('metric_date', { ascending: false })
          .limit(500),
        supabase
          .from('analytics_sources')
          .select('*')
          .eq('org_id', organization.id)
          .order('updated_at', { ascending: false })
          .limit(50),
      ]);

      if (!active) return;

      setCampaigns(campaignResult.data ?? []);
      setContentItems(contentResult.data ?? []);
      setTasks(taskResult.data ?? []);
      setSocialPosts(postResult.data ?? []);
      setMetrics(metricResult.data ?? []);
      setSources(sourceResult.data ?? []);

      setErrors([
        loadError('Campaigns', campaignResult.error),
        loadError('Content', contentResult.error),
        loadError('Tasks', taskResult.error),
        loadError('Social posts', postResult.error),
        loadError('Reporting metrics', metricResult.error),
        loadError('Reporting sources', sourceResult.error),
      ].filter((error): error is LoadError => Boolean(error)));
      setLoading(false);
    }

    loadAnalytics();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const analytics = useMemo(() => {
    const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active').length;
    const approvedContent = contentItems.filter((item) => approvedContentStatuses.includes(item.status)).length;
    const posters = contentItems.filter((item) => item.content_type === 'poster').length;
    const publishedPosts = socialPosts.filter((post) => post.status === 'published').length;
    const queuedPosts = socialPosts.filter((post) => post.status === 'queued' || post.status === 'publishing').length;
    const openTasks = tasks.filter((task) => !completedTaskStatuses.includes(task.status)).length;
    const recurringTasks = tasks.filter((task) => task.recurrence !== 'none').length;
    const overdueTasks = tasks.filter((task) => isOverdue(task)).length;
    const reviewScores = contentItems
      .map((item) => reviewScore(item.metadata))
      .filter((score): score is number => score !== null);
    const averageReviewScore = reviewScores.length > 0
      ? Math.round(reviewScores.reduce((total, score) => total + score, 0) / reviewScores.length)
      : null;

    const totals = metrics.reduce(
      (current, row) => ({
        spend: current.spend + Number(row.spend),
        impressions: current.impressions + Number(row.impressions),
        clicks: current.clicks + Number(row.clicks),
        conversions: current.conversions + Number(row.conversions),
        revenue: current.revenue + Number(row.revenue),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    );
    const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    const connectedSources = sources.filter((source) => source.status === 'connected' || source.status === 'syncing').length;

    return {
      activeCampaigns,
      approvedContent,
      posters,
      publishedPosts,
      queuedPosts,
      openTasks,
      recurringTasks,
      overdueTasks,
      reviewScores: reviewScores.length,
      averageReviewScore,
      totals,
      ctr,
      roas,
      connectedSources,
    };
  }, [campaigns, contentItems, metrics, socialPosts, sources, tasks]);

  const campaignRollups = useMemo(() => buildCampaignRollups(campaigns, contentItems, tasks, socialPosts, metrics), [campaigns, contentItems, metrics, socialPosts, tasks]);
  const sourceRollups = useMemo(() => buildSourceRollups(metrics, sources), [metrics, sources]);
  const hasWorkflowData = campaigns.length + contentItems.length + tasks.length + socialPosts.length > 0;
  const hasReportingData = metrics.length > 0;

  return (
    <div className="page-stack analytics-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Measure</p>
          <h2>Analytics</h2>
        </div>
        <span className={hasReportingData || hasWorkflowData ? 'status-pill success' : 'status-pill warning'}>
          {hasReportingData ? `${metrics.length} metric rows` : hasWorkflowData ? 'Workflow data' : 'No data yet'}
        </span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading analytics">
          <Loader2 className="spin" size={28} />
          <h3>Loading analytics</h3>
        </section>
      ) : (
        <>
          {errors.length > 0 ? (
            <section className="form-message warning" aria-label="Analytics notices">
              Some analytics data could not load yet: {errors.map((error) => `${error.area}: ${error.message}`).join(' | ')}
            </section>
          ) : null}

          <section className="stats-grid" aria-label="Analytics summary">
            <article className="stat-card">
              <span>Active campaigns</span>
              <strong>{analytics.activeCampaigns}</strong>
              <small>{campaigns.length} total campaigns</small>
            </article>
            <article className="stat-card">
              <span>Open tasks</span>
              <strong>{analytics.openTasks}</strong>
              <small>{analytics.overdueTasks} overdue · {analytics.recurringTasks} recurring</small>
            </article>
            <article className="stat-card">
              <span>Published posts</span>
              <strong>{analytics.publishedPosts}</strong>
              <small>{analytics.queuedPosts} queued or publishing</small>
            </article>
          </section>

          <section className="stats-grid" aria-label="Reporting summary">
            <article className="stat-card">
              <span>Spend</span>
              <strong>{money(analytics.totals.spend)}</strong>
              <small>{analytics.connectedSources} connected sources</small>
            </article>
            <article className="stat-card">
              <span>Revenue</span>
              <strong>{money(analytics.totals.revenue)}</strong>
              <small>ROAS {analytics.roas.toFixed(2)}x</small>
            </article>
            <article className="stat-card">
              <span>Clicks</span>
              <strong>{number(analytics.totals.clicks)}</strong>
              <small>{analytics.ctr.toFixed(1)}% CTR from {number(analytics.totals.impressions)} impressions</small>
            </article>
          </section>

          <section className="work-band analytics-health-grid">
            <article className="draft-panel analytics-health-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Output</p>
                  <h3>Content health</h3>
                </div>
                <CheckCircle2 size={21} />
              </div>
              <div className="analytics-meter">
                <span style={{ width: `${percent(analytics.approvedContent, Math.max(contentItems.length, 1))}%` }} />
              </div>
              <p>{analytics.approvedContent} of {contentItems.length} saved assets are ready, queued, or published.</p>
              <small>{analytics.posters} poster assets · {analytics.reviewScores} reviewed assets · average review {analytics.averageReviewScore ?? '—'}</small>
            </article>

            <article className="draft-panel analytics-health-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Operations</p>
                  <h3>Task health</h3>
                </div>
                <CalendarDays size={21} />
              </div>
              <div className="analytics-meter warning">
                <span style={{ width: `${percent(tasks.length - analytics.openTasks, Math.max(tasks.length, 1))}%` }} />
              </div>
              <p>{tasks.length - analytics.openTasks} of {tasks.length} tasks are approved, done, or archived.</p>
              <small>{analytics.overdueTasks > 0 ? `${analytics.overdueTasks} overdue tasks need attention.` : 'No overdue tasks found.'}</small>
            </article>

            <article className="draft-panel analytics-health-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Performance</p>
                  <h3>Reporting health</h3>
                </div>
                <MousePointerClick size={21} />
              </div>
              <div className="analytics-meter blue">
                <span style={{ width: `${Math.min(100, analytics.connectedSources * 25)}%` }} />
              </div>
              <p>{analytics.connectedSources} reporting sources are connected or syncing.</p>
              <small>{hasReportingData ? `${metrics.length} daily metric rows loaded.` : 'Connect reporting sources to fill spend, clicks, and revenue.'}</small>
            </article>
          </section>

          <section className="draft-panel saved-content-panel" aria-label="Campaign analytics">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Campaign view</p>
                <h3>Campaign health board</h3>
              </div>
              <Target size={21} />
            </div>

            <div className="saved-content-list">
              {campaignRollups.length > 0 ? campaignRollups.map((campaign) => (
                <article className="saved-content-row campaign-row analytics-row" key={campaign.id}>
                  <div className="saved-content-row__main">
                    <strong>{campaign.name}</strong>
                    <div className="saved-content-row__meta">
                      <span>{campaign.status}</span>
                      <span>Updated {formatDate(campaign.updatedAt)}</span>
                    </div>
                    <div className="campaign-metrics">
                      <span><strong>{campaign.content}</strong> content</span>
                      <span><strong>{campaign.openTasks}</strong> open tasks</span>
                      <span><strong>{campaign.livePosts}</strong> live posts</span>
                      <span><strong>{money(campaign.spend)}</strong> spend</span>
                      <span><strong>{money(campaign.revenue)}</strong> revenue</span>
                    </div>
                  </div>
                  <div className="saved-content-row__side">
                    <small>Readiness</small>
                    <strong>{campaignReadiness(campaign)}%</strong>
                  </div>
                </article>
              )) : (
                <div className="queue-empty">
                  <BarChart3 size={20} />
                  <span>Create campaigns and link work to see campaign analytics.</span>
                </div>
              )}
            </div>
          </section>

          <section className="draft-panel saved-content-panel" aria-label="Source analytics">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Sources</p>
                <h3>Reporting sources</h3>
              </div>
              <CircleDollarSign size={21} />
            </div>

            <div className="analytics-source-grid">
              {sourceRollups.length > 0 ? sourceRollups.map((source) => (
                <article className="analytics-source-card" key={source.key}>
                  <div>
                    <strong>{source.name}</strong>
                    <span>{source.status}</span>
                  </div>
                  <dl>
                    <div><dt>Spend</dt><dd>{money(source.spend)}</dd></div>
                    <div><dt>Clicks</dt><dd>{number(source.clicks)}</dd></div>
                    <div><dt>Revenue</dt><dd>{money(source.revenue)}</dd></div>
                  </dl>
                </article>
              )) : (
                <div className="queue-empty">
                  <CircleDollarSign size={20} />
                  <span>No reporting source rows yet. Connect ad, web, or ecommerce sources from Settings when provider sync is ready.</span>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function buildCampaignRollups(
  campaigns: CampaignRow[],
  contentItems: ContentItemRow[],
  tasks: MarketingTaskRow[],
  socialPosts: SocialPostRow[],
  metrics: AnalyticsMetricRow[],
): CampaignRollup[] {
  const map = new Map<string, CampaignRollup>();
  for (const campaign of campaigns) {
    map.set(campaign.id, {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      updatedAt: campaign.updated_at,
      content: 0,
      approvedContent: 0,
      tasks: 0,
      openTasks: 0,
      posts: 0,
      livePosts: 0,
      spend: 0,
      revenue: 0,
    });
  }
  for (const item of contentItems) {
    const rollup = item.campaign_id ? map.get(item.campaign_id) : null;
    if (!rollup) continue;
    rollup.content += 1;
    if (approvedContentStatuses.includes(item.status)) rollup.approvedContent += 1;
  }
  for (const task of tasks) {
    const rollup = task.campaign_id ? map.get(task.campaign_id) : null;
    if (!rollup) continue;
    rollup.tasks += 1;
    if (!completedTaskStatuses.includes(task.status)) rollup.openTasks += 1;
  }
  for (const post of socialPosts) {
    const rollup = post.campaign_id ? map.get(post.campaign_id) : null;
    if (!rollup) continue;
    rollup.posts += 1;
    if (livePostStatuses.includes(post.status)) rollup.livePosts += 1;
  }

  const byName = new Map(Array.from(map.values()).map((campaign) => [campaign.name.toLocaleLowerCase(), campaign]));
  for (const row of metrics) {
    const rollup = byName.get(row.campaign.toLocaleLowerCase());
    if (!rollup) continue;
    rollup.spend += Number(row.spend);
    rollup.revenue += Number(row.revenue);
  }

  return Array.from(map.values()).sort((a, b) => campaignReadiness(b) - campaignReadiness(a));
}

function buildSourceRollups(metrics: AnalyticsMetricRow[], sources: AnalyticsSourceRow[]) {
  const map = new Map<string, { key: string; name: string; status: string; spend: number; clicks: number; revenue: number }>();
  for (const source of sources) {
    map.set(source.source_key, {
      key: source.source_key,
      name: source.display_name,
      status: source.status,
      spend: 0,
      clicks: 0,
      revenue: 0,
    });
  }
  for (const row of metrics) {
    const current = map.get(row.source_key) ?? {
      key: row.source_key,
      name: titleFromKey(row.source_key),
      status: 'metric rows',
      spend: 0,
      clicks: 0,
      revenue: 0,
    };
    current.spend += Number(row.spend);
    current.clicks += Number(row.clicks);
    current.revenue += Number(row.revenue);
    map.set(row.source_key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
}

function campaignReadiness(campaign: CampaignRollup) {
  const contentScore = percent(campaign.approvedContent, Math.max(campaign.content, 1));
  const taskScore = percent(campaign.tasks - campaign.openTasks, Math.max(campaign.tasks, 1));
  const postScore = percent(campaign.livePosts, Math.max(campaign.posts, 1));
  return Math.round((contentScore + taskScore + postScore) / 3);
}

function isOverdue(task: MarketingTaskRow) {
  if (!task.due_at || completedTaskStatuses.includes(task.status)) return false;
  return new Date(task.due_at).getTime() < startOfToday().getTime();
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function reviewScore(metadata: Json | null): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const review = (metadata as Record<string, unknown>).review;
  if (!review || typeof review !== 'object' || Array.isArray(review)) return null;
  const score = (review as Record<string, unknown>).score;
  if (typeof score === 'number' && Number.isFinite(score)) return Math.max(0, Math.min(100, Math.round(score)));
  return null;
}

function loadError(area: string, error: unknown): LoadError | null {
  if (!error) return null;
  if (error instanceof Error && error.message) return { area, message: error.message };
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') return { area, message: record.message };
  }
  return { area, message: 'Could not load this section.' };
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function titleFromKey(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}
