
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Upload, Check, X, PlusCircle, RefreshCcw, Copy } from 'lucide-react';
import { processInvoiceImage, InvoiceExtractedData } from '../geminiService';
import { Product, Category, Supplier, PurchaseInvoice, ProductAlias, StockEntryLineInput, RestaurantProfile } from '../types';
import { normalizeInvoiceImage, normalizeWithoutCrop, detectDocumentCrop, CropProposal, PageQuality, PortugueseQrData, normalizePortugueseDocumentType, parsePortugueseQrData, scanQrFromCanvas, scanQrPayloads, validateInvoiceTotals } from './stock-entry/invoiceProcessor';
import { buildProductMatches, confidenceStyle, normalizeNif } from './stock-entry/productMatcher';

interface StockEntryProps {
  products: Product[];
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  productAliases: ProductAlias[];
  categories: Category[];
  restaurantProfile?: RestaurantProfile | null;
  onComplete: (items: StockEntryLineInput[], photoUrl?: string, supplierData?: Partial<Supplier>, invoiceData?: any, photoUrls?: string[]) => void | Promise<void>;
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
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraIsMultiMode, setCameraIsMultiMode] = useState(false);
  const [capturedParts, setCapturedParts] = useState(0);
  const [qrLiveDetected, setQrLiveDetected] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [nifMismatch, setNifMismatch] = useState<string | null>(null);
  const [liveQrNifError, setLiveQrNifError] = useState<string | null>(null);
  const [qrPayloads, setQrPayloads] = useState<string[]>([]);
  const [qrData, setQrData] = useState<PortugueseQrData | null>(null);
  const [pageQualities, setPageQualities] = useState<PageQuality[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraViewportHeight, setCameraViewportHeight] = useState(720);
  const [pendingCapture, setPendingCapture] = useState<{
    rawDataUrl: string;
    croppedBase64: string;
    croppedQuality: PageQuality;
    proposal: CropProposal;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const captureCameraPageRef = useRef<() => Promise<void>>();
  const autoSubmitRef = useRef(false);

  useEffect(() => {
    if (nif && docNumber) {
      const exists = invoices.some(inv => inv.docNumber.toLowerCase() === docNumber.toLowerCase() && inv.supplierNif === nif);
      setIsDuplicate(exists);
    }
  }, [nif, docNumber, invoices]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // Keep ref pointing to latest captureCameraPage (avoids stale closures in scan timer)
  useEffect(() => { captureCameraPageRef.current = captureCameraPage; });

  const applyQrData = (qrText: string) => {
    const parsed = parsePortugueseQrData(qrText);
    setQrData(parsed);
    if (parsed.supplierNif) {
      setNif(parsed.supplierNif);
      const knownSupplier = suppliers.find(s => normalizeNif(s.nif || '') === parsed.supplierNif);
      if (knownSupplier?.name) setSupplier(knownSupplier.name);
    }
    if (parsed.documentNumber) setDocNumber(parsed.documentNumber);
    return parsed;
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

  // Live QR scan: scans every 600ms until QR is found, then LATCHES green.
  // Once detected, brackets stay green regardless of phone movement so the
  // user can re-frame the full invoice before tapping capture.
  useEffect(() => {
    if (!isCameraReady || !isCameraOpen || qrLiveDetected) return;
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let active = true;

    const scan = async () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          let qrText: string | null = null;

          if (detector) {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0]?.rawValue) qrText = codes[0].rawValue;
          }
          if (!qrText && ctx) {
            const sw = video.videoWidth || 0;
            const sh = video.videoHeight || 0;
            if (sw > 0 && sh > 0) {
              const scanWidth = Math.min(720, sw);
              canvas.width = scanWidth;
              canvas.height = Math.round(scanWidth * (sh / sw));
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              qrText = scanQrFromCanvas(canvas) || null;
            }
          }

          if (qrText) {
            const parsedQr = applyQrData(qrText);
            setQrPayloads(prev => prev.includes(qrText) ? prev : [...prev, qrText]);
            const nifErr = checkQrBuyerNif(parsedQr);
            if (nifErr) {
              setLiveQrNifError(nifErr);
              setNifMismatch(nifErr);
              // Keep scanning — user may move to correct invoice
              if (active) setTimeout(scan, 1200);
              return;
            }
            setLiveQrNifError(null);
            setNifMismatch(null);
            setQrLiveDetected(true); // latch green — NIF OK
            return;
          }
        } catch { /* ignore per-frame errors */ }
      }
      if (active) setTimeout(scan, 600);
    };

    scan();
    return () => { active = false; };
  }, [isCameraReady, isCameraOpen, qrLiveDetected, suppliers, restaurantProfile?.nif]);

  useEffect(() => {
    if (!isCameraOpen) return;

    setIsCameraReady(false);
    const stream = cameraStreamRef.current;
    const video = videoRef.current;
    if (!video || !stream) return;

    let warmupTimer: ReturnType<typeof setTimeout> | null = null;

    const onCanPlay = () => {
      // iOS needs extra time after canplay for the sensor to deliver real frames
      warmupTimer = setTimeout(() => setIsCameraReady(true), 600);
    };

    video.addEventListener('canplay', onCanPlay);
    video.srcObject = stream;
    video.play().catch(() => undefined);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      if (warmupTimer) clearTimeout(warmupTimer);
    };
  }, [isCameraOpen]);

  useEffect(() => {
    if (!isCameraOpen) return;

    const updateViewportHeight = () => {
      setCameraViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight || 720));
    };
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    updateViewportHeight();
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
    };
  }, [isCameraOpen]);

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
    } catch (error) {
      setCameraError('Não consegui abrir a câmara. Confirme as permissões do browser e se está em HTTPS ou localhost.');
    }
  };

  const closeCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
    setIsCameraReady(false);
    setCameraIsMultiMode(false);
    setCapturedParts(0);
    setQrLiveDetected(false);
    setLiveQrNifError(null);
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

      // OCR succeeded → mark all pages as readable; update QR flag from Gemini result
      const geminiFoundQr = Boolean(validation.data.qrCodeText || validation.data.digitalCompliance?.hasQrCode);
      setPageQualities((prev: PageQuality[]) => prev.map((q: PageQuality) => ({
        ...q,
        isReadable: true,
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
        const normalized = await normalizeInvoiceImage(originalDataUrl);
        newOriginalPages.push(originalDataUrl);
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

      const firstQrPayload = updatedQrPayloads[0];
      if (firstQrPayload) {
        const parsedQr = applyQrData(firstQrPayload);
        const nifErr = checkQrBuyerNif(parsedQr);
        if (nifErr) {
          setNifMismatch(nifErr);
          setIsProcessing(false);
          return;
        }
        setNifMismatch(null);
      }
      await processAllPages(updatedOriginals, updatedQrPayloads);
    } catch (error) {
      setProcessingError('Não consegui abrir essa fotografia. Tente outro ficheiro ou tire uma nova foto.');
      setIsProcessing(false);
    }
  };

  const captureCameraPage = async () => {
    setQrLiveDetected(false);
    setLiveQrNifError(null);
    const video = videoRef.current;
    if (!video || !isCameraReady || video.readyState < 2) {
      setCameraError('A câmara ainda não está pronta. Aguarde um momento e tente novamente.');
      return;
    }

    const canvas = document.createElement('canvas');
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const maxWidth = 2000;
    const scale = Math.min(1, maxWidth / sourceWidth);
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Crop detection — only for single-page captures (not multi-mode)
    const proposal = detectDocumentCrop(canvas);
    if (!cameraIsMultiMode && proposal.confidence >= 0.7) {
      const normalized = await normalizeInvoiceImage(rawDataUrl);
      closeCamera();
      setPendingCapture({ rawDataUrl, croppedBase64: normalized.data, croppedQuality: normalized.quality, proposal });
      return;
    }

    // Low confidence or multi-mode: use original (no crop) for single-page, auto-crop for multi
    let normalized: { data: string; quality: PageQuality; width: number; height: number };
    if (!cameraIsMultiMode && proposal.confidence < 0.3) {
      normalized = await normalizeWithoutCrop(rawDataUrl);
      setProcessingError('Não foi possível detetar o documento com segurança. A imagem original foi mantida.');
    } else {
      normalized = await normalizeInvoiceImage(rawDataUrl);
    }

    const updated = [...pages, normalized.data];
    const updatedOriginals = [...originalPages, rawDataUrl];
    const newQrPayloads = await scanQrPayloads([normalized.data]);
    const updatedQrPayloads = [...qrPayloads, ...newQrPayloads];
    setPages(updated);
    setOriginalPages(updatedOriginals);
    setQrPayloads(updatedQrPayloads);
    setPageQualities(prev => [...prev, { ...normalized.quality, hasQrCode: Boolean(newQrPayloads[0]) }]);

    // NIF check immediately after capture — before calling Gemini
    if (updatedQrPayloads.length > 0) {
      const parsedQr = applyQrData(updatedQrPayloads[0]);
      const nifErr = checkQrBuyerNif(parsedQr);
      if (nifErr) {
        closeCamera();
        setNifMismatch(nifErr);
        return;
      }
    }
    setNifMismatch(null);

    const isLong = normalized.width > 0 && (normalized.height / normalized.width) > 2.5;
    const newPartCount = capturedParts + 1;

    if (isLong || cameraIsMultiMode) {
      setCameraIsMultiMode(true);
      setCapturedParts(newPartCount);
      setIsCameraReady(false);
      if (newPartCount >= 3) {
        closeCamera();
        await processAllPages(updatedOriginals, updatedQrPayloads);
      }
    } else {
      closeCamera();
      await processAllPages(updatedOriginals, updatedQrPayloads);
    }
  };

  const confirmCapture = async (useCrop: boolean) => {
    if (!pendingCapture) return;
    const { rawDataUrl, croppedBase64, croppedQuality, proposal } = pendingCapture;
    setPendingCapture(null);

    let normalized: { data: string; quality: PageQuality; width: number; height: number };
    if (useCrop) {
      normalized = { data: croppedBase64, quality: croppedQuality, width: proposal.cropW, height: proposal.cropH };
    } else {
      normalized = await normalizeWithoutCrop(rawDataUrl);
    }

    const updated = [...pages, normalized.data];
    const updatedOriginals = [...originalPages, rawDataUrl];
    const newQrPayloads = await scanQrPayloads([normalized.data]);
    const updatedQrPayloads = [...qrPayloads, ...newQrPayloads];
    setPages(updated);
    setOriginalPages(updatedOriginals);
    setQrPayloads(updatedQrPayloads);
    setPageQualities((prev: PageQuality[]) => [...prev, { ...normalized.quality, hasQrCode: Boolean(newQrPayloads[0]) }]);

    if (updatedQrPayloads.length > 0) {
      const parsedQr = applyQrData(updatedQrPayloads[0]);
      const nifErr = checkQrBuyerNif(parsedQr);
      if (nifErr) { setNifMismatch(nifErr); return; }
    }
    setNifMismatch(null);
    await processAllPages(updatedOriginals, updatedQrPayloads);
  };

  const analyzeCameraParts = async () => {
    const currentPages = originalPages.length > 0 ? originalPages : pages;
    const currentQrPayloads = qrPayloads;
    closeCamera();
    await processAllPages(currentPages, currentQrPayloads);
  };

  const confirmEntry = async () => {
    if (isSubmitting) return;
    if (extractedData && !isDuplicate && !nifMismatch) {
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
        await Promise.resolve(onComplete(itemsToSubmit, invoicePhotos[0], { name: supplier, nif }, {
          docNumber,
          documentType,
          dateIssued: qrData?.documentDate,
          totalAmount: extractedData.totalInvoiceAmount,
          customerName: extractedData.customerName,
          customerNif: qrData?.customerNif || extractedData.customerNif,
          qrCodeText: extractedData.qrCodeText || extractedData.digitalCompliance.qrCodeText,
          qrTotalAmount: extractedData.qrTotalAmount ?? extractedData.digitalCompliance.qrTotalAmount,
          calculatedLinesTotal: extractedData.calculatedLinesTotal ?? extractedData.digitalCompliance.calculatedLinesTotal,
          totalValidationStatus: extractedData.digitalCompliance.totalValidationStatus,
          totalValidationNotes: extractedData.digitalCompliance.totalValidationNotes,
          digitalCompliance: extractedData.digitalCompliance
        }, invoicePhotos));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const cameraOverlay = isCameraOpen ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: `${cameraViewportHeight}px`,
        zIndex: 2147483647,
        background: '#020617',
        overflow: 'hidden',
        touchAction: 'none',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#000'
        }}
      />
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between text-white bg-gradient-to-b from-black/75 to-transparent">
        <div>
          {cameraIsMultiMode ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                {[1, 2, 3].map(n => (
                  <span key={n} className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${n <= capturedParts ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white/50'}`}>{n <= capturedParts ? '✓' : n}</span>
                ))}
              </div>
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                {capturedParts === 0 ? 'Fotografe a parte seguinte' : `Parte ${capturedParts} capturada — fotografe a continuação`}
              </p>
            </>
          ) : (
            <>
              <h4 className="font-black uppercase text-sm">Câmara</h4>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
                QR detetado automaticamente
              </p>
            </>
          )}
        </div>
        <button onClick={closeCamera} className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* QR scanner brackets — green=OK, red=NIF error, white=scanning */}
      {isCameraReady && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          <div className="relative w-64 h-64">
            {(['tl','tr','bl','br'] as const).map(c => (
              <span key={c} className={`absolute w-12 h-12 transition-colors duration-300
                ${liveQrNifError ? 'border-red-400' : qrLiveDetected ? 'border-emerald-400' : 'border-white/70'}
                ${c==='tl' ? 'top-0 left-0 border-t-4 border-l-4 rounded-tl-xl' : ''}
                ${c==='tr' ? 'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl' : ''}
                ${c==='bl' ? 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl' : ''}
                ${c==='br' ? 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl' : ''}`} />
            ))}
            <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-colors duration-300
              ${liveQrNifError ? 'text-red-400' : qrLiveDetected ? 'text-emerald-400' : 'text-white/40'}`}>
              {liveQrNifError ? '✗ NIF' : qrLiveDetected ? '✓ QR OK' : 'QR...'}
            </span>
          </div>
        </div>
      )}

      {/* NIF error banner — shown immediately when QR is detected with wrong NIF */}
      {liveQrNifError && (
        <div className="absolute top-20 left-4 right-4 z-20 p-3 rounded-2xl bg-red-500/95 text-white text-[10px] font-black uppercase flex items-center gap-2">
          <X size={14} className="shrink-0" /> {liveQrNifError}
        </div>
      )}

      {qrLiveDetected && qrData && !liveQrNifError && (
        <div className="absolute top-20 left-4 right-4 z-20 p-3 rounded-2xl bg-emerald-500/95 text-white text-[10px] font-black uppercase space-y-1">
          <div className="flex items-center gap-2">
            <Check size={14} className="shrink-0" /> QR fiscal lido e NIF da empresa validado
          </div>
          <p className="opacity-85">
            Forn. {qrData.supplierNif || '-'} · Empresa {qrData.customerNif || 'sem NIF'} · Total {qrData.totalAmount ? `€ ${qrData.totalAmount.toFixed(2)}` : '-'}
          </p>
        </div>
      )}

      {/* Multi-mode banner */}
      {cameraIsMultiMode && capturedParts > 0 && !qrLiveDetected && (
        <div className="absolute top-20 left-4 right-4 z-10 p-3 rounded-2xl bg-emerald-500/90 text-white text-[10px] font-black uppercase flex items-center gap-2">
          <Check size={14} /> {capturedParts === 1 ? '1 parte capturada' : `${capturedParts} partes capturadas`} — enquadre a parte seguinte e fotografe
        </div>
      )}

      {cameraError && <p className="absolute left-4 right-4 bottom-28 z-10 p-3 rounded-2xl bg-red-500/90 text-xs font-bold text-white">{cameraError}</p>}

      {/* Bottom controls */}
      <div className="absolute left-0 right-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3 justify-end bg-gradient-to-t from-black/80 to-transparent">
        <button onClick={closeCamera} className="px-5 py-4 rounded-2xl border border-white/10 text-white/80 font-black uppercase text-xs hover:text-white hover:bg-white/10 transition-all">Cancelar</button>
        {cameraIsMultiMode && capturedParts > 0 && (
          <button
            onClick={analyzeCameraParts}
            className="px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-xl"
          >
            <Check size={16} /> Analisar {capturedParts} {capturedParts === 1 ? 'parte' : 'partes'}
          </button>
        )}
        <button
          onClick={captureCameraPage}
          disabled={!isCameraReady}
          className={`flex-1 sm:flex-none px-8 py-4 rounded-2xl text-white font-black uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-2xl ${
            !isCameraReady ? 'bg-orange-500/40 cursor-not-allowed'
            : qrLiveDetected ? 'bg-emerald-500 hover:bg-emerald-400 scale-105'
            : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          <Camera size={18} />
          {!isCameraReady ? 'A preparar…' : qrLiveDetected ? 'Capturar — QR OK' : cameraIsMultiMode ? `Fotografar Parte ${capturedParts + 1}` : 'Fotografar'}
        </button>
      </div>
    </div>
  ) : null;

  const cropConfirmModal = pendingCapture && !isCameraOpen ? createPortal(
    <div className="fixed inset-0 z-[2147483646] bg-black/80 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full sm:max-w-md p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black uppercase text-sm">Recorte Detetado</h3>
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${pendingCapture.proposal.confidence >= 0.8 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
            {Math.round(pendingCapture.proposal.confidence * 100)}% conf.
          </span>
        </div>
        <p className="text-[10px] text-slate-500 font-medium mb-4">O documento foi detetado automaticamente. O recorte remove o fundo e facilita a leitura.</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-slate-400 uppercase text-center">Original</p>
            <div className="h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
              <img src={pendingCapture.rawDataUrl} className="max-w-full max-h-full object-contain" />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-black text-emerald-600 uppercase text-center">✓ Recortado</p>
            <div className="h-36 rounded-xl overflow-hidden border-2 border-emerald-400 bg-slate-100 flex items-center justify-center">
              <img src={`data:image/jpeg;base64,${pendingCapture.croppedBase64}`} className="max-w-full max-h-full object-contain" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => confirmCapture(true)}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase text-xs transition-all flex items-center justify-center gap-2"
          >
            <Check size={15} /> Usar Recorte <span className="text-emerald-200 text-[9px] normal-case font-bold">(recomendado)</span>
          </button>
          <button
            onClick={() => confirmCapture(false)}
            className="w-full py-3 rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-black uppercase text-xs transition-all"
          >
            Usar Imagem Original
          </button>
          <button
            onClick={() => setPendingCapture(null)}
            className="w-full py-2 text-slate-400 hover:text-slate-600 font-black uppercase text-[10px] transition-colors"
          >
            Cancelar — Tirar Outra Foto
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const matchedItemsCount = extractedData ? extractedData.items.filter((_, idx) => mapping[idx]).length : 0;
  const totalItemsCount = extractedData?.items.length || 0;
  const currentDocumentType = extractedData
    ? normalizePortugueseDocumentType(qrData?.documentType, extractedData.documentType, qrData?.documentNumber, extractedData.invoiceNumber)
    : normalizePortugueseDocumentType(qrData?.documentType, qrData?.documentNumber);
  const isCreditDocument = currentDocumentType === 'NC';
  const allItemsGreen = extractedData
    ? extractedData.items.every((item, idx) => Boolean(mapping[idx]) && (matchConfidences[idx] || 0) >= 90)
    : false;
  const creditStockIsEnough = !extractedData || !isCreditDocument || extractedData.items.every((item, idx) => {
    const product = products.find(p => p.id === mapping[idx]) || autoCreatedProducts[mapping[idx]];
    const quantity = item.quantity * (conversionFactors[idx] || 1);
    return Number(product?.currentStock || 0) >= quantity;
  });
  const autoAcceptReady = Boolean(
    extractedData &&
    qrData &&
    !isProcessing &&
    !isSubmitting &&
    !isDuplicate &&
    !nifMismatch &&
    extractedData.digitalCompliance?.totalValidationStatus === 'VALIDO' &&
    (extractedData.digitalCompliance?.confidenceScore || 0) >= 90 &&
    allItemsGreen &&
    creditStockIsEnough
  );

  useEffect(() => {
    if (!autoAcceptReady || autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    confirmEntry();
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
                        <img src={`data:image/jpeg;base64,${p}`} className="w-full h-full object-cover" />
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
                {qrData && (
                  <div className={`mb-4 p-4 rounded-2xl border ${nifMismatch ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-[10px] font-black uppercase">Dados fiscais do QR</p>
                      <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${nifMismatch ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {nifMismatch ? 'NIF errado' : 'QR válido'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <p>Fornecedor: <span className="font-black">{qrData.supplierNif || '-'}</span></p>
                      <p>Empresa: <span className="font-black">{qrData.customerNif || 'sem NIF'}</span></p>
                      <p>Documento: <span className="font-black">{qrData.documentNumber || '-'}</span></p>
                      <p>Total: <span className="font-black">{qrData.totalAmount ? `€ ${qrData.totalAmount.toFixed(2)}` : '-'}</span></p>
                      {qrData.atcud && <p className="col-span-2">ATCUD: <span className="font-black">{qrData.atcud}</span></p>}
                    </div>
                  </div>
                )}
                {isProcessing && <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100 animate-pulse"><RefreshCcw className="animate-spin text-orange-500" size={20} /><p className="text-[10px] font-black text-orange-600 uppercase">Lendo Artigos...</p></div>}
             </div>
             {extractedData && isDuplicate && <div className="bg-red-600 text-white p-6 rounded-[2.5rem] shadow-xl animate-bounce flex items-start gap-4"><Copy size={32} /><div><h5 className="font-black uppercase text-sm">Fatura Duplicada!</h5><p className="text-[10px] font-bold opacity-80 mt-1">Este Nº {docNumber} já foi inserido anteriormente.</p></div></div>}
          </div>

          <div className="lg:col-span-8 space-y-6">
             {extractedData ? (
               <div className="animate-in slide-in-from-right-4">
                 <div className="bg-white p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[3rem] shadow-sm border border-slate-200 space-y-4 sm:space-y-8">
                    <div className="sticky top-0 z-20 -mx-4 -mt-4 sm:mx-0 sm:mt-0 p-4 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur border-b border-slate-100 sm:border-0">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Total</p>
                          <p className="text-lg font-black text-slate-900">€ {extractedData.totalInvoiceAmount.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase">Artigos</p>
                          <p className="text-lg font-black text-orange-600">{matchedItemsCount}/{totalItemsCount}</p>
                        </div>
                        <div className={`p-3 rounded-2xl border ${confidenceStyle(extractedData.digitalCompliance?.confidenceScore)}`}>
                          <p className="text-[8px] font-black uppercase">Conf.</p>
                          <p className="text-lg font-black">{extractedData.digitalCompliance?.confidenceScore ?? 0}%</p>
                        </div>
                      </div>
                    </div>
                    {nifMismatch && (
                      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                        <span className="text-red-500 text-lg leading-none shrink-0">⚠</span>
                        <p className="text-xs font-bold text-red-700">{nifMismatch}</p>
                      </div>
                    )}
                    {qrData && (
                      <div className={`p-4 rounded-2xl border ${nifMismatch ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">QR fiscal</p>
                            <p className="text-[10px] font-bold opacity-80 mt-1">
                              Estes dados vêm diretamente do QR da Autoridade Tributária.
                            </p>
                          </div>
                          <span className={`self-start sm:self-auto px-3 py-1.5 rounded-xl text-[9px] font-black uppercase ${nifMismatch ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {nifMismatch ? 'NIF comprador inválido' : 'NIF comprador OK'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-bold">
                          <p>Fornecedor<br /><span className="font-black">{qrData.supplierNif || '-'}</span></p>
                          <p>Empresa<br /><span className="font-black">{qrData.customerNif || 'sem NIF'}</span></p>
                          <p>Documento<br /><span className="font-black">{qrData.documentNumber || '-'}</span></p>
                          <p>Total QR<br /><span className="font-black">{qrData.totalAmount ? `€ ${qrData.totalAmount.toFixed(2)}` : '-'}</span></p>
                        </div>
                      </div>
                    )}
                    {currentDocumentType && (
                      <div className={`p-4 rounded-2xl border ${isCreditDocument ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest">Tipo de documento</p>
                            <p className="text-[10px] font-bold opacity-80 mt-1">
                              {isCreditDocument ? 'Nota de crédito detetada. Ao confirmar, o stock será abatido.' : 'Tipo detetado por QR/OCR/número do documento.'}
                            </p>
                          </div>
                          <span className={`px-3 py-1.5 rounded-xl text-sm font-black ${isCreditDocument ? 'bg-red-100 text-red-700' : 'bg-white text-slate-900 border border-slate-200'}`}>
                            {currentDocumentType}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
                       <div className="space-y-1"><label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</label><input type="text" className="w-full px-4 sm:px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
                       <div className="space-y-1"><label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">NIF</label><input type="text" className="w-full px-4 sm:px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs" value={nif} onChange={(e) => setNif(e.target.value)} /></div>
                       <div className="space-y-1"><label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº Fatura</label><input type="text" className={`w-full px-4 sm:px-5 py-3 border rounded-xl font-bold text-xs ${isDuplicate ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200'}`} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} /></div>
                    </div>
                    <div className={`hidden sm:flex p-4 rounded-2xl border flex-col sm:flex-row sm:items-center justify-between gap-3 ${confidenceStyle(extractedData.digitalCompliance?.confidenceScore)}`}>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">Confiança da validação</p>
                        <p className="text-[10px] font-bold opacity-80 mt-1">
                          QR {extractedData.qrTotalAmount ? `€ ${extractedData.qrTotalAmount.toFixed(2)}` : 'não verificado'} · Linhas € {(extractedData.calculatedLinesTotal || 0).toFixed(2)}
                        </p>
                      </div>
                      <p className="text-2xl font-black">{extractedData.digitalCompliance?.confidenceScore ?? 0}%</p>
                    </div>
                    <div className="space-y-3 sm:space-y-4">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-3 sm:pb-4">Conferência rápida</h5>
                       <div className="space-y-3 sm:space-y-6">
                          {extractedData.items.map((item, idx) => {
                            const isMapped = !!mapping[idx];
                            const currentFamily = itemFamilies[idx] || 'Outros';
                            const filteredProducts = products.filter(p => p.category === currentFamily);
                            const selectedProduct = products.find(p => p.id === mapping[idx]) || autoCreatedProducts[mapping[idx]];
                            const factor = conversionFactors[idx] || 1;
                            const stockQty = item.quantity * factor;
                            const stockActionLabel = isCreditDocument ? 'Abate' : 'Entra';
                            return (
                              <div key={idx} className={`p-3 sm:p-6 rounded-2xl sm:rounded-[2rem] border transition-all ${isMapped ? 'bg-white border-slate-100 shadow-sm' : 'bg-orange-50 border-orange-100'}`}>
                                <div className="flex flex-col md:flex-row gap-3 sm:gap-6">
                                  <div className="md:w-1/3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-800 leading-snug">{item.name}</p>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1">{item.quantity} {item.unit || 'un'} · € {item.totalPrice.toFixed(2)}</p>
                                      </div>
                                      <span className={`shrink-0 px-2 py-1 rounded-lg border text-[8px] font-black ${confidenceStyle(matchConfidences[idx])}`}>{matchConfidences[idx] || 0}%</span>
                                    </div>
                                  </div>
                                  <div className="flex-1 space-y-3 sm:space-y-4">
                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                       <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">Família</label><select className="w-full px-3 sm:px-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={currentFamily} onChange={(e) => { setItemFamilies(prev => ({ ...prev, [idx]: e.target.value })); setMapping(prev => { const n = {...prev}; delete n[idx]; return n; }); }}>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                       <div className="space-y-1 sm:hidden">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">{stockActionLabel}</label>
                                         <div className={`px-3 py-3 text-white rounded-xl text-[10px] font-black uppercase ${isCreditDocument ? 'bg-red-700' : 'bg-slate-900'}`}>{stockQty.toFixed(3)} {selectedProduct?.unit || 'un'}</div>
                                       </div>
                                     </div>
                                     <div className="space-y-2"><label className="text-[8px] font-black text-slate-400 uppercase">Inventário</label>
                                        {isMapped ? (
                                          <div className="flex items-center gap-2 px-3 sm:px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl"><Check className="text-emerald-500 shrink-0" size={16} /><p className="text-[10px] font-black text-emerald-700 uppercase flex-1 leading-snug">{selectedProduct?.name}</p><button onClick={() => setMapping(prev => { const n = {...prev}; delete n[idx]; return n; })} className="text-[8px] font-black text-emerald-500 uppercase hover:text-red-500">Trocar</button></div>
                                        ) : (
                                          <div className="flex flex-col sm:flex-row gap-2">
                                             <select className="flex-1 px-3 sm:px-4 py-3 bg-white border border-orange-200 rounded-xl text-[10px] font-black uppercase outline-none" onChange={(e) => { setMapping(prev => ({ ...prev, [idx]: e.target.value })); setMatchConfidences(prev => ({ ...prev, [idx]: 100 })); }}><option value="">Selecionar Artigo Existente...</option>{filteredProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                                             <button onClick={async () => {
                                               const created = await onQuickCreateProduct({ name: item.name, category: currentFamily, unit: unitOriginals[idx] || item.unit || 'un' });
                                               setMapping(prev => ({ ...prev, [idx]: created.id }));
                                               setMatchConfidences(prev => ({ ...prev, [idx]: 100 }));
                                             }} className="px-4 py-3 bg-slate-900 text-white text-[10px] font-black uppercase rounded-xl hover:bg-orange-500 transition-all flex items-center gap-2"><PlusCircle size={14} /> Criar Novo</button>
                                          </div>
                                        )}
                                     </div>
                                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                       <div className="space-y-1 hidden sm:block">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">Unid. Fatura</label>
                                         <input className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={unitOriginals[idx] || item.unit || 'un'} onChange={(e) => setUnitOriginals(prev => ({ ...prev, [idx]: e.target.value }))} />
                                       </div>
                                       <div className="space-y-1">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">Fator</label>
                                         <input type="number" step="0.001" min="0.001" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase outline-none" value={factor} onChange={(e) => setConversionFactors(prev => ({ ...prev, [idx]: Number(e.target.value) || 1 }))} />
                                       </div>
                                       <div className="space-y-1">
                                         <label className="text-[8px] font-black text-slate-400 uppercase">{stockActionLabel} Stock</label>
                                         <div className={`px-3 py-2 text-white rounded-xl text-[10px] font-black uppercase ${isCreditDocument ? 'bg-red-700' : 'bg-slate-900'}`}>{stockQty.toFixed(3)} {selectedProduct?.unit || 'un'}</div>
                                       </div>
                                     </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                       </div>
                    </div>
                    <div className="sticky bottom-0 z-30 -mx-4 -mb-4 sm:mx-0 sm:mb-0 p-4 sm:p-0 bg-white/95 sm:bg-transparent backdrop-blur border-t sm:border-t pt-4 sm:pt-8 flex flex-col md:flex-row justify-between items-center gap-3 sm:gap-6">
                       <div className="hidden sm:block"><p className="text-[10px] font-black text-slate-400 uppercase">Total do Documento</p><p className="text-4xl font-black italic text-slate-900">€ {extractedData.totalInvoiceAmount.toFixed(2)}</p></div>
                       <button onClick={confirmEntry} className={`w-full md:w-auto px-8 sm:px-12 py-4 sm:py-5 rounded-2xl sm:rounded-[2rem] font-black uppercase text-xs shadow-2xl transition-all ${isDuplicate || nifMismatch || isSubmitting ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : isCreditDocument ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-orange-500 text-white hover:bg-orange-600 sm:bg-slate-900 sm:hover:bg-orange-500'}`} disabled={!!(isDuplicate || nifMismatch || isSubmitting)}>
                         {isSubmitting ? 'A guardar automaticamente...' : isCreditDocument ? 'Confirmar Nota de Crédito' : 'Confirmar Entrada'} {isSubmitting ? <RefreshCcw size={18} className="inline ml-2 animate-spin" /> : <Check size={20} className="inline ml-2" />}
                       </button>
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

      {cameraOverlay && createPortal(cameraOverlay, document.body)}
      {cropConfirmModal}
    </div>
  );
};

export default StockEntry;
