import { AppUser, Restaurant } from '../types';
import { apiGet, apiPost } from './apiClient';

const fromDb = (row: any): AppUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone || undefined,
  role: row.role,
  isActive: row.is_active !== false
});

const fromRestaurant = (row: any): Restaurant => ({
  id: row.id, companyId: row.company_id, companyName: row.company_name || undefined,
  name: row.name, nif: row.nif || undefined,
  notificationEmails: row.notification_emails || [],
  isActive: row.is_active, userRole: row.user_role || undefined
});

export interface LoginResult {
  user: AppUser;
  restaurants: Restaurant[];
  currentRestaurant: Restaurant | null;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const row = await apiPost<any>('/api/auth/login', { email, password });
  return {
    user: fromDb({ ...row, is_active: true }),
    restaurants: (row.restaurants || []).map(fromRestaurant),
    currentRestaurant: row.currentRestaurant ? fromRestaurant(row.currentRestaurant) : null
  };
}

export async function getUserContext(userId: string): Promise<Pick<LoginResult, 'restaurants' | 'currentRestaurant'>> {
  const row = await apiGet<any>(`/api/auth/context?userId=${userId}`);
  return {
    restaurants: (row.restaurants || []).map(fromRestaurant),
    currentRestaurant: row.currentRestaurant ? fromRestaurant(row.currentRestaurant) : null
  };
}

export async function listUsers(): Promise<AppUser[]> {
  const result = await apiGet<{ data: any[] }>('/api/auth/users');
  return result.data.map(fromDb);
}

export async function saveUser(user: Partial<AppUser> & { name: string; email: string; password?: string }): Promise<AppUser> {
  const row = await apiPost<any>('/api/auth/users', {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || 'funcionario',
    isActive: user.isActive !== false,
    password: user.password
  });
  return fromDb(row);
}
