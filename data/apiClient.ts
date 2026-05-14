const DEFAULT_PRODUCTION_API_URL = 'https://gestoresto.mpr.pt';
const API_BASE = (
  ((import.meta as any).env.VITE_API_URL as string | undefined) ||
  (((import.meta as any).env.PROD as boolean) ? DEFAULT_PRODUCTION_API_URL : '')
).replace(/\/$/, '');

export function apiUrl(path?: string) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

// ── Auth context (set after login / restaurant switch) ──────────────────────
const USER_KEY       = 'gestoresto_user';
const RESTAURANT_KEY = 'gestoresto_restaurant_id';

export function setAuthRestaurant(restaurantId: string) {
  localStorage.setItem(RESTAURANT_KEY, restaurantId);
}

export function getAuthRestaurant(): string {
  return localStorage.getItem(RESTAURANT_KEY) || '';
}

function authHeaders(): Record<string, string> {
  const user = (() => { try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); } catch { return {}; } })();
  const headers: Record<string, string> = {};
  if (user?.id)              headers['x-user-id']       = user.id;
  if (getAuthRestaurant())   headers['x-restaurant-id'] = getAuthRestaurant();
  return headers;
}

// ── Internal helpers ────────────────────────────────────────────────────────
function apiNotConfiguredMessage() {
  return `API do servidor não configurada. Use ${DEFAULT_PRODUCTION_API_URL} ou defina VITE_API_URL e faça novo deploy.`;
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
  if (shouldFailFast()) throw new Error(apiNotConfiguredMessage());
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> || {}) }
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────────────────
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
  return request<T>(path, { method: 'POST', body: formData });
}
