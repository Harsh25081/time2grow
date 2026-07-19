import type { Database } from '../../types/database';

export type AnalyticsSourceRow = Database['public']['Tables']['analytics_sources']['Row'];
export type AnalyticsMetricRow = Database['public']['Tables']['analytics_metrics']['Row'];
export type SourceCategory = AnalyticsSourceRow['category'];
export type SourceStatus = AnalyticsSourceRow['status'];

// The named sources the registry connects. These are the ones we can seed reporting data for and show
// as first-class cards; the wider registry (320+ more) is surfaced as a single "browse" affordance.
export type SourceDefinition = {
  key: string;
  name: string;
  category: SourceCategory;
  // Rough per-source daily funnel shape used only to generate believable sample reporting data. Real
  // numbers replace these once a live connector sync lands. Modeled as a proper funnel so the derived
  // CPC / CTR / ROAS all read realistically:
  //   ad sources:      clicks = spend ÷ cpc,  impressions = clicks ÷ ctr
  //   organic/social:  impressions = reachPerDay,  clicks = impressions × ctr
  //   ecommerce:       impressions = sessions (reachPerDay),  conversions = sessions × cvr
  seed: {
    campaigns: string[];
    spendPerDay: number; // typical daily ad spend baseline (0 for organic/ecommerce)
    cpc: number; // cost per click, in ₹ (ad sources only)
    reachPerDay: number; // daily impressions/sessions baseline (organic/ecommerce only)
    ctr: number; // click-through rate
    cvr: number; // conversion rate (on clicks for ads/social, on sessions for ecommerce)
    aov: number; // average order value / value per conversion, in ₹
  };
};

export const REGISTRY_SOURCE_COUNT = 326;

export const sourceCatalog: SourceDefinition[] = [
  {
    key: 'meta_ads',
    name: 'Meta Ads',
    category: 'ads',
    seed: { campaigns: ['Prospecting', 'Retargeting'], spendPerDay: 4200, cpc: 7, reachPerDay: 0, ctr: 0.014, cvr: 0.02, aov: 1500 },
  },
  {
    key: 'google_ads',
    name: 'Google Ads',
    category: 'ads',
    seed: { campaigns: ['Brand Search', 'Performance Max'], spendPerDay: 5100, cpc: 18, reachPerDay: 0, ctr: 0.05, cvr: 0.05, aov: 2000 },
  },
  {
    key: 'tiktok_ads',
    name: 'TikTok Ads',
    category: 'ads',
    seed: { campaigns: ['Spark Ads', 'Awareness'], spendPerDay: 2600, cpc: 4, reachPerDay: 0, ctr: 0.011, cvr: 0.012, aov: 1200 },
  },
  {
    key: 'linkedin_ads',
    name: 'LinkedIn Ads',
    category: 'ads',
    seed: { campaigns: ['Lead Gen Forms', 'Sponsored Content'], spendPerDay: 3100, cpc: 55, reachPerDay: 0, ctr: 0.006, cvr: 0.06, aov: 6000 },
  },
  {
    key: 'youtube',
    name: 'YouTube',
    category: 'social',
    seed: { campaigns: ['Channel', 'Shorts'], spendPerDay: 0, cpc: 0, reachPerDay: 18_000, ctr: 0.02, cvr: 0.01, aov: 800 },
  },
  {
    key: 'shopify',
    name: 'Shopify',
    category: 'ecommerce',
    seed: { campaigns: ['Storefront'], spendPerDay: 0, cpc: 0, reachPerDay: 1600, ctr: 0, cvr: 0.02, aov: 2050 },
  },
];

export const sourceByKey = new Map(sourceCatalog.map((source) => [source.key, source]));

export function sourceName(key: string) {
  return sourceByKey.get(key)?.name ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const categoryLabels: Record<SourceCategory, string> = {
  ads: 'Ad platform',
  social: 'Social',
  ecommerce: 'E-commerce',
  web: 'Web analytics',
  email: 'Email',
  crm: 'CRM',
  other: 'Other',
};

export const statusLabels: Record<SourceStatus, string> = {
  connected: 'Connected',
  syncing: 'Syncing',
  disconnected: 'Not connected',
  error: 'Sync error',
};

// --- Aggregation ---------------------------------------------------------

export type MetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

export const emptyTotals: MetricTotals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };

export function addMetric(totals: MetricTotals, row: Pick<AnalyticsMetricRow, keyof MetricTotals>): MetricTotals {
  return {
    spend: totals.spend + Number(row.spend),
    impressions: totals.impressions + Number(row.impressions),
    clicks: totals.clicks + Number(row.clicks),
    conversions: totals.conversions + Number(row.conversions),
    revenue: totals.revenue + Number(row.revenue),
  };
}

