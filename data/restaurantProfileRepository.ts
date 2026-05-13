import { RestaurantProfile } from '../types';
import { apiGet, apiPost } from './apiClient';

const fromDb = (row: any): RestaurantProfile | null => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    nif: row.nif,
    legalName: row.legal_name || undefined,
    email: row.email || undefined,
    phone: row.phone || undefined,
    address: row.address || undefined,
    postalCode: row.postal_code || undefined,
    city: row.city || undefined,
    country: row.country || undefined
  };
};

export async function getRestaurantProfile(): Promise<RestaurantProfile | null> {
  try {
    const result = await apiGet<{ data: any | null }>('/api/restaurant-profile');
    return fromDb(result.data);
  } catch (error: any) {
    if (String(error?.message || '').includes('Cannot GET /api/restaurant-profile')) {
      return null;
    }
    throw error;
  }
}

export async function saveRestaurantProfile(profile: RestaurantProfile): Promise<RestaurantProfile> {
  const result = await apiPost<any>('/api/restaurant-profile', profile);
  return fromDb(result) as RestaurantProfile;
}
