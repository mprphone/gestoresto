
export interface InvoiceExtractedData {
  supplierName?: string;
  supplierNif?: string;
  customerName?: string;
  customerNif?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
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
  aiUsage?: {
    model?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    thinkingTokens?: number;
    attempts?: number;
  };
}

import { apiPost } from './data/apiClient';

export const processInvoiceImage = async (base64Images: string[]): Promise<InvoiceExtractedData | null> => {
  try {
    return await apiPost<InvoiceExtractedData>('/api/gemini/analyze-invoice', { images: base64Images });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const isTransientNetworkFailure = /load failed|failed to fetch|networkerror|network request failed/i.test(message);
    if (!isTransientNetworkFailure) throw error;

    // iOS Safari can drop an upload when the app loses focus briefly, for example
    // during a phone call. One retry is cheap and avoids sending the operator back.
    await new Promise(resolve => setTimeout(resolve, 1200));
    try {
      return await apiPost<InvoiceExtractedData>('/api/gemini/analyze-invoice', { images: base64Images });
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : '';
      if (/load failed|failed to fetch|networkerror|network request failed/i.test(retryMessage)) {
        throw new Error('A ligação foi interrompida antes de enviar a imagem. Confirme a rede e tente novamente.');
      }
      throw retryError;
    }
  }
};
