import { apiGet, apiPost } from './apiClient';

export interface PendingInvoice {
  id: string;
  doc_number: string;
  supplier_name: string;
  supplier_nif: string;
  total_amount: number;
  date_issued: string;
  created_at: string;
  has_qr_code: boolean;
  qr_total_amount?: number;
  total_validation_status?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  line_count: number;
}

export async function listPendingInvoices(): Promise<PendingInvoice[]> {
  const result = await apiGet<{ data: PendingInvoice[] }>('/api/review/pending');
  return result.data;
}

export async function markReviewed(id: string, userId: string): Promise<void> {
  await apiPost(`/api/review/${id}/reviewed`, { userId });
}

export async function markUnreviewed(id: string): Promise<void> {
  await apiPost(`/api/review/${id}/unreviewed`, {});
}

export async function subscribePush(subscription: PushSubscription, userId: string): Promise<void> {
  await apiPost('/api/push/subscribe', { subscription, userId });
}

export async function getVapidPublicKey(): Promise<string> {
  const result = await apiGet<{ publicKey: string }>('/api/push/vapid-public-key');
  return result.publicKey;
}
