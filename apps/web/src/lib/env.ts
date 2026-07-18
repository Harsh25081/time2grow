const localHosts = ['localhost', '127.0.0.1', '::1'];
const browserIsLocal = typeof window !== 'undefined' && localHosts.includes(window.location.hostname);
const configuredPosterAgentUrl = (import.meta.env.VITE_POSTER_AGENT_URL ?? '').trim();

function safePosterAgentUrl() {
  if (browserIsLocal) {
    return configuredPosterAgentUrl || 'http://127.0.0.1:8000/api/poster';
  }
  if (!configuredPosterAgentUrl) return '/api/poster';
  if (configuredPosterAgentUrl.startsWith('/')) return configuredPosterAgentUrl;

  try {
    const agentUrl = new URL(configuredPosterAgentUrl);
    return agentUrl.protocol === 'https:' && !localHosts.includes(agentUrl.hostname)
      ? configuredPosterAgentUrl
      : '';
  } catch {
    return '';
  }
}

type PublicEnv = {
  appEnv: string;
  appName: string;
  appUrl: string;
  supportEmail: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  billingProvider: string;
  posterAgentUrl: string;
};

export const env: PublicEnv = {
  appEnv: import.meta.env.VITE_APP_ENV ?? 'local',
  appName: import.meta.env.VITE_APP_NAME ?? 'time2grow',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL ?? 'support@time2grow.example',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  billingProvider: import.meta.env.VITE_BILLING_PROVIDER ?? 'razorpay',
  // Python runs locally on port 8000 and as /api/poster in Vercel.
  posterAgentUrl: safePosterAgentUrl(),
};

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
