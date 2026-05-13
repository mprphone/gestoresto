
import { apiPost } from './data/apiClient';

export interface InvoiceExtractedData {
  supplierName?: string;
  supplierNif?: string;
  customerName?: string;
  customerNif?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  invoiceNumber?: string;
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
    isCompliant: boolean;
    imageQualityOk: boolean;
    complianceNotes?: string;
    isMissingPages: boolean;
  };
}

export const processInvoiceImage = async (base64Images: string[]): Promise<InvoiceExtractedData | null> => {
  return apiPost<InvoiceExtractedData>('/api/gemini/analyze-invoice', { images: base64Images });
};
