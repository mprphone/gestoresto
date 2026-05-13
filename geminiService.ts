
import { GoogleGenAI, Type } from "@google/genai";

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
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const imageParts = base64Images.map(base64 => ({
      inlineData: { mimeType: 'image/jpeg', data: base64 }
    }));

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-05-20',
      contents: {
        parts: [
          ...imageParts,
          { text: `Analise este documento de compra (fatura, nota de entrega, guia de remessa, nota de equipamento ou similar).

EXTRAÇÃO DE ARTIGOS — REGRA PRINCIPAL:
Extraia TODOS os artigos/produtos/itens/linhas presentes no documento, sem excepção.
Para cada artigo inclua sempre o campo "name". Para os campos numéricos (quantity, unitPrice, totalPrice) use 0 se não conseguir ler com clareza — nunca omita um artigo por causa de campos em falta.
Extraia também: código do artigo, unidade de medida, taxa de IVA, data de validade se existir, e categoria sugerida.

CABEÇALHO:
Fornecedor (nome, NIF, email, telefone), Cliente (nome, NIF), Número do documento, Total do documento.

VALIDAÇÃO TÉCNICA/LEGAL:
1. Qualidade da imagem para arquivo digital (imageQualityOk).
2. Detete QR Code e ATCUD (obrigatórios em faturas portuguesas).
   Se ler o QR Code devolva qrCodeText e o valor do campo O (GrossTotal) em qrTotalAmount.
3. Verifique se faltam páginas (ex: "pág 1/2" sem pág 2) → isMissingPages.
4. Some os totais das linhas → calculatedLinesTotal (sem IVA se as linhas não incluírem IVA).

Devolva JSON estrito.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplierName: { type: Type.STRING },
            supplierNif: { type: Type.STRING },
            customerName: { type: Type.STRING },
            customerNif: { type: Type.STRING },
            supplierEmail: { type: Type.STRING },
            supplierPhone: { type: Type.STRING },
            invoiceNumber: { type: Type.STRING },
            qrCodeText: { type: Type.STRING },
            qrTotalAmount: { type: Type.NUMBER },
            calculatedLinesTotal: { type: Type.NUMBER },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  supplierItemCode: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  unitPrice: { type: Type.NUMBER },
                  totalPrice: { type: Type.NUMBER },
                  vatRate: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  expiryDate: { type: Type.STRING }
                },
                required: ["name"]
              }
            },
            totalInvoiceAmount: { type: Type.NUMBER },
            digitalCompliance: {
              type: Type.OBJECT,
              properties: {
                hasQrCode: { type: Type.BOOLEAN },
                hasAtcud: { type: Type.BOOLEAN },
                isCompliant: { type: Type.BOOLEAN },
                imageQualityOk: { type: Type.BOOLEAN },
                complianceNotes: { type: Type.STRING },
                isMissingPages: { type: Type.BOOLEAN }
              },
              required: ["hasQrCode", "isCompliant", "imageQualityOk", "isMissingPages"]
            }
          },
          required: ["items", "totalInvoiceAmount", "digitalCompliance"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as InvoiceExtractedData;

    parsed.items = (parsed.items || []).map(item => ({
      ...item,
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      category: item.category || 'Outros'
    }));

    return parsed;
  } catch (error) {
    console.error("Erro no processamento IA:", error);
    return null;
  }
};
