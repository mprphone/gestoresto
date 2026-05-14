import { InvoiceStatus, PurchaseInvoice, PurchaseInvoiceLine } from '../types';
import { apiGet, apiPost, apiUrl } from './apiClient';
import { PageOptions, PageResult } from './pagination';

const invoiceFromDb = (row: any): PurchaseInvoice => ({
  id: row.id,
  supplierId: row.supplier_id || 'manual',
  supplierName: row.supplier_name,
  supplierNif: row.supplier_nif,
  customerName: row.customer_name || undefined,
  customerNif: row.customer_nif || undefined,
  restaurantProfileId: row.restaurant_profile_id || undefined,
  restaurantMatchStatus: row.restaurant_match_status || undefined,
  restaurantMatchNotes: row.restaurant_match_notes || undefined,
  docNumber: row.doc_number,
  totalAmount: Number(row.total_amount || 0),
  date: row.date_issued,
  dueDate: row.due_date || undefined,
  status: row.status as InvoiceStatus,
  photoUrl: apiUrl(row.photo_url || undefined),
  primaryArchiveDocumentId: row.primary_archive_document_id || undefined,
  paidAmount: Number(row.paid_amount || 0),
  lastPaymentDate: row.last_payment_date || undefined,
  lastPaymentMethod: row.last_payment_method || undefined,
  lastPaymentAccount: row.last_payment_account || undefined,
  proofUrl: apiUrl(row.proof_url || undefined),
  expenseCategory: row.expense_category || undefined,
  digitalCompliance: {
    hasQrCode: row.has_qr_code,
    hasAtcud: row.has_atcud,
    atcud: row.atcud || undefined,
    imageQualityOk: row.image_quality_ok,
    isMissingPages: row.is_missing_pages,
    qrCodeText: row.qr_code_text || undefined,
    qrTotalAmount: row.qr_total_amount === null ? undefined : Number(row.qr_total_amount),
    calculatedLinesTotal: row.calculated_lines_total === null ? undefined : Number(row.calculated_lines_total),
    totalValidationStatus: row.total_validation_status || undefined,
    totalValidationNotes: row.total_validation_notes || undefined,
    complianceNotes: row.compliance_notes || undefined
  }
});

const lineFromDb = (row: any): PurchaseInvoiceLine => ({
  id: row.id,
  invoiceId: row.invoice_id,
  lineNumber: row.line_number,
  productId: row.product_id,
  productAliasId: row.product_alias_id || undefined,
  originalName: row.original_name,
  supplierItemCode: row.supplier_item_code || undefined,
  quantityOriginal: Number(row.quantity_original || 0),
  unitOriginal: row.unit_original,
  conversionFactor: Number(row.conversion_factor || 1),
  quantityStock: Number(row.quantity_stock || 0),
  unitStock: row.unit_stock,
  unitPrice: Number(row.unit_price || 0),
  totalPrice: Number(row.total_price || 0),
  vatRate: row.vat_rate === null ? undefined : Number(row.vat_rate),
  expiryDate: row.expiry_date || undefined,
  notes: row.notes || undefined
});

export async function listInvoicesPage(options?: PageOptions): Promise<PageResult<PurchaseInvoice>> {
  const page = options?.page || 1;
  const pageSize = options?.pageSize || 50;
  const result = await apiGet<PageResult<any>>(`/api/invoices?page=${page}&pageSize=${pageSize}`);
  return { ...result, data: result.data.map(invoiceFromDb) };
}

export async function listInvoiceLines(invoiceId: string): Promise<PurchaseInvoiceLine[]> {
  const result = await apiGet<{ data: any[] }>(`/api/invoices/${invoiceId}/lines`);
  return result.data.map(lineFromDb);
}

export async function createInvoiceWithLines(payload: any): Promise<{ invoice: PurchaseInvoice; lines: PurchaseInvoiceLine[]; archiveDocument?: any }> {
  const result = await apiPost<{ invoice: any; lines: any[]; archiveDocument?: any }>('/api/invoices', payload);
  return {
    invoice: invoiceFromDb(result.invoice),
    lines: result.lines.map(lineFromDb),
    archiveDocument: result.archiveDocument
  };
}
