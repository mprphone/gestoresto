import { apiGet, apiPost } from './apiClient';

export interface PendingInvoice {
  id: string;
  doc_number: string;
  document_type?: string;
  supplier_name: string;
  supplier_nif: string;
  total_amount: number;
  date_issued: string;
  created_at: string;
  has_qr_code: boolean;
  qr_total_amount?: number;
  total_validation_status?: string;
  expense_category?: string;
  is_missing_pages?: boolean;
  ai_model?: string;
  ai_input_tokens?: number;
  ai_output_tokens?: number;
  ai_total_tokens?: number;
  ai_thinking_tokens?: number;
  ai_attempts?: number;
  reviewed_at?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  line_count: number;
  archive_id?: string;
  archive_mime_type?: string;
  archive_filename?: string;
}

export interface ReviewInvoiceLine {
  id: string;
  invoice_id: string;
  line_number: number;
  product_id?: string;
  product_name?: string;
  original_name: string;
  quantity_original: number;
  unit_original: string;
  conversion_factor: number;
  quantity_stock: number;
  unit_stock: string;
  unit_price: number;
  total_price: number;
  notes?: string;
  movement_id?: string;
  movement_type?: string;
  movement_quantity?: number;
}

export async function listPendingInvoices(): Promise<PendingInvoice[]> {
  const result = await apiGet<{ data: PendingInvoice[] }>('/api/review/pending');
  return result.data;
}

export async function listReviewInvoiceLines(id: string): Promise<ReviewInvoiceLine[]> {
  const result = await apiGet<{ data: any[] }>(`/api/review/${id}/lines`);
  return result.data.map(row => ({
    ...row,
    quantity_original: Number(row.quantity_original || 0),
    conversion_factor: Number(row.conversion_factor || 1),
    quantity_stock: Number(row.quantity_stock || 0),
    unit_price: Number(row.unit_price || 0),
    total_price: Number(row.total_price || 0),
    movement_quantity: row.movement_quantity === null || row.movement_quantity === undefined ? undefined : Number(row.movement_quantity)
  }));
}

export async function updateReviewInvoiceLine(invoiceId: string, lineId: string, payload: {
  productId: string;
  originalName?: string;
  quantityOriginal?: number;
  unitOriginal?: string;
  conversionFactor?: number;
  quantityStock: number;
  unitStock?: string;
  unitPrice?: number;
  totalPrice?: number;
  notes?: string;
}): Promise<void> {
  await apiPost(`/api/review/${invoiceId}/lines/${lineId}`, payload);
}

export async function markReviewed(id: string, userId: string): Promise<void> {
  await apiPost(`/api/review/${id}/reviewed`, { userId });
}

export async function markUnreviewed(id: string): Promise<void> {
  await apiPost(`/api/review/${id}/unreviewed`, {});
}

export async function updateReviewExpenseCategory(id: string, expenseCategory?: string): Promise<void> {
  await apiPost(`/api/review/${id}/expense-category`, { expenseCategory });
}

export interface PendingGuia {
  guia_id: string;
  movement_type: string;
  created_at: string;
  item_count: number;
  items: { id: string; product_id: string; name: string; quantity: number; unit: string; photo_url?: string }[];
}

export async function listPendingGuias(): Promise<PendingGuia[]> {
  const result = await apiGet<{ data: PendingGuia[] }>('/api/review/pending-guias');
  return result.data;
}

export async function markGuiaReviewed(guiaId: string, userId: string): Promise<void> {
  await apiPost(`/api/review/guias/${guiaId}/reviewed`, { userId });
}

export async function markGuiaRejected(guiaId: string, userId: string): Promise<void> {
  await apiPost(`/api/review/guias/${guiaId}/rejected`, { userId });
}

export async function subscribePush(subscription: PushSubscription, userId: string): Promise<void> {
  await apiPost('/api/push/subscribe', { subscription, userId });
}

export async function getVapidPublicKey(): Promise<string> {
  const result = await apiGet<{ publicKey: string }>('/api/push/vapid-public-key');
  return result.publicKey;
}
