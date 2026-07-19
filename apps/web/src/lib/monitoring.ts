import { env } from './env';

type ErrorContext = {
  source: string;
  componentStack?: string;
};

let installed = false;

export function reportError(error: unknown, context: ErrorContext) {
  const normalized = normalizeError(error);
  const payload = {
    message: normalized.message.slice(0, 1000),
    stack: normalized.stack?.slice(0, 4000),
    source: context.source,
    componentStack: context.componentStack?.slice(0, 4000),
    path: window.location.pathname,
    appEnv: env.appEnv,
    occurredAt: new Date().toISOString(),
  };

  if (env.appEnv !== 'production') {
    console.error('[time2grow]', payload);
  }

  if (!env.errorReportingUrl) return;

  void fetch(env.errorReportingUrl, {
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function installGlobalErrorMonitoring() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, { source: 'window.error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { source: 'window.unhandledrejection' });
  });
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Unknown application error');
}