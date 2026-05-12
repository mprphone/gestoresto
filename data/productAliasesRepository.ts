import { ProductAlias } from '../types';
import { apiGet, apiPost } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const fromDb = (row: any): ProductAlias => ({
  id: row.id,
  supplierId: row.supplier_id,
  productId: row.product_id,
  supplierItemName: row.supplier_item_name,
  supplierItemCode: row.supplier_item_code || undefined,
  supplierUnit: row.supplier_unit || undefined,
  productUnit: row.product_unit,
  conversionFactor: Number(row.conversion_factor || 1),
  confidence: Number(row.confidence || 100),
  lastSeenAt: row.last_seen_at || undefined
});

export async function listAliasesForSupplier(supplierId?: string, options?: PageOptions): Promise<PageResult<ProductAlias>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 50;
  const query = supplierId ? `supplierId=${supplierId}&` : '';
  const result = await apiGet<PageResult<any>>(`/api/aliases?${query}page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(fromDb) };
}

export async function learnProductAlias(alias: ProductAlias) {
  await apiPost('/api/aliases', alias);
}
