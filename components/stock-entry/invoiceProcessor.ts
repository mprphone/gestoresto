import jsQR from 'jsqr';
import { InvoiceExtractedData } from '../../geminiService';

export interface PageQuality {
  sharpness: number;
  brightness: number;
  isReadable: boolean;
  hasQrCode: boolean;
}

const moneyCents = (value?: number | null) => {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100);
};

const formatMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

export const parsePortugueseQrTotal = (text: string) => {
  const totalField = text.match(/(?:^|\*)O:([^*]+)/);
  if (!totalField) return undefined;
  const value = totalField[1].trim().replace(',', '.');
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export interface PortugueseQrData {
  rawText: string;
  fields: Record<string, string>;
  supplierNif?: string;
  customerNif?: string;
  customerCountry?: string;
  documentType?: string;
  documentStatus?: string;
  documentDate?: string;
  documentNumber?: string;
  atcud?: string;
  taxPayable?: number;
  totalAmount?: number;
}

const parseQrMoney = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatQrDate = (value?: string) => {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length !== 8) return undefined;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

export const parsePortugueseQrData = (text: string): PortugueseQrData => {
  const fields: Record<string, string> = {};
  text.split('*').forEach(part => {
    const index = part.indexOf(':');
    if (index > 0) fields[part.slice(0, index)] = part.slice(index + 1).trim();
  });

  return {
    rawText: text,
    fields,
    supplierNif: (fields.A || '').replace(/\D/g, '') || undefined,
    customerNif: (fields.B || '').replace(/\D/g, '') || undefined,
    customerCountry: fields.C || undefined,
    documentType: fields.D || undefined,
    documentStatus: fields.E || undefined,
    documentDate: formatQrDate(fields.F),
    documentNumber: fields.G || undefined,
    atcud: fields.H || undefined,
    taxPayable: parseQrMoney(fields.N),
    totalAmount: parseQrMoney(fields.O)
  };
};

const withoutAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const normalizePortugueseDocumentType = (...values: Array<string | undefined | null>) => {
  const joined = withoutAccents(values.filter(Boolean).join(' ').toUpperCase()).replace(/\s+/g, ' ').trim();
  if (!joined) return undefined;

  if (/\bN\/?C\b/.test(joined) || joined.includes('NOTA DE CREDITO') || joined.includes('NOTA CREDITO')) return 'NC';
  if (/\bN\/?D\b/.test(joined) || joined.includes('NOTA DE DEBITO') || joined.includes('NOTA DEBITO')) return 'ND';
  if (/\bFR\b/.test(joined) || joined.includes('FATURA-RECIBO') || joined.includes('FACTURA-RECIBO') || joined.includes('FATURA RECIBO')) return 'FR';
  if (/\bFS\b/.test(joined) || joined.includes('FATURA SIMPLIFICADA') || joined.includes('FACTURA SIMPLIFICADA')) return 'FS';
  if (/\bFT\b/.test(joined) || joined.includes('FATURA') || joined.includes('FACTURA')) return 'FT';
  if (/\bGT\b/.test(joined) || joined.includes('GUIA DE TRANSPORTE')) return 'GT';
  if (/\bGR\b/.test(joined) || joined.includes('GUIA DE REMESSA')) return 'GR';
  if (/\bVD\b/.test(joined) || joined.includes('VENDA A DINHEIRO')) return 'VD';
  return undefined;
};

const hasVatOnLines = (items: InvoiceExtractedData['items']) =>
  items.some(item => Number(item.vatRate || 0) > 0);

export const scanQrFromCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return undefined;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })?.data;
};

