
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Upload, Check, RefreshCcw, X, QrCode } from 'lucide-react';
import { apiPost, apiPostForm } from '../data/apiClient';
import { RestaurantProfile } from '../types';
import { analyzeCanvasQuality, cropDetectedDocumentForArchive, normalizeWithoutCrop, PageQuality, parsePortugueseQrData, scanQrFromCanvas, scanQrPayloads } from './stock-entry/invoiceProcessor';
import { checkInvoiceDuplicate } from '../data/invoicesRepository';
import { listSuppliersPage } from '../data/suppliersRepository';
import { processInvoiceImage, InvoiceExtractedData } from '../geminiService';

interface ExpensesProps {
  onSaved?: () => void;
  restaurantProfile?: RestaurantProfile | null;
}

const Expenses: React.FC<ExpensesProps> = ({ onSaved, restaurantProfile }) => {
  // Camera state
  const [isCameraOpen, setIsCameraOpen]   = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [qrDetected, setQrDetected]       = useState(false);
  const [cameraError, setCameraError]     = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState(720);
  const videoRef        = useRef<HTMLVideoElement>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const captureRef      = useRef<() => Promise<void>>();

  const [supplier,    setSupplier]    = useState('');
  const [nif,         setNif]         = useState('');
  const [docNumber,   setDocNumber]   = useState('');
  const [amount,      setAmount]      = useState('');
  const [date,        setDate]        = useState(new Date().toISOString().split('T')[0]);
  const [qrDocuments, setQrDocuments] = useState<ReturnType<typeof parsePortugueseQrData>[]>([]);
  const [capturedImgs, setCapturedImgs] = useState<string[]>([]); // cropped archive pages
  const [liveQuality, setLiveQuality] = useState<PageQuality | null>(null);
  const [capturedQualities, setCapturedQualities] = useState<PageQuality[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [supplierNamesByNif, setSupplierNamesByNif] = useState<Record<string, string>>({});
  const [expenseAiData, setExpenseAiData] = useState<InvoiceExtractedData | null>(null);
  const [isAnalyzingName, setIsAnalyzingName] = useState(false);

  const [isSaving,      setIsSaving]      = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [qrNifMismatch, setQrNifMismatch] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Despesas só precisam de arquivo legível; ao contrário do stock, não extraímos linhas por IA.
  const getExpenseQualityReasons = (quality: PageQuality) => {
    const reasons = quality.qualityReasons.filter(reason => reason !== 'Foto desfocada');
    if (quality.sharpnessScore < 30) reasons.unshift('Foto desfocada');
    return reasons;
  };
  const isExpenseArchiveReadable = (quality: PageQuality | null | undefined) =>
    Boolean(quality && getExpenseQualityReasons(quality).length === 0);
  const qualityMessage = (quality: PageQuality) => {
    const reasons = getExpenseQualityReasons(quality);
    return `${reasons.join(' · ') || 'Foto sem qualidade suficiente'}. Nitidez ${quality.sharpnessScore}%.`;
  };

  useEffect(() => {
    listSuppliersPage({ pageSize: 500 })
      .then(result => {
        setSupplierNamesByNif(Object.fromEntries(
          result.data
            .filter(supplier => supplier.nif && supplier.name)
            .map(supplier => [String(supplier.nif).replace(/\D/g, ''), supplier.name])
        ));
      })
      .catch(() => undefined);
  }, []);

  const fallbackSupplierName = (supplierNif?: string) =>
    supplierNif ? `Fornecedor NIF ${supplierNif}` : 'Fornecedor por rever';

  const resolveSupplierName = (supplierNif?: string, candidate?: string) => {
    const cleanNif = String(supplierNif || '').replace(/\D/g, '');
    const knownName = cleanNif ? supplierNamesByNif[cleanNif] : '';
    const candidateName = String(candidate || '').trim();
    return candidateName || knownName || fallbackSupplierName(cleanNif);
  };

  const rememberSupplierName = (supplierNif?: string, name?: string) => {
    const cleanNif = String(supplierNif || '').replace(/\D/g, '');
    const cleanName = String(name || '').trim();
    if (!cleanNif || !cleanName || cleanName === fallbackSupplierName(cleanNif)) return;
    setSupplierNamesByNif(prev => ({ ...prev, [cleanNif]: cleanName }));
    setSupplier(cleanName);
  };

  const enrichFromImage = async (dataUrl: string, fallbackNif?: string) => {
    setIsAnalyzingName(true);
    try {
      const data = await processInvoiceImage([dataUrl]);
      if (!data) return;
      setExpenseAiData(data);
      const detectedNif = String(data.supplierNif || '').replace(/\D/g, '');
      const activeNif = detectedNif || fallbackNif || nif || qrDocuments[0]?.supplierNif || '';
      if (data.supplierName) rememberSupplierName(activeNif, data.supplierName);
      if (data.supplierName) setSupplier(data.supplierName);
      if (detectedNif) setNif(detectedNif);
      if (data.invoiceNumber) setDocNumber(data.invoiceNumber);
      if (data.totalInvoiceAmount) setAmount(String(data.totalInvoiceAmount));
    } catch (error) {
      // Nome por IA é uma melhoria; a despesa continua guardável com o QR.
    } finally {
      setIsAnalyzingName(false);
    }
  };

  // ── Camera helpers ──────────────────────────────────────────
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const closeCamera = () => {
    stopCamera();
    setIsCameraOpen(false);
    setIsCameraReady(false);
    setQrDetected(false);
    setCameraError(null);
    setLiveQuality(null);
  };

  const openCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmara não disponível neste browser.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setCameraError('Não foi possível abrir a câmara. Verifique as permissões.');
    }
  };

  // Attach stream to video after camera opens
  useEffect(() => {
    if (!isCameraOpen) return;
    setIsCameraReady(false);
    setQrDetected(false);
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onCanPlay = () => { timer = setTimeout(() => setIsCameraReady(true), 600); };
    video.addEventListener('canplay', onCanPlay);
    video.srcObject = stream;
    video.play().catch(() => {});
    const updateH = () => setViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight || 720));
    updateH();
    window.addEventListener('resize', updateH);
    window.visualViewport?.addEventListener('resize', updateH);
    return () => {
      video.removeEventListener('canplay', onCanPlay);
      if (timer) clearTimeout(timer);
      window.removeEventListener('resize', updateH);
      window.visualViewport?.removeEventListener('resize', updateH);
    };
  }, [isCameraOpen]);

  const applyQr = async (rawText: string) => {
    const parsed = parsePortugueseQrData(rawText);
    setQrDocuments(prev => prev.some(item => item.rawText === parsed.rawText) ? prev : [...prev, parsed]);
    setNif(parsed.supplierNif || '');
    setDocNumber(parsed.documentNumber || '');
    if (parsed.totalAmount) setAmount(String(parsed.totalAmount));
    if (parsed.documentDate) setDate(parsed.documentDate);
    setSupplier(resolveSupplierName(parsed.supplierNif));

    const restNif = String(restaurantProfile?.nif || '').replace(/\D/g, '');
    const buyerNif = String(parsed.customerNif || '').replace(/\D/g, '');
    if (!buyerNif && restNif) {
      setQrNifMismatch(`O QR não tem NIF da empresa. NIF esperado: ${restNif}.`);
    } else if (buyerNif === '999999990') {
      setQrNifMismatch(`Fatura para consumidor final. NIF esperado: ${restNif || 'NIF da empresa'}.`);
    } else if (restNif && buyerNif !== restNif) {
      setQrNifMismatch(`Fatura emitida para NIF ${buyerNif}, mas o restaurante tem NIF ${restNif}.`);
    } else {
      setQrNifMismatch(null);
    }

    const duplicate = await checkInvoiceDuplicate({
      supplierNif: parsed.supplierNif,
      docNumber: parsed.documentNumber,
      totalAmount: parsed.totalAmount,
      dateIssued: parsed.documentDate,
      qrCodeText: parsed.rawText,
      atcud: parsed.atcud
    }).catch(() => null);
    if (duplicate?.duplicate) setDuplicateWarning(duplicate.message || 'Esta fatura já foi registada.');
    else setDuplicateWarning(null);
    return parsed;
  };

  // Live QR + quality scan
  useEffect(() => {
    if (!isCameraReady || !isCameraOpen) return;
    const BDC = (window as any).BarcodeDetector;
    const detector = BDC ? new BDC({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let active = true;
    const scan = async () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          let rawValue: string | undefined;
          if (detector) {
            const codes = await detector.detect(video);
            rawValue = codes[0]?.rawValue;
          }
          if (ctx) {
            const sw = video.videoWidth || 0;
            const sh = video.videoHeight || 0;
            if (sw > 0 && sh > 0) {
              const scanWidth = Math.min(720, sw);
              canvas.width = scanWidth;
              canvas.height = Math.round(scanWidth * (sh / sw));
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              setLiveQuality(analyzeCanvasQuality(canvas));
              rawValue ||= scanQrFromCanvas(canvas);
            }
          }
          if (rawValue && !qrDocuments.some(document => document.rawText === rawValue)) {
            if (!active) return;
            await applyQr(rawValue);
            setQrDetected(true);
          }
        } catch {}
      }
      if (active) setTimeout(scan, 600);
    };
    scan();
    return () => { active = false; };
  }, [isCameraReady, isCameraOpen, qrDocuments, restaurantProfile?.nif]);

  // Capture photo
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !isCameraReady || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const normalized = await normalizeWithoutCrop(rawDataUrl);
    if (qrDocuments.length === 0) { setCameraError('Leia primeiro o QR fiscal da fatura.'); return; }
    if (qrNifMismatch) { setCameraError(qrNifMismatch); return; }
    if (duplicateWarning) { setCameraError(duplicateWarning); return; }
    if (!isExpenseArchiveReadable(normalized.quality)) { setCameraError(qualityMessage(normalized.quality)); return; }
    const archivePage = await cropDetectedDocumentForArchive(rawDataUrl);
    setCapturedImgs(prev => [...prev, archivePage]);
    setCapturedQualities(prev => [...prev, normalized.quality]);
    closeCamera();
    await enrichFromImage(rawDataUrl, qrDocuments[0]?.supplierNif);
  };
  useEffect(() => { captureRef.current = capture; });

  // File upload fallback
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      const normalized = await normalizeWithoutCrop(dataUrl);
      const payloads = await scanQrPayloads([normalized.data]);
      if (!payloads[0]) { setError('Não consegui ler o QR fiscal desta imagem.'); return; }
      await Promise.all(payloads.map(applyQr));
      if (!isExpenseArchiveReadable(normalized.quality)) { setError(qualityMessage(normalized.quality)); return; }
      const archivePage = await cropDetectedDocumentForArchive(dataUrl);
      setCapturedImgs(prev => [...prev, archivePage]);
      setCapturedQualities(prev => [...prev, normalized.quality]);
      await enrichFromImage(dataUrl, parsePortugueseQrData(payloads[0]).supplierNif);
    };
    reader.readAsDataURL(file);
  };

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (capturedImgs.length === 0) { setError('Fotografe a fatura.'); return; }
    if (qrDocuments.length === 0) { setError('Leia o QR fiscal da fatura.'); return; }
    if (qrNifMismatch) { setError(qrNifMismatch); return; }
    if (duplicateWarning) { setError(duplicateWarning); return; }
    setError(null);
    setIsSaving(true);
    try {
      const archiveDocumentIds: string[] = [];
      for (const [index, image] of capturedImgs.entries()) {
        const blob = await (await fetch(`data:image/jpeg;base64,${image}`)).blob();
        const form = new FormData();
        form.append('file', blob, `despesa-${Date.now()}-pag-${index + 1}.jpg`);
        form.append('documentType', 'OUTRO');
        const uploaded = await apiPostForm<{ id: string }>('/api/archive/upload', form);
        archiveDocumentIds.push(uploaded.id);
      }
      for (const [index, qr] of qrDocuments.entries()) {
        await apiPost('/api/invoices', {
          supplierName: resolveSupplierName(qr.supplierNif, qrDocuments.length === 1 ? supplier : supplierNamesByNif[String(qr.supplierNif || '').replace(/\D/g, '')]),
          supplierNif: qr.supplierNif,
          supplierEmail: expenseAiData?.supplierEmail,
          supplierPhone: expenseAiData?.supplierPhone,
          customerNif: qr.customerNif,
          docNumber: qr.documentNumber || `DEP-${Date.now()}-${index + 1}`,
          documentType: qr.documentType,
          totalAmount: Number(qr.totalAmount || 0),
          dateIssued: qr.documentDate || date,
          expenseCategory: undefined,
          notes: qrDocuments.length > 1
            ? `Despesa por classificar - documento composto com ${qrDocuments.length} QR fiscais.`
            : 'Despesa por classificar - pendente de revisão do gerente.',
          archiveDocumentId: archiveDocumentIds[0],
          archiveDocumentIds,
          reuseArchiveDocuments: index > 0,
          atcud: qr.atcud,
          qrCodeText: qr.rawText,
          qrTotalAmount: qr.totalAmount,
          hasQrCode: true,
          hasAtcud: !!qr.atcud,
          imageQualityOk: capturedQualities.every(quality => isExpenseArchiveReadable(quality)),
          totalValidationStatus: 'NAO_VERIFICADO',
          aiUsage: expenseAiData?.aiUsage,
          ocrJson: expenseAiData,
          lines: [],
        });
      }
      setSaved(true);
      setSupplier(''); setNif(''); setDocNumber('');
      setAmount(''); setQrDocuments([]);
      setExpenseAiData(null);
      setCapturedImgs([]);
      setCapturedQualities([]);
      setDuplicateWarning(null);
      setDate(new Date().toISOString().split('T')[0]);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch (e: any) {
      setError(e.message || 'Erro ao registar despesa.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasCaptured = capturedImgs.length > 0;
  const qrReady     = qrDocuments.length > 0;

  // A despesa pode ter várias páginas; só gravamos quando o funcionário concluir o arquivo.

  // ── Camera overlay ─────────────────────────────────────────
  const overlay = isCameraOpen ? createPortal(
    <div style={{ position:'fixed', inset:0, width:'100vw', height:`${viewportHeight}px`, zIndex:2147483647, background:'#020617', overflow:'hidden', touchAction:'none' }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between text-white bg-gradient-to-b from-black/75 to-transparent">
        <div>
          <h4 className="font-black uppercase text-sm">Despesa — Câmara</h4>
          <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
            {(window as any).BarcodeDetector ? 'Aponte o QR Code da fatura' : 'Enquadre e fotografe a fatura'}
          </p>
        </div>
        <button onClick={closeCamera} className="p-3 bg-white/10 hover:bg-white/20 rounded-full"><X size={20} /></button>
      </div>

      {/* Adaptive invoice guide */}
      {isCameraReady && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center px-7 py-28">
          <div className={`w-full ${liveQuality?.isLongReceipt ? 'max-w-[12rem]' : 'max-w-[17.5rem]'} h-full max-h-[62vh] rounded-3xl border-4 border-dashed transition-all duration-300 ${
            liveQuality?.isReadable ? 'border-emerald-400' : 'border-white/60'
          }`} />
        </div>
      )}

      {/* QR brackets */}
      {isCameraReady && (
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          <div className="relative w-64 h-64">
            {(['tl','tr','bl','br'] as const).map(c => (
              <span key={c} className={`absolute w-12 h-12 transition-colors duration-300 ${qrDetected ? 'border-emerald-400' : 'border-white/70'}
                ${c==='tl' ? 'top-0 left-0 border-t-4 border-l-4 rounded-tl-xl' : ''}
                ${c==='tr' ? 'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl' : ''}
                ${c==='bl' ? 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl' : ''}
                ${c==='br' ? 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl' : ''}`} />
            ))}
            <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase ${qrDetected ? 'text-emerald-400' : 'text-white/40'}`}>
              {qrDetected ? '✓ QR OK' : 'QR...'}
            </span>
          </div>
        </div>
      )}

      {/* QR detected banner — red if NIF mismatch */}
      {qrDetected && (
        <div className={`absolute top-20 left-4 right-4 z-10 p-3 rounded-2xl text-white text-[10px] font-black uppercase flex items-center gap-2 ${qrNifMismatch ? 'bg-red-500/95' : 'bg-emerald-500/90'}`}>
          {qrNifMismatch ? <X size={14} /> : <Check size={14} />}
          {qrNifMismatch ? qrNifMismatch : 'QR lido — enquadre a fatura completa e fotografe'}
        </div>
      )}

      {liveQuality && !qrNifMismatch && !duplicateWarning && (
        <div className={`absolute left-4 right-4 z-10 p-3 rounded-2xl text-white text-[10px] font-black uppercase ${
          qrDetected ? 'top-40' : 'top-20'
        } ${isExpenseArchiveReadable(liveQuality) ? 'bg-emerald-500/90' : 'bg-orange-500/95'}`}>
          {isExpenseArchiveReadable(liveQuality)
            ? `Boa para arquivo · ${liveQuality.isLongReceipt ? 'Talão' : 'Documento'} enquadrado · Nitidez ${liveQuality.sharpnessScore}%`
            : `${getExpenseQualityReasons(liveQuality).join(' · ')} · Nitidez ${liveQuality.sharpnessScore}%`}
        </div>
      )}

      {duplicateWarning && (
        <div className="absolute top-20 left-4 right-4 z-10 p-3 rounded-2xl bg-red-500/95 text-white text-[10px] font-black uppercase flex items-center gap-2">
          <X size={14} /> {duplicateWarning}
        </div>
      )}

      {cameraError && <p className="absolute left-4 right-4 bottom-28 z-10 p-3 rounded-2xl bg-red-500/90 text-xs font-bold text-white">{cameraError}</p>}

      {/* Bottom controls */}
      <div className="absolute left-0 right-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3 justify-end bg-gradient-to-t from-black/80 to-transparent">
        <button onClick={closeCamera} className="px-5 py-4 rounded-2xl border border-white/10 text-white/80 font-black uppercase text-xs hover:bg-white/10">Cancelar</button>
        <button
          onClick={() => captureRef.current?.()}
          disabled={!isCameraReady || !(qrDetected || qrReady) || !isExpenseArchiveReadable(liveQuality) || !!qrNifMismatch || !!duplicateWarning}
          className={`flex-1 px-8 py-4 rounded-2xl text-white font-black uppercase text-xs flex items-center justify-center gap-2 shadow-2xl transition-all ${
            !isCameraReady || !(qrDetected || qrReady) || !isExpenseArchiveReadable(liveQuality) || !!qrNifMismatch || !!duplicateWarning ? 'bg-orange-500/40 cursor-not-allowed'
            : qrDetected ? 'bg-emerald-500 hover:bg-emerald-400 scale-105'
            : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          <Camera size={18} />
          {!isCameraReady
            ? 'A preparar…'
            : duplicateWarning
              ? 'Fatura duplicada'
              : !(qrDetected || qrReady)
                ? 'Leia o QR'
                : !isExpenseArchiveReadable(liveQuality)
                  ? 'Ajuste a fatura'
                  : 'Fotografar — QR OK'}
        </button>
      </div>
    </div>,
    document.body
  ) : null;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-32">
      <div>
        <h2 className="text-2xl font-black uppercase italic tracking-tight">Nova Despesa</h2>
        <p className="text-sm text-slate-400 font-bold mt-1">Leia o QR fiscal e fotografe a fatura com qualidade. O gerente classifica depois.</p>
      </div>

      {/* Capture */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento / Recibo</p>

        {hasCaptured ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {capturedImgs.map((image, index) => (
                <div key={index} className="relative rounded-2xl overflow-hidden border border-slate-200 aspect-[3/4] bg-slate-50">
                  <img src={`data:image/jpeg;base64,${image}`} className="w-full h-full object-contain" />
                  <button onClick={() => {
                    setCapturedImgs(prev => prev.filter((_, page) => page !== index));
                    setCapturedQualities(prev => prev.filter((_, page) => page !== index));
                  }} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button onClick={openCamera}
                className="aspect-[3/4] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-orange-300 hover:text-orange-400 transition-all">
                <Camera size={24} />
                <span className="text-[9px] font-black uppercase mt-2">Adicionar página</span>
              </button>
            </div>
            {qrReady && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-xs font-black">
                <QrCode size={16} /> {qrDocuments.length} QR fiscal{qrDocuments.length !== 1 ? 'is' : ''} lido{qrDocuments.length !== 1 ? 's' : ''}
              </div>
            )}
            {isAnalyzingName && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-500 text-xs font-black">
                <RefreshCcw size={16} className="animate-spin" /> A tentar ler o nome do fornecedor por IA…
              </div>
            )}
            {qrNifMismatch && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                <X size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black uppercase">⚠ NIF do Cliente Não Coincide</p>
                  <p className="text-xs font-bold mt-1 opacity-80">{qrNifMismatch}</p>
                </div>
              </div>
            )}
            {duplicateWarning && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                <X size={18} className="shrink-0 mt-0.5" />
                <p className="text-xs font-bold">{duplicateWarning}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={openCamera}
              className="p-6 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-3 text-slate-400 hover:border-orange-300 hover:text-orange-400 transition-all">
              <Camera size={28} />
              <span className="text-[9px] font-black uppercase">Câmara + QR</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="p-6 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center gap-3 text-slate-400 hover:border-orange-300 hover:text-orange-400 transition-all">
              <Upload size={28} />
              <span className="text-[9px] font-black uppercase">Abrir Ficheiro</span>
            </button>
            <input type="file" accept="image/*,application/pdf" className="hidden" ref={fileInputRef} onChange={handleFile} />
          </div>
        )}
      </div>

      {qrReady && (
        <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Dados fiscais do QR</p>
          <div className="mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</p>
            <p className="text-sm font-black text-slate-900 mt-1">{supplier || resolveSupplierName(qrDocuments[0]?.supplierNif)}</p>
            {isAnalyzingName && <p className="text-[10px] font-bold text-slate-400 mt-1">A confirmar nome por IA…</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-600">
            {qrDocuments.map((qr, index) => (
              <React.Fragment key={qr.rawText}>
                <p>QR {index + 1}<br /><span className="font-black text-slate-900">{qr.supplierNif || '-'}</span></p>
                <p>Documento<br /><span className="font-black text-slate-900">{qr.documentNumber || '-'}</span></p>
                <p>Empresa<br /><span className="font-black text-slate-900">{qr.customerNif || '-'}</span></p>
                <p>Total<br /><span className="font-black text-slate-900">€ {Number(qr.totalAmount || 0).toFixed(2)}</span></p>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-600 text-sm font-bold">{error}</div>}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-emerald-700 text-sm font-black flex items-center gap-3">
          <Check size={18} /> Despesa registada com sucesso!
        </div>
      )}

      {isSaving && (
        <div className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm shadow-2xl flex items-center justify-center gap-3">
          <RefreshCcw size={18} className="animate-spin" /> A Registar…
        </div>
      )}
      {hasCaptured && !isSaving && !saved && (
        <button onClick={handleSave}
          className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm shadow-2xl hover:bg-orange-500 transition-all flex items-center justify-center gap-3">
          <Check size={18} /> Concluir arquivo ({capturedImgs.length} {capturedImgs.length === 1 ? 'página' : 'páginas'})
        </button>
      )}

      {overlay}
    </div>
  );
};

export default Expenses;
