const localHosts = ['localhost', '127.0.0.1', '::1'];
const browserIsLocal = typeof window !== 'undefined' && localHosts.includes(window.location.hostname);
const configuredPosterWebhookUrl = (import.meta.env.VITE_N8N_POSTER_WEBHOOK_URL ?? '').trim();

function safePosterWebhookUrl() {
  if (browserIsLocal) {
    return configuredPosterWebhookUrl || 'http://localhost:5678/webhook/time2grow-poster-workflow-2';
  }
  if (configuredPosterWebhookUrl.startsWith('/')) return configuredPosterWebhookUrl;

  try {
    const webhookUrl = new URL(configuredPosterWebhookUrl);
    return webhookUrl.protocol === 'https:' && !localHosts.includes(webhookUrl.hostname)
      ? configuredPosterWebhookUrl
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
  n8nPosterWebhookUrl: string;
};

export const env: PublicEnv = {
  appEnv: import.meta.env.VITE_APP_ENV ?? 'local',
  appName: import.meta.env.VITE_APP_NAME ?? 'time2grow',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL ?? 'support@time2grow.example',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  billingProvider: import.meta.env.VITE_BILLING_PROVIDER ?? 'razorpay',
  // Local development keeps its n8n shortcut. Hosted builds leave this empty
  // and use the Supabase ai-handler unless a public HTTPS webhook is supplied.
  n8nPosterWebhookUrl: safePosterWebhookUrl(),
};

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