export const analyzeCanvasQuality = (canvas: HTMLCanvasElement, hasQrCode = false): PageQuality => {
  const ctx = canvas.getContext('2d');
  const sampleWidth = Math.min(260, canvas.width);
  const sampleHeight = Math.min(260, canvas.height);
  const x = Math.max(0, Math.floor((canvas.width - sampleWidth) / 2));
  const y = Math.max(0, Math.floor((canvas.height - sampleHeight) / 2));
  const data = ctx?.getImageData(x, y, sampleWidth, sampleHeight).data;
  if (!data) return { sharpness: 0, brightness: 0, isReadable: false, hasQrCode };

  let brightness = 0;
  let edge = 0;
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
    brightness += value;
    gray.push(value);
  }
  for (let row = 1; row < sampleHeight; row++) {
    for (let col = 1; col < sampleWidth; col++) {
      const current = gray[row * sampleWidth + col];
      edge += Math.abs(current - gray[row * sampleWidth + col - 1]);
      edge += Math.abs(current - gray[(row - 1) * sampleWidth + col]);
    }
  }
  const pixels = gray.length || 1;
  const avgBrightness = brightness / pixels;
  const sharpness = edge / pixels;
  return {
    sharpness,
    brightness: avgBrightness,
    isReadable: avgBrightness > 15 && avgBrightness < 254,
    hasQrCode
  };
};

export const normalizeInvoiceImage = (base64: string): Promise<{ data: string; quality: PageQuality; width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onerror = () => resolve({ data: base64.split(',')[1] || base64, quality: { sharpness: 0, brightness: 0, isReadable: false, hasQrCode: false }, width: 0, height: 0 });
    img.onload = () => {
      const MAX_WIDTH = 2000;
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const source = document.createElement('canvas');
      source.width = Math.round(img.width * scale);
      source.height = Math.round(img.height * scale);
      const sourceCtx = source.getContext('2d');
      sourceCtx?.drawImage(img, 0, 0, source.width, source.height);

      const pixels = sourceCtx?.getImageData(0, 0, source.width, source.height);
      const colProfile = new Float32Array(source.width);
      const rowProfile = new Float32Array(source.height);
      const step = 3;

      if (pixels) {
        for (let y = 0; y < source.height; y += step) {
          for (let x = 0; x < source.width; x += step) {
            const i = (y * source.width + x) * 4;
            const lum = pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114;
            colProfile[x] += lum;
            rowProfile[y] += lum;
          }
        }
        const colSamples = Math.ceil(source.height / step);
        const rowSamples = Math.ceil(source.width / step);
        for (let x = 0; x < source.width; x += step) colProfile[x] /= colSamples;
        for (let y = 0; y < source.height; y += step) rowProfile[y] /= rowSamples;
        for (let x = 1; x < source.width; x++) if (colProfile[x] === 0) colProfile[x] = colProfile[x - 1];
        for (let y = 1; y < source.height; y++) if (rowProfile[y] === 0) rowProfile[y] = rowProfile[y - 1];
      }

      const smoothArr = (arr: Float32Array, w: number): Float32Array => {
        const out = new Float32Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
          let sum = 0, cnt = 0;
          for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) { sum += arr[j]; cnt++; }
          out[i] = cnt > 0 ? sum / cnt : arr[i];
        }
        return out;
      };
      const colSmooth = smoothArr(colProfile, 25);
      const rowSmooth = smoothArr(rowProfile, 25);

      const PAPER_THRESHOLD = 140;
      let minX = 0, maxX = source.width - 1;
      let minY = 0, maxY = source.height - 1;
      for (let x = 0; x < source.width; x++) { if (colSmooth[x] >= PAPER_THRESHOLD) { minX = x; break; } }
      for (let x = source.width - 1; x >= 0; x--) { if (colSmooth[x] >= PAPER_THRESHOLD) { maxX = x; break; } }
      for (let y = 0; y < source.height; y++) { if (rowSmooth[y] >= PAPER_THRESHOLD) { minY = y; break; } }
      for (let y = source.height - 1; y >= 0; y--) { if (rowSmooth[y] >= PAPER_THRESHOLD) { maxY = y; break; } }

      const detectedW = maxX - minX;
      const detectedH = maxY - minY;
      const foundContent = detectedW > source.width * 0.1 && detectedH > source.height * 0.1
        && (detectedW < source.width * 0.95 || detectedH < source.height * 0.95);
      const pad = 20;
      const cropX = foundContent ? Math.max(0, minX - pad) : 0;
      const cropY = foundContent ? Math.max(0, minY - pad) : 0;
      const cropW = foundContent ? Math.min(source.width - cropX, detectedW + pad * 2) : source.width;
      const cropH = foundContent ? Math.min(source.height - cropY, detectedH + pad * 2) : source.height;

      const out = document.createElement('canvas');
      out.width = cropW;
      out.height = cropH;
      const outCtx = out.getContext('2d');
      if (outCtx) {
        outCtx.fillStyle = '#ffffff';
        outCtx.fillRect(0, 0, out.width, out.height);
        outCtx.filter = 'contrast(1.08) brightness(1.03)';
        outCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height);
      }
      resolve({ data: out.toDataURL('image/jpeg', 0.92).split(',')[1], quality: analyzeCanvasQuality(out), width: out.width, height: out.height });
    };
  });
};

