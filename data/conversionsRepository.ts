import { apiGet, apiPost } from './apiClient';
import { PageOptions, PageResult } from './pagination';

export interface ProductUnitConversion {
  id: string;
  productId: string;
  supplierId?: string;
  productName?: string;
  supplierName?: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
  notes?: string;
}

const fromDb = (row: any): ProductUnitConversion => ({
  id: row.id,
  productId: row.product_id,
  supplierId: row.supplier_id || undefined,
  productName: row.product_name || undefined,
  supplierName: row.supplier_name || undefined,
  fromUnit: row.from_unit,
  toUnit: row.to_unit,
  factor: Number(row.factor || 1),
  notes: row.notes || undefined
});

export async function listProductConversions(options?: PageOptions): Promise<PageResult<ProductUnitConversion>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 100;
  const result = await apiGet<PageResult<any>>(`/api/conversions/product?page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(fromDb) };
}

export async function upsertProductConversion(input: Omit<ProductUnitConversion, 'productName' | 'supplierName'>) {
  const row = await apiPost<any>('/api/conversions/product', input);
  return fromDb(row);
}
