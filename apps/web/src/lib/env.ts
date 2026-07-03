type PublicEnv = {
  appEnv: string;
  appName: string;
  appUrl: string;
  supportEmail: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  billingProvider: string;
};

export const env: PublicEnv = {
  appEnv: import.meta.env.VITE_APP_ENV ?? 'local',
  appName: import.meta.env.VITE_APP_NAME ?? 'time2grow',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL ?? 'support@time2grow.example',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  billingProvider: import.meta.env.VITE_BILLING_PROVIDER ?? 'razorpay',
};

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
