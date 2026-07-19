import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { reportingSourceName, reportingSourceRegistry } from './reportingSources';

type AnalyticsMetricRow = Database['public']['Tables']['analytics_metrics']['Row'];
type AnalyticsSourceRow = Database['public']['Tables']['analytics_sources']['Row'];

type PlatformFilter = 'all' | string;

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

type CampaignRow = Totals & {
  campaign: string;
  rows: number;
};

type PlatformRow = Totals & {
  sourceKey: string;
  name: string;
  connected: boolean;
};

const emptyTotals: Totals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
};

export function AnalyticsReportingPage() {
  const { organization } = useAuth();
  const [metrics, setMetrics] = useState<AnalyticsMetricRow[]>([]);
  const [sources, setSources] = useState<AnalyticsSourceRow[]>([]);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadReportingData() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setMetrics([]);
        setSources([]);
        setLoading(false);
        return;
      }

      const [metricResult, sourceResult] = await Promise.all([
        supabase
          .from('analytics_metrics')
          .select('*')
          .eq('org_id', organization.id)
          .order('metric_date', { ascending: true })
          .limit(1000),
        supabase
          .from('analytics_sources')
          .select('*')
          .eq('org_id', organization.id)
          .order('updated_at', { ascending: false }),
      ]);

      if (!active) return;

      if (metricResult.error) setError(errorMessage(metricResult.error, 'Could not load reporting metrics.'));
      else setMetrics(metricResult.data ?? []);

      if (sourceResult.error) setError(errorMessage(sourceResult.error, 'Could not load reporting sources.'));
      else setSources(sourceResult.data ?? []);

      setLoading(false);
    }

    loadReportingData();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const platformOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const source of reportingSourceRegistry) keys.add(source.key);
    for (const source of sources) keys.add(source.source_key);
    for (const metric of metrics) keys.add(metric.source_key);
    return Array.from(keys).map((key) => ({ key, name: reportingSourceName(key) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [metrics, sources]);

  const filteredMetrics = useMemo(() => {
    if (platformFilter === 'all') return metrics;
    return metrics.filter((metric) => metric.source_key === platformFilter);
  }, [metrics, platformFilter]);

  const totals = useMemo(() => sumRows(filteredMetrics), [filteredMetrics]);
  const previousTotals = useMemo(() => {
    const midpoint = Math.floor(filteredMetrics.length / 2);
    return sumRows(filteredMetrics.slice(0, midpoint));
  }, [filteredMetrics]);
  const currentTotals = useMemo(() => {
    const midpoint = Math.floor(filteredMetrics.length / 2);
    return sumRows(filteredMetrics.slice(midpoint));
  }, [filteredMetrics]);
  const trendRows = useMemo(() => buildTrendRows(filteredMetrics), [filteredMetrics]);
  const platformRows = useMemo(() => buildPlatformRows(metrics, sources), [metrics, sources]);
  const campaignRows = useMemo(() => buildCampaignRows(filteredMetrics), [filteredMetrics]);
  const selectedPlatformName = platformFilter === 'all' ? 'All platforms' : reportingSourceName(platformFilter);
  const hasRows = filteredMetrics.length > 0;

  return (
    <div className="page-stack analytics-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Reporting Data</h2>
        </div>
        <label className="analytics-platform-select">
          <span>Platform</span>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
            <option value="all">All platforms</option>
            {platformOptions.map((platform) => (
              <option key={platform.key} value={platform.key}>{platform.name}</option>
            ))}
          </select>
        </label>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading reporting data">
          <Loader2 className="spin" size={28} />
          <h3>Loading reporting data</h3>
        </section>
      ) : (
        <>
          {error ? <p className="form-message error">{error}</p> : null}

          <section className="stats-grid" aria-label={`${selectedPlatformName} KPIs`}>
            <article className="stat-card">
              <span>Spend</span>
              <strong>{money(totals.spend)}</strong>
              <small>{changeLabel(currentTotals.spend, previousTotals.spend)} vs previous rows</small>
            </article>
            <article className="stat-card">
              <span>Revenue</span>
              <strong>{money(totals.revenue)}</strong>
              <small>ROAS {ratio(totals.revenue, totals.spend).toFixed(2)}x</small>
            </article>
            <article className="stat-card">
              <span>{platformFilter === 'youtube' ? 'Views' : 'Impressions'}</span>
              <strong>{number(totals.impressions)}</strong>
              <small>{number(totals.clicks)} clicks</small>
            </article>
          </section>

          <section className="stats-grid" aria-label={`${selectedPlatformName} conversion KPIs`}>
            <article className="stat-card">
              <span>CTR</span>
              <strong>{percent(ratio(totals.clicks, totals.impressions))}</strong>
              <small>Clicks divided by impressions/views</small>
            </article>
            <article className="stat-card">
              <span>{platformFilter === 'shopify' ? 'Orders' : 'Conversions'}</span>
              <strong>{number(totals.conversions)}</strong>
              <small>{money(ratio(totals.revenue, totals.conversions))} avg value</small>
            </article>
            <article className="stat-card">
              <span>Rows loaded</span>
              <strong>{number(filteredMetrics.length)}</strong>
              <small>{selectedPlatformName}</small>
            </article>
          </section>

          {hasRows ? (
            <>
              <section className="draft-panel analytics-visual-panel" aria-label="Performance trend">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Trend</p>
                    <h3>Performance over time</h3>
                  </div>
                  <TrendingUp size={21} />
                </div>
                <div className="analytics-trend-chart">
                  {trendRows.map((row) => (
                    <div className="analytics-trend-column" key={row.date}>
                      <div className="analytics-trend-column__bars">
                        <span className="revenue" style={{ height: `${barHeight(row.revenue, trendRows, 'revenue')}%` }} title={`Revenue ${money(row.revenue)}`} />
                        <span className="spend" style={{ height: `${barHeight(row.spend, trendRows, 'spend')}%` }} title={`Spend ${money(row.spend)}`} />
                      </div>
                      <small>{shortDate(row.date)}</small>
                    </div>
                  ))}
                </div>
                <div className="analytics-chart-legend">
                  <span><i className="revenue" /> Revenue</span>
                  <span><i className="spend" /> Spend</span>
                </div>
              </section>

              <section className="content-creator-grid analytics-reporting-grid">
                <article className="draft-panel analytics-visual-panel" aria-label="Platform comparison">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Compare</p>
                      <h3>Platform performance</h3>
                    </div>
                    <BarChart3 size={21} />
                  </div>
                  <div className="analytics-platform-bars">
                    {platformRows.map((platform) => (
                      <div className="analytics-platform-bar" key={platform.sourceKey}>
                        <div>
                          <strong>{platform.name}</strong>
                          <span>{money(platform.revenue)} revenue · {money(platform.spend)} spend</span>
                        </div>
                        <div className="analytics-horizontal-meter">
                          <span style={{ width: `${platformShare(platform.revenue, platformRows)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="draft-panel analytics-visual-panel" aria-label="Campaign performance">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Campaigns</p>
                      <h3>Top campaigns</h3>
                    </div>
                    <BarChart3 size={21} />
                  </div>
                  <div className="analytics-table-wrap">
                    <table className="analytics-performance-table">
                      <thead>
                        <tr>
                          <th>Campaign</th>
                          <th>Spend</th>
                          <th>Revenue</th>
                          <th>ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignRows.map((campaign) => (
                          <tr key={campaign.campaign}>
                            <td>{campaign.campaign}</td>
                            <td>{money(campaign.spend)}</td>
                            <td>{money(campaign.revenue)}</td>
                            <td>{ratio(campaign.revenue, campaign.spend).toFixed(2)}x</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>
            </>
          ) : (
            <section className="empty-state">
              <BarChart3 size={34} />
              <h3>No reporting data for {selectedPlatformName}</h3>
              <p>Connect this source in Settings → Connections. Once sync rows arrive, KPIs and visuals will appear here.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function sumRows(rows: AnalyticsMetricRow[]): Totals {
  return rows.reduce(
    (current, row) => ({
      spend: current.spend + Number(row.spend),
      impressions: current.impressions + Number(row.impressions),
      clicks: current.clicks + Number(row.clicks),
      conversions: current.conversions + Number(row.conversions),
      revenue: current.revenue + Number(row.revenue),
    }),
    { ...emptyTotals },
  );
}

function buildTrendRows(rows: AnalyticsMetricRow[]) {
  const map = new Map<string, Totals>();
  for (const row of rows) {
    const current = map.get(row.metric_date) ?? { ...emptyTotals };
    current.spend += Number(row.spend);
    current.impressions += Number(row.impressions);
    current.clicks += Number(row.clicks);
    current.conversions += Number(row.conversions);
    current.revenue += Number(row.revenue);
    map.set(row.metric_date, current);
  }
  return Array.from(map.entries()).map(([date, totals]) => ({ date, ...totals })).slice(-14);
}

function buildPlatformRows(rows: AnalyticsMetricRow[], sources: AnalyticsSourceRow[]): PlatformRow[] {
  const connected = new Set(sources.filter((source) => source.status === 'connected' || source.status === 'syncing').map((source) => source.source_key));
  const map = new Map<string, PlatformRow>();
  for (const row of rows) {
    const current = map.get(row.source_key) ?? {
      sourceKey: row.source_key,
      name: reportingSourceName(row.source_key),
      connected: connected.has(row.source_key),
      ...emptyTotals,
    };
    current.spend += Number(row.spend);
    current.impressions += Number(row.impressions);
    current.clicks += Number(row.clicks);
    current.conversions += Number(row.conversions);
    current.revenue += Number(row.revenue);
    map.set(row.source_key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.spend - a.spend).slice(0, 6);
}

function buildCampaignRows(rows: AnalyticsMetricRow[]): CampaignRow[] {
  const map = new Map<string, CampaignRow>();
  for (const row of rows) {
    const current = map.get(row.campaign) ?? { campaign: row.campaign, rows: 0, ...emptyTotals };
    current.rows += 1;
    current.spend += Number(row.spend);
    current.impressions += Number(row.impressions);
    current.clicks += Number(row.clicks);
    current.conversions += Number(row.conversions);
    current.revenue += Number(row.revenue);
    map.set(row.campaign, current);
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || b.spend - a.spend).slice(0, 8);
}

function barHeight(value: number, rows: Array<Totals & { date: string }>, key: 'spend' | 'revenue') {
  const max = Math.max(...rows.map((row) => row[key]), 1);
  return Math.max(6, Math.round((value / max) * 100));
}

function platformShare(value: number, rows: PlatformRow[]) {
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  return Math.max(4, Math.round((value / max) * 100));
}

function ratio(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function changeLabel(current: number, previous: number) {
  if (previous <= 0 && current <= 0) return 'No change';
  if (previous <= 0) return 'New activity';
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function percent(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
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
