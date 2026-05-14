import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';

export const geminiRouter = Router();

const GEMINI_PROMPT = `Analise este documento de compra (fatura, nota de entrega, guia de remessa, nota de equipamento ou similar).

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

Devolva JSON estrito.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    supplierName:         { type: Type.STRING },
    supplierNif:          { type: Type.STRING },
    customerName:         { type: Type.STRING },
    customerNif:          { type: Type.STRING },
    supplierEmail:        { type: Type.STRING },
    supplierPhone:        { type: Type.STRING },
    invoiceNumber:        { type: Type.STRING },
    qrCodeText:           { type: Type.STRING },
    qrTotalAmount:        { type: Type.NUMBER },
    calculatedLinesTotal: { type: Type.NUMBER },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name:             { type: Type.STRING },
          supplierItemCode: { type: Type.STRING },
          quantity:         { type: Type.NUMBER },
          unit:             { type: Type.STRING },
          unitPrice:        { type: Type.NUMBER },
          totalPrice:       { type: Type.NUMBER },
          vatRate:          { type: Type.NUMBER },
          category:         { type: Type.STRING },
          expiryDate:       { type: Type.STRING }
        },
        required: ['name']
      }
    },
    totalInvoiceAmount: { type: Type.NUMBER },
    digitalCompliance: {
      type: Type.OBJECT,
      properties: {
        hasQrCode:        { type: Type.BOOLEAN },
        hasAtcud:         { type: Type.BOOLEAN },
        isCompliant:      { type: Type.BOOLEAN },
        imageQualityOk:   { type: Type.BOOLEAN },
        complianceNotes:  { type: Type.STRING },
        isMissingPages:   { type: Type.BOOLEAN }
      },
      required: ['hasQrCode', 'isCompliant', 'imageQualityOk', 'isMissingPages']
    }
  },
  required: ['items', 'totalInvoiceAmount', 'digitalCompliance']
};

geminiRouter.post('/analyze-invoice', async (req, res, next) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array required' });
    }
    if (!config.geminiApiKey || config.geminiApiKey === 'PLACEHOLDER_API_KEY') {
      return res.status(500).json({ error: 'Chave Gemini não configurada no servidor.' });
    }

    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

    const imageParts = images.map(image => {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(image || ''));
      return { inlineData: { mimeType: match?.[1] || 'image/jpeg', data: match?.[2] || image } };
    });

    // Retry up to 3x for transient 503/overloaded errors
    let response;
    const retryDelays = [2000, 5000, 10000];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: config.geminiModel,
          contents: { parts: [...imageParts, { text: GEMINI_PROMPT }] },
          config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
        });
        break; // success
      } catch (err) {
        const msg = String(err?.message || '');
        const retryable = err?.status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded');
        if (retryable && attempt < 2) {
          console.log(`[gemini] 503 attempt ${attempt + 1}/3, retrying in ${retryDelays[attempt]}ms`);
          await new Promise(r => setTimeout(r, retryDelays[attempt]));
          continue;
        }
        throw err;
      }
    }

    const text = response.text;
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini' });

    const parsed = JSON.parse(text);
    parsed.items = (parsed.items || []).map(item => ({
      ...item,
      quantity:   Number(item.quantity)   || 1,
      unitPrice:  Number(item.unitPrice)  || 0,
      totalPrice: Number(item.totalPrice) || 0,
      category:   item.category || 'Outros'
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Gemini analyze error:', error);
    next(error);
  }
});
