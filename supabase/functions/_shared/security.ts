const sensitiveKeyPattern = /(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|authorization|password|secret)/i;
const telegramTokenPattern = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;

export function safeReturnPath(value: unknown, fallback = '/social') {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, 'https://time2grow.invalid');
    if (parsed.origin !== 'https://time2grow.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function redactProviderMessage(value: unknown, fallback = 'Provider request failed.', configuredSecrets: string[] = []) {
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : fallback;
  let sanitized = raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, redactUrl)
    .replace(telegramTokenPattern, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .trim();

  for (const secret of configuredSecrets) {
    if (secret) sanitized = sanitized.split(secret).join('[REDACTED]');
  }

  return (sanitized || fallback).slice(0, 1000);
}

function redactUrl(match: string) {
  const trailing = match.match(/[),.;!?]+$/)?.[0] ?? '';
  const candidate = trailing ? match.slice(0, -trailing.length) : match;

  try {
    const parsed = new URL(candidate);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(key, sensitiveKeyPattern.test(key) ? '[REDACTED]' : parsed.searchParams.get(key) ?? '');
    }
    parsed.pathname = parsed.pathname.replace(/\/bot[^/]+/i, '/bot[REDACTED]');
    return `${parsed.toString()}${trailing}`;
  } catch {
    return `[REDACTED_URL]${trailing}`;
  }
}
