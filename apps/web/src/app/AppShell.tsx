import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  CalendarDays,
  Dna,
  Home,
  Inbox,
  Link2,
  LogOut,
  Send,
  Settings,
  Sparkles,
  Target,
} from 'lucide-react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { BusinessDnaPage } from '../features/business-dna/BusinessDnaPage';
import { ConnectionsPage } from '../features/connections/ConnectionsPage';
import { ContentCreatorPage } from '../features/content-studio/ContentCreatorPage';
import { PosterStudioAiPage } from '../features/poster-studio/PosterStudioAiPage';
import { useAuth } from '../features/auth/AuthProvider';
import { SocialHubPage } from '../features/social-hub/SocialHubPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { deriveBrandDisplayName } from '../features/business-dna/brandIdentity';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];

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
  { to: '/tasks', label: 'Tasks', icon: CalendarDays },
  { to: '/leads', label: 'Leads', icon: Target },
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/settings', label: 'Settings', icon: Settings },
];

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

const stats = [
  { label: 'AI calls today', value: '0', hint: 'Cap ready' },
  { label: 'Workspace plan', value: 'Free', hint: 'Metered later' },
  { label: 'Distribution targets', value: '30', hint: 'Live setup' },
];

export function AppShell() {
  const { profile, organization, membership, signOut, configured } = useAuth();
  const [businessDna, setBusinessDna] = useState<BusinessDnaRow | null>(null);
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
        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                configured={configured}
                profileName={profile?.full_name ?? 'Creator'}
                orgName={displayOrgName}
              />
            }
          />
          <Route path="/business-dna" element={<BusinessDnaPage />} />
          <Route path="/content" element={<ContentCreatorPage />} />
          <Route path="/poster" element={<Navigate to="/poster-ai" replace />} />
          <Route path="/poster-ai" element={<PosterStudioAiPage />} />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/social" element={<SocialHubPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/leads" element={<ModulePlaceholder title="Leads CRM" icon={Target} />} />
          <Route path="/inbox" element={<ModulePlaceholder title="Unified Inbox" icon={Inbox} />} />
          <Route path="/settings" element={<ModulePlaceholder title="Settings" icon={Settings} />} />
          <Route path="*" element={<NavigateHome />} />
        </Routes>
      </main>

      <button className="maya-launcher" type="button" title="Maya assistant — coming soon" disabled>
        <Bot size={22} />
        <span>Maya · Soon</span>
      </button>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {primaryNav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bottom-nav__item">
            <item.icon size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function Dashboard({
  configured,
  profileName,
  orgName,
}: {
  configured: boolean;
  profileName: string;
  orgName: string;
}) {
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
        {stats.map((stat) => (
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

function NavigateHome() {
  return <Navigate to="/" replace />;
}
