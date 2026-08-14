import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  CalendarDays,
  Dna,
  Home,
  Inbox,
  LineChart,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MessageCircle,
  Palette,
  PenLine,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';

import { deriveBrandDisplayName } from '../features/business-dna/brandIdentity';
import { MayaAssistant } from '../features/maya/MayaAssistant';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];
type HomeTaskRow = Pick<Database['public']['Tables']['marketing_tasks']['Row'], 'id' | 'title' | 'status' | 'due_at'>;
type HomeLeadRow = Pick<Database['public']['Tables']['leads']['Row'], 'id' | 'full_name' | 'status' | 'lead_type' | 'next_follow_up_at'>;
type HomeCampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status'>;
type HomeContentRow = Pick<Database['public']['Tables']['content_items']['Row'], 'id' | 'title' | 'status' | 'content_type' | 'updated_at'>;

const BusinessDnaPage = lazy(() => import('../features/business-dna/BusinessDnaPage').then((module) => ({ default: module.BusinessDnaPage })));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const AnalyticsReportingPage = lazy(() => import('../features/analytics/AnalyticsReportingPage').then((module) => ({ default: module.AnalyticsReportingPage })));
const PostInsightsPage = lazy(() => import('../features/post-insights/PostInsightsPage').then((module) => ({ default: module.PostInsightsPage })));
const CampaignsPage = lazy(() => import('../features/campaigns/CampaignsPage').then((module) => ({ default: module.CampaignsPage })));
const ConnectionsPage = lazy(() => import('../features/connections/ConnectionsPage').then((module) => ({ default: module.ConnectionsPage })));
const ContentCreatorPage = lazy(() => import('../features/content-studio/ContentCreatorPage').then((module) => ({ default: module.ContentCreatorPage })));
const CompetitorIntelligencePage = lazy(() => import('../features/competitors/CompetitorIntelligencePage').then((module) => ({ default: module.CompetitorIntelligencePage })));
const InboxPage = lazy(() => import('../features/inbox/InboxPage').then((module) => ({ default: module.InboxPage })));
const LeadsPage = lazy(() => import('../features/leads/LeadsPage').then((module) => ({ default: module.LeadsPage })));
const PosterStudioAiPage = lazy(() => import('../features/poster-studio/PosterStudioAiPage').then((module) => ({ default: module.PosterStudioAiPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const SocialHubPage = lazy(() => import('../features/social-hub/SocialHubPage').then((module) => ({ default: module.SocialHubPage })));
const TasksPage = lazy(() => import('../features/tasks/TasksPage').then((module) => ({ default: module.TasksPage })));
const TrendRadarPage = lazy(() => import('../features/trends/TrendRadarPage').then((module) => ({ default: module.TrendRadarPage })));

type WorkspaceDashboardStats = {
  aiUsageToday: number;
  distributionHandles: number;
  planKey: string;
};

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
};

const appNav: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/business-dna', label: 'Business DNA', icon: Dna },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, end: true },
  { to: '/campaigns/content', label: 'Content Studio', icon: PenLine },
  { to: '/campaigns/posters', label: 'Poster Studio', icon: Palette },
  { to: '/campaigns/social', label: 'Distribution Hub', icon: Send },
  { to: '/inbox', label: 'Unified Inbox', icon: MessageCircle },
  { to: '/leads', label: 'Leads', icon: Target },
  { to: '/trends', label: 'Trend Radar', icon: TrendingUp },
  { to: '/competitors', label: 'Competitor Intelligence', icon: Search },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  // { to: '/analytics/posts', label: 'Post Insights', icon: LineChart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const mobilePrimaryNav: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone, end: true },
  { to: '/inbox', label: 'Inbox', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const mobileMoreNav: NavItem[] = appNav.filter((item) => !mobilePrimaryNav.some((primary) => primary.to === item.to));

export function AppShell() {
  const { profile, organization, membership, signOut, configured } = useAuth();
  const [businessDna, setBusinessDna] = useState<BusinessDnaRow | null>(null);
  const [dashboardStats, setDashboardStats] = useState<WorkspaceDashboardStats | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const displayOrgName = useMemo(() => deriveBrandDisplayName(organization?.name, businessDna), [organization?.name, businessDna]);

  useEffect(() => {
    let active = true;

    async function loadBusinessDna() {
      if (!supabase || !organization?.id) {
        setBusinessDna(null);
        return;
      }

      const { data } = await supabase
        .from('business_dna')
        .select('*')
        .eq('org_id', organization.id)
        .maybeSingle();

      if (active) setBusinessDna(data ?? null);
    }

    loadBusinessDna();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  useEffect(() => {
    let active = true;

    async function loadDashboardStats() {
      if (!supabase || !organization?.id) {
        setDashboardStats(null);
        return;
      }

      const { data, error } = await supabase.rpc('workspace_dashboard_stats', {
        target_org_id: organization.id,
      });

      if (!active) return;
      setDashboardStats(error ? null : parseDashboardStats(data));
    }

    loadDashboardStats();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand-lockup compact">
          <div className="brand-mark">t2g</div>
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>time2grow</h1>
          </div>
        </div>

        <nav className="desktop-nav">
          {appNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
              <item.icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>
            <span>{profile?.full_name ?? 'Creator'}</span>
            <small>{membership?.role ?? 'owner'} - {displayOrgName}</small>
          </div>
          <button className="icon-button" type="button" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-surface">
        <Suspense fallback={<section className="empty-state" aria-label="Loading module"><span>Loading module…</span></section>}>
          <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                configured={configured}
                profileName={profile?.full_name ?? 'Creator'}
                orgName={displayOrgName}
                planKey={organization?.plan_key ?? 'unknown'}
                stats={dashboardStats}
              />
            }
          />
          <Route path="/business-dna" element={<BusinessDnaPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/analytics/posts" element={<PostInsightsPage />} />
          <Route path="/analytics/reporting" element={<AnalyticsReportingPage />} />
          <Route path="/trends" element={<TrendRadarPage />} />
          <Route path="/competitors" element={<CompetitorIntelligencePage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/content" element={<ContentCreatorPage />} />
          <Route path="/campaigns/posters" element={<PosterStudioAiPage />} />
          <Route path="/campaigns/social" element={<SocialHubPage />} />
          <Route path="/campaigns/tasks" element={<TasksPage />} />
          <Route path="/content" element={<Navigate to="/campaigns/content" replace />} />
          <Route path="/poster" element={<Navigate to="/campaigns/posters" replace />} />
          <Route path="/poster-ai" element={<Navigate to="/campaigns/posters" replace />} />
          <Route path="/social" element={<Navigate to="/campaigns/social" replace />} />
          <Route path="/tasks" element={<Navigate to="/campaigns/tasks" replace />} />
          <Route path="/connections" element={<Navigate to="/settings/connections" replace />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/connections" element={<ConnectionsPage />} />
          <Route path="/settings/team" element={<SettingsPage section="team" />} />
          <Route path="/settings/workspace" element={<SettingsPage section="workspace" />} />
          <Route path="/settings/billing" element={<SettingsPage section="billing" />} />
          <Route path="/settings/notifications" element={<SettingsPage section="notifications" />} />
          <Route path="/settings/security" element={<SettingsPage section="security" />} />
            <Route path="*" element={<NavigateHome />} />
          </Routes>
        </Suspense>
      </main>

      <MayaAssistant />

      {mobileMenuOpen ? (
        <nav className="mobile-more-menu" id="mobile-more-menu" aria-label="More navigation">
          <div className="mobile-more-menu__header">
            <strong>More</strong>
            <button className="icon-button" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close more navigation">
              <X size={18} />
            </button>
          </div>
          <div className="mobile-more-menu__grid">
            {mobileMoreNav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="mobile-more-menu__item" onClick={() => setMobileMenuOpen(false)}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {mobilePrimaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bottom-nav__item" onClick={() => setMobileMenuOpen(false)}>
            <item.icon size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          className={mobileMenuOpen ? 'bottom-nav__item active' : 'bottom-nav__item'}
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-more-menu"
        >
          <Menu size={21} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

function Dashboard({
  configured,
  profileName,
  orgName,
  planKey,
  stats,
}: {
  configured: boolean;
  profileName: string;
  orgName: string;
  planKey: string;
  stats: WorkspaceDashboardStats | null;
}) {
  const { organization } = useAuth();
  const [tasks, setTasks] = useState<HomeTaskRow[]>([]);
  const [leads, setLeads] = useState<HomeLeadRow[]>([]);
  const [campaigns, setCampaigns] = useState<HomeCampaignRow[]>([]);
  const [contentItems, setContentItems] = useState<HomeContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = useMemo(() => new Date(), []);
  const workspaceStats = [
    { label: 'AI units today', value: stats ? String(stats.aiUsageToday) : '—', hint: stats ? 'of 40 daily units' : 'Usage unavailable' },
    { label: 'Workspace plan', value: titleCase(stats?.planKey ?? planKey), hint: 'Current workspace plan' },
    { label: 'Distribution handles', value: stats ? String(stats.distributionHandles) : '—', hint: stats ? 'Enabled destinations' : 'Count unavailable' },
  ];

  const home = useMemo(() => {
    const todayTasks = tasks.filter((task) => isToday(task.due_at, today) && !['approved', 'done', 'archived'].includes(task.status));
    const overdueTasks = tasks.filter((task) => isBeforeToday(task.due_at, today) && !['approved', 'done', 'archived'].includes(task.status));
    const followUps = leads.filter((lead) => isToday(lead.next_follow_up_at, today) && !['won', 'lost', 'archived'].includes(lead.status));
    const hotLeads = leads.filter((lead) => lead.lead_type === 'hot' && !['won', 'lost', 'archived'].includes(lead.status));
    const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'active').length;
    const pausedCampaigns = campaigns.filter((campaign) => campaign.status === 'paused').length;
    const readyContent = contentItems.filter((item) => item.status === 'ready').length;
    const queuedContent = contentItems.filter((item) => item.status === 'queued').length;
    const draftContent = contentItems.filter((item) => item.status === 'draft').length;
    return { todayTasks, overdueTasks, followUps, hotLeads, activeCampaigns, pausedCampaigns, readyContent, queuedContent, draftContent };
  }, [campaigns, contentItems, leads, tasks, today]);
  const recommendations = useMemo(() => buildHomeRecommendations(home, stats), [home, stats]);

  useEffect(() => {
    let active = true;

    async function loadHome() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setTasks([]);
        setLeads([]);
        setCampaigns([]);
        setContentItems([]);
        setLoading(false);
        return;
      }

      const [taskResult, leadResult, campaignResult, contentResult] = await Promise.all([
        supabase.from('marketing_tasks').select('id, title, status, due_at').eq('org_id', organization.id).neq('status', 'archived').order('due_at', { ascending: true, nullsFirst: false }).limit(80),
        supabase.from('leads').select('id, full_name, status, lead_type, next_follow_up_at').eq('org_id', organization.id).neq('status', 'archived').order('next_follow_up_at', { ascending: true, nullsFirst: false }).limit(120),
        supabase.from('campaigns').select('id, name, status').eq('org_id', organization.id).neq('status', 'archived').order('updated_at', { ascending: false }).limit(80),
        supabase.from('content_items').select('id, title, status, content_type, updated_at').eq('org_id', organization.id).neq('status', 'archived').order('updated_at', { ascending: false }).limit(80),
      ]);

      if (!active) return;
      setTasks(taskResult.data ?? []);
      setLeads(leadResult.data ?? []);
      setCampaigns(campaignResult.data ?? []);
      setContentItems(contentResult.data ?? []);
      const firstError = taskResult.error || leadResult.error || campaignResult.error || contentResult.error;
      setError(firstError ? errorMessage(firstError, 'Could not load Home data.') : '');
      setLoading(false);
    }

    loadHome();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Good to see you, {profileName}</p>
          <h2>Home</h2>
        </div>
        <span className={configured ? 'status-pill success' : 'status-pill warning'}>
          {configured ? orgName : 'Env setup needed'}
        </span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading Home">
          <Loader2 className="spin" size={28} />
          <h3>Loading Home</h3>
        </section>
      ) : (
        <>
          {error ? <p className="form-message warning">{error}</p> : null}

          <section className="home-brief-panel" aria-label="Maya Executive Brief">
            <div>
              <p className="eyebrow">Maya Executive Brief</p>
              <h3>{home.todayTasks.length + home.followUps.length > 0 ? 'Start with follow-up and execution.' : 'Workspace is calm this morning.'}</h3>
              <p>{executiveBrief(home, stats)}</p>
            </div>
            <Bot size={26} />
          </section>

          <section className="stats-grid" aria-label="Home summary">
            <article className="stat-card">
              <span>Today's tasks</span>
              <strong>{home.todayTasks.length}</strong>
              <small>{home.overdueTasks.length} overdue</small>
            </article>
            <article className="stat-card">
              <span>Today's follow-ups</span>
              <strong>{home.followUps.length}</strong>
              <small>{home.hotLeads.length} hot leads</small>
            </article>
            <article className="stat-card">
              <span>Campaign Health</span>
              <strong>{home.activeCampaigns}</strong>
              <small>{home.pausedCampaigns} paused campaigns</small>
            </article>
          </section>

          <section className="home-grid" aria-label="Daily workspace">
            <HomePanel title="Today's Tasks" icon={<CalendarDays size={20} />}>
              <HomeList rows={home.todayTasks.slice(0, 5).map((task) => ({ id: task.id, title: task.title, meta: titleCase(task.status) }))} empty="No tasks due today." />
            </HomePanel>
            <HomePanel title="Today's Follow-ups" icon={<Target size={20} />}>
              <HomeList rows={home.followUps.slice(0, 5).map((lead) => ({ id: lead.id, title: lead.full_name, meta: `${titleCase(lead.lead_type)} - ${titleCase(lead.status)}` }))} empty="No follow-ups due today." />
            </HomePanel>
            <HomePanel title="Lead Summary" icon={<Inbox size={20} />}>
              <div className="home-mini-metrics">
                <span><strong>{leads.length}</strong>Total</span>
                <span><strong>{home.hotLeads.length}</strong>Hot</span>
                <span><strong>{leads.filter((lead) => lead.status === 'won').length}</strong>Won</span>
              </div>
            </HomePanel>
            <HomePanel title="Content Queue" icon={<Sparkles size={20} />}>
              <div className="home-mini-metrics">
                <span><strong>{home.readyContent}</strong>Ready</span>
                <span><strong>{home.queuedContent}</strong>Queued</span>
                <span><strong>{home.draftContent}</strong>Draft</span>
              </div>
            </HomePanel>
          </section>

          <section className="home-grid secondary" aria-label="Actions and recommendations">
            <HomePanel title="Quick Actions" icon={<Send size={20} />}>
              <div className="home-action-grid">
                <Link to="/campaigns/content">Create content</Link>
                <Link to="/campaigns/posters">Create poster</Link>
                <Link to="/leads">Review leads</Link>
                <Link to="/inbox">Open Inbox</Link>
              </div>
            </HomePanel>
            <HomePanel title="AI Recommendations" icon={<Bot size={20} />}>
              <HomeList rows={recommendations.map((item, index) => ({ id: String(index), title: item, meta: 'Maya' }))} empty="No recommendations yet." />
            </HomePanel>
          </section>
        </>
      )}

      <section className="stats-grid" aria-label="Workspace stats">
        {workspaceStats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
          </article>
        ))}
      </section>

    </div>
  );
}

function HomePanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="draft-panel home-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Home</p>
          <h3>{title}</h3>
        </div>
        {icon}
      </div>
      {children}
    </section>
  );
}

function HomeList({ rows, empty }: { rows: Array<{ id: string; title: string; meta: string }>; empty: string }) {
  if (rows.length === 0) return <p className="home-empty">{empty}</p>;

  return (
    <div className="home-list">
      {rows.map((row) => (
        <article key={row.id}>
          <strong>{row.title}</strong>
          <small>{row.meta}</small>
        </article>
      ))}
    </div>
  );
}

function executiveBrief(
  home: {
    todayTasks: HomeTaskRow[];
    overdueTasks: HomeTaskRow[];
    followUps: HomeLeadRow[];
    hotLeads: HomeLeadRow[];
    activeCampaigns: number;
    readyContent: number;
    queuedContent: number;
  },
  stats: WorkspaceDashboardStats | null,
) {
  const parts = [
    `${home.todayTasks.length} tasks due today`,
    `${home.followUps.length} follow-ups`,
    `${home.hotLeads.length} hot leads`,
    `${home.activeCampaigns} active campaigns`,
  ];
  if (home.readyContent + home.queuedContent > 0) parts.push(`${home.readyContent + home.queuedContent} content items ready or queued`);
  if (stats) parts.push(`${stats.aiUsageToday} AI units used today`);
  if (home.overdueTasks.length > 0) parts.push(`${home.overdueTasks.length} overdue tasks need attention`);
  return parts.join('. ') + '.';
}

function buildHomeRecommendations(
  home: {
    todayTasks: HomeTaskRow[];
    overdueTasks: HomeTaskRow[];
    followUps: HomeLeadRow[];
    hotLeads: HomeLeadRow[];
    activeCampaigns: number;
    readyContent: number;
    queuedContent: number;
    draftContent: number;
  },
  stats: WorkspaceDashboardStats | null,
) {
  const recommendations: string[] = [];
  if (home.hotLeads.length > 0) recommendations.push('Start with hot lead follow-ups before creating new campaigns.');
  if (home.overdueTasks.length > 0) recommendations.push('Clear overdue tasks to protect campaign delivery.');
  if (home.readyContent > 0) recommendations.push('Move ready content into Social Distribution Hub today.');
  if (home.draftContent > home.readyContent + home.queuedContent) recommendations.push('Review draft content and approve the strongest pieces.');
  if (home.activeCampaigns === 0) recommendations.push('Launch or reactivate one campaign so the workspace has a growth focus.');
  if (stats && stats.distributionHandles === 0) recommendations.push('Connect publishing handles so content can move from creation to distribution.');
  if (recommendations.length === 0) recommendations.push('Keep today focused: review Inbox, follow up with leads, and queue the next content item.');
  return recommendations.slice(0, 5);
}

function isToday(value: string | null, today: Date) {
  if (!value) return false;
  const date = new Date(value);
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function isBeforeToday(value: string | null, today: Date) {
  if (!value) return false;
  const date = new Date(value);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return date.getTime() < start.getTime();
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}

function parseDashboardStats(value: unknown): WorkspaceDashboardStats | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.aiUsageToday !== 'number'
    || typeof record.distributionHandles !== 'number'
    || typeof record.planKey !== 'string'
  ) {
    return null;
  }
  return {
    aiUsageToday: record.aiUsageToday,
    distributionHandles: record.distributionHandles,
    planKey: record.planKey,
  };
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : 'Unknown';
}

function NavigateHome() {
  return <Navigate to="/" replace />;
}
