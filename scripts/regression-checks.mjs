import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function requirePattern(label, path, pattern) {
  const text = source(path);
  if (!pattern.test(text)) {
    throw new Error(label + ' failed: ' + path);
  }
  console.log('PASS ' + label);
}

function rejectPattern(label, path, pattern) {
  const text = source(path);
  if (pattern.test(text)) {
    throw new Error(label + ' failed: ' + path);
  }
  console.log('PASS ' + label);
}

requirePattern(
  'future social posts stay queued',
  'apps/web/src/features/social-hub/SocialHubPage.tsx',
  /if \(isScheduled && scheduledAt\)[\s\S]*status: 'queued'[\s\S]*else \{[\s\S]*publishPostNow/,
);
requirePattern(
  'publish endpoint blocks early scheduled posts',
  'supabase/functions/social-publish/index.ts',
  /scheduledAt\.getTime\(\) > Date\.now\(\)[\s\S]*HttpError\(409/,
);
requirePattern(
  'scheduled worker atomically claims only due queued posts',
  'supabase/migrations/20260719150000_scheduled_social_post_delivery.sql',
  /status = 'queued'[\s\S]*scheduled_at <= now\(\)[\s\S]*for update skip locked[\s\S]*delivery_claim_id = gen_random_uuid\(\)/,
);
requirePattern(
  'scheduled worker requires a server-only secret',
  'supabase/functions/scheduled-jobs/index.ts',
  /SCHEDULED_JOBS_SECRET[\s\S]*constantTimeEqual/,
);
requirePattern(
  'scheduled publisher validates the active delivery claim',
  'supabase/functions/social-publish/index.ts',
  /schedulerRequest[\s\S]*post\.status !== 'publishing'[\s\S]*post\.delivery_claim_id !== schedulerClaimId/,
);
requirePattern(
  'scheduled publisher processes only queued targets',
  'supabase/functions/social-publish/index.ts',
  /from\('publish_targets'\)[\s\S]*eq\('social_post_id', postId\)[\s\S]*eq\('status', 'queued'\)/,
);
requirePattern(
  'manual publisher atomically claims a post before provider calls',
  'supabase/functions/social-publish/index.ts',
  /manualClaimId[\s\S]*status: 'publishing'[\s\S]*\.in\('status', \['draft', 'queued', 'failed', 'partial_failed'\]\)[\s\S]*delivery_claim_id/,
);
requirePattern(
  'publisher scopes linked handles and media to the post workspace',
  'supabase/functions/social-publish/index.ts',
  /loadHandles\(supabase, post\.org_id[\s\S]*from\('distribution_handles'\)[\s\S]*eq\('org_id', orgId\)[\s\S]*from\('social_media_assets'\)[\s\S]*eq\('org_id', stringValue\(post\.org_id\)/,
);
requirePattern(
  'provider errors redact credentials before persistence',
  'supabase/functions/social-publish/index.ts',
  /safeErrorMessage[\s\S]*redactProviderMessage[\s\S]*TELEGRAM_BOT_TOKEN/,
);
rejectPattern(
  'provider error fallbacks never echo request URLs',
  'supabase/functions/social-publish/index.ts',
  /Request failed: \$\{url\}/,
);

requirePattern(
  'poster endpoint reserves usage before provider calls',
  'api/poster.py',
  /_reserve_poster_usage[\s\S]*palette = _palette[\s\S]*_plan_concepts/,
);
requirePattern(
  'poster quota requires active write-capable membership',
  'supabase/migrations/20260719143000_poster_generation_authorization_and_quota.sql',
  /membership\.status = 'active'[\s\S]*membership\.role = any[\s\S]*'owner'[\s\S]*'admin'[\s\S]*'editor'/,
);
requirePattern(
  'poster quota has daily and burst limits',
  'supabase/migrations/20260719143000_poster_generation_authorization_and_quota.sql',
  /daily_limit constant integer := 40[\s\S]*burst_limit constant integer := 8[\s\S]*pg_advisory_xact_lock/,
);
requirePattern(
  'AI usage reservation is atomic and service-role only',
  'supabase/migrations/20260719152000_critical_security_hardening.sql',
  /reserve_ai_usage[\s\S]*pg_advisory_xact_lock[\s\S]*insert into public\.ai_usage_log[\s\S]*grant execute[\s\S]*service_role/,
);
requirePattern(
  'AI handler reserves usage before provider actions',
  'supabase/functions/ai-handler/index.ts',
  /await reserveAiUsage[\s\S]*const result = await handler/,
);
requirePattern(
  'AI review action stores structured review metadata',
  'supabase/functions/ai-handler/index.ts',
  /review_asset: reviewAsset[\s\S]*from\('content_items'\)[\s\S]*metadata: nextMetadata[\s\S]*parseReviewCompletion/,
);
requirePattern(
  'Content Studio exposes role-aware asset review',
  'apps/web/src/features/content-studio/ContentCreatorPage.tsx',
  /handleReviewItem[\s\S]*action: 'review_asset'[\s\S]*canWriteContent[\s\S]*ReviewChip/,
);
requirePattern(
  'admins cannot assign or modify owner memberships',
  'supabase/migrations/20260719152000_critical_security_hardening.sql',
  /memberships_insert_creator_or_managers[\s\S]*has_org_role\(org_id, array\['admin'\]\)[\s\S]*role <> 'owner'[\s\S]*memberships_update_owner_or_admin_non_owner/,
);
requirePattern(
  'cross-workspace relations use composite tenant keys',
  'supabase/migrations/20260719152000_critical_security_hardening.sql',
  /publish_targets_same_org_post_fk[\s\S]*foreign key \(org_id, social_post_id\)[\s\S]*social_media_assets_same_org_post_fk[\s\S]*provider_credentials_same_org_handle_fk/,
);
requirePattern(
  'workspace bootstrap exposes a recovery error',
  'apps/web/src/features/auth/AuthProvider.tsx',
  /bootstrapError[\s\S]*workspaceErrorMessage/,
);
requirePattern(
  'connections controls are role-aware',
  'apps/web/src/features/connections/ConnectionsPage.tsx',
  /canManageConnections[\s\S]*membership\?\.role === 'owner'[\s\S]*membership\?\.role === 'admin'/,
);
requirePattern(
  'Business DNA and Poster Studio controls are role-aware',
  'apps/web/src/features/business-dna/BusinessDnaPage.tsx',
  /membership[\s\S]*canWrite[\s\S]*role-gated-fieldset[\s\S]*ClientBrandManager[\s\S]*canWrite=/,
);
requirePattern(
  'Business DNA stores platform brain fields',
  'supabase/migrations/20260720120000_business_dna_brain_fields.sql',
  /brand_voice[\s\S]*ideal_customer_profile[\s\S]*products_services[\s\S]*faqs[\s\S]*pricing[\s\S]*offers[\s\S]*competitors[\s\S]*brand_assets[\s\S]*sales_scripts[\s\S]*policies[\s\S]*website_summary[\s\S]*social_links/,
);
requirePattern(
  'Business DNA page captures expanded brain sections',
  'apps/web/src/features/business-dna/BusinessDnaPage.tsx',
  /brandVoice[\s\S]*idealCustomerProfile[\s\S]*productsServices[\s\S]*salesScripts[\s\S]*socialLinks[\s\S]*brand_voice[\s\S]*ideal_customer_profile/,
);
requirePattern(
  'AI handler extracts and summarizes expanded Business DNA',
  'supabase/functions/ai-handler/index.ts',
  /brandVoice[\s\S]*idealCustomerProfile[\s\S]*productsServices[\s\S]*salesScripts[\s\S]*socialLinks[\s\S]*brand_voice[\s\S]*ideal_customer_profile/,
);
requirePattern(
  'Poster Studio blocks viewer generation and saves',
  'apps/web/src/features/poster-studio/PosterStudioAiPage.tsx',
  /membership[\s\S]*canWrite[\s\S]*Ask an owner, admin, or editor to generate posters[\s\S]*disabled=\{generating \|\| !canWrite\}/,
);
rejectPattern(
  'QR upload MIME types match the storage bucket',
  'apps/web/src/features/business-dna/BusinessDnaPage.tsx',
  /image\/svg\+xml/,
);
requirePattern(
  'dashboard uses tenant-safe live metrics',
  'apps/web/src/app/AppShell.tsx',
  /workspace_dashboard_stats[\s\S]*AI units today[\s\S]*Distribution handles/,
);
requirePattern(
  'mobile navigation uses a secondary More menu',
  'apps/web/src/app/AppShell.tsx',
  /mobilePrimaryNav[\s\S]*mobileMoreNav[\s\S]*mobile-more-menu/,
);
requirePattern(
  'Campaigns page is real CRUD and role-aware',
  'apps/web/src/features/campaigns/CampaignsPage.tsx',
  /from\('campaigns'\)[\s\S]*eq\('org_id', organization\.id\)[\s\S]*canWrite[\s\S]*Create campaign[\s\S]*campaign-metrics/,
);
requirePattern(
  'Campaigns route is wired into app shell',
  'apps/web/src/app/AppShell.tsx',
  /CampaignsPage[\s\S]*to: '\/campaigns'[\s\S]*path="\/campaigns"/,
);
requirePattern(
  'Leads CRM is real CRUD and role-aware',
  'apps/web/src/features/leads/LeadsPage.tsx',
  /from\('leads'\)[\s\S]*eq\('org_id', organization\.id\)[\s\S]*canWrite[\s\S]*Create lead[\s\S]*client_business_dna_id[\s\S]*campaign_id/,
);
requirePattern(
  'Leads CRM imports sheets',
  'apps/web/src/features/leads/LeadsPage.tsx',
  /parseLeadFile[\s\S]*accept="\.xlsx,\.csv,\.tsv[\s\S]*Import leads/,
);
requirePattern(
  'Leads CRM syncs from existing connected sources',
  'apps/web/src/features/leads/LeadsPage.tsx',
  /from\('analytics_sources'\)[\s\S]*parseSourceLeads[\s\S]*Settings \/ Connections[\s\S]*Sync leads/,
);
requirePattern(
  'Leads route is wired into app shell',
  'apps/web/src/app/AppShell.tsx',
  /LeadsPage[\s\S]*to="\/leads"[\s\S]*path="\/leads"/,
);
requirePattern(
  'Inbox tables are org-scoped and role-protected',
  'supabase/migrations/20260720110000_unified_inbox.sql',
  /create table if not exists public\.inbox_threads[\s\S]*org_id uuid not null[\s\S]*create table if not exists public\.inbox_messages[\s\S]*inbox_threads_select_members[\s\S]*inbox_messages_write_editors/,
);
requirePattern(
  'Inbox page is real CRUD and role-aware',
  'apps/web/src/features/inbox/InboxPage.tsx',
  /from\('inbox_threads'\)[\s\S]*eq\('org_id', organization\.id\)[\s\S]*from\('inbox_messages'\)[\s\S]*canWrite[\s\S]*Create conversation[\s\S]*createLeadFromThread/,
);
requirePattern(
  'Inbox uses existing handles and CRM links',
  'apps/web/src/features/inbox/InboxPage.tsx',
  /from\('leads'\)[\s\S]*from\('campaigns'\)[\s\S]*from\('distribution_handles'\)[\s\S]*lead_id[\s\S]*campaign_id[\s\S]*distribution_handle_id/,
);
requirePattern(
  'Inbox route is wired into app shell',
  'apps/web/src/app/AppShell.tsx',
  /InboxPage[\s\S]*to="\/inbox"[\s\S]*path="\/inbox"/,
);
requirePattern(
  'Trend Radar table is org-scoped and role-protected',
  'supabase/migrations/20260720113000_trend_radar.sql',
  /create table if not exists public\.trend_radar_items[\s\S]*org_id uuid not null[\s\S]*google_trends[\s\S]*ai_opportunity[\s\S]*trend_radar_items_select_members[\s\S]*trend_radar_items_write_editors/,
);
requirePattern(
  'Trend Radar page is real CRUD and role-aware',
  'apps/web/src/features/trends/TrendRadarPage.tsx',
  /from\('trend_radar_items'\)[\s\S]*eq\('org_id', organization\.id\)[\s\S]*canWrite[\s\S]*Add trend[\s\S]*Save trend/,
);
requirePattern(
  'Trend Radar generates campaigns from recommendations',
  'apps/web/src/features/trends/TrendRadarPage.tsx',
  /generateCampaign[\s\S]*Trend detected:[\s\S]*from\('campaigns'\)[\s\S]*status: 'campaign_generated'[\s\S]*Generate now/,
);
requirePattern(
  'Trend Radar route is wired into app shell',
  'apps/web/src/app/AppShell.tsx',
  /TrendRadarPage[\s\S]*to: '\/trends'[\s\S]*path="\/trends"/,
);
requirePattern(
  'Social Hub visible label is renamed',
  'apps/web/src/app/AppShell.tsx',
  /Social Distribution Hub[\s\S]*Distribution/,
);
requirePattern(
  'Campaign work modules sit under Campaigns',
  'apps/web/src/app/AppShell.tsx',
  /campaignNav[\s\S]*\/campaigns\/content[\s\S]*\/campaigns\/posters[\s\S]*\/campaigns\/tasks[\s\S]*\/campaigns\/social[\s\S]*path="\/content" element=\{<Navigate to="\/campaigns\/content"/,
);
requirePattern(
  'Connections sits under Settings',
  'apps/web/src/app/AppShell.tsx',
  /settingsNav[\s\S]*\/settings\/connections[\s\S]*path="\/connections" element=\{<Navigate to="\/settings\/connections"/,
);
requirePattern(
  'Analytics page is wired into app shell',
  'apps/web/src/app/AppShell.tsx',
  /AnalyticsPage[\s\S]*analyticsNav[\s\S]*\/analytics\/reporting[\s\S]*path="\/analytics"[\s\S]*path="\/analytics\/reporting"/,
);
requirePattern(
  'Analytics page reads workflow and reporting data',
  'apps/web/src/features/analytics/AnalyticsPage.tsx',
  /from\('campaigns'\)[\s\S]*from\('content_items'\)[\s\S]*from\('marketing_tasks'\)[\s\S]*from\('social_posts'\)[\s\S]*from\('analytics_metrics'\)[\s\S]*from\('analytics_sources'\)/,
);
requirePattern(
  'Analytics reporting registry includes requested marketing sources',
  'apps/web/src/features/analytics/reportingSources.ts',
  /meta_ads[\s\S]*google_ads[\s\S]*tiktok_ads[\s\S]*linkedin_ads[\s\S]*youtube[\s\S]*shopify/,
);
requirePattern(
  'Analytics reporting page shows platform KPIs and visuals',
  'apps/web/src/features/analytics/AnalyticsReportingPage.tsx',
  /Platform[\s\S]*All platforms[\s\S]*Spend[\s\S]*Revenue[\s\S]*Performance over time[\s\S]*Platform performance[\s\S]*Top campaigns/,
);
rejectPattern(
  'Analytics reporting page does not show implementation details',
  'apps/web/src/features/analytics/AnalyticsReportingPage.tsx',
  /One reporting table|Cross-platform reporting|ReportingSourcesPanel/,
);
requirePattern(
  'Connections exposes Shopify reporting source',
  'apps/web/src/features/connections/ConnectionsPage.tsx',
  /ReportingSourcesPanel[\s\S]*Shopify[\s\S]*Analytics can query/,
);

requirePattern(
  'feature pages are route-level lazy chunks',
  'apps/web/src/app/AppShell.tsx',
  /lazy\(\(\) => import\([\s\S]*Suspense/,
);
requirePattern(
  'global and React errors reach monitoring',
  'apps/web/src/main.tsx',
  /installGlobalErrorMonitoring[\s\S]*MonitoringErrorBoundary/,
);
requirePattern(
  'public policy and support routes exist',
  'apps/web/src/app/App.tsx',
  /path="\/privacy"[\s\S]*path="\/terms"[\s\S]*path="\/support"/,
);
requirePattern(
  'public signup defaults behind a launch gate',
  'apps/web/src/lib/env.ts',
  /publicSignupEnabled[\s\S]*VITE_PUBLIC_SIGNUP_ENABLED/,
);
requirePattern(
  'OAuth callbacks validate same-origin return URLs',
  'supabase/functions/_shared/security.ts',
  /safeReturnPath[\s\S]*!candidate\.startsWith\('\/'\)[\s\S]*candidate\.startsWith\('\/\/'\)[\s\S]*parsed\.origin !== 'https:\/\/time2grow\.invalid'/,
);
requirePattern(
  'deployment config sends browser hardening headers',
  'vercel.json',
  /Content-Security-Policy[\s\S]*frame-ancestors 'none'[\s\S]*X-Content-Type-Options[\s\S]*Permissions-Policy/,
);
requirePattern(
  'CI runs the lint gate',
  '.github/workflows/ci.yml',
  /npm run lint:web/,
);
requirePattern(
  'CI runs executable security helper tests',
  'package.json',
  /"test:functions": "deno test[^"\n]*security_test\.ts"/,
);

console.log('All regression checks passed.');
