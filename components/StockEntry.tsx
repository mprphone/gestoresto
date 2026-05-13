
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Check, X, PlusCircle, RefreshCcw, Copy } from 'lucide-react';
import { processInvoiceImage, InvoiceExtractedData } from '../geminiService';
import { Product, Category, Supplier, PurchaseInvoice, ProductAlias, StockEntryLineInput } from '../types';

interface StockEntryProps {
  products: Product[];
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  productAliases: ProductAlias[];
  categories: Category[];
  onComplete: (items: StockEntryLineInput[], photoUrl?: string, supplierData?: Partial<Supplier>, invoiceData?: any) => void;
  onQuickCreateProduct: (data: any) => Product | Promise<Product>;
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const moneyCents = (value?: number | null) => {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100);
};

const formatMoney = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

const parsePortugueseQrTotal = (text: string) => {
  const totalField = text.split('*').find(part => part.startsWith('O:'));
  if (!totalField) return undefined;
  const value = totalField.slice(2).replace(',', '.');
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const hasVatOnLines = (items: InvoiceExtractedData['items']) =>
  items.some(item => Number(item.vatRate || 0) > 0);

interface PageQuality {
  sharpness: number;
  brightness: number;
  isReadable: boolean;
  hasQrCode: boolean;
}

const StockEntry: React.FC<StockEntryProps> = ({ products, suppliers, invoices, productAliases, categories, onComplete, onQuickCreateProduct }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [extractedData, setExtractedData] = useState<InvoiceExtractedData | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({}); 
  const [aliasMapping, setAliasMapping] = useState<Record<number, string>>({});
  const [itemFamilies, setItemFamilies] = useState<Record<number, Category>>({});
  const [unitOriginals, setUnitOriginals] = useState<Record<number, string>>({});
  const [conversionFactors, setConversionFactors] = useState<Record<number, number>>({});
  const [autoCreatedProducts, setAutoCreatedProducts] = useState<Record<string, Product>>({});
  const [supplier, setSupplier] = useState('');
  const [nif, setNif] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [qrPayloads, setQrPayloads] = useState<string[]>([]);
  const [pageQualities, setPageQualities] = useState<PageQuality[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (nif && docNumber) {
      const exists = invoices.some(inv => inv.docNumber.toLowerCase() === docNumber.toLowerCase() && inv.supplierNif === nif);
      setIsDuplicate(exists);
    }
  }, [nif, docNumber, invoices]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const openCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Este browser não dá acesso direto à câmara. Use Abrir Ficheiro ou atualize o browser.');
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch (error) {
      setCameraError('Não consegui abrir a câmara. Confirme as permissões do browser e se está em HTTPS ou localhost.');
    }
  };

  const closeCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
  };

  const analyzeCanvasQuality = (canvas: HTMLCanvasElement, hasQrCode = false): PageQuality => {
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
      isReadable: sharpness > 9 && avgBrightness > 80 && avgBrightness < 245,
      hasQrCode
    };
  };

  const normalizeInvoiceImage = (base64: string): Promise<{ data: string; quality: PageQuality }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onerror = () => resolve({ data: base64.split(',')[1] || base64, quality: { sharpness: 0, brightness: 0, isReadable: false, hasQrCode: false } });
      img.onload = () => {
        const MAX_WIDTH = 1200;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        const source = document.createElement('canvas');
        source.width = Math.round(img.width * scale);
        source.height = Math.round(img.height * scale);
        const sourceCtx = source.getContext('2d');
        sourceCtx?.drawImage(img, 0, 0, source.width, source.height);

        const pixels = sourceCtx?.getImageData(0, 0, source.width, source.height);
        let minX = source.width;
        let minY = source.height;
        let maxX = 0;
        let maxY = 0;

        if (pixels) {
          for (let y = 0; y < source.height; y += 2) {
            for (let x = 0; x < source.width; x += 2) {
              const i = (y * source.width + x) * 4;
              const r = pixels.data[i];
              const g = pixels.data[i + 1];
              const b = pixels.data[i + 2];
              const brightness = (r + g + b) / 3;
              const contrast = Math.max(r, g, b) - Math.min(r, g, b);
              if (brightness < 238 || contrast > 28) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
              }
            }
          }
        }

        const foundContent = maxX > minX && maxY > minY;
        const pad = 28;
        const cropX = foundContent ? Math.max(0, minX - pad) : 0;
        const cropY = foundContent ? Math.max(0, minY - pad) : 0;
        const cropW = foundContent ? Math.min(source.width - cropX, maxX - minX + pad * 2) : source.width;
        const cropH = foundContent ? Math.min(source.height - cropY, maxY - minY + pad * 2) : source.height;

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
        resolve({ data: out.toDataURL('image/jpeg', 0.9).split(',')[1], quality: analyzeCanvasQuality(out) });
      };
    });
  };

  const scanQrPayloads = async (base64Pages: string[]) => {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) return [];

    try {
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const payloads: string[] = [];
      for (const page of base64Pages) {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('QR image load failed'));
        });
        image.src = `data:image/jpeg;base64,${page}`;
        await loaded;
        const codes = await detector.detect(image);
        for (const code of codes) {
          if (code.rawValue) payloads.push(code.rawValue);
        }
      }
      return payloads;
    } catch (error) {
      return [];
    }
  };

  const validateTotals = (data: InvoiceExtractedData, detectedQrPayloads: string[]) => {
    const linesTotal = data.items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const calculatedLinesTotal = Number.isFinite(Number(data.calculatedLinesTotal)) ? Number(data.calculatedLinesTotal) : linesTotal;
    const qrText = detectedQrPayloads[0] || data.qrCodeText;
    const qrTotal = qrText ? parsePortugueseQrTotal(qrText) : data.qrTotalAmount;
    const invoiceTotalCents = moneyCents(data.totalInvoiceAmount);
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

    return {
      data: {
        ...data,
        qrCodeText: qrText,
        qrTotalAmount: qrTotal,
        calculatedLinesTotal,
        digitalCompliance: {
          ...data.digitalCompliance,
          hasQrCode: data.digitalCompliance.hasQrCode || detectedQrPayloads.length > 0,
          qrCodeText: qrText,
          qrTotalAmount: qrTotal,
          calculatedLinesTotal,
          totalValidationStatus: notes.length > 0 ? 'ALERTA' as const : 'VALIDO' as const,
          totalValidationNotes: notes.join(' ')
        }
      },
      notes
    };
  };

  const processAllPages = async (currentPages: string[], currentQrPayloads = qrPayloads) => {
    setIsProcessing(true);
    setProcessingError(null);
    try {
      const data = await processInvoiceImage(currentPages);
      if (!data || data.items.length === 0) {
        setProcessingError('A IA não conseguiu ler artigos nesta fotografia. Tente uma foto mais próxima, nítida e com a fatura completa.');
        return;
      }

      const validation = validateTotals(data, currentQrPayloads);
      if (validation.notes.length > 0) {
        setProcessingError(validation.notes.join(' '));
        return;
      }

      setExtractedData(validation.data);
      setSupplier(validation.data.supplierName || '');
      setNif(validation.data.supplierNif || '');
      setDocNumber(validation.data.invoiceNumber || '');
      
      const autoMap: Record<number, string> = {};
      const createdProducts: Record<string, Product> = {};
      const initialFamilies: Record<number, Category> = {};

      for (const [idx, item] of validation.data.items.entries()) {
        let family = 'Outros';
        const catLower = (item.category || '').toLowerCase();
        const existingCat = categories.find(c => catLower.includes(c.toLowerCase()) || c.toLowerCase().includes(catLower));
        if (existingCat) family = existingCat;
        initialFamilies[idx] = family;

        const currentSupplier = suppliers.find(s => s.nif === data.supplierNif);
        const aliasMatch = currentSupplier
          ? productAliases.find(alias =>
              alias.supplierId === currentSupplier.id &&
              normalizeText(alias.supplierItemName) === normalizeText(item.name || '')
            )
          : undefined;
        const match = aliasMatch
          ? products.find(p => p.id === aliasMatch.productId)
          : products.find(p => normalizeText(p.name || '') === normalizeText(item.name || '')) ||
            Object.values(createdProducts).find(p => normalizeText(p.name || '') === normalizeText(item.name || ''));

        if (match) {
          autoMap[idx] = match.id;
          initialFamilies[idx] = match.category;
          if (aliasMatch) {
            setAliasMapping(prev => ({ ...prev, [idx]: aliasMatch.id }));
            setConversionFactors(prev => ({ ...prev, [idx]: aliasMatch.conversionFactor || 1 }));
          }
        } else {
          const created = await onQuickCreateProduct({
            name: item.name || 'Artigo sem nome',
            category: family,
            unit: item.unit || 'un',
            minStock: 0
          });
          autoMap[idx] = created.id;
          createdProducts[created.id] = created;
          initialFamilies[idx] = created.category;
        }
        setUnitOriginals(prev => ({ ...prev, [idx]: item.unit || match?.unit || 'un' }));
        setConversionFactors(prev => ({ ...prev, [idx]: prev[idx] || 1 }));
      }
      setAutoCreatedProducts(prev => ({ ...prev, ...createdProducts }));
      setMapping(autoMap);
      setItemFamilies(initialFamilies);
    } catch (error) {
      setProcessingError('Não foi possível analisar a fotografia. Verifique a ligação à internet e a chave Gemini.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setProcessingError(null);
    try {
      const newPages: string[] = [];
      const newQualities: PageQuality[] = [];
      for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        const p = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Falha ao ler imagem'));
        });
        reader.readAsDataURL(files[i]);
        const normalized = await normalizeInvoiceImage(await p);
        newPages.push(normalized.data);
        newQualities.push(normalized.quality);
      }
      const updated = [...pages, ...newPages];
      const newQrPayloads = await scanQrPayloads(newPages);
      const updatedQrPayloads = [...qrPayloads, ...newQrPayloads];
      const updatedQualities = [...pageQualities, ...newQualities.map((quality, index) => ({ ...quality, hasQrCode: Boolean(newQrPayloads[index]) }))];
      setPages(updated);
      setQrPayloads(updatedQrPayloads);
      setPageQualities(updatedQualities);
      await processAllPages(updated, updatedQrPayloads);
    } catch (error) {
      setProcessingError('Não consegui abrir essa fotografia. Tente outro ficheiro ou tire uma nova foto.');
      setIsProcessing(false);
    }
  };

  const captureCameraPage = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setCameraError('A câmara ainda não está pronta. Espere um segundo e tente novamente.');
      return;
    }

    const canvas = document.createElement('canvas');
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const maxWidth = 1400;
    const scale = Math.min(1, maxWidth / sourceWidth);
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const captured = canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
    const normalized = await normalizeInvoiceImage(`data:image/jpeg;base64,${captured}`);
    const updated = [...pages, normalized.data];
    const newQrPayloads = await scanQrPayloads([normalized.data]);
    const updatedQrPayloads = [...qrPayloads, ...newQrPayloads];
    setPages(updated);
    setQrPayloads(updatedQrPayloads);
    setPageQualities(prev => [...prev, { ...normalized.quality, hasQrCode: newQrPayloads.length > 0 }]);
    closeCamera();
    await processAllPages(updated, updatedQrPayloads);
  };

  const confirmEntry = async () => {
    if (extractedData && !isDuplicate) {
      const completeMapping = { ...mapping };
      const createdProducts = { ...autoCreatedProducts };
      for (const [idx, item] of extractedData.items.entries()) {
        if (completeMapping[idx]) continue;
        const created = await onQuickCreateProduct({
          name: item.name || 'Artigo sem nome',
          category: itemFamilies[idx] || item.category || 'Outros',
          unit: unitOriginals[idx] || item.unit || 'un',
          minStock: 0
        });
        completeMapping[idx] = created.id;
        createdProducts[created.id] = created;
      }
      setMapping(completeMapping);
      setAutoCreatedProducts(createdProducts);

      const itemsToSubmit: StockEntryLineInput[] = extractedData.items.map((item, idx) => {
        const product = products.find(p => p.id === completeMapping[idx]) || createdProducts[completeMapping[idx]];
        const factor = conversionFactors[idx] || 1;
        return {
          ...item,
          productId: completeMapping[idx],
          aliasId: aliasMapping[idx],
          officialName: product?.name || item.name,
          supplierItemCode: item.supplierItemCode,
          unitOriginal: unitOriginals[idx] || item.unit || product?.unit || 'un',
          conversionFactor: factor,
          quantityStock: item.quantity * factor,
          unitStock: product?.unit || unitOriginals[idx] || 'un',
          vatRate: item.vatRate
        };
      });
      onComplete(itemsToSubmit, `data:image/jpeg;base64,${pages[0]}`, { name: supplier, nif }, {
        docNumber,
        totalAmount: extractedData.totalInvoiceAmount,
        customerName: extractedData.customerName,
        customerNif: extractedData.customerNif,
        qrCodeText: extractedData.qrCodeText || extractedData.digitalCompliance.qrCodeText,
        qrTotalAmount: extractedData.qrTotalAmount ?? extractedData.digitalCompliance.qrTotalAmount,
        calculatedLinesTotal: extractedData.calculatedLinesTotal ?? extractedData.digitalCompliance.calculatedLinesTotal,
        totalValidationStatus: extractedData.digitalCompliance.totalValidationStatus,
        totalValidationNotes: extractedData.digitalCompliance.totalValidationNotes,
        digitalCompliance: extractedData.digitalCompliance
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />

      {!extractedData && !isProcessing && pages.length === 0 && (
        <div className="bg-white p-12 rounded-[3rem] shadow-sm border border-slate-200 text-center animate-in fade-in zoom-in-95">
          <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-8"><PlusCircle className="text-orange-500 w-12 h-12" /></div>
          <h3 className="text-3xl font-black mb-4 uppercase italic tracking-tight">Nova Fatura p/ Stock</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-10 font-medium">Capture o documento para entrada automática no armazém central.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl mx-auto">
             <button onClick={openCamera} className="bg-slate-900 text-white p-8 rounded-[2.5rem] font-black uppercase flex flex-col items-center gap-4 hover:bg-orange-500 transition-all shadow-2xl active:scale-95"><Camera size={32} /> Usar Câmara</button>
             <button onClick={() => fileInputRef.current?.click()} className="bg-white text-slate-900 p-8 rounded-[2.5rem] font-black uppercase flex flex-col items-center gap-4 border-2 border-slate-100 hover:border-orange-500 transition-all shadow-xl active:scale-95"><Upload size={32} /> Abrir Ficheiro</button>
          </div>
          {cameraError && <p className="mt-6 text-xs font-bold text-red-500">{cameraError}</p>}
        </div>
      )}

      {(pages.length > 0 || isProcessing) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-4">
             <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digitalização</h4><span className="text-xs font-black text-orange-500">{pages.length} docs</span></div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                   {pages.map((p, idx) => (
                     <div key={idx} className="relative group aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200">
                        <img src={`data:image/jpeg;base64,${p}`} className="w-full h-full object-cover" />
                        <button onClick={() => {
                          setPages(prev => prev.filter((_, i) => i !== idx));
                          setQrPayloads(prev => prev.filter((_, i) => i !== idx));
                          setPageQualities(prev => prev.filter((_, i) => i !== idx));
                          setProcessingError(null);
                        }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
                        <span className={`absolute left-2 bottom-2 px-2 py-1 rounded-lg text-[8px] font-black uppercase ${pageQualities[idx]?.isReadable ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                          {pageQualities[idx]?.isReadable ? 'Boa leitura' : 'Rever foto'}
                        </span>
                     </div>
                   ))}
                   <button onClick={openCamera} className="aspect-[3/4] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:border-orange-500 transition-all"><PlusCircle size={24} /><span className="text-[8px] font-black uppercase mt-1">Add Pág.</span></button>
                </div>
                {cameraError && <p className="mb-4 text-xs font-bold text-red-500">{cameraError}</p>}
                {pageQualities.length > 0 && (
                  <div className={`mb-4 p-4 rounded-2xl border ${pageQualities.every(q => q.isReadable) ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-orange-50 border-orange-100 text-orange-700'}`}>
                    <p className="text-[10px] font-black uppercase">
                      {pageQualities.every(q => q.isReadable) ? 'Imagem boa para leitura e arquivo digital' : 'Imagem pode não estar perfeita para leitura'}
                    </p>
                    <p className="text-[10px] font-bold opacity-70 mt-1">
                      QR {qrPayloads.length > 0 ? 'lido' : 'não lido diretamente'} · Margens ajustadas automaticamente
                    </p>
                  </div>
                )}
                {isProcessing && <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100 animate-pulse"><RefreshCcw className="animate-spin text-orange-500" size={20} /><p className="text-[10px] font-black text-orange-600 uppercase">Lendo Artigos...</p></div>}
             </div>
             {extractedData && isDuplicate && <div className="bg-red-600 text-white p-6 rounded-[2.5rem] shadow-xl animate-bounce flex items-start gap-4"><Copy size={32} /><div><h5 className="font-black uppercase text-sm">Fatura Duplicada!</h5><p className="text-[10px] font-bold opacity-80 mt-1">Este Nº {docNumber} já foi inserido anteriormente.</p></div></div>}
          </div>

          <div className="lg:col-span-8 space-y-6">
             {extractedData ? (
               <div className="animate-in slide-in-from-right-4">
                 <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label><input type="text" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
                       <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NIF</label><input type="text" className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={nif} onChange={(e) => setNif(e.target.value)} /></div>
                       <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Fatura</label><input type="text" className={`w-full px-5 py-3 border rounded-xl font-bold text-xs ${isDuplicate ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200'}`} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} /></div>
                    </div>
                    <div className="space-y-4">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-4">Conferência opcional: Família e Artigo</h5>
                       <div className="space-y-6">
                          {extractedData.items.map((item, idx) => {
                            const isMapped = !!mapping[idx];
                            const currentFamily = itemFamilies[idx] || 'Outros';
                            const filteredProducts = products.filter(p => p.category === currentFamily);
                            const selectedProduct = products.find(p => p.id === mapping[idx]) || autoCreatedProducts[mapping[idx]];
                            const factor = conversionFactors[idx] || 1;
                            const stockQty = item.quantity * factor;
                            return (
                              <div key={idx} className={`p-6 rounded-[2rem] border transition-all ${isMapped ? 'bg-white border-slate-100 shadow-sm' : 'bg-orange-50 border-orange-100'}`}>
                                <div className="flex flex-col md:flex-row gap-6">
                                  <div className="md:w-1/3"><p className="text-[8px] font-black text-slate-400 uppercase mb-1">Na Fatura:</p><p className="text-xs font-black text-slate-800 line-clamp-2">{item.name}</p><div className="mt-2 text-[10px] font-black text-slate-900">€ {item.totalPrice.toFixed(2)}</div><p className="text-[9px] font-bold text-slate-400 mt-1">{item.quantity} {item.unit || 'un'}</p></div>
                                  <div className="flex-1 space-y-4">
                                     <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">1. Escolher Família</label><select className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={currentFamily} onChange={(e) => { setItemFamilies(prev => ({ ...prev, [idx]: e.target.value })); setMapping(prev => { const n = {...prev}; delete n[idx]; return n; }); }}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                     <div className="space-y-2"><label className="text-[8px] font-black text-slate-400 uppercase">2. Associar ao Inventário</label>
                                        {isMapped ? (
                                          <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl"><Check className="text-emerald-500" size={16} /><p className="text-[10px] font-black text-emerald-700 uppercase flex-1">{products.find(p => p.id === mapping[idx])?.name}</p><button onClick={() => setMapping(prev => { const n = {...prev}; delete n[idx]; return n; })} className="text-[8px] font-black text-emerald-400 uppercase hover:text-red-500">Trocar</button></div>
                                        ) : (
                                          <div className="flex flex-col sm:flex-row gap-2">
                                             <select className="flex-1 px-4 py-3 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase outline-none" onChange={(e) => setMapping(prev => ({ ...prev, [idx]: e.target.value }))}><option value="">Selecionar Artigo Existente...</option>{filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                                             <button onClick={async () => {
                                               const created = await onQuickCreateProduct({ name: item.name, category: currentFamily, unit: unitOriginals[idx] || item.unit || 'un' });
                                               setMapping(prev => ({ ...prev, [idx]: created.id }));
                                             }} className="px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase rounded-xl hover:bg-orange-500 transition-all flex items-center gap-2"><PlusCircle size={14} /> Criar Novo</button>
                                          </div>
                                        )}
                                     </div>
                                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                       <div className="space-y-1">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">Unid. Fatura</label>
                                         <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={unitOriginals[idx] || item.unit || 'un'} onChange={(e) => setUnitOriginals(prev => ({ ...prev, [idx]: e.target.value }))} />
                                       </div>
                                       <div className="space-y-1">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">Fator</label>
                                         <input type="number" step="0.001" min="0.001" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={factor} onChange={(e) => setConversionFactors(prev => ({ ...prev, [idx]: Number(e.target.value) || 1 }))} />
                                       </div>
                                       <div className="space-y-1">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">Entra Stock</label>
                                         <div className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase">{stockQty.toFixed(3)} {selectedProduct?.unit || 'un'}</div>
                                       </div>
                                     </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                       </div>
                    </div>
                    <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-6">
                       <div><p className="text-[10px] font-black text-slate-400 uppercase">Total do Documento</p><p className="text-4xl font-black italic text-slate-900">€ {extractedData.totalInvoiceAmount.toFixed(2)}</p></div>
                       <button onClick={confirmEntry} className={`w-full md:w-auto px-12 py-5 rounded-[2rem] font-black uppercase text-xs shadow-2xl transition-all ${isDuplicate ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-orange-500'}`} disabled={isDuplicate}>Adicionar ao Stock Central <Check size={20} className="inline ml-2" /></button>
                    </div>
                 </div>
               </div>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-slate-300 py-32 space-y-6 text-center">
                 {isProcessing ? (
                   <>
                     <RefreshCcw className="animate-spin text-orange-500" size={48} />
                     <p className="font-black text-[10px] uppercase">IA Analisando Documento...</p>
                   </>
                 ) : (
                   <>
                     <div className="p-5 bg-red-50 rounded-3xl border border-red-100">
                       <X className="text-red-500" size={36} />
                     </div>
                     <div className="max-w-md">
                       <p className="font-black text-sm text-slate-800 uppercase">Não consegui ler a fatura</p>
                       <p className="text-xs font-bold text-slate-400 mt-2">{processingError || 'A análise terminou sem dados suficientes.'}</p>
                       <p className="text-[10px] font-bold text-slate-300 mt-3">O total final da fatura tem de bater com o total do QR quando este for lido. As linhas podem estar sem IVA.</p>
                     </div>
                     <div className="flex flex-col sm:flex-row gap-3">
                       <button onClick={() => processAllPages(pages)} disabled={pages.length === 0} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] hover:bg-orange-500 disabled:opacity-40 transition-all">
                         Tentar novamente
                       </button>
                       <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl font-black uppercase text-[10px] hover:border-orange-500 transition-all">
                         Escolher outra foto
                       </button>
                     </div>
                   </>
                 )}
               </div>
             )}
          </div>
        </div>
      )}

      {isCameraOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-slate-900 border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
            <div className="p-4 flex items-center justify-between text-white">
              <div>
                <h4 className="font-black uppercase text-sm">Câmara</h4>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Enquadre a fatura e fotografe</p>
              </div>
              <button onClick={closeCamera} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="bg-black aspect-[4/3] md:aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            </div>
            {cameraError && <p className="px-6 pt-4 text-xs font-bold text-red-300">{cameraError}</p>}
            <div className="p-5 flex flex-col sm:flex-row gap-3 justify-end bg-slate-900">
              <button onClick={closeCamera} className="px-6 py-4 rounded-2xl border border-white/10 text-white/60 font-black uppercase text-xs hover:text-white hover:bg-white/10 transition-all">Cancelar</button>
              <button onClick={captureCameraPage} className="px-8 py-4 rounded-2xl bg-orange-500 text-white font-black uppercase text-xs hover:bg-orange-600 transition-all flex items-center justify-center gap-2">
                <Camera size={18} /> Fotografar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockEntry;
