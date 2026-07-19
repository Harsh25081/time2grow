import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database as AppDatabase, Json } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import {
  reportingSourceRegistry,
  sourceStatusLabel,
  syncModeLabel,
  type ReportingSourceDefinition,
} from './reportingSources';

type AnalyticsSourceRow = AppDatabase['public']['Tables']['analytics_sources']['Row'];
type AnalyticsMetricRow = Pick<AppDatabase['public']['Tables']['analytics_metrics']['Row'], 'id' | 'source_key'>;

type ReportingSourcesPanelProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function ReportingSourcesPanel({
  eyebrow = 'Sources',
  title = 'Reporting data sources',
  description = 'Connect ad platforms and marketing sources into one normalized reporting store so Analytics can query spend, impressions, clicks, conversions, and revenue directly.',
}: ReportingSourcesPanelProps) {
  const { organization, user, membership } = useAuth();
  const canManageSources = membership?.role === 'owner' || membership?.role === 'admin';
  const [sources, setSources] = useState<AnalyticsSourceRow[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadSources() {
    setError('');

    if (!supabase || !organization?.id) {
      setSources([]);
      setMetrics([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [sourceResult, metricResult] = await Promise.all([
      supabase
        .from('analytics_sources')
        .select('*')
        .eq('org_id', organization.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('analytics_metrics')
        .select('id, source_key')
        .eq('org_id', organization.id)
        .limit(1000),
    ]);

    if (sourceResult.error) setError(errorMessage(sourceResult.error, 'Could not load reporting sources.'));
    else setSources(sourceResult.data ?? []);

    if (metricResult.error) setError(errorMessage(metricResult.error, 'Could not load reporting metrics.'));
    else setMetrics(metricResult.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    loadSources();
  }, [organization?.id]);

  const sourceByKey = useMemo(() => new Map(sources.map((source) => [source.source_key, source])), [sources]);
  const metricCountByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const metric of metrics) map.set(metric.source_key, (map.get(metric.source_key) ?? 0) + 1);
    return map;
  }, [metrics]);

  async function connectSource(definition: ReportingSourceDefinition) {
    setMessage('');
    setError('');

    if (!canManageSources) {
      setError('Ask a workspace owner or admin to manage reporting sources.');
      return;
    }

    if (!supabase || !organization?.id || !user?.id) {
      setError('Connect Supabase before adding reporting sources.');
      return;
    }

    setSavingKey(definition.key);
    const existing = sourceByKey.get(definition.key);
    const metadata = {
      registry: 'time2grow_reporting_v1',
      syncMode: definition.syncMode,
      supportedMetrics: definition.metrics,
      setupState: 'connector_requested',
    } satisfies Json;

    try {
      if (existing) {
        const { data, error: updateError } = await supabase
          .from('analytics_sources')
          .update({
            display_name: definition.name,
            category: definition.category,
            status: existing.status === 'connected' ? 'syncing' : existing.status,
            metadata,
          })
          .eq('id', existing.id)
          .eq('org_id', organization.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        setSources((current) => current.map((source) => (source.id === data.id ? data : source)));
        setMessage(`${definition.name} reporting source refreshed.`);
      } else {
        const { data, error: insertError } = await supabase
          .from('analytics_sources')
          .insert({
            org_id: organization.id,
            source_key: definition.key,
            display_name: definition.name,
            category: definition.category,
            status: 'syncing',
            metadata,
            created_by: user.id,
          })
          .select('*')
          .single();
        if (insertError) throw insertError;
        setSources((current) => [data, ...current]);
        setMessage(`${definition.name} added to reporting sources.`);
      }
    } catch (connectError) {
      setError(errorMessage(connectError, `Could not add ${definition.name}.`));
    } finally {
      setSavingKey('');
    }
  }

  return (
    <section className="draft-panel saved-content-panel reporting-sources-panel" aria-label="Reporting data sources">
      <div className="section-heading content-library-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p className="section-description">{description}</p>
        </div>
        <button type="button" className="icon-text-button" onClick={loadSources} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="queue-empty">
          <Loader2 className="spin" size={20} />
          <span>Loading reporting registry</span>
        </div>
      ) : (
        <div className="reporting-source-registry">
          {reportingSourceRegistry.map((definition) => {
            const connectedSource = sourceByKey.get(definition.key);
            const metricCount = metricCountByKey.get(definition.key) ?? 0;
            const saving = savingKey === definition.key;
            return (
              <article className={`reporting-source-card ${connectedSource ? 'is-connected' : ''}`} key={definition.key}>
                <div className="reporting-source-card__top">
                  <span className="channel-icon"><Database size={20} /></span>
                  <span className={`connection-status ${connectedSource ? connectionStatusClass(connectedSource.status) : 'needs_setup'}`}>
                    {sourceStatusLabel(connectedSource?.status)}
                  </span>
                </div>
                <div>
                  <h4>{definition.name}</h4>
                  <p>{definition.description}</p>
                </div>
                <div className="reporting-source-card__meta">
                  <span>{definition.owner}</span>
                  <span>{syncModeLabel(definition.syncMode)}</span>
                  <span>{metricCount} rows</span>
                </div>
                <div className="reporting-source-card__metrics">
                  {definition.metrics.map((metric) => <span key={metric}>{metric}</span>)}
                </div>
                <button type="button" onClick={() => connectSource(definition)} disabled={!canManageSources || saving}>
                  {saving ? 'Saving' : connectedSource ? 'Refresh source' : 'Add source'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {!canManageSources ? <p className="form-message warning">You can view reporting sources. Ask a workspace owner or admin to connect or refresh them.</p> : null}
      {message ? <p className="form-message success">{message}</p> : null}
      {error ? <p className="form-message error">{error}</p> : null}
    </section>
  );
}

function connectionStatusClass(status: AnalyticsSourceRow['status']) {
  if (status === 'connected') return 'ready';
  if (status === 'syncing') return 'review';
  return 'needs_setup';
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
