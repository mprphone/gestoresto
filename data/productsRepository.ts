import { Product } from '../types';
import { apiDelete, apiGet, apiPost } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const fromDb = (row: any): Product => ({
  id: row.id,
  name: row.name,
  category: row.category,
  unit: row.unit,
  currentStock: Number(row.current_stock || 0),
  averagePrice: Number(row.average_price || 0),
  minStock: Number(row.min_stock || 0),
  lastUpdated: row.updated_at || row.created_at
});

export async function listProductsPage(options?: PageOptions): Promise<PageResult<Product>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 50;
  const result = await apiGet<PageResult<any>>(`/api/products?page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(fromDb) };
}

export async function upsertProduct(product: Product) {
  const row = await apiPost<any>('/api/products', product);
  return fromDb(row);
}

export async function deleteProduct(productId: string) {
  await apiDelete(`/api/products/${productId}`);
}
