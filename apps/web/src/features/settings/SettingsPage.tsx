import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, KeyRound, Link2, Loader2, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { useAuth } from '../auth/AuthProvider';
import type { Organization } from '../../types/domain';

type WorkspaceForm = {
  name: string;
  slug: string;
  orgType: Organization['org_type'];
};

const workspaceTypeLabels: Record<Organization['org_type'], string> = {
  solo: 'Single business / creator',
  agency: 'Agency',
  company: 'Company',
};

export function SettingsPage() {
  const { configured, organization, profile, membership, user, refreshWorkspace, signOut } = useAuth();
  const canManageWorkspace = membership?.role === 'owner' || membership?.role === 'admin';
  const [profileName, setProfileName] = useState(profile?.full_name ?? '');
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceForm>({
    name: organization?.name ?? '',
    slug: organization?.slug ?? '',
    orgType: organization?.org_type ?? 'solo',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    setProfileName(profile?.full_name ?? '');
  }, [profile?.full_name]);

  useEffect(() => {
    setWorkspaceForm({
      name: organization?.name ?? '',
      slug: organization?.slug ?? '',
      orgType: organization?.org_type ?? 'solo',
    });
  }, [organization?.name, organization?.org_type, organization?.slug]);

  const passwordReady = useMemo(() => password.length >= 8 && password === confirmPassword, [confirmPassword, password]);
  const workspaceStatus = canManageWorkspace ? 'Admin access' : 'View only';

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
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { full_name: nextName },
      });
      if (metadataError) throw metadataError;

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ full_name: nextName || null, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (profileUpdateError) throw profileUpdateError;

      await refreshWorkspace();
      setProfileMessage('Account details saved.');
    } catch (error) {
      setProfileError(errorMessage(error, 'Could not save account details.'));
    } finally {
      setProfileSaving(false);
    }
  }

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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${env.appUrl}/auth`,
      });
      if (resetError) throw resetError;
      setPasswordMessage('Password reset email sent.');
    } catch (error) {
      setPasswordError(errorMessage(error, 'Could not send reset email.'));
    } finally {
      setResetSending(false);
    }
  }

  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Workspace settings</h2>
        </div>
        <span className={configured ? 'status-pill success' : 'status-pill warning'}>
          {configured ? workspaceStatus : 'Env setup needed'}
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
          <span>Workspace type</span>
          <strong>{workspaceTypeLabels[organization?.org_type ?? 'solo']}</strong>
        </article>
        <article>
          <ShieldCheck size={20} />
          <span>Your access</span>
          <strong>{titleCase(membership?.role ?? 'owner')}</strong>
        </article>
      </section>

      <div className="settings-layout">
        <div className="settings-main">
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
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Your name" />
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
                <input
                  value={workspaceForm.name}
                  disabled={!canManageWorkspace}
                  onChange={(event) => setWorkspaceForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Workspace name"
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  value={workspaceForm.slug}
                  disabled={!canManageWorkspace}
                  onChange={(event) => setWorkspaceForm((current) => ({ ...current, slug: event.target.value }))}
                  placeholder="workspace-slug"
                />
              </label>
              <label>
                <span>Mode</span>
                <select
                  value={workspaceForm.orgType}
                  disabled={!canManageWorkspace}
                  onChange={(event) => setWorkspaceForm((current) => ({ ...current, orgType: event.target.value as Organization['org_type'] }))}
                >
                  <option value="solo">Single business / creator</option>
                  <option value="agency">Agency</option>
                  <option value="company">Company</option>
                </select>
              </label>
              <label>
                <span>Plan</span>
                <input value={titleCase(organization?.plan_key ?? 'free')} disabled readOnly />
              </label>
              {workspaceMessage ? <p className="form-message success">{workspaceMessage}</p> : null}
              {workspaceError ? <p className="form-message error">{workspaceError}</p> : null}
              <button className="primary-action settings-submit" type="submit" disabled={!canManageWorkspace || workspaceSaving}>
                {workspaceSaving ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
                <span>{workspaceSaving ? 'Saving' : 'Save workspace'}</span>
              </button>
            </form>
          </section>
        </div>

        <aside className="settings-side" aria-label="Security and workspace links">
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
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <label>
                <span>Confirm password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                />
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
            </form>
          </section>

          <section className="settings-panel" aria-label="Connected systems">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Connected systems</p>
                <h3>Connections</h3>
              </div>
              <Link2 size={20} />
            </div>
            <div className="settings-action-list">
              <Link className="settings-action-row" to="/settings/connections">
                <span>
                  <strong>Publishing and reporting</strong>
                  <small>Accounts, handles, sources, Shopify</small>
                </span>
                <ArrowRight size={18} />
              </Link>
              <button className="settings-action-row" type="button" onClick={() => void signOut()}>
                <span>
                  <strong>Sign out</strong>
                  <small>{user?.email ?? 'Current account'}</small>
                </span>
                <LogOut size={18} />
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
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

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
