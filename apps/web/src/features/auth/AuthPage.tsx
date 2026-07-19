import { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, KeyRound, Loader2, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { useAuth } from './AuthProvider';

type AuthMode = 'signin' | 'signup' | 'reset';

const modeCopy: Record<AuthMode, { title: string; action: string; icon: typeof Mail }> = {
  signin: {
    title: 'Sign in to time2grow',
    action: 'Sign in',
    icon: Mail,
  },
  signup: {
    title: 'Create your workspace',
    action: 'Create account',
    icon: UserPlus,
  },
  reset: {
    title: 'Reset your password',
    action: 'Send reset link',
    icon: KeyRound,
  },
};

export function AuthPage() {
  const { configured, session, passwordRecovery, clearPasswordRecovery } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<'solo' | 'agency'>('solo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const copy = modeCopy[mode];
  const Icon = copy.icon;

  const canSubmit = useMemo(() => {
    if (!configured || !email.trim()) {
      return false;
    }

    if (mode === 'reset') {
      return true;
    }

    return password.length >= 8;
  }, [configured, email, mode, password]);

  if (passwordRecovery) {
    return <UpdatePasswordPanel onComplete={clearPasswordRecovery} />;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !canSubmit) {
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }
      }

      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              account_type: accountType,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        setMessage('Account created. Check your inbox if email confirmation is enabled.');
      }

      if (mode === 'reset') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${env.appUrl}/auth`,
        });

        if (resetError) {
          throw resetError;
        }

        setMessage('Password reset link sent.');
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-label="Authentication">
        <div className="brand-lockup">
          <div className="brand-mark">t2g</div>
          <div>
            <p className="eyebrow">AI growth workspace</p>
            <h1>time2grow</h1>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card__header">
            <span className="auth-icon">
              <Icon size={22} />
            </span>
            <div>
              <h2>{copy.title}</h2>
              <p>Build, learn, and manage your creator growth loop in one secure workspace.</p>
            </div>
          </div>

          {!configured ? (
            <div className="setup-warning">
              <ShieldCheck size={22} />
              <div>
                <strong>Supabase env vars needed</strong>
                <span>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/web/.env.local`.</span>
              </div>
            </div>
          ) : null}

          <div className="segmented-control" role="tablist" aria-label="Authentication mode">
            {(['signin', ...(env.publicSignupEnabled ? ['signup' as const] : []), 'reset'] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                role="tab"
                aria-selected={mode === nextMode}
                className={mode === nextMode ? 'is-active' : ''}
                onClick={() => {
                  setMode(nextMode);
                  setMessage('');
                  setError('');
                }}
              >
                {nextMode === 'signin' ? 'Sign in' : nextMode === 'signup' ? 'Sign up' : 'Reset'}
              </button>
            ))}
          </div>

          {!env.publicSignupEnabled ? <p className="field-hint">New workspaces are currently invite-only while billing and launch controls are finalized.</p> : null}
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' ? (
              <label>
                <span>Full name</span>
                <input
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your name"
                />
              </label>
            ) : null}

            {mode === 'signup' ? (
              <label>
                <span>Account type</span>
                <div className="segmented-control" role="radiogroup" aria-label="Account type">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={accountType === 'solo'}
                    className={accountType === 'solo' ? 'is-active' : ''}
                    onClick={() => setAccountType('solo')}
                  >
                    Single business / creator
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={accountType === 'agency'}
                    className={accountType === 'agency' ? 'is-active' : ''}
                    onClick={() => setAccountType('agency')}
                  >
                    Agency (multiple clients)
                  </button>
                </div>
                <small className="field-hint">
                  {accountType === 'agency'
                    ? 'Manage a separate Business DNA per client and pick one when creating content.'
                    : 'One Business DNA for your own brand. You can switch to agency later.'}
                </small>
              </label>
            ) : null}

            <label>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            {mode !== 'reset' ? (
              <label>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </label>
            ) : null}

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}

            <button className="primary-action" type="submit" disabled={!canSubmit || loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              <span>{loading ? 'Working' : copy.action}</span>
            </button>
          </form>
          <footer className="public-info-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/support">Support</a>
          </footer>
        </div>
      </section>
    </main>
  );
}

function UpdatePasswordPanel({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const canSubmit = password.length >= 8 && password === confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !canSubmit) {
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      setMessage('Password updated. Redirecting you to your workspace.');
      setDone(true);
      setTimeout(onComplete, 1200);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-label="Set a new password">
        <div className="brand-lockup">
          <div className="brand-mark">t2g</div>
          <div>
            <p className="eyebrow">AI growth workspace</p>
            <h1>time2grow</h1>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card__header">
            <span className="auth-icon">
              <KeyRound size={22} />
            </span>
            <div>
              <h2>Set a new password</h2>
              <p>Choose a new password for your account to finish resetting it.</p>
            </div>
          </div>

          {!env.publicSignupEnabled ? <p className="field-hint">New workspaces are currently invite-only while billing and launch controls are finalized.</p> : null}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                disabled={done}
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
                minLength={8}
                required
                disabled={done}
              />
            </label>

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}

            <button className="primary-action" type="submit" disabled={!canSubmit || loading || done}>
              {loading ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              <span>{loading ? 'Working' : 'Update password'}</span>
            </button>
          </form>
          <footer className="public-info-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/support">Support</a>
          </footer>
        </div>
      </section>
    </main>
  );
}