export interface CropProposal {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  sourceW: number;
  sourceH: number;
  confidence: number; // 0–1
  reason: string;
}

export const detectDocumentCrop = (canvas: HTMLCanvasElement): CropProposal => {
  const W = canvas.width;
  const H = canvas.height;
  const fallback: CropProposal = { cropX: 0, cropY: 0, cropW: W, cropH: H, sourceW: W, sourceH: H, confidence: 0, reason: 'fallback' };
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || W === 0 || H === 0) return fallback;

  const pixels = ctx.getImageData(0, 0, W, H);
  const colProfile = new Float32Array(W);
  const rowProfile = new Float32Array(H);
  const step = 3;

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const lum = pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114;
      colProfile[x] += lum;
      rowProfile[y] += lum;
    }
  }
  const colSamples = Math.ceil(H / step) || 1;
  const rowSamples = Math.ceil(W / step) || 1;
  for (let x = 0; x < W; x++) colProfile[x] /= colSamples;
  for (let y = 0; y < H; y++) rowProfile[y] /= rowSamples;
  for (let x = 1; x < W; x++) if (colProfile[x] === 0) colProfile[x] = colProfile[x - 1];
  for (let y = 1; y < H; y++) if (rowProfile[y] === 0) rowProfile[y] = rowProfile[y - 1];

  const smoothArr2 = (arr: Float32Array, w: number): Float32Array => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(arr.length - 1, i + w); j++) { s += arr[j]; c++; }
      out[i] = c > 0 ? s / c : arr[i];
    }
    return out;
  };
  const colSmooth = smoothArr2(colProfile, 25);
  const rowSmooth = smoothArr2(rowProfile, 25);

  const THRESHOLD = 140;
  let minX = W - 1, maxX = 0, minY = H - 1, maxY = 0;
  for (let x = 0; x < W; x++) { if (colSmooth[x] >= THRESHOLD) { minX = x; break; } }
  for (let x = W - 1; x >= 0; x--) { if (colSmooth[x] >= THRESHOLD) { maxX = x; break; } }
  for (let y = 0; y < H; y++) { if (rowSmooth[y] >= THRESHOLD) { minY = y; break; } }
  for (let y = H - 1; y >= 0; y--) { if (rowSmooth[y] >= THRESHOLD) { maxY = y; break; } }

  const dW = maxX - minX;
  const dH = maxY - minY;
  if (dW <= 0 || dH <= 0) return { ...fallback, reason: 'documento não detetado' };

  const leftM = minX / W;
  const rightM = (W - maxX) / W;
  const topM = minY / H;
  const bottomM = (H - maxY) / H;
  const areaRatio = (dW * dH) / (W * H);
  const marginsOk = leftM > 0.04 && rightM > 0.04 && topM > 0.03 && bottomM > 0.03;
  const areaOk = areaRatio > 0.12 && areaRatio < 0.88;
  const hasCrop = areaRatio < 0.88;

  let confidence = 0;
  const notes: string[] = [];
  if (marginsOk) { confidence += 0.5; notes.push('margens'); }
  if (areaOk) { confidence += 0.3; notes.push('área'); }
  if (hasCrop) { confidence += 0.2; notes.push('recorte'); }

  const padX = Math.round(W * 0.06);
  const padY = Math.round(H * 0.06);
  const cropX = Math.max(0, minX - padX);
  const cropY = Math.max(0, minY - padY);
  const cropW = Math.min(W - cropX, dW + padX * 2);
  const cropH = Math.min(H - cropY, dH + padY * 2);

  return { cropX, cropY, cropW, cropH, sourceW: W, sourceH: H, confidence, reason: notes.join('+') };
};

