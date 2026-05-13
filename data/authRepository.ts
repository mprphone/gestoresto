import { AppUser } from '../types';
import { apiGet, apiPost } from './apiClient';

const fromDb = (row: any): AppUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone || undefined,
  role: row.role,
  isActive: row.is_active !== false
});

export async function login(email: string, password: string): Promise<AppUser> {
  const row = await apiPost<any>('/api/auth/login', { email, password });
  return fromDb({ ...row, is_active: true });
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
