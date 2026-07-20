import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, Building2, CreditCard, KeyRound, Link2, Loader2, LogOut, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { useAuth } from '../auth/AuthProvider';
import type { Organization } from '../../types/domain';
import type { Database, Json } from '../../types/database';

type SettingsSection = 'overview' | 'team' | 'workspace' | 'billing' | 'notifications' | 'security';
type MembershipRow = Database['public']['Tables']['organization_memberships']['Row'];
type NotificationPreferenceRow = Database['public']['Tables']['notification_preferences']['Row'];

type WorkspaceForm = {
  name: string;
  slug: string;
  orgType: Organization['org_type'];
};

type NotificationForm = {
  emailEnabled: boolean;
  inboxMentions: boolean;
  leadAlerts: boolean;
  campaignUpdates: boolean;
  competitorAlerts: boolean;
  trendAlerts: boolean;
  weeklyDigest: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

const workspaceTypeLabels: Record<Organization['org_type'], string> = {
  solo: 'Single business / creator',
  agency: 'Agency',
  company: 'Company',
};

const defaultNotifications: NotificationForm = {
  emailEnabled: true,
  inboxMentions: true,
  leadAlerts: true,
  campaignUpdates: true,
  competitorAlerts: true,
  trendAlerts: true,
  weeklyDigest: true,
  quietHoursStart: '',
  quietHoursEnd: '',
};

const settingCards: Array<{ section: SettingsSection | 'connections'; title: string; description: string; icon: typeof Link2; to: string; status: string }> = [
  { section: 'connections', title: 'Connections', description: 'Publishing accounts, reporting sources, handles, and Shopify.', icon: Link2, to: '/settings/connections', status: 'Live' },
  { section: 'team', title: 'Team', description: 'View workspace members, roles, and access status.', icon: UsersRound, to: '/settings/team', status: 'Live' },
  { section: 'workspace', title: 'Workspace', description: 'Workspace name, slug, mode, and plan identity.', icon: Building2, to: '/settings/workspace', status: 'Live' },
  { section: 'billing', title: 'Billing', description: 'Plan, invoices, usage, and payment methods.', icon: CreditCard, to: '/settings/billing', status: 'Coming soon' },
  { section: 'notifications', title: 'Notifications', description: 'Alerts for Inbox, leads, campaigns, competitors, and trends.', icon: Bell, to: '/settings/notifications', status: 'Live' },
  { section: 'security', title: 'Security', description: 'Profile, password, reset email, and sign out controls.', icon: ShieldCheck, to: '/settings/security', status: 'Live' },
];

export function SettingsPage({ section = 'overview' }: { section?: SettingsSection }) {
  if (section === 'team') return <TeamSettingsPage />;
  if (section === 'workspace') return <WorkspaceSettingsPage />;
  if (section === 'billing') return <BillingSettingsPage />;
  if (section === 'notifications') return <NotificationSettingsPage />;
  if (section === 'security') return <SecuritySettingsPage />;
  return <SettingsOverviewPage />;
}

function SettingsOverviewPage() {
  const { configured, organization, membership, user } = useAuth();

  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Settings</h2>
        </div>
        <span className={configured ? 'status-pill success' : 'status-pill warning'}>
          {configured ? titleCase(membership?.role ?? 'owner') : 'Env setup needed'}
        </span>
      </header>

      <section className="settings-overview" aria-label="Settings summary">
        <article>
          <UserRound size={20} />
          <span>Signed in as</span>
          <strong>{user?.email ?? 'Unknown email'}</strong>
        </article>
        <article>
          <Building2 size={20} />
          <span>Workspace</span>
          <strong>{organization?.name ?? 'Workspace'}</strong>
        </article>
        <article>
          <ShieldCheck size={20} />
          <span>Your access</span>
          <strong>{titleCase(membership?.role ?? 'owner')}</strong>
        </article>
      </section>

      <section className="settings-card-grid" aria-label="Settings sections">
        {settingCards.map((item) => (
          <Link className="settings-section-card" to={item.to} key={item.title}>
            <item.icon size={21} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <em>{item.status}</em>
          </Link>
        ))}
      </section>
    </div>
  );
}