export const normalizeWithoutCrop = (base64: string): Promise<{ data: string; quality: PageQuality; width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onerror = () => resolve({ data: base64.split(',')[1] || base64, quality: { sharpness: 0, brightness: 0, isReadable: false, hasQrCode: false }, width: 0, height: 0 });
    img.onload = () => {
      const MAX_WIDTH = 2000;
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const out = document.createElement('canvas');
      out.width = Math.round(img.width * scale);
      out.height = Math.round(img.height * scale);
      const ctx = out.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.filter = 'contrast(1.08) brightness(1.03)';
        ctx.drawImage(img, 0, 0, out.width, out.height);
      }
      resolve({ data: out.toDataURL('image/jpeg', 0.92).split(',')[1], quality: analyzeCanvasQuality(out), width: out.width, height: out.height });
    };
  });
};

export const scanQrPayloads = async (base64Pages: string[]) => {
  const BarcodeDetectorCtor = (window as any).BarcodeDetector;

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('img load failed'));
      img.src = src;
    });

  try {
    const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ['qr_code'] }) : null;
    const payloads: string[] = [];
    const addPayload = (value?: string) => {
      if (value && !payloads.includes(value)) payloads.push(value);
    };

    for (const page of base64Pages) {
      const img = await loadImage(`data:image/jpeg;base64,${page}`);

      if (detector) {
        const codes = await detector.detect(img);
        for (const c of codes) addPayload(c.rawValue);
      }
      if (payloads.length === 0) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx?.drawImage(img, 0, 0);
        addPayload(scanQrFromCanvas(canvas));
      }
      if (payloads.length > 0) continue;

      const qw = Math.round(img.width / 2);
      const qh = Math.round(img.height / 2);
      const canvas = document.createElement('canvas');
      canvas.width = qw * 2;
      canvas.height = qh * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const quadrants: [number, number][] = [[0, 0], [qw, 0], [0, qh], [qw, qh]];
      for (const [sx, sy] of quadrants) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy, qw, qh, 0, 0, canvas.width, canvas.height);
        if (detector) {
          const qImg = await loadImage(canvas.toDataURL('image/jpeg', 0.95));
          const qCodes = await detector.detect(qImg);
          for (const c of qCodes) addPayload(c.rawValue);
        }
        addPayload(scanQrFromCanvas(canvas));
        if (payloads.length > 0) break;
      }
    }
    return payloads;
  } catch (error) {
    return [];
  }
};

