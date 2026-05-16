
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Upload, X, PlusCircle, RefreshCcw, Copy } from 'lucide-react';
import { processInvoiceImage, InvoiceExtractedData } from '../geminiService';
import { Product, Category, Supplier, PurchaseInvoice, ProductAlias, StockEntryLineInput, RestaurantProfile } from '../types';
import { cropDetectedDocumentForArchive, normalizeWithoutCrop, PageQuality, PortugueseQrData, normalizePortugueseDocumentType, parsePortugueseQrData, scanQrPayloads, validateInvoiceTotals } from './stock-entry/invoiceProcessor';
import { buildProductMatches, normalizeNif } from './stock-entry/productMatcher';
import { CameraOverlay } from './stock-entry/CameraOverlay';
import { InvoiceReviewPanel } from './stock-entry/InvoiceReviewPanel';
import { useCamera } from './stock-entry/useCamera';
import { checkInvoiceDuplicate } from '../data/invoicesRepository';

interface StockEntryProps {
  products: Product[];
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  productAliases: ProductAlias[];
  categories: Category[];
  restaurantProfile?: RestaurantProfile | null;
  onComplete: (items: StockEntryLineInput[], photoUrl?: string, supplierData?: Partial<Supplier>, invoiceData?: any, photoUrls?: string[]) => boolean | void | Promise<boolean | void>;
  onQuickCreateProduct: (data: any) => Product | Promise<Product>;
}

