import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  CalendarDays,
  Dna,
  Home,
  Inbox,
  Link2,
  LogOut,
  Menu,
  Send,
  Settings,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';

import { deriveBrandDisplayName } from '../features/business-dna/brandIdentity';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];

const BusinessDnaPage = lazy(() => import('../features/business-dna/BusinessDnaPage').then((module) => ({ default: module.BusinessDnaPage })));
const CampaignsPage = lazy(() => import('../features/campaigns/CampaignsPage').then((module) => ({ default: module.CampaignsPage })));
const ConnectionsPage = lazy(() => import('../features/connections/ConnectionsPage').then((module) => ({ default: module.ConnectionsPage })));
const ContentCreatorPage = lazy(() => import('../features/content-studio/ContentCreatorPage').then((module) => ({ default: module.ContentCreatorPage })));
const PosterStudioAiPage = lazy(() => import('../features/poster-studio/PosterStudioAiPage').then((module) => ({ default: module.PosterStudioAiPage })));
const SocialHubPage = lazy(() => import('../features/social-hub/SocialHubPage').then((module) => ({ default: module.SocialHubPage })));
const TasksPage = lazy(() => import('../features/tasks/TasksPage').then((module) => ({ default: module.TasksPage })));

type WorkspaceDashboardStats = {
  aiUsageToday: number;
  distributionHandles: number;
  planKey: string;
};

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
};

const primaryNav: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/business-dna', label: 'Business DNA', icon: Dna },
  { to: '/content', label: 'Content', icon: Sparkles },
  { to: '/poster-ai', label: 'AI Posters', icon: Sparkles },
  { to: '/connections', label: 'Connections', icon: Link2 },
  { to: '/social', label: 'Social', icon: Send },
  { to: '/campaigns', label: 'Campaigns', icon: Target },
  { to: '/tasks', label: 'Tasks', icon: CalendarDays },
  { to: '/leads', label: 'Leads', icon: Target },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const mobilePrimaryNav = primaryNav.filter((item) => ['/', '/business-dna', '/content', '/poster-ai', '/social'].includes(item.to));
const mobileMoreNav = primaryNav.filter((item) => !mobilePrimaryNav.includes(item));

const modules = [
  {
    title: 'Business DNA',
    description: 'Capture positioning, audience, proof, colors, and growth goals.',
    status: 'Live',
    color: 'pink',
  },
  {
    title: 'Content Studio',
    description: 'Generate posts from DNA, campaign context, and persona tone.',
    status: 'Live',
    color: 'purple',
  },
  {
    title: 'Poster Studio',
    description: 'Create premium AI posters from Business DNA and save them for publishing.',
    status: 'Live',
    color: 'pink',
  },
  {
    title: 'Social Hub',
    description: 'Publish posts, posters, and videos to connected social and messaging channels.',
    status: 'Priority',
    color: 'blue',
  },
  {
    title: 'Lead CRM',
    description: 'Track lead source, status, score, and follow-up timeline.',
    status: 'Coming soon',
    color: 'green',
  },
];


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
          {primaryNav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-item">
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
          <Route path="/content" element={<ContentCreatorPage />} />
          <Route path="/poster" element={<Navigate to="/poster-ai" replace />} />
          <Route path="/poster-ai" element={<PosterStudioAiPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/social" element={<SocialHubPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/leads" element={<ModulePlaceholder title="Leads CRM" icon={Target} />} />
          <Route path="/inbox" element={<ModulePlaceholder title="Unified Inbox" icon={Inbox} />} />
          <Route path="/settings" element={<ModulePlaceholder title="Settings" icon={Settings} />} />
            <Route path="*" element={<NavigateHome />} />
          </Routes>
        </Suspense>
      </main>

      <button className="maya-launcher" type="button" title="Maya assistant — coming soon" disabled>
        <Bot size={22} />
        <span>Maya · Soon</span>
      </button>

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
              <NavLink key={item.to} to={item.to} className="mobile-more-menu__item" onClick={() => setMobileMenuOpen(false)}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {mobilePrimaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bottom-nav__item" onClick={() => setMobileMenuOpen(false)}>
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
  const workspaceStats = [
    { label: 'AI units today', value: stats ? String(stats.aiUsageToday) : '—', hint: stats ? 'of 40 daily units' : 'Usage unavailable' },
    { label: 'Workspace plan', value: titleCase(stats?.planKey ?? planKey), hint: 'Current workspace plan' },
    { label: 'Distribution handles', value: stats ? String(stats.distributionHandles) : '—', hint: stats ? 'Enabled destinations' : 'Count unavailable' },
  ];

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Good to see you, {profileName}</p>
          <h2>{orgName}</h2>
        </div>
        <span className={configured ? 'status-pill success' : 'status-pill warning'}>
          {configured ? 'Supabase connected' : 'Env setup needed'}
        </span>
      </header>

      <section className="stats-grid" aria-label="Workspace stats">
        {workspaceStats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.hint}</small>
          </article>
        ))}
      </section>

      <section className="work-band">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Build order</p>
            <h3>Foundation modules</h3>
          </div>
          <span>V1 core</span>
        </div>

        <div className="module-grid">
          {modules.map((module) => (
            <article className={`module-card ${module.color}`} key={module.title}>
              <div>
                <h4>{module.title}</h4>
                <p>{module.description}</p>
              </div>
              <span>{module.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="activity-band">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Today</p>
            <h3>Setup checklist</h3>
          </div>
          <CalendarDays size={21} />
        </div>
        <ol className="checklist">
          <li className="is-done">React app shell created</li>
          <li className="is-done">Supabase auth client wired</li>
          <li className="is-done">Profiles and workspace migration added</li>
          <li>Run migration in Supabase</li>
          <li>Create first user account</li>
        </ol>
      </section>
    </div>
  );
}

function ModulePlaceholder({ title, icon: Icon }: { title: string; icon: typeof Home }) {
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Module</p>
          <h2>{title}</h2>
        </div>
        <Icon size={24} />
      </header>

      <section className="empty-state">
        <BarChart3 size={34} />
        <h3>{title} is coming soon</h3>
        <p>This module is not available yet. We are preparing it for a future release.</p>
      </section>
    </div>
  );
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