export const validateInvoiceTotals = (data: InvoiceExtractedData, detectedQrPayloads: string[]) => {
  const linesTotal = data.items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
  const calculatedLinesTotal = Number.isFinite(Number(data.calculatedLinesTotal)) ? Number(data.calculatedLinesTotal) : linesTotal;
  const detectedQrText = detectedQrPayloads.find(payload => parsePortugueseQrTotal(payload) !== undefined);
  const qrText = detectedQrText || data.qrCodeText || detectedQrPayloads[0];
  const qrData = qrText ? parsePortugueseQrData(qrText) : undefined;
  const documentType = normalizePortugueseDocumentType(qrData?.documentType, data.documentType, qrData?.documentNumber, data.invoiceNumber);
  const parsedDetectedQrTotal = detectedQrText ? parsePortugueseQrTotal(detectedQrText) : undefined;
  const parsedGeminiQrTotal = data.qrCodeText ? parsePortugueseQrTotal(data.qrCodeText) : undefined;
  const geminiQrTotal = Number(data.qrTotalAmount || 0) > 0 ? data.qrTotalAmount : undefined;
  const qrTotal = qrData?.totalAmount ?? parsedDetectedQrTotal ?? parsedGeminiQrTotal ?? geminiQrTotal;
  const extractedInvoiceTotal = Number(data.totalInvoiceAmount || 0) > 0 ? Number(data.totalInvoiceAmount) : undefined;
  const inferredInvoiceTotal = extractedInvoiceTotal ?? qrTotal ?? (calculatedLinesTotal > 0 ? calculatedLinesTotal : undefined);
  const invoiceTotalCents = moneyCents(inferredInvoiceTotal);
  const linesTotalCents = moneyCents(calculatedLinesTotal);
  const qrTotalCents = moneyCents(qrTotal);
  const lineTotalsLikelyIncludeVat = hasVatOnLines(data.items) && data.items.some(item => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const vatRate = Number(item.vatRate || 0);
    const totalPrice = Number(item.totalPrice || 0);
    const grossEstimate = quantity * unitPrice * (1 + vatRate / 100);
    return Math.abs(totalPrice - grossEstimate) < 0.03;
  });
  const notes: string[] = [];

  if (invoiceTotalCents === null) {
    notes.push('A IA não conseguiu identificar o total final da fatura.');
  }
  if (lineTotalsLikelyIncludeVat && invoiceTotalCents !== null && linesTotalCents !== null && invoiceTotalCents !== linesTotalCents) {
    notes.push(`Total das linhas ${formatMoney(linesTotalCents)} EUR diferente do total da fatura ${formatMoney(invoiceTotalCents)} EUR.`);
  }
  if (invoiceTotalCents !== null && qrTotalCents !== null && invoiceTotalCents !== qrTotalCents) {
    notes.push(`Total do QR ${formatMoney(qrTotalCents)} EUR diferente do total da fatura ${formatMoney(invoiceTotalCents)} EUR.`);
  }

  let confidenceScore = 100;
  if (!qrTotalCents) confidenceScore -= 10;
  if (!extractedInvoiceTotal && inferredInvoiceTotal) confidenceScore -= 10;
  if (data.digitalCompliance.isMissingPages) confidenceScore -= 25;
  if (notes.length > 0) confidenceScore -= Math.min(45, notes.length * 22);
  if (data.items.some(item => !item.name || Number(item.totalPrice || 0) <= 0)) confidenceScore -= 12;
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  return {
    data: {
      ...data,
      supplierNif: qrData?.supplierNif || data.supplierNif,
      customerNif: qrData?.customerNif || data.customerNif,
      invoiceNumber: qrData?.documentNumber || data.invoiceNumber,
      documentType: documentType || data.documentType,
      totalInvoiceAmount: inferredInvoiceTotal ?? 0,
      qrCodeText: qrText,
      qrTotalAmount: qrTotal,
      calculatedLinesTotal,
      digitalCompliance: {
        ...data.digitalCompliance,
        hasQrCode: data.digitalCompliance.hasQrCode || detectedQrPayloads.length > 0,
        hasAtcud: data.digitalCompliance.hasAtcud || Boolean(qrData?.atcud),
        atcud: qrData?.atcud || (data.digitalCompliance as any).atcud,
        qrCodeText: qrText,
        qrTotalAmount: qrTotal,
        calculatedLinesTotal,
        totalValidationStatus: notes.length > 0 ? 'ALERTA' as const : 'VALIDO' as const,
        totalValidationNotes: notes.join(' '),
        confidenceScore
      }
    },
    notes
  };
};
