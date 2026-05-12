import { ArchiveDocumentType, DigitalArchiveDocument } from '../types';
import { apiGet, apiPostForm } from './apiClient';
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
  publicUrl: row.public_url || (row.id ? `/api/archive/file/${row.id}` : undefined),
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

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, base64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export async function uploadArchiveDocument(input: {
  dataUrl: string;
  filename: string;
  documentType: ArchiveDocumentType;
  invoiceId?: string;
  supplierId?: string;
  paymentId?: string;
  qualityOk?: boolean;
  hasQrCode?: boolean;
  hasAtcud?: boolean;
  atcud?: string;
  notes?: string;
}): Promise<DigitalArchiveDocument> {
  const form = new FormData();
  form.append('file', dataUrlToFile(input.dataUrl, input.filename));
  form.append('documentType', input.documentType);
  if (input.invoiceId) form.append('invoiceId', input.invoiceId);
  if (input.supplierId) form.append('supplierId', input.supplierId);
  if (input.paymentId) form.append('paymentId', input.paymentId);
  if (input.qualityOk !== undefined) form.append('qualityOk', String(input.qualityOk));
  if (input.hasQrCode !== undefined) form.append('hasQrCode', String(input.hasQrCode));
  if (input.hasAtcud !== undefined) form.append('hasAtcud', String(input.hasAtcud));
  if (input.atcud) form.append('atcud', input.atcud);
  if (input.notes) form.append('notes', input.notes);
  const row = await apiPostForm<any>('/api/archive/upload', form);
  return fromDb(row);
}
