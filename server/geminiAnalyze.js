import { GoogleGenAI, Type } from '@google/genai';
import { config } from './config.js';

export const GEMINI_PROMPT = `Analise este documento de compra (fatura, nota de entrega, guia de remessa, nota de equipamento ou similar).

EXTRAÇÃO DE ARTIGOS — REGRA PRINCIPAL:
Extraia TODOS os artigos/produtos/itens/linhas presentes no documento, sem excepção.
Para cada artigo inclua sempre o campo "name". Para os campos numéricos (quantity, unitPrice, totalPrice) use 0 se não conseguir ler com clareza — nunca omita um artigo por causa de campos em falta.
Extraia também: código do artigo, unidade de medida, taxa de IVA, data de validade se existir, e categoria sugerida.

CABEÇALHO:
Fornecedor (nome, NIF, email, telefone), Cliente (nome, NIF), Número do documento, Data do documento, Tipo do documento, Total do documento.
O campo invoiceDate deve conter a data do documento em formato YYYY-MM-DD. Se só houver mês/ano use YYYY-MM-01.
O campo documentType deve identificar o tipo fiscal quando visível: FT, FR, FS, NC, ND, GT, GR, VD ou texto equivalente.
Se no documento aparecer "Nota de Crédito" devolva documentType = "NC" mesmo que o número não comece por NC.
Se aparecer "Fatura-recibo" devolva "FR"; "Fatura simplificada" devolva "FS"; "Fatura" devolva "FT".

VALIDAÇÃO TÉCNICA/LEGAL:
1. Qualidade da imagem para arquivo digital (imageQualityOk).
2. Detete QR Code e ATCUD (obrigatórios em faturas portuguesas).
   Se ler o QR Code devolva qrCodeText e o valor do campo O (GrossTotal) em qrTotalAmount.
3. Verifique se faltam páginas (ex: "pág 1/2" sem pág 2) → isMissingPages.
4. Some os totais das linhas → calculatedLinesTotal (sem IVA se as linhas não incluírem IVA).

Devolva JSON estrito.`;

export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    supplierName:         { type: Type.STRING },
    supplierNif:          { type: Type.STRING },
    customerName:         { type: Type.STRING },
    customerNif:          { type: Type.STRING },
    supplierEmail:        { type: Type.STRING },
    supplierPhone:        { type: Type.STRING },
    invoiceNumber:        { type: Type.STRING },
    invoiceDate:          { type: Type.STRING },
    documentType:         { type: Type.STRING },
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
        hasQrCode:       { type: Type.BOOLEAN },
        hasAtcud:        { type: Type.BOOLEAN },
        isCompliant:     { type: Type.BOOLEAN },
        imageQualityOk:  { type: Type.BOOLEAN },
        complianceNotes: { type: Type.STRING },
        isMissingPages:  { type: Type.BOOLEAN }
      },
      required: ['hasQrCode', 'isCompliant', 'imageQualityOk', 'isMissingPages']
    }
  },
  required: ['items', 'totalInvoiceAmount', 'digitalCompliance']
};

// Analyse one or more base64 images with Gemini. Returns parsed JSON.
export async function analyzeInvoiceImages(base64Images) {
  if (!config.geminiApiKey || config.geminiApiKey === 'PLACEHOLDER_API_KEY') {
    throw Object.assign(new Error('Chave Gemini não configurada.'), { statusCode: 500 });
  }
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const imageParts = base64Images.map(img => {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(img || ''));
    return { inlineData: { mimeType: m?.[1] || 'image/jpeg', data: m?.[2] || img } };
  });

  let response;
  const retryDelays = [2000, 5000, 10000];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: { parts: [...imageParts, { text: GEMINI_PROMPT }] },
        config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
      });
      break;
    } catch (err) {
      const msg = String(err?.message || '');
      const retryable = err?.status === 503 || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded');
      if (retryable && attempt < 2) {
        await new Promise(r => setTimeout(r, retryDelays[attempt]));
        continue;
      }
      throw err;
    }
  }

  const text = response.text;
  if (!text) throw new Error('Gemini devolveu resposta vazia.');
  const parsed = JSON.parse(text);
  const usage = response.usageMetadata || {};
  parsed.items = (parsed.items || []).map(item => ({
    ...item,
    quantity:   Number(item.quantity)   || 1,
    unitPrice:  Number(item.unitPrice)  || 0,
    totalPrice: Number(item.totalPrice) || 0,
    category:   item.category || 'Outros'
  }));
  parsed.aiUsage = {
    model: config.geminiModel,
    inputTokens:    Number(usage.promptTokenCount || 0),
    outputTokens:   Number(usage.candidatesTokenCount || 0),
    totalTokens:    Number(usage.totalTokenCount || 0),
    thinkingTokens: Number(usage.thoughtsTokenCount || 0),
    attempts: 1
  };
  return parsed;
}
