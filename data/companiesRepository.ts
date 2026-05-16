import { Company, Restaurant, AppUser } from '../types';
import { apiGet, apiPost, apiPut, apiDelete } from './apiClient';

const fromCompany = (row: any): Company => ({
  id: row.id, name: row.name, nif: row.nif || undefined,
  email: row.email || undefined, phone: row.phone || undefined,
  address: row.address || undefined, postalCode: row.postal_code || undefined,
  city: row.city || undefined, country: row.country || undefined,
  isActive: row.is_active, restaurantCount: Number(row.restaurant_count || 0)
});

const fromRestaurant = (row: any): Restaurant => ({
  id: row.id, companyId: row.company_id, companyName: row.company_name || undefined,
  name: row.name, nif: row.nif || undefined, legalName: row.legal_name || undefined,
  email: row.email || undefined, phone: row.phone || undefined,
  address: row.address || undefined, postalCode: row.postal_code || undefined,
  city: row.city || undefined, country: row.country || undefined,
  notificationEmails: row.notification_emails || [],
  isActive: row.is_active, userRole: row.user_role || undefined
});

export async function listCompanies(): Promise<Company[]> {
  const result = await apiGet<{ data: any[] }>('/api/companies');
  return result.data.map(fromCompany);
}

export async function createCompany(data: Partial<Company>): Promise<Company> {
  const result = await apiPost<any>('/api/companies', data);
  return fromCompany(result);
}

export async function updateCompany(id: string, data: Partial<Company>): Promise<Company> {
  const result = await apiPut<any>(`/api/companies/${id}`, data);
  return fromCompany(result);
}

export async function listRestaurants(userId?: string): Promise<Restaurant[]> {
  const path = userId ? `/api/restaurants?userId=${userId}` : '/api/restaurants';
  const result = await apiGet<{ data: any[] }>(path);
  return result.data.map(fromRestaurant);
}

export async function createRestaurant(data: Partial<Restaurant>): Promise<Restaurant> {
  const result = await apiPost<any>('/api/restaurants', data);
  return fromRestaurant(result);
}

export async function updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
  const result = await apiPut<any>(`/api/restaurants/${id}`, data);
  return fromRestaurant(result);
}

export async function listRestaurantUsers(restaurantId: string): Promise<(AppUser & { accessRole: string; accessId: string })[]> {
  const result = await apiGet<{ data: any[] }>(`/api/restaurants/${restaurantId}/users`);
  return result.data.map(row => ({
    id: row.id, name: row.name, email: row.email, phone: row.phone,
    role: row.role, isActive: row.is_active,
    accessRole: row.access_role, accessId: row.access_id
  }));
}

export async function listAvailableUsers(restaurantId: string): Promise<AppUser[]> {
  const result = await apiGet<{ data: any[] }>(`/api/restaurants/${restaurantId}/users/available`);
  return result.data;
}

export async function addUserToRestaurant(restaurantId: string, userId: string, role: string): Promise<void> {
  await apiPost(`/api/restaurants/${restaurantId}/users`, { userId, role });
}

export async function removeUserFromRestaurant(restaurantId: string, userId: string): Promise<void> {
  await apiDelete(`/api/restaurants/${restaurantId}/users/${userId}`);
}

export async function switchRestaurant(userId: string, restaurantId: string): Promise<Restaurant> {
  const result = await apiPost<{ currentRestaurant: any }>('/api/auth/switch-restaurant', { userId, restaurantId });
  return fromRestaurant(result.currentRestaurant);
}
