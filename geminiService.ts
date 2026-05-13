
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
    imageQualityOk: boolean; // Novo: validação de nitidez/luz
    complianceNotes?: string;
    isMissingPages: boolean;
  };
}

export const processInvoiceImage = async (base64Images: string[]): Promise<InvoiceExtractedData | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const imageParts = base64Images.map(base64 => ({
      inlineData: { mimeType: 'image/jpeg', data: base64 }
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          ...imageParts,
          { text: `Analise estas imagens de faturas para um restaurante. 
          Extraia: Fornecedor, NIF do fornecedor, Cliente/Comprador, NIF do cliente/comprador, Nº Fatura, Itens (nome, código de artigo se existir, qtd, unidade, preço un., total, IVA, categoria/família sugerida) e total final da fatura.
          
          VALIDAÇÃO TÉCNICA/LEGAL:
          1. Avalie a qualidade da imagem: Está nítida e legível para arquivo digital legal (imageQualityOk)?
          2. Detete QR Code e ATCUD (obrigatórios em Portugal).
          2.1. Se conseguir ler o conteúdo do QR Code, devolva qrCodeText e o valor total bruto do campo O do QR Code em qrTotalAmount. Nas faturas portuguesas, o campo O corresponde ao GrossTotal/Total amount.
          3. Verifique se faltam páginas (ex: referências a 'pág 1/2' sem a pág 2).
          4. Some os totais das linhas e devolva calculatedLinesTotal. Se as linhas vierem sem IVA, esta soma deve ser o subtotal/base tributável, não o total bruto.
          
          Retorne em JSON estrito.` }
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
                required: ["name", "quantity", "unitPrice"]
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
    return JSON.parse(text) as InvoiceExtractedData;
  } catch (error) {
    console.error("Erro no processamento IA:", error);
    return null;
  }
};