const StockEntry: React.FC<StockEntryProps> = ({ products, suppliers, invoices, productAliases, categories, restaurantProfile, onComplete, onQuickCreateProduct }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [originalPages, setOriginalPages] = useState<string[]>([]);
  const [extractedData, setExtractedData] = useState<InvoiceExtractedData | null>(null);
  const [mapping, setMapping] = useState<Record<number, string>>({}); 
  const [matchConfidences, setMatchConfidences] = useState<Record<number, number>>({});
  const [aliasMapping, setAliasMapping] = useState<Record<number, string>>({});
  const [itemFamilies, setItemFamilies] = useState<Record<number, Category>>({});
  const [unitOriginals, setUnitOriginals] = useState<Record<number, string>>({});
  const [conversionFactors, setConversionFactors] = useState<Record<number, number>>({});
  const [autoCreatedProducts, setAutoCreatedProducts] = useState<Record<string, Product>>({});
  const [supplier, setSupplier] = useState('');
  const [nif, setNif] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [nifMismatch, setNifMismatch] = useState<string | null>(null);
  const [qrPayloads, setQrPayloads] = useState<string[]>([]);
  const [qrData, setQrData] = useState<PortugueseQrData | null>(null);
  const [pageQualities, setPageQualities] = useState<PageQuality[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSubmitRef = useRef(false);

  useEffect(() => {
    if (nif && docNumber) {
      const exists = invoices.some(inv => inv.docNumber.toLowerCase() === docNumber.toLowerCase() && inv.supplierNif === nif);
      setIsDuplicate(exists);
      if (exists) setDuplicateWarning(`Este documento ${docNumber} já foi inserido anteriormente.`);
    }
  }, [nif, docNumber, invoices]);

  const applyQrData = (qrText: string) => {
    const parsed = parsePortugueseQrData(qrText);
    setIsDuplicate(false);
    setDuplicateWarning(null);
    setQrData(parsed);
    if (parsed.supplierNif) {
      setNif(parsed.supplierNif);
      const knownSupplier = suppliers.find(s => normalizeNif(s.nif || '') === parsed.supplierNif);
      if (knownSupplier?.name) setSupplier(knownSupplier.name);
    }
    if (parsed.documentNumber) setDocNumber(parsed.documentNumber);
    return parsed;
  };

  const checkQrDuplicate = async (parsed: PortugueseQrData) => {
    try {
      const result = await checkInvoiceDuplicate({
        supplierNif: parsed.supplierNif,
        docNumber: parsed.documentNumber,
        totalAmount: parsed.totalAmount,
        dateIssued: parsed.documentDate,
        qrCodeText: parsed.rawText,
        atcud: parsed.atcud
      });
      if (result.duplicate) {
        setIsDuplicate(true);
        setDuplicateWarning(result.message || 'Esta fatura já foi registada anteriormente.');
        return true;
      }
    } catch {
      // The final save still performs the same server-side duplicate validation.
    }
    return false;
  };

  // Returns error message if buyer NIF in QR is invalid for this restaurant, null if OK
  const checkQrBuyerNif = (qr: string | PortugueseQrData): string | null => {
    const parsed = typeof qr === 'string' ? parsePortugueseQrData(qr) : qr;
    const buyerNif = parsed.customerNif || '';
    const restNif = (restaurantProfile?.nif || '').replace(/\D/g, '');
    if (!buyerNif && restNif) return `O QR não tem NIF do comprador/empresa. NIF esperado: ${restNif}. Solicite fatura com o NIF da empresa/restaurante`;
    if (!buyerNif) return null;
    if (buyerNif === '999999990') return `Fatura para Consumidor Final. NIF esperado: ${restNif || 'NIF da empresa/restaurante'}`;
    if (restNif && buyerNif !== restNif) return `NIF do comprador no QR (${buyerNif}) não coincide com o NIF da empresa/restaurante (${restNif})`;
    return null;
  };

  const imageSizeFromDataUrl = (dataUrl: string) => new Promise<{ width: number; height: number; image: HTMLImageElement }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height, image });
    image.onerror = () => reject(new Error('Falha ao preparar imagem para OCR'));
    image.src = dataUrl;
  });

  const qualityErrorMessage = (quality: PageQuality) =>
    `${quality.qualityReasons.join(' · ') || 'Foto sem qualidade suficiente'}. Nitidez ${quality.sharpnessScore}%.`;

  const prepareOcrPagesForAi = async (sourcePages: string[], forceDetailSlices = false) => {
    const ocrPages: string[] = [];
    for (const page of sourcePages) {
      try {
        const dataUrl = page.startsWith('data:') ? page : `data:image/jpeg;base64,${page}`;
        const { width, height, image } = await imageSizeFromDataUrl(dataUrl);
        const ratio = height / Math.max(1, width);
        if (ratio <= 2.15 && !forceDetailSlices) {
          ocrPages.push(dataUrl);
          continue;
        }

        ocrPages.push(dataUrl);
        // Talões compridos e A4 fotografado de longe ficam bons para arquivo, mas as linhas
        // podem chegar pequenas à IA. Mantemos a foto original e enviamos close-ups só para OCR.
        const sliceHeight = ratio > 2.15 ? Math.round(width * 1.65) : Math.round(height * 0.42);
        const overlap = Math.round(sliceHeight * 0.18);
        const step = Math.max(1, sliceHeight - overlap);
        const maxSlices = ratio > 2.15 ? 6 : 4;
        let sliceCount = 0;
        for (let y = 0; y < height && sliceCount < maxSlices; y += step) {
          const h = Math.min(sliceHeight, height - y);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(image, 0, y, width, h, 0, 0, width, h);
          ocrPages.push(canvas.toDataURL('image/jpeg', 0.9));
          sliceCount += 1;
          if (y + h >= height) break;
        }
      } catch {
        continue;
      }
    }
    return ocrPages.length > 0 ? ocrPages : sourcePages;
  };

  const processAllPages = async (currentPages: string[], currentQrPayloads = qrPayloads) => {
    autoSubmitRef.current = false;
    setIsProcessing(true);
    setProcessingError(null);
    try {
      let data = await processInvoiceImage(currentPages);
      if ((!data || data.items.length === 0) && currentQrPayloads.length > 0) {
        const detailPages = await prepareOcrPagesForAi(currentPages, true);
        if (detailPages.length > currentPages.length) {
          const detailData = await processInvoiceImage(detailPages);
          if (detailData) {
            const firstUsage = data?.aiUsage;
            const secondUsage = detailData.aiUsage;
            detailData.aiUsage = {
              model: secondUsage?.model || firstUsage?.model,
              inputTokens: (firstUsage?.inputTokens || 0) + (secondUsage?.inputTokens || 0),
              outputTokens: (firstUsage?.outputTokens || 0) + (secondUsage?.outputTokens || 0),
              totalTokens: (firstUsage?.totalTokens || 0) + (secondUsage?.totalTokens || 0),
              thinkingTokens: (firstUsage?.thinkingTokens || 0) + (secondUsage?.thinkingTokens || 0),
              attempts: (firstUsage?.attempts || (data ? 1 : 0)) + (secondUsage?.attempts || 1)
            };
          }
          data = detailData;
        }
      }
      if (!data || data.items.length === 0) {
        setProcessingError(currentQrPayloads.length > 0
          ? 'O QR fiscal foi lido, mas não consegui estruturar as linhas dos artigos. Tente aproximar mais a folha ou fotografar só a zona da tabela.'
          : 'A IA não conseguiu ler artigos nesta fotografia. Tente uma foto mais próxima, nítida e com a fatura completa.');
        return;
      }

      const validation = validateInvoiceTotals(data, currentQrPayloads);

      // Build non-blocking warnings (total mismatch, missing pages) — don't block extraction
      const warnings: string[] = [];
      if (data.digitalCompliance.isMissingPages) {
        warnings.push('Parece faltar parte do talão — adicione mais fotos e analise de novo.');
      }
      if (validation.notes.length > 0) {
        warnings.push(...validation.notes);
      }
      if (warnings.length > 0) {
        setProcessingError(warnings.join(' '));
      }

      const firstQrData = currentQrPayloads.length > 0 ? parsePortugueseQrData(currentQrPayloads[0]) : null;
      if (firstQrData) setQrData(firstQrData);
      if (!firstQrData && validation.data.qrCodeText) setQrData(parsePortugueseQrData(validation.data.qrCodeText));
      const qrNifError = firstQrData ? checkQrBuyerNif(firstQrData) : null;
      if (qrNifError) {
        setNifMismatch(`${qrNifError}. Não é possível registar esta fatura.`);
      } else {
        setNifMismatch(null);
      }

      setExtractedData(validation.data);
      const qrSupplier = firstQrData?.supplierNif
        ? suppliers.find(s => normalizeNif(s.nif || '') === firstQrData.supplierNif)
        : undefined;
      setSupplier(qrSupplier?.name || validation.data.supplierName || supplier || '');
      setNif(normalizeNif(validation.data.supplierNif || ''));
      setDocNumber(validation.data.invoiceNumber || '');

      // OCR success does not override capture quality; archive acceptance still depends on the original photo.
      const geminiFoundQr = Boolean(validation.data.qrCodeText || validation.data.digitalCompliance?.hasQrCode);
      setPageQualities((prev: PageQuality[]) => prev.map((q: PageQuality) => ({
        ...q,
        hasQrCode: q.hasQrCode || geminiFoundQr
      })));
      if (geminiFoundQr) {
        setQrPayloads((prev: string[]) => prev.length > 0 || !validation.data.qrCodeText ? prev : [validation.data.qrCodeText]);
      }
      
      const matches = await buildProductMatches({
        extractedData: validation.data,
        products,
        suppliers,
        productAliases,
        categories,
        onQuickCreateProduct
      });
      setAutoCreatedProducts(prev => ({ ...prev, ...matches.createdProducts }));
      setMapping(matches.autoMap);
      setMatchConfidences(matches.confidenceMap);
      setItemFamilies(matches.initialFamilies);
      setAliasMapping(matches.aliasMap);
      setUnitOriginals(matches.unitMap);
      setConversionFactors(matches.factorMap);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setProcessingError(message || 'Não foi possível analisar a fotografia. Verifique a ligação à internet e a chave Gemini.');
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
      const newOriginalPages: string[] = [];
      const newQualities: PageQuality[] = [];
      for (let i = 0; i < files.length; i++) {
        const reader = new FileReader();
        const p = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Falha ao ler imagem'));
        });
        reader.readAsDataURL(files[i]);
        const originalDataUrl = await p;
        const normalized = await normalizeWithoutCrop(originalDataUrl);
        const archivePage = await cropDetectedDocumentForArchive(originalDataUrl);
        newOriginalPages.push(`data:image/jpeg;base64,${archivePage}`);
        newPages.push(normalized.data);
        newQualities.push(normalized.quality);
      }
      const updated = [...pages, ...newPages];
      const updatedOriginals = [...originalPages, ...newOriginalPages];
      const newQrPayloads = await scanQrPayloads(newPages);
      const updatedQrPayloads = [...qrPayloads, ...newQrPayloads];
      const updatedQualities = [...pageQualities, ...newQualities.map((quality, index) => ({ ...quality, hasQrCode: Boolean(newQrPayloads[index]) }))];
      setPages(updated);
      setOriginalPages(updatedOriginals);
      setQrPayloads(updatedQrPayloads);
      setPageQualities(updatedQualities);

      const rejectedQuality = updatedQualities.find(quality => !quality.isReadable);
      if (rejectedQuality) {
        setProcessingError(qualityErrorMessage(rejectedQuality));
        setIsProcessing(false);
        return;
      }

      const firstQrPayload = updatedQrPayloads[0];
      if (firstQrPayload) {
        const parsedQr = applyQrData(firstQrPayload);
        if (await checkQrDuplicate(parsedQr)) {
          setProcessingError(duplicateWarning || 'Esta fatura já foi registada anteriormente.');
          setIsProcessing(false);
          return;
        }
        const nifErr = checkQrBuyerNif(parsedQr);
        setNifMismatch(nifErr);
        if (nifErr) {
          setProcessingError(`${nifErr}. Não é possível analisar esta fatura.`);
          setIsProcessing(false);
          return;
        }
      }
      await processAllPages(updatedOriginals, updatedQrPayloads);
    } catch (error) {
      setProcessingError('Não consegui abrir essa fotografia. Tente outro ficheiro ou tire uma nova foto.');
      setIsProcessing(false);
    }
  };

  const camera = useCamera({
    pages,
    originalPages,
    qrPayloads,
    qrData,
    isDuplicate,
    suppliersKey: suppliers,
    restaurantNif: restaurantProfile?.nif,
    setPages,
    setOriginalPages,
    setQrPayloads,
    setPageQualities,
    setNifMismatch,
    applyQrData,
    checkQrDuplicate,
    checkQrBuyerNif,
    processAllPages,
    qualityErrorMessage
  });
  const { openCamera, cameraError } = camera;

  const resetEntry = () => {
    setPages([]);
    setOriginalPages([]);
    setExtractedData(null);
    setMapping({});
    setMatchConfidences({});
    setAliasMapping({});
    setItemFamilies({});
    setUnitOriginals({});
    setConversionFactors({});
    setAutoCreatedProducts({});
    setSupplier('');
    setNif('');
    setDocNumber('');
    setIsDuplicate(false);
    setDuplicateWarning(null);
    setProcessingError(null);
    setNifMismatch(null);
    camera.resetCameraState();
    setQrPayloads([]);
    setQrData(null);
    setPageQualities([]);
    autoSubmitRef.current = false;
  };

  const confirmEntry = async () => {
    if (isSubmitting) return;
    if (nifMismatch) {
      setProcessingError(`${nifMismatch}. Não é possível registar esta fatura.`);
      return;
    }
    const unreadablePage = pageQualities.find(page => !page.isReadable);
    if (unreadablePage) {
      setProcessingError(qualityErrorMessage(unreadablePage));
      return;
    }
    if (extractedData && !isDuplicate) {
      setIsSubmitting(true);
      const completeMapping = { ...mapping };
      const createdProducts = { ...autoCreatedProducts };
      try {
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
            vatRate: item.vatRate,
            confidence: matchConfidences[idx] || 55
          };
        });
        const sourcePages = originalPages.length > 0 ? originalPages : pages.map(page => `data:image/jpeg;base64,${page}`);
        const invoicePhotos = sourcePages.map(page => page.startsWith('data:') ? page : `data:image/jpeg;base64,${page}`);
        const documentType = normalizePortugueseDocumentType(qrData?.documentType, extractedData.documentType, qrData?.documentNumber, extractedData.invoiceNumber);
        const saved = await Promise.resolve(onComplete(itemsToSubmit, invoicePhotos[0], { name: supplier, nif }, {
          docNumber,
          documentType,
          dateIssued: qrData?.documentDate || extractedData.invoiceDate,
          totalAmount: extractedData.totalInvoiceAmount,
          customerName: extractedData.customerName,
          customerNif: qrData?.customerNif || extractedData.customerNif,
          qrCodeText: extractedData.qrCodeText || extractedData.digitalCompliance.qrCodeText,
          qrTotalAmount: extractedData.qrTotalAmount ?? extractedData.digitalCompliance.qrTotalAmount,
          calculatedLinesTotal: extractedData.calculatedLinesTotal ?? extractedData.digitalCompliance.calculatedLinesTotal,
          totalValidationStatus: extractedData.digitalCompliance.totalValidationStatus,
          totalValidationNotes: extractedData.digitalCompliance.totalValidationNotes,
          digitalCompliance: extractedData.digitalCompliance,
          aiUsage: extractedData.aiUsage
        }, invoicePhotos));
        if (saved !== false) resetEntry();
      } finally {
        setIsSubmitting(false);
      }
    }
  };
  const confirmEntryRef = useRef(confirmEntry);
  useEffect(() => { confirmEntryRef.current = confirmEntry; });


  const matchedItemsCount = extractedData ? extractedData.items.filter((_, idx) => mapping[idx]).length : 0;
  const totalItemsCount = extractedData?.items.length || 0;
  const currentDocumentType = extractedData
    ? normalizePortugueseDocumentType(qrData?.documentType, extractedData.documentType, qrData?.documentNumber, extractedData.invoiceNumber)
    : normalizePortugueseDocumentType(qrData?.documentType, qrData?.documentNumber);
  const isCreditDocument = currentDocumentType === 'NC';
  const autoAcceptReady = Boolean(
    extractedData &&
    extractedData.items.length > 0 &&
    pageQualities.length > 0 &&
    pageQualities.every(page => page.isReadable) &&
    !isProcessing &&
    !isSubmitting &&
    !isDuplicate &&
    !nifMismatch &&
    !isCreditDocument
  );

  useEffect(() => {
    if (!autoAcceptReady || autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    confirmEntryRef.current();
  }, [autoAcceptReady]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-28 sm:pb-20">
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

      {/* NIF block — shown immediately after capture, before Gemini runs */}
      {nifMismatch && !extractedData && !isProcessing && pages.length > 0 && (
        <div className="flex items-start gap-4 p-6 bg-red-50 border-2 border-red-300 rounded-[2rem] animate-in fade-in">
          <span className="text-2xl shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1">
            <p className="font-black text-red-700 text-sm uppercase tracking-wide mb-1">Fatura não pode ser registada</p>
            <p className="text-sm font-bold text-red-600">{nifMismatch}</p>
            <button
              onClick={() => { setPages([]); setOriginalPages([]); setQrPayloads([]); setQrData(null); setPageQualities([]); setNifMismatch(null); setProcessingError(null); }}
              className="mt-4 px-5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700 transition-colors"
            >
              Descartar — Tirar Nova Foto
            </button>
          </div>
        </div>
      )}

      {(pages.length > 0 || isProcessing) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className={`${extractedData ? 'hidden lg:block' : ''} lg:col-span-4 space-y-4`}>
             <div className="bg-white p-4 sm:p-6 rounded-[1.75rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6"><h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digitalização</h4><span className="text-xs font-black text-orange-500">{pages.length} docs</span></div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                   {pages.map((p, idx) => (
                     <div key={idx} className="relative group aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200">
                        <img src={originalPages[idx] || `data:image/jpeg;base64,${p}`} className="w-full h-full object-contain bg-slate-50" />
                        <button onClick={() => {
                          setPages(prev => prev.filter((_, i) => i !== idx));
                          setOriginalPages(prev => prev.filter((_, i) => i !== idx));
                          setQrPayloads(prev => {
                            const next = prev.filter((_, i) => i !== idx);
                            setQrData(next[0] ? parsePortugueseQrData(next[0]) : null);
                            return next;
                          });
                          setPageQualities(prev => prev.filter((_, i) => i !== idx));
                          setProcessingError(null);
                        }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
                        <span className={`absolute left-2 bottom-2 px-2 py-1 rounded-lg text-[8px] font-black uppercase ${pageQualities[idx]?.isReadable ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                          {pageQualities[idx]?.isReadable ? 'Boa para arquivo' : 'Rever foto'}
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
                      QR {qrPayloads.length > 0 ? 'lido' : 'não lido diretamente'} · Imagem original preservada
                    </p>
                  </div>
                )}
                {qrData && (
                  <div className={`mb-4 p-4 rounded-2xl border ${nifMismatch ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-[10px] font-black uppercase">Dados fiscais do QR</p>
                      <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${nifMismatch ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {nifMismatch ? 'NIF errado' : 'QR válido'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <p>Fornecedor NIF: <span className="font-black">{qrData.supplierNif || '-'}</span></p>
                      <p>Empresa NIF: <span className="font-black">{qrData.customerNif || '-'}</span></p>
                      <p>Nº Doc: <span className="font-black">{qrData.documentNumber || '-'}</span></p>
                      <p>Data: <span className="font-black">{qrData.documentDate ? new Date(qrData.documentDate + 'T00:00:00').toLocaleDateString('pt-PT') : '-'}</span></p>
                      <p>Total QR: <span className="font-black">{qrData.totalAmount ? `€ ${qrData.totalAmount.toFixed(2)}` : '-'}</span></p>
                      {qrData.documentType && <p>Tipo: <span className="font-black">{qrData.documentType}</span></p>}
                      {qrData.atcud && <p className="col-span-2">ATCUD: <span className="font-black">{qrData.atcud}</span></p>}
                    </div>
                  </div>
                )}
                {isProcessing && <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100 animate-pulse"><RefreshCcw className="animate-spin text-orange-500" size={20} /><p className="text-[10px] font-black text-orange-600 uppercase">Lendo Artigos...</p></div>}
             </div>
             {isDuplicate && <div className="bg-red-600 text-white p-6 rounded-[2.5rem] shadow-xl animate-bounce flex items-start gap-4"><Copy size={32} /><div><h5 className="font-black uppercase text-sm">Fatura Duplicada!</h5><p className="text-[10px] font-bold opacity-80 mt-1">{duplicateWarning || `Este Nº ${docNumber} já foi inserido anteriormente.`}</p></div></div>}
          </div>

          <div className="lg:col-span-8 space-y-6">
             {extractedData ? (
               <InvoiceReviewPanel
                 extractedData={extractedData}
                 matchedItemsCount={matchedItemsCount}
                 totalItemsCount={totalItemsCount}
                 nifMismatch={nifMismatch}
                 qrData={qrData}
                 currentDocumentType={currentDocumentType}
                 isCreditDocument={isCreditDocument}
                 supplier={supplier}
                 nif={nif}
                 docNumber={docNumber}
                 isDuplicate={isDuplicate}
                 isSubmitting={isSubmitting}
                 products={products}
                 categories={categories}
                 mapping={mapping}
                 matchConfidences={matchConfidences}
                 itemFamilies={itemFamilies}
                 unitOriginals={unitOriginals}
                 conversionFactors={conversionFactors}
                 autoCreatedProducts={autoCreatedProducts}
                 setSupplier={setSupplier}
                 setNif={setNif}
                 setDocNumber={setDocNumber}
                 setMapping={setMapping}
                 setMatchConfidences={setMatchConfidences}
                 setItemFamilies={setItemFamilies}
                 setUnitOriginals={setUnitOriginals}
                 setConversionFactors={setConversionFactors}
                 onQuickCreateProduct={onQuickCreateProduct}
                 confirmEntry={confirmEntry}
               />
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
                       <button onClick={() => processAllPages(originalPages.length > 0 ? originalPages : pages)} disabled={pages.length === 0} className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] hover:bg-orange-500 disabled:opacity-40 transition-all">
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

      {camera.isCameraOpen && createPortal(<CameraOverlay {...camera.overlayProps} />, document.body)}
    </div>
  );
};

export default StockEntry;
