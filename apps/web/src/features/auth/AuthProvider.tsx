import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { hasSupabaseConfig } from '../../lib/env';
import type { Organization, OrganizationMembership, Profile } from '../../types/domain';

type BootstrapState = {
  profile: Profile | null;
  organization: Organization | null;
  membership: OrganizationMembership | null;
};

type AuthContextValue = BootstrapState & {
  configured: boolean;
  loading: boolean;
  bootstrapError: string;
  session: Session | null;
  user: User | null;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const emptyBootstrap: BootstrapState = {
  profile: null,
  organization: null,
  membership: null,
};

function getDisplayName(user: User) {
  const metadataName = user.user_metadata?.full_name;
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim();
  }

  return user.email?.split('@')[0] ?? 'Creator';
}

// Account type chosen at sign-up. 'agency' unlocks per-client Business DNA;
// anything else falls back to the single-workspace 'solo' default.
function getOrgTypeFromMetadata(user: User): 'solo' | 'agency' {
  return user.user_metadata?.account_type === 'agency' ? 'agency' : 'solo';
}

async function bootstrapUser(user: User): Promise<BootstrapState> {
  if (!supabase) {
    return emptyBootstrap;
  }

  const displayName = getDisplayName(user);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: displayName,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single();

  if (profileError) {
    throw profileError;
  }

  const { data: existingMemberships, error: membershipsError } = await supabase
    .from('organization_memberships')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1);

  if (membershipsError) {
    throw membershipsError;
  }

  const membership = existingMemberships?.[0] ?? null;

  if (!membership) {
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: `${displayName}'s Workspace`,
        org_type: getOrgTypeFromMetadata(user),
        plan_key: 'free',
        created_by: user.id,
      })
      .select('*')
      .single();

    if (orgError) {
      throw orgError;
    }

    const { data: createdMembership, error: membershipError } = await supabase
      .from('organization_memberships')
      .insert({
        org_id: organization.id,
        user_id: user.id,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (membershipError) {
      throw membershipError;
    }

    return { profile, organization, membership: createdMembership };
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', membership.org_id)
    .single();

  if (organizationError) {
    throw organizationError;
  }

  return { profile, organization, membership };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapState>(emptyBootstrap);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const refreshWorkspace = async () => {
    if (!supabase || !session?.user) {
      setBootstrap(emptyBootstrap);
      setBootstrapError('');
      return;
    }

    setBootstrapError('');
    try {
      const nextBootstrap = await bootstrapUser(session.user);
      setBootstrap(nextBootstrap);
    } catch (error) {
      setBootstrap(emptyBootstrap);
      setBootstrapError(workspaceErrorMessage(error));
    }
  };

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) {
        return;
      }

      if (error) {
        setSession(null);
        setBootstrap(emptyBootstrap);
        setLoading(false);
        return;
      }

      setSession(data.session);

      if (data.session?.user) {
        try {
          const nextBootstrap = await bootstrapUser(data.session.user);
          if (active) {
            setBootstrap(nextBootstrap);
          }
        } catch (error) {
          if (active) {
            setBootstrap(emptyBootstrap);
            setBootstrapError(workspaceErrorMessage(error));
          }
        }
      }

      if (active) {
        setLoading(false);
      }
    }

    load();

    if (!supabase) {
      return () => {
        active = false;
      };
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setPasswordRecovery(false);
      }

      if (!nextSession?.user) {
        setBootstrap(emptyBootstrap);
        setBootstrapError('');
        return;
      }

      setBootstrapError('');
      bootstrapUser(nextSession.user)
        .then((nextBootstrap) => {
          setBootstrap(nextBootstrap);
          setBootstrapError('');
        })
        .catch((error) => {
          setBootstrap(emptyBootstrap);
          setBootstrapError(workspaceErrorMessage(error));
        });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: hasSupabaseConfig,
      loading,
      bootstrapError,
      session,
      user: session?.user ?? null,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery(false),
      ...bootstrap,
      signOut: async () => {
        await supabase?.auth.signOut();
        setSession(null);
        setBootstrap(emptyBootstrap);
        setBootstrapError('');
        setPasswordRecovery(false);
      },
      refreshWorkspace,
    }),
    [bootstrap, bootstrapError, loading, passwordRecovery, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function workspaceErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'We could not load your workspace. Check your connection and try again.';
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
