
export interface InvoiceExtractedData {
  supplierName?: string;
  supplierNif?: string;
  customerName?: string;
  customerNif?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  invoiceNumber?: string;
  documentType?: string;
  qrCodeText?: string;
  qrTotalAmount?: number;
  calculatedLinesTotal?: number;
  items: {
    name: string;
    supplierItemCode?: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    totalPrice: number;
    vatRate?: number;
    category: string;
    expiryDate?: string;
  }[];
  totalInvoiceAmount: number;
  digitalCompliance: {
    hasQrCode: boolean;
    hasAtcud: boolean;
    atcud?: string;
    isCompliant: boolean;
    imageQualityOk: boolean;
    complianceNotes?: string;
    isMissingPages: boolean;
    qrCodeText?: string;
    qrTotalAmount?: number;
    calculatedLinesTotal?: number;
    totalValidationStatus?: 'VALIDO' | 'ALERTA' | 'NAO_VERIFICADO';
    totalValidationNotes?: string;
    confidenceScore?: number;
  };
}

import { apiPost } from './data/apiClient';

export const processInvoiceImage = async (base64Images: string[]): Promise<InvoiceExtractedData | null> => {
  return apiPost<InvoiceExtractedData>('/api/gemini/analyze-invoice', { images: base64Images });
};
