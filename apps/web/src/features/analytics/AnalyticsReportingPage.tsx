import { BarChart3, Database } from 'lucide-react';
import { ReportingSourcesPanel } from './ReportingSourcesPanel';

export function AnalyticsReportingPage() {
  return (
    <div className="page-stack analytics-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Reporting Data</h2>
        </div>
        <span className="status-pill success">Unified store</span>
      </header>

      <section className="work-band analytics-query-map">
        <article className="draft-panel analytics-health-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Normalize</p>
              <h3>One reporting table</h3>
            </div>
            <Database size={21} />
          </div>
          <p>Every source maps into `analytics_metrics`: source, campaign, date, spend, impressions, clicks, conversions, and revenue.</p>
          <small>That keeps Analytics queryable without custom code for every provider screen.</small>
        </article>

        <article className="draft-panel analytics-health-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Query</p>
              <h3>Cross-platform reporting</h3>
            </div>
            <BarChart3 size={21} />
          </div>
          <p>Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, YouTube, and Shopify can roll up together by campaign and date.</p>
          <small>Source-specific details stay in metadata while core metrics stay comparable.</small>
        </article>
      </section>

      <ReportingSourcesPanel
        eyebrow="Registry"
        title="Connect reporting sources"
        description="Add the platforms that should pull reporting data into time2grow's normalized analytics store."
      />
    </div>
  );
}
