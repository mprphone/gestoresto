import { Movement, MovementType } from '../types';
import { apiGet, apiPost } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const fromDb = (row: any): Movement => ({
  id: row.id,
  productId: row.product_id,
  type: row.type as MovementType,
  quantity: Number(row.quantity || 0),
  price: row.price === null ? undefined : Number(row.price),
  date: row.date_moved,
  photoUrl: row.photo_url || undefined,
  notes: row.notes || undefined,
  supplierId: row.supplier_id || undefined,
  supplierName: row.supplier_name || undefined
});

export async function listMovementsPage(options?: PageOptions): Promise<PageResult<Movement>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 100;
  const result = await apiGet<PageResult<any>>(`/api/movements?page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(fromDb) };
}

export async function createMovement(input: {
  productId: string;
  type: MovementType;
  quantity: number;
  price?: number;
  photoUrl?: string;
  notes?: string;
}) {
  const row = await apiPost<any>('/api/movements', input);
  return fromDb(row);
}
