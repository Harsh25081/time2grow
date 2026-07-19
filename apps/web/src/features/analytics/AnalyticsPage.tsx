import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wand2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Json } from '../../types/database';
import {
  buildSampleMetrics,
  cpc,
  ctr,
  emptyTotals,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRatio,
  REGISTRY_SOURCE_COUNT,
  roas,
  sourceCatalog,
  sourceName,
  sumMetrics,
  type AnalyticsMetricRow,
  type AnalyticsSourceRow,
  type MetricTotals,
} from './analyticsData';

const analyticsWriterRoles = ['owner', 'admin', 'editor'] as const;
const SAMPLE_DAYS = 90;

type RangeOption = { value: number; label: string };
const rangeOptions: RangeOption[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

type AiHighlight = { label: string; value: string };
type AiAnswer = { answer: string; highlights: AiHighlight[] };

export function AnalyticsPage() {
  const { organization, user, membership } = useAuth();
  const [sources, setSources] = useState<AnalyticsSourceRow[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<AiAnswer | null>(null);
  const [aiError, setAiError] = useState('');

  const canWrite = analyticsWriterRoles.some((role) => role === membership?.role);

  async function load() {
    setLoading(true);
    setError('');

    if (!supabase || !organization?.id) {
      setSources([]);
      setMetrics([]);
      setLoading(false);
      return;
    }

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (SAMPLE_DAYS - 1));
    const sinceIso = since.toISOString().slice(0, 10);

    const [sourcesResult, metricsResult] = await Promise.all([
      supabase
        .from('analytics_sources')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('analytics_metrics')
        .select('*')
        .eq('org_id', organization.id)
        .gte('metric_date', sinceIso)
        .order('metric_date', { ascending: false })
        .limit(5000),
    ]);

    if (sourcesResult.error) {
      setError(errorMessage(sourcesResult.error, 'Run the analytics migration before loading this page.'));
    }
    setSources(sourcesResult.data ?? []);
    setMetrics(metricsResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const connectedKeys = useMemo(
    () => new Set(sources.filter((source) => source.status === 'connected' || source.status === 'syncing').map((s) => s.source_key)),
    [sources],
  );

  // Window boundaries: the current range, and the equal-length window right before it for deltas.
  const { windowStart, prevStart } = useMemo(() => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
    const prev = new Date(start);
    prev.setUTCDate(prev.getUTCDate() - rangeDays);
    return { windowStart: start.toISOString().slice(0, 10), prevStart: prev.toISOString().slice(0, 10) };
  }, [rangeDays]);

  const matchesSource = (row: AnalyticsMetricRow) => sourceFilter === 'all' || row.source_key === sourceFilter;

  const currentRows = useMemo(
    () => metrics.filter((row) => row.metric_date >= windowStart && matchesSource(row)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metrics, windowStart, sourceFilter],
  );
  const previousRows = useMemo(
    () => metrics.filter((row) => row.metric_date >= prevStart && row.metric_date < windowStart && matchesSource(row)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metrics, prevStart, windowStart, sourceFilter],
  );

  const totals = useMemo(() => sumMetrics(currentRows), [currentRows]);
  const prevTotals = useMemo(() => sumMetrics(previousRows), [previousRows]);

  const bySource = useMemo(() => {
    const map = new Map<string, MetricTotals>();
    for (const row of currentRows) {
      map.set(row.source_key, addTo(map.get(row.source_key), row));
    }
    return [...map.entries()]
      .map(([key, value]) => ({ key, totals: value }))
      .sort((a, b) => b.totals.revenue - a.totals.revenue || b.totals.spend - a.totals.spend);
  }, [currentRows]);

  const maxRevenue = Math.max(1, ...bySource.map((entry) => entry.totals.revenue));
  const hasData = metrics.length > 0;

  const kpis = useMemo(
    () => [
      { label: 'Ad spend', value: formatCurrency(totals.spend), delta: pctDelta(totals.spend, prevTotals.spend), invert: true },
      { label: 'Revenue', value: formatCurrency(totals.revenue), delta: pctDelta(totals.revenue, prevTotals.revenue) },
      { label: 'ROAS', value: formatRatio(roas(totals)), delta: pctDelta(roas(totals), roas(prevTotals)) },
      { label: 'Conversions', value: formatNumber(totals.conversions), delta: pctDelta(totals.conversions, prevTotals.conversions) },
      { label: 'CTR', value: formatPercent(ctr(totals)), delta: pctDelta(ctr(totals), ctr(prevTotals)) },
      { label: 'Avg. CPC', value: formatCurrency(cpc(totals)), delta: pctDelta(cpc(totals), cpc(prevTotals)), invert: true },
    ],
    [totals, prevTotals],
  );

  async function withBusy(key: string, fn: () => Promise<void>) {
    if (!supabase || !organization?.id || !user?.id) return;
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage analytics sources.');
      return;
    }
    setBusy(key);
    setMessage('');
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Try again.'));
    } finally {
      setBusy('');
    }
  }

  async function seedSources(keys: string[]) {
    if (!supabase || !organization?.id || !user?.id) return;
    const now = new Date().toISOString();
    const rows = keys.map((key) => {
      const def = sourceCatalog.find((source) => source.key === key)!;
      return {
        org_id: organization!.id,
        source_key: def.key,
        display_name: def.name,
        category: def.category,
        status: 'connected' as const,
        last_synced_at: now,
        created_by: user!.id,
      };
    });
    const { error: sourceError } = await supabase
      .from('analytics_sources')
      .upsert(rows, { onConflict: 'org_id,source_key' });
    if (sourceError) throw sourceError;

    const sample = buildSampleMetrics(organization!.id, keys, SAMPLE_DAYS);
    const metricRows = sample.map((row) => ({
      org_id: organization!.id,
      created_by: user!.id,
      metadata: { seeded: true } as Json,
      ...row,
    }));
    // Chunk the upsert so a large window stays well under payload limits.
    for (let i = 0; i < metricRows.length; i += 500) {
      const { error: metricError } = await supabase
        .from('analytics_metrics')
        .upsert(metricRows.slice(i, i + 500), { onConflict: 'org_id,source_key,campaign,metric_date' });
      if (metricError) throw metricError;
    }
  }

  function loadAllSample() {
    return withBusy('load-all', async () => {
      await seedSources(sourceCatalog.map((source) => source.key));
      setMessage('Sample reporting data loaded across all sources.');
      await load();
    });
  }

  function resetData() {
    if (!window.confirm('Remove all analytics sources and their reporting data for this workspace? This cannot be undone.')) return;
    return withBusy('reset', async () => {
      const del1 = await supabase!.from('analytics_metrics').delete().eq('org_id', organization!.id);
      if (del1.error) throw del1.error;
      const del2 = await supabase!.from('analytics_sources').delete().eq('org_id', organization!.id);
      if (del2.error) throw del2.error;
      setSourceFilter('all');
      setAiAnswer(null);
      setMessage('Analytics data cleared.');
      await load();
    });
  }

  async function askQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    if (!supabase || !organization?.id) {
      setAiError('Connect Supabase to query your reporting data.');
      return;
    }
    setAsking(true);
    setAiError('');
    setAiAnswer(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: {
          action: 'analytics_query',
          orgId: organization.id,
          question: trimmed,
          days: rangeDays,
          sourceKey: sourceFilter === 'all' ? '' : sourceFilter,
        },
      });
      if (invokeError) throw invokeError;
      const result = data?.result ?? data;
      setAiAnswer({
        answer: typeof result?.answer === 'string' ? result.answer : 'No answer was returned.',
        highlights: Array.isArray(result?.highlights)
          ? result.highlights
              .map((h: unknown) => (h && typeof h === 'object'
                ? { label: String((h as Record<string, unknown>).label ?? ''), value: String((h as Record<string, unknown>).value ?? '') }
                : null))
              .filter((h: AiHighlight | null): h is AiHighlight => Boolean(h && h.label))
          : [],
      });
    } catch (err) {
      setAiError(errorMessage(err, 'Could not answer that. Try rephrasing, or load data first.'));
    } finally {
      setAsking(false);
    }
  }

  const exampleQuestions = [
    'Which source has the best ROAS?',
    'Where is my ad spend going and is it paying off?',
    'What should I cut or scale next week?',
  ];

  return (
    <div className="page-stack analytics-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Measure</p>
          <h2>Analytics</h2>
        </div>
        <span className={connectedKeys.size > 0 ? 'status-pill success' : 'status-pill warning'}>
          {connectedKeys.size > 0 ? `${connectedKeys.size} sources connected` : 'No sources yet'}
        </span>
      </header>

      <p className="analytics-intro">
        One place for reporting data from every ad platform and marketing source — Meta Ads, Google Ads,
        TikTok Ads, LinkedIn Ads, YouTube, Shopify, and {REGISTRY_SOURCE_COUNT - sourceCatalog.length}+ more
        in the registry. Connect sources on the <Link to="/connections">Connections page</Link>; their spend,
        reach, and revenue flow into this unified store you can query directly.
      </p>

      {loading ? (
        <section className="empty-state" aria-label="Loading analytics">
          <Loader2 className="spin" size={28} />
          <h3>Loading analytics</h3>
        </section>
      ) : (
        <>
          <section className="analytics-toolbar" aria-label="Filters">
            <div className="library-filter-tabs" aria-label="Date range">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={rangeDays === option.value ? 'is-active' : ''}
                  onClick={() => setRangeDays(option.value)}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <label className="analytics-source-select">
              <span>Source</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">All sources</option>
                {sourceCatalog
                  .filter((source) => connectedKeys.has(source.key))
                  .map((source) => (
                    <option key={source.key} value={source.key}>{source.name}</option>
                  ))}
              </select>
            </label>

            <div className="analytics-toolbar__actions">
              <button type="button" className="icon-text-button" onClick={load} disabled={Boolean(busy)}>
                <RefreshCw size={16} className={busy ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
              {canWrite ? (
                <>
                  <button type="button" className="primary-action" onClick={loadAllSample} disabled={Boolean(busy)}>
                    {busy === 'load-all' ? <Loader2 className="spin" size={16} /> : <Database size={16} />}
                    <span>{hasData ? 'Reload sample data' : 'Load sample data'}</span>
                  </button>
                  {hasData ? (
                    <button type="button" className="icon-text-button danger" onClick={resetData} disabled={Boolean(busy)}>
                      {busy === 'reset' ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                      <span>Reset</span>
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          {message ? <p className="form-message success">{message}</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}

          {!hasData ? (
            <section className="empty-state" aria-label="No analytics data">
              <BarChart3 size={34} />
              <h3>No reporting data yet</h3>
              <p>
                Connect your ad platforms and marketing sources on the <Link to="/connections">Connections page</Link> and their reporting data shows up here.
                {canWrite ? ' Or load sample data to preview the unified view.' : ' Ask an editor to connect a source.'}
              </p>
            </section>
          ) : (
            <>
              <section className="stats-grid analytics-kpis" aria-label="Key metrics">
                {kpis.map((kpi) => (
                  <article className="stat-card" key={kpi.label}>
                    <span>{kpi.label}</span>
                    <strong>{kpi.value}</strong>
                    <DeltaBadge delta={kpi.delta} invert={kpi.invert} />
                  </article>
                ))}
              </section>

              <section className="analytics-panel" aria-label="Performance by source">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Breakdown</p>
                    <h3>Performance by source</h3>
                  </div>
                  <span>{rangeOptions.find((option) => option.value === rangeDays)?.label}</span>
                </div>
                <div className="analytics-table-scroll">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Spend</th>
                        <th>Impressions</th>
                        <th>Clicks</th>
                        <th>Conversions</th>
                        <th>Revenue</th>
                        <th>ROAS</th>
                        <th aria-label="Revenue share" />
                      </tr>
                    </thead>
                    <tbody>
                      {bySource.map((entry) => (
                        <tr key={entry.key}>
                          <th scope="row">{sourceName(entry.key)}</th>
                          <td>{formatCurrency(entry.totals.spend)}</td>
                          <td>{formatNumber(entry.totals.impressions)}</td>
                          <td>{formatNumber(entry.totals.clicks)}</td>
                          <td>{formatNumber(entry.totals.conversions)}</td>
                          <td>{formatCurrency(entry.totals.revenue)}</td>
                          <td>{entry.totals.spend > 0 ? formatRatio(roas(entry.totals)) : '—'}</td>
                          <td>
                            <span className="source-bar" aria-hidden="true">
                              <span style={{ width: `${(entry.totals.revenue / maxRevenue) * 100}%` }} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td>{formatCurrency(totals.spend)}</td>
                        <td>{formatNumber(totals.impressions)}</td>
                        <td>{formatNumber(totals.clicks)}</td>
                        <td>{formatNumber(totals.conversions)}</td>
                        <td>{formatCurrency(totals.revenue)}</td>
                        <td>{totals.spend > 0 ? formatRatio(roas(totals)) : '—'}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section className="analytics-panel ai-query-panel" aria-label="Ask your data">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow ai">Ask your data</p>
                    <h3>Query reporting in plain language</h3>
                  </div>
                  <Sparkles size={20} />
                </div>
                <form className="ai-query-form" onSubmit={askQuestion}>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="e.g. Which source had the best ROAS this month?"
                    aria-label="Question about your reporting data"
                  />
                  <button className="primary-action ai" type="submit" disabled={asking || !question.trim()}>
                    {asking ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
                    <span>{asking ? 'Thinking' : 'Ask'}</span>
                  </button>
                </form>
                <div className="ai-query-examples">
                  {exampleQuestions.map((example) => (
                    <button key={example} type="button" onClick={() => setQuestion(example)} disabled={asking}>
                      {example}
                    </button>
                  ))}
                </div>
                {aiError ? <p className="form-message error">{aiError}</p> : null}
                {aiAnswer ? (
                  <div className="ai-answer">
                    <p>{aiAnswer.answer}</p>
                    {aiAnswer.highlights.length > 0 ? (
                      <ul className="ai-highlights">
                        {aiAnswer.highlights.map((highlight) => (
                          <li key={`${highlight.label}-${highlight.value}`}>
                            <span>{highlight.label}</span>
                            <strong>{highlight.value}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DeltaBadge({ delta, invert }: { delta: number | null; invert?: boolean }) {
  if (delta === null || !Number.isFinite(delta)) return <small>vs prev. period</small>;
  const rounded = Math.round(delta * 100);
  if (rounded === 0) return <small>No change vs prev.</small>;
  // For "lower is better" metrics (spend, CPC) an increase is styled as a regression.
  const positive = invert ? rounded < 0 : rounded > 0;
  const Icon = rounded > 0 ? TrendingUp : TrendingDown;
  return (
    <small className={`stat-delta ${positive ? 'up' : 'down'}`}>
      <Icon size={13} />
      {rounded > 0 ? '+' : ''}{rounded}% vs prev.
    </small>
  );
}

function addTo(base: MetricTotals | undefined, row: AnalyticsMetricRow): MetricTotals {
  const start = base ?? emptyTotals;
  return {
    spend: start.spend + Number(row.spend),
    impressions: start.impressions + Number(row.impressions),
    clicks: start.clicks + Number(row.clicks),
    conversions: start.conversions + Number(row.conversions),
    revenue: start.revenue + Number(row.revenue),
  };
}

function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
