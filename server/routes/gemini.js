import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';

export const geminiRouter = Router();

geminiRouter.post('/analyze-invoice', async (req, res, next) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array required' });
    }

    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const imageParts = images.map(base64 => ({
      inlineData: { mimeType: 'image/jpeg', data: base64 }
    }));

    const response = await ai.models.generateContent({
      model: config.geminiModel,
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
        responseMimeType: 'application/json',
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
                required: ['name']
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
              required: ['hasQrCode', 'isCompliant', 'imageQualityOk', 'isMissingPages']
            }
          },
          required: ['items', 'totalInvoiceAmount', 'digitalCompliance']
        }
      }
    });

    const text = response.text;
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini' });

    const parsed = JSON.parse(text);

    // Normalize numeric defaults
    parsed.items = (parsed.items || []).map(item => ({
      ...item,
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      totalPrice: Number(item.totalPrice) || 0,
      category: item.category || 'Outros'
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Gemini analyze error:', error);
    next(error);
  }
});
