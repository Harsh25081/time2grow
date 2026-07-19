import type { Database } from '../../types/database';

export type AnalyticsSourceCategory = Database['public']['Tables']['analytics_sources']['Row']['category'];
export type AnalyticsSourceStatus = Database['public']['Tables']['analytics_sources']['Row']['status'];

export type ReportingSourceDefinition = {
  key: string;
  name: string;
  category: AnalyticsSourceCategory;
  owner: string;
  description: string;
  syncMode: 'oauth' | 'api_key' | 'partner_connector';
  metrics: string[];
};

export const reportingSourceRegistry: ReportingSourceDefinition[] = [
  {
    key: 'meta_ads',
    name: 'Meta Ads',
    category: 'ads',
    owner: 'Meta',
    description: 'Campaign spend, impressions, clicks, conversions, and creative performance from Facebook and Instagram ads.',
    syncMode: 'oauth',
    metrics: ['Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue'],
  },
  {
    key: 'google_ads',
    name: 'Google Ads',
    category: 'ads',
    owner: 'Google',
    description: 'Search, YouTube, Performance Max, and display campaign reporting in the same analytics table.',
    syncMode: 'oauth',
    metrics: ['Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue'],
  },
  {
    key: 'tiktok_ads',
    name: 'TikTok Ads',
    category: 'ads',
    owner: 'TikTok',
    description: 'Short-form ad performance, video campaign spend, clicks, conversions, and revenue attribution.',
    syncMode: 'oauth',
    metrics: ['Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue'],
  },
  {
    key: 'linkedin_ads',
    name: 'LinkedIn Ads',
    category: 'ads',
    owner: 'LinkedIn',
    description: 'B2B campaign reporting for sponsored content, lead generation, traffic, and conversion campaigns.',
    syncMode: 'oauth',
    metrics: ['Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue'],
  },
  {
    key: 'youtube',
    name: 'YouTube',
    category: 'social',
    owner: 'Google',
    description: 'Channel and video performance that can be compared with campaign and content activity.',
    syncMode: 'oauth',
    metrics: ['Views', 'Impressions', 'Clicks', 'Conversions', 'Revenue'],
  },
  {
    key: 'shopify',
    name: 'Shopify',
    category: 'ecommerce',
    owner: 'Shopify',
    description: 'Store revenue, orders, product performance, and campaign-attributed sales in one reporting place.',
    syncMode: 'api_key',
    metrics: ['Orders', 'Revenue', 'Conversions', 'Average order value'],
  },
];

export function reportingSourceName(sourceKey: string) {
  return reportingSourceRegistry.find((source) => source.key === sourceKey)?.name ?? titleFromKey(sourceKey);
}

export function sourceStatusLabel(status: AnalyticsSourceStatus | undefined) {
  if (status === 'connected') return 'Connected';
  if (status === 'syncing') return 'Syncing';
  if (status === 'error') return 'Needs attention';
  return 'Not connected';
}

export function syncModeLabel(mode: ReportingSourceDefinition['syncMode']) {
  if (mode === 'api_key') return 'API key';
  if (mode === 'partner_connector') return 'Partner connector';
  return 'OAuth';
}

function titleFromKey(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}
