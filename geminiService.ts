
import { GoogleGenAI, Type } from "@google/genai";

export interface InvoiceExtractedData {
  supplierName?: string;
  supplierNif?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  invoiceNumber?: string;
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
          Extraia: Fornecedor, NIF, Nº Fatura, Itens (nome, código de artigo se existir, qtd, unidade, preço un., total, IVA, categoria/família sugerida).
          
          VALIDAÇÃO TÉCNICA/LEGAL:
          1. Avalie a qualidade da imagem: Está nítida e legível para arquivo digital legal (imageQualityOk)?
          2. Detete QR Code e ATCUD (obrigatórios em Portugal).
          3. Verifique se faltam páginas (ex: referências a 'pág 1/2' sem a pág 2).
          
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
            supplierEmail: { type: Type.STRING },
            supplierPhone: { type: Type.STRING },
            invoiceNumber: { type: Type.STRING },
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
