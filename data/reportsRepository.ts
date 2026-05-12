import { apiGet } from './apiClient';

export interface ReportSummary {
  totalStockValue: number;
  lowStockCount: number;
  totalPending: number;
  totalWasteThisMonth: number;
  purchasesThisMonth: number;
  lowStock: Array<{
    id: string;
    name: string;
    category: string;
    current_stock: string;
    min_stock: string;
    unit: string;
  }>;
  recentPrices: Array<{
    product_id: string;
    name: string;
    supplier_name?: string;
    unit_price: string;
    date_issued: string;
    unit_stock: string;
  }>;
}

export async function getReportSummary(): Promise<ReportSummary> {
  return apiGet<ReportSummary>('/api/reports/summary');
}

export async function getSupplierDebt() {
  return apiGet<{ data: Array<{ supplier_nif: string; supplier_name: string; open_invoices: string; pending_amount: string }> }>('/api/reports/supplier-debt');
}
