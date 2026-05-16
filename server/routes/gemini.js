import { Router } from 'express';
import { analyzeInvoiceImages } from '../geminiAnalyze.js';

export const geminiRouter = Router();

function geminiUserMessage(error) {
  const raw = String(error?.message || '');
  if (error?.status === 429 || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('Quota exceeded')) {
    const retryMatch = raw.match(/retry(?:Delay| in)[^0-9]*([0-9]+(?:\.[0-9]+)?)/i);
    const retry = retryMatch ? ` Tente novamente dentro de cerca de ${Math.ceil(Number(retryMatch[1]))} segundos.` : '';
    return { status: 429, message: `Limite da IA Gemini atingido para este modelo.${retry}` };
  }
  if (error?.status === 400 || raw.includes('Request payload size exceeds') || raw.includes('too large')) {
    return { status: 413, message: 'A imagem ficou demasiado pesada para análise IA. Tente uma foto mais próxima.' };
  }
  return null;
}

geminiRouter.post('/analyze-invoice', async (req, res, next) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'images array required' });
    }
    const parsed = await analyzeInvoiceImages(images);
    res.json(parsed);
  } catch (error) {
    console.error('Gemini analyze error:', error);
    const userError = geminiUserMessage(error);
    if (userError) return res.status(userError.status).json({ error: userError.message });
    next(error);
  }
});
