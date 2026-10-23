export class ApiRequestError extends Error {
  status: number;
  code?: string;
  errors?: Record<string, string>;

  constructor(status: number, message: string, code?: string, errors?: Record<string, string>) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const method = (options.method ?? (options.body || options.formData ? 'POST' : 'GET')).toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (MUTATING.has(method)) {
    const csrf = readCookie('effebi_crm_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body,
    credentials: 'same-origin',
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload && String(payload.error)) ||
      (response.status === 401
        ? 'Sessione scaduta: accedi di nuovo.'
        : 'Richiesta non riuscita. Riprova.');
    throw new ApiRequestError(
      response.status,
      message,
      payload?.code,
      payload?.errors,
    );
  }
  return payload as T;
}

/** Query string compatta, senza parametri vuoti. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

export function downloadUrl(documentId: string): string {
  return `/api/documenti/${documentId}/download`;
}
