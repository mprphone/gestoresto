import { Supplier } from '../types';
import { apiGet, apiPost } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const fromDb = (row: any): Supplier => ({
  id: row.id,
  name: row.name,
  nif: row.nif,
  email: row.email || undefined,
  phone: row.phone || undefined,
  paymentTermsDays: Number(row.payment_terms_days || 30),
  notes: row.notes || undefined
});

export async function listSuppliersPage(options?: PageOptions): Promise<PageResult<Supplier>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 50;
  const result = await apiGet<PageResult<any>>(`/api/suppliers?page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(fromDb) };
}

export async function upsertSupplier(supplier: Supplier) {
  await apiPost('/api/suppliers', supplier);
}