function TeamSettingsPage() {
  const { organization, membership, user } = useAuth();
  const [members, setMembers] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canManageTeam = membership?.role === 'owner' || membership?.role === 'admin';
  const currentUserIsOwner = membership?.role === 'owner';

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('organization_memberships')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (loadError) setError(errorMessage(loadError, 'Could not load team members.'));
      setMembers(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  async function updateMember(member: MembershipRow, patch: Database['public']['Tables']['organization_memberships']['Update']) {
    if (!supabase || !organization?.id || !canManageTeam) return;
    setUpdatingId(member.id);
    setMessage('');
    setError('');

    try {
      const { data, error: updateError } = await supabase
        .from('organization_memberships')
        .update(patch)
        .eq('id', member.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      setMembers((current) => current.map((item) => (item.id === data.id ? data : item)));
      setMessage('Team access updated.');
    } catch (updateError) {
      setError(errorMessage(updateError, 'Could not update team access.'));
    } finally {
      setUpdatingId('');
    }
  }

  return (
    <SettingsShell title="Team" eyebrow="Settings" status={canManageTeam ? 'Manage access' : 'View only'}>
      {loading ? (
        <section className="empty-state" aria-label="Loading team">
          <Loader2 className="spin" size={28} />
          <h3>Loading Team</h3>
        </section>
      ) : (
        <section className="settings-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Members</p>
              <h3>Workspace team</h3>
            </div>
            <UsersRound size={20} />
          </div>
          {!canManageTeam ? <p className="form-message warning">Ask a workspace owner or admin to change team access.</p> : null}
          <div className="settings-table">
            {members.map((member) => {
              const canEditOwner = currentUserIsOwner || member.role !== 'owner';
              return (
                <article key={member.id} className="settings-table-row">
                  <span>
                    <strong>{member.user_id === user?.id ? 'You' : 'Workspace member'}</strong>
                    <small>{member.user_id === user?.id ? user?.email ?? member.user_id : shortId(member.user_id)}</small>
                  </span>
                  <label>
                    <span>Role</span>
                    <select
                      value={member.role}
                      disabled={!canManageTeam || !canEditOwner || updatingId === member.id}
                      onChange={(event) => updateMember(member, { role: event.target.value as MembershipRow['role'] })}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                      <option value="billing_admin">Billing admin</option>
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={member.status}
                      disabled={!canManageTeam || !canEditOwner || updatingId === member.id}
                      onChange={(event) => updateMember(member, { status: event.target.value as MembershipRow['status'] })}
                    >
                      <option value="active">Active</option>
                      <option value="invited">Invited</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
          {message ? <p className="form-message success">{message}</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}
        </section>
      )}
    </SettingsShell>
  );
}

function WorkspaceSettingsPage() {
  const { organization, membership, user, refreshWorkspace } = useAuth();
  const canManageWorkspace = membership?.role === 'owner' || membership?.role === 'admin';
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceForm>({
    name: organization?.name ?? '',
    slug: organization?.slug ?? '',
    orgType: organization?.org_type ?? 'solo',
  });
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');

  useEffect(() => {
    setWorkspaceForm({
      name: organization?.name ?? '',
      slug: organization?.slug ?? '',
      orgType: organization?.org_type ?? 'solo',
    });
  }, [organization?.name, organization?.org_type, organization?.slug]);

  async function handleSaveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceMessage('');
    setWorkspaceError('');

    const nextName = workspaceForm.name.trim();
    const nextSlug = normalizeSlug(workspaceForm.slug);
    if (!nextName) {
      setWorkspaceError('Enter a workspace name.');
      return;
    }

    if (!supabase || !organization?.id || !user?.id) {
      setWorkspaceError('Connect Supabase and select a workspace before saving.');
      return;
    }

    if (!canManageWorkspace) {
      setWorkspaceError('Ask a workspace owner or admin to change workspace settings.');
      return;
    }

    setWorkspaceSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          name: nextName,
          slug: nextSlug || null,
          org_type: workspaceForm.orgType,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organization.id);
      if (updateError) throw updateError;

      await refreshWorkspace();
      setWorkspaceForm((current) => ({ ...current, slug: nextSlug }));
      setWorkspaceMessage('Workspace settings saved.');
    } catch (error) {
      setWorkspaceError(errorMessage(error, 'Could not save workspace settings.'));
    } finally {
      setWorkspaceSaving(false);
    }
  }

  return (
    <SettingsShell title="Workspace" eyebrow="Settings" status={canManageWorkspace ? 'Admin access' : 'View only'}>
      <section className="settings-panel" aria-label="Workspace details">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h3>Details</h3>
          </div>
          <Building2 size={20} />
        </div>
        {!canManageWorkspace ? <p className="form-message warning">You can view workspace details. Ask a workspace owner or admin to edit them.</p> : null}
        <form className="settings-form" onSubmit={handleSaveWorkspace}>
          <label>
            <span>Workspace name</span>
            <input value={workspaceForm.name} disabled={!canManageWorkspace} onChange={(event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>Slug</span>
            <input value={workspaceForm.slug} disabled={!canManageWorkspace} onChange={(event) => setWorkspaceForm((current) => ({ ...current, slug: event.target.value }))} />
          </label>
          <label>
            <span>Mode</span>
            <select value={workspaceForm.orgType} disabled={!canManageWorkspace} onChange={(event) => setWorkspaceForm((current) => ({ ...current, orgType: event.target.value as Organization['org_type'] }))}>
              <option value="solo">Single business / creator</option>
              <option value="agency">Agency</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label>
            <span>Plan</span>
            <input value={titleCase(organization?.plan_key ?? 'free')} disabled readOnly />
          </label>
          <label>
            <span>Workspace type</span>
            <input value={workspaceTypeLabels[organization?.org_type ?? 'solo']} disabled readOnly />
          </label>
          {workspaceMessage ? <p className="form-message success">{workspaceMessage}</p> : null}
          {workspaceError ? <p className="form-message error">{workspaceError}</p> : null}
          <button className="primary-action settings-submit" type="submit" disabled={!canManageWorkspace || workspaceSaving}>
            {workspaceSaving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
            <span>{workspaceSaving ? 'Saving' : 'Save workspace'}</span>
          </button>
        </form>
      </section>
    </SettingsShell>
  );
}

function NotificationSettingsPage() {
  const { organization, user } = useAuth();
  const [preferenceId, setPreferenceId] = useState('');
  const [form, setForm] = useState<NotificationForm>(defaultNotifications);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id || !user?.id) {
        setPreferenceId('');
        setForm(defaultNotifications);
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('org_id', organization.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!active) return;
      if (loadError) setError(errorMessage(loadError, 'Could not load notification settings.'));
      setPreferenceId(data?.id ?? '');
      setForm(data ? notificationFormFromRow(data) : defaultNotifications);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id, user?.id]);

  function updateForm<K extends keyof NotificationForm>(key: K, value: NotificationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveNotifications(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;
    setSaving(true);
    setMessage('');
    setError('');

    const payload = notificationPayload(form);
    try {
      const query = preferenceId
        ? supabase.from('notification_preferences').update(payload).eq('id', preferenceId).eq('org_id', organization.id).select('*').single()
        : supabase.from('notification_preferences').insert({ ...payload, org_id: organization.id, user_id: user.id, metadata: {} satisfies Json }).select('*').single();
      const { data, error: saveError } = await query;
      if (saveError) throw saveError;
      setPreferenceId(data.id);
      setForm(notificationFormFromRow(data));
      setMessage('Notification settings saved.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save notification settings.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsShell title="Notifications" eyebrow="Settings" status="Personal preferences">
      <section className="settings-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Notifications</p>
            <h3>Alerts</h3>
          </div>
          <Bell size={20} />
        </div>
        {loading ? (
          <div className="queue-empty">
            <Loader2 className="spin" size={18} />
            <span>Loading notification settings</span>
          </div>
        ) : (
          <form className="settings-form settings-form--single" onSubmit={saveNotifications}>
            <div className="settings-toggle-list">
              <ToggleRow label="Email notifications" checked={form.emailEnabled} onChange={(checked) => updateForm('emailEnabled', checked)} />
              <ToggleRow label="Inbox mentions" checked={form.inboxMentions} onChange={(checked) => updateForm('inboxMentions', checked)} />
              <ToggleRow label="Lead alerts" checked={form.leadAlerts} onChange={(checked) => updateForm('leadAlerts', checked)} />
              <ToggleRow label="Campaign updates" checked={form.campaignUpdates} onChange={(checked) => updateForm('campaignUpdates', checked)} />
              <ToggleRow label="Competitor alerts" checked={form.competitorAlerts} onChange={(checked) => updateForm('competitorAlerts', checked)} />
              <ToggleRow label="Trend alerts" checked={form.trendAlerts} onChange={(checked) => updateForm('trendAlerts', checked)} />
              <ToggleRow label="Weekly digest" checked={form.weeklyDigest} onChange={(checked) => updateForm('weeklyDigest', checked)} />
            </div>
            <div className="settings-form">
              <label>
                <span>Quiet hours start</span>
                <input type="time" value={form.quietHoursStart} onChange={(event) => updateForm('quietHoursStart', event.target.value)} />
              </label>
              <label>
                <span>Quiet hours end</span>
                <input type="time" value={form.quietHoursEnd} onChange={(event) => updateForm('quietHoursEnd', event.target.value)} />
              </label>
            </div>
            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
            <button className="primary-action settings-submit" type="submit" disabled={saving}>
              {saving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              <span>{saving ? 'Saving' : 'Save notifications'}</span>
            </button>
          </form>
        )}
      </section>
    </SettingsShell>
  );
}

function SecuritySettingsPage() {
  const { profile, user, refreshWorkspace, signOut } = useAuth();
  const [profileName, setProfileName] = useState(profile?.full_name ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const passwordReady = useMemo(() => password.length >= 8 && password === confirmPassword, [confirmPassword, password]);

  useEffect(() => {
    setProfileName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage('');
    setProfileError('');

    const nextName = profileName.trim();
    if (!supabase || !user?.id) {
      setProfileError('Connect Supabase and sign in before saving account details.');
      return;
    }

    setProfileSaving(true);
    try {
      const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: nextName } });
      if (metadataError) throw metadataError;

      const { error: profileUpdateError } = await supabase.from('profiles').update({ full_name: nextName || null, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (profileUpdateError) throw profileUpdateError;

      await refreshWorkspace();
      setProfileMessage('Account details saved.');
    } catch (error) {
      setProfileError(errorMessage(error, 'Could not save account details.'));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (!passwordReady) {
      setPasswordError('Use at least 8 characters and confirm the same password.');
      return;
    }

    if (!supabase) {
      setPasswordError('Connect Supabase before changing your password.');
      return;
    }

    setPasswordSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed.');
    } catch (error) {
      setPasswordError(errorMessage(error, 'Could not change password.'));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSendResetLink() {
    setPasswordMessage('');
    setPasswordError('');

    if (!supabase || !user?.email) {
      setPasswordError('A signed-in email account is required.');
      return;
    }

    setResetSending(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${env.appUrl}/auth` });
      if (resetError) throw resetError;
      setPasswordMessage('Password reset email sent.');
    } catch (error) {
      setPasswordError(errorMessage(error, 'Could not send reset email.'));
    } finally {
      setResetSending(false);
    }
  }

  return (
    <SettingsShell title="Security" eyebrow="Settings" status="Account controls">
      <div className="settings-layout">
        <section className="settings-panel" aria-label="Account profile">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Account</p>
              <h3>Profile</h3>
            </div>
            <UserRound size={20} />
          </div>
          <form className="settings-form" onSubmit={handleSaveProfile}>
            <label>
              <span>Display name</span>
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <label>
              <span>Email</span>
              <input value={user?.email ?? ''} disabled readOnly />
            </label>
            {profileMessage ? <p className="form-message success">{profileMessage}</p> : null}
            {profileError ? <p className="form-message error">{profileError}</p> : null}
            <button className="primary-action settings-submit" type="submit" disabled={profileSaving}>
              {profileSaving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              <span>{profileSaving ? 'Saving' : 'Save profile'}</span>
            </button>
          </form>
        </section>

        <aside className="settings-side">
          <section className="settings-panel" aria-label="Password">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Security</p>
                <h3>Password</h3>
              </div>
              <KeyRound size={20} />
            </div>
            <form className="settings-form settings-form--single" onSubmit={handleChangePassword}>
              <label>
                <span>New password</span>
                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <label>
                <span>Confirm password</span>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
              {passwordMessage ? <p className="form-message success">{passwordMessage}</p> : null}
              {passwordError ? <p className="form-message error">{passwordError}</p> : null}
              <button className="primary-action settings-submit" type="submit" disabled={!passwordReady || passwordSaving}>
                {passwordSaving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
                <span>{passwordSaving ? 'Changing' : 'Change password'}</span>
              </button>
              <button className="icon-text-button" type="button" onClick={handleSendResetLink} disabled={resetSending}>
                {resetSending ? <Loader2 className="spin" size={16} /> : <Mail size={16} />}
                <span>{resetSending ? 'Sending' : 'Send reset email'}</span>
              </button>
              <button className="icon-text-button" type="button" onClick={() => void signOut()}>
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </form>
          </section>
        </aside>
      </div>
    </SettingsShell>
  );
}

function BillingSettingsPage() {
  const { organization } = useAuth();

  return (
    <SettingsShell title="Billing" eyebrow="Settings" status="Coming soon">
      <section className="settings-panel settings-coming-soon" aria-label="Billing">
        <CreditCard size={28} />
        <h3>Billing is coming soon</h3>
        <p>Plan upgrades, invoices, usage, and payment methods will live here. Current plan: {titleCase(organization?.plan_key ?? 'free')}.</p>
      </section>
    </SettingsShell>
  );
}

function SettingsShell({ title, eyebrow, status, children }: { title: string; eyebrow: string; status: string; children: ReactNode }) {
  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className="page-header-actions">
          <Link className="icon-text-button" to="/settings">
            <ArrowRight size={16} />
            <span>All settings</span>
          </Link>
          <span className={status === 'Coming soon' ? 'status-pill warning' : 'status-pill success'}>{status}</span>
        </div>
      </header>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="settings-toggle-row">
      <span>
        <strong>{label}</strong>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function notificationFormFromRow(row: NotificationPreferenceRow): NotificationForm {
  return {
    emailEnabled: row.email_enabled,
    inboxMentions: row.inbox_mentions,
    leadAlerts: row.lead_alerts,
    campaignUpdates: row.campaign_updates,
    competitorAlerts: row.competitor_alerts,
    trendAlerts: row.trend_alerts,
    weeklyDigest: row.weekly_digest,
    quietHoursStart: row.quiet_hours_start ?? '',
    quietHoursEnd: row.quiet_hours_end ?? '',
  };
}

function notificationPayload(form: NotificationForm): Database['public']['Tables']['notification_preferences']['Update'] {
  return {
    email_enabled: form.emailEnabled,
    inbox_mentions: form.inboxMentions,
    lead_alerts: form.leadAlerts,
    campaign_updates: form.campaignUpdates,
    competitor_alerts: form.competitorAlerts,
    trend_alerts: form.trendAlerts,
    weekly_digest: form.weeklyDigest,
    quiet_hours_start: form.quietHoursStart || null,
    quiet_hours_end: form.quietHoursEnd || null,
  };
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : 'Unknown';
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
