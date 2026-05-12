const API_BASE = (((import.meta as any).env.VITE_API_URL as string | undefined) || '').replace(/\/$/, '');

function apiNotConfiguredMessage() {
  return [
    'API do servidor não configurada.',
    'No Vercel, defina VITE_API_URL com o endereço HTTPS da API do servidor',
    '(ex: https://api.seudominio.pt) e faça novo deploy.'
  ].join(' ');
}

function shouldFailFast() {
  if (API_BASE) return false;
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('vercel.app');
}

async function readError(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null);
    if (data?.error) return data.error;
    if (data?.message) return data.message;
  }
  const text = await response.text().catch(() => '');
  if (!API_BASE && (text.includes('NOT_FOUND') || response.status === 404)) {
    return apiNotConfiguredMessage();
  }
  return text || `Pedido falhou (${response.status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (shouldFailFast()) {
    throw new Error(apiNotConfiguredMessage());
  }
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export async function apiPostForm<T>(path: string, formData: FormData): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: formData
  });
}