export function sumMetrics(rows: AnalyticsMetricRow[]): MetricTotals {
  return rows.reduce(addMetric, emptyTotals);
}

export function roas(totals: MetricTotals) {
  return totals.spend > 0 ? totals.revenue / totals.spend : 0;
}

export function ctr(totals: MetricTotals) {
  return totals.impressions > 0 ? totals.clicks / totals.impressions : 0;
}

export function cpc(totals: MetricTotals) {
  return totals.clicks > 0 ? totals.spend / totals.clicks : 0;
}

export function cpa(totals: MetricTotals) {
  return totals.conversions > 0 ? totals.spend / totals.conversions : 0;
}

// --- Formatting ----------------------------------------------------------

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function formatNumber(value: number) {
  return Math.abs(value) >= 10_000 ? compact.format(value) : plain.format(Math.round(value));
}

export function formatCurrency(value: number) {
  const formatted = Math.abs(value) >= 10_000 ? compact.format(value) : plain.format(Math.round(value));
  return `₹${formatted}`;
}

export function formatPercent(value: number, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRatio(value: number) {
  return `${value.toFixed(2)}×`;
}

// --- Deterministic sample data ------------------------------------------

// A tiny seeded PRNG so "Load sample data" produces stable, believable rows (not a random mess that
// changes on every click). Same org + day always yields the same figure.
function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitter(seedInput: string, spread: number) {
  // Returns a multiplier in [1 - spread, 1 + spread].
  const unit = hashSeed(seedInput) / 0xffffffff;
  return 1 + (unit * 2 - 1) * spread;
}

export type SampleMetric = {
  source_key: string;
  campaign: string;
  metric_date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

/**
 * Builds normalized daily reporting rows for the given sources over the trailing `days` window. Each
 * source spreads its baseline across its campaigns, applies a gentle weekend dip and a small
 * deterministic jitter, and derives impressions/clicks/conversions/revenue from its funnel rates so
 * the KPIs (ROAS, CTR, CPC) all read realistically. Pure — no I/O, easy to unit test.
 */
export function buildSampleMetrics(orgId: string, sourceKeys: string[], days: number): SampleMetric[] {
  const rows: SampleMetric[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const key of sourceKeys) {
    const def = sourceByKey.get(key);
    if (!def) continue;
    const { campaigns, spendPerDay, cpc, reachPerDay, ctr: baseCtr, cvr, aov } = def.seed;
    const isEcommerce = def.category === 'ecommerce';

    for (let back = days - 1; back >= 0; back -= 1) {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() - back);
      const iso = date.toISOString().slice(0, 10);
      const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
      const dayFactor = weekend ? 0.78 : 1;

      for (const campaign of campaigns) {
        const seedBase = `${orgId}:${key}:${campaign}:${iso}`;
        const share = 1 / campaigns.length;

        let spend = 0;
        let impressions = 0;
        let clicks = 0;
        let conversions = 0;

        if (spendPerDay > 0 && cpc > 0) {
          // Paid: spend drives clicks (÷ CPC), CTR back-solves the impressions that produced them.
          spend = Math.round(spendPerDay * share * dayFactor * jitter(`${seedBase}:spend`, 0.25));
          clicks = Math.round((spend / cpc) * jitter(`${seedBase}:clicks`, 0.12));
          impressions = baseCtr > 0 ? Math.round((clicks / baseCtr) * jitter(`${seedBase}:impr`, 0.15)) : 0;
          conversions = Math.max(0, Math.round(clicks * cvr * jitter(`${seedBase}:conv`, 0.3)));
        } else if (isEcommerce) {
          // Storefront: sessions convert to orders directly; no ad spend or ad clicks.
          impressions = Math.round(reachPerDay * share * dayFactor * jitter(`${seedBase}:impr`, 0.2));
          conversions = Math.max(0, Math.round(impressions * cvr * jitter(`${seedBase}:conv`, 0.25)));
        } else {
          // Organic social: reach drives clicks-to-site, which convert at the source rate.
          impressions = Math.round(reachPerDay * share * dayFactor * jitter(`${seedBase}:impr`, 0.2));
          clicks = Math.round(impressions * baseCtr * jitter(`${seedBase}:clicks`, 0.18));
          conversions = Math.max(0, Math.round(clicks * cvr * jitter(`${seedBase}:conv`, 0.3)));
        }

        const revenue = Math.round(conversions * aov * jitter(`${seedBase}:rev`, 0.15));

        rows.push({
          source_key: key,
          campaign,
          metric_date: iso,
          spend,
          impressions,
          clicks,
          conversions,
          revenue,
        });
      }
    }
  }

  return rows;
}
