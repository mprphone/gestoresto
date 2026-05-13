
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
  try {
    const response = await fetch('/api/gemini/analyze-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: base64Images })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini server error:', response.status, err);
      return null;
    }

    return await response.json() as InvoiceExtractedData;
  } catch (error) {
    console.error('Erro no processamento IA:', error);
    return null;
  }
};
