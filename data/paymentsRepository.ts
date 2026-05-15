import { Payment } from '../types';
import { apiGet, apiPost } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const fromDb = (row: any): Payment => ({
  id: row.id,
  invoiceId: row.invoice_id,
  supplierId: row.supplier_id,
  amount: Number(row.amount || 0),
  date: row.date_paid,
  method: row.method,
  account: row.account || undefined,
  notes: row.notes || undefined,
  proofUrl: row.proof_url || undefined,
  archiveDocumentId: row.archive_document_id || undefined
});

export async function listPayments(options?: PageOptions): Promise<Payment[]> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 200;
  const result = await apiGet<PageResult<any>>(`/api/payments?page=${page}&pageSize=${pageSize}`);
  return result.data.map(fromDb);
}

export async function createBatchPayment(payload: {
  invoiceIds: string[];
  datePaid: string;
  method: Payment['method'];
  account?: string;
  amount?: number;
  notes?: string;
  proofUrl?: string;
  archiveDocumentId?: string;
}) {
  const result = await apiPost<{ data: any[] }>('/api/payments/batch', payload);
  return result.data.map(fromDb);
}
