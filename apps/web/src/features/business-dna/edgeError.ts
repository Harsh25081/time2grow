// Shared error formatting for Supabase Edge Function calls used by the Business
// DNA editors (self and client). Turns invoke errors into a clear message,
// reading the function's JSON error body when present.
export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }

  return fallback;
}

export async function edgeFunctionErrorMessage(error: unknown, functionName: string) {
  const response = edgeFunctionResponse(error);
  if (response) {
    const detail = await response
      .clone()
      .json()
      .then((body) => {
        if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
        if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
        return '';
      })
      .catch(() => response.clone().text().catch(() => ''));

    if (detail.trim()) return detail.trim();
  }

  const message = errorMessage(error, '');
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('failed to send a request to the edge function') || lowerMessage.includes('failed to fetch')) {
    return `Could not reach the ${functionName} Edge Function. Deploy ${functionName} in Supabase Edge Functions for this project, then refresh and try again.`;
  }

  if (lowerMessage.includes('edge function returned a non-2xx status code')) {
    return `${functionName} returned an error. Check the Supabase Edge Function logs for the exact provider or secret issue.`;
  }

  return message || `Could not call the ${functionName} Edge Function.`;
}

function edgeFunctionResponse(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const context = (error as Record<string, unknown>).context;
  return context instanceof Response ? context : null;
}
