import { ArchiveDocumentType, DigitalArchiveDocument } from '../types';
import { apiGet } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const fromDb = (row: any): DigitalArchiveDocument => ({
  id: row.id,
  documentType: row.document_type as ArchiveDocumentType,
  invoiceId: row.invoice_id || undefined,
  paymentId: row.payment_id || undefined,
  supplierId: row.supplier_id || undefined,
  originalFilename: row.original_filename || undefined,
  mimeType: row.mime_type || undefined,
  byteSize: row.byte_size === null ? undefined : Number(row.byte_size),
  sha256: row.sha256 || undefined,
  storageProvider: row.storage_provider,
  storageBucket: row.storage_bucket || undefined,
  storagePath: row.storage_path,
  publicUrl: row.public_url || undefined,
  localRoot: row.local_root || '/mnt/bunker/resto',
  pageCount: Number(row.page_count || 1),
  qualityOk: row.quality_ok,
  hasQrCode: row.has_qr_code,
  hasAtcud: row.has_atcud,
  atcud: row.atcud || undefined,
  notes: row.notes || undefined,
  createdAt: row.created_at
});

export async function listArchiveDocumentsForInvoice(invoiceId: string, options?: PageOptions): Promise<PageResult<DigitalArchiveDocument>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 50;
  const result = await apiGet<PageResult<any>>(`/api/archive/invoice/${invoiceId}?page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(fromDb) };
}
