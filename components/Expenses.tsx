
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Zap, Droplets, Flame, Wifi, Shield, Home, Calculator, MoreHorizontal,
  Camera, Upload, Check, RefreshCcw, X, Euro, QrCode, Pencil
} from 'lucide-react';
import { apiPost, apiPostForm, apiGet } from '../data/apiClient';
import { RestaurantProfile } from '../types';

const CATEGORY_UI: Record<string, { icon: React.ElementType; color: string }> = {
  'Eletricidade':     { icon: Zap,             color: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
  'Água':             { icon: Droplets,        color: 'bg-blue-50 text-blue-600 border-blue-200' },
  'Gás':              { icon: Flame,           color: 'bg-orange-50 text-orange-600 border-orange-200' },
  'Telecomunicações': { icon: Wifi,            color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  'Seguros':          { icon: Shield,          color: 'bg-teal-50 text-teal-600 border-teal-200' },
  'Rendas':           { icon: Home,            color: 'bg-slate-100 text-slate-600 border-slate-200' },
  'Contabilidade':    { icon: Calculator,      color: 'bg-purple-50 text-purple-600 border-purple-200' },
  'Outros':           { icon: MoreHorizontal,  color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

// Parse Portuguese AT QR code fields (A:NIF B:NIF-cliente D:tipo F:data G:nº-doc H:ATCUD O:total)
function parseATQR(text: string) {
  const fields: Record<string, string> = {};
  text.split('*').forEach(part => {
    const colon = part.indexOf(':');
    if (colon > 0) fields[part.slice(0, colon)] = part.slice(colon + 1);
  });
  const rawDate = fields['F'] || '';
  const date = rawDate.length === 8
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : new Date().toISOString().split('T')[0];
  const raw = fields['G'] || '';
  const docNumber = raw.includes(' ') ? raw.split(' ').slice(1).join(' ') : raw;
  return {
    supplierNif: fields['A'] || '',
    customerNif: fields['B'] || '',
    docNumber,
    atcud: fields['H'] || '',
    totalAmount: fields['O'] ? Number(fields['O'].replace(',', '.')) : undefined,
    date,
    hasQrCode: true,
    qrCodeText: text,
  };
}

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
  const captureRef      = useRef<() => void>();

  // Form state
  const [expenseCategories, setExpenseCategories] = useState<{id: string; name: string}[]>([]);
  useEffect(() => {
    apiGet<{data: {id: string; name: string}[]}>('/api/expense-categories')
      .then(r => setExpenseCategories(r.data))
      .catch(() => setExpenseCategories(Object.entries(CATEGORY_UI).map(([id]) => ({ id, name: id }))));
  }, []);

  const [category,    setCategory]    = useState('');
  const [supplier,    setSupplier]    = useState('');
  const [nif,         setNif]         = useState('');
  const [docNumber,   setDocNumber]   = useState('');
  const [amount,      setAmount]      = useState('');
  const [date,        setDate]        = useState(new Date().toISOString().split('T')[0]);
  const [notes,       setNotes]       = useState('');
  const [atcud,       setAtcud]       = useState('');
  const [qrText,      setQrText]      = useState('');
  const [capturedImg, setCapturedImg] = useState<string | null>(null); // base64

  const [isSaving,      setIsSaving]      = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [qrNifMismatch, setQrNifMismatch] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Live QR scan — latch on first detection
  useEffect(() => {
    if (!isCameraReady || !isCameraOpen || qrDetected) return;
    const BDC = (window as any).BarcodeDetector;
    if (!BDC) return;
    const detector = new BDC({ formats: ['qr_code'] });
    let active = true;
    const scan = async () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0]?.rawValue) {
            if (!active) return;
            const parsed = parseATQR(codes[0].rawValue);
            setNif(parsed.supplierNif);
            setDocNumber(parsed.docNumber);
            setAtcud(parsed.atcud);
            setQrText(parsed.qrCodeText);
            if (parsed.totalAmount) setAmount(String(parsed.totalAmount));
            setDate(parsed.date);
            setQrDetected(true);
            // NIF mismatch check
            const restNif = String(restaurantProfile?.nif || '').replace(/\D/g, '');
            const buyerNif = parsed.customerNif.replace(/\D/g, '');
            if (restNif && buyerNif && buyerNif !== restNif) {
              setQrNifMismatch(`Fatura emitida para NIF ${buyerNif}, mas o restaurante tem NIF ${restNif}. Esta fatura pode não ser dedutível.`);
            } else {
              setQrNifMismatch(null);
            }
            return;
          }
        } catch {}
      }
      if (active) setTimeout(scan, 600);
    };
    scan();
    return () => { active = false; };
  }, [isCameraReady, isCameraOpen, qrDetected]);

  // Capture photo
  const capture = () => {
    const video = videoRef.current;
    if (!video || !isCameraReady || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    setCapturedImg(b64);
    closeCamera();
  };
  useEffect(() => { captureRef.current = capture; });

  // File upload fallback
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setCapturedImg(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!category)            { setError('Escolha uma categoria.');            return; }
    if (!supplier.trim())     { setError('Indique o fornecedor / descrição.'); return; }
    if (!amount || Number(amount) <= 0) { setError('Indique um valor válido.'); return; }
    setError(null);
    setIsSaving(true);
    try {
      let archiveDocumentId: string | undefined;
      if (capturedImg) {
        const blob = await (await fetch(`data:image/jpeg;base64,${capturedImg}`)).blob();
        const form = new FormData();
        form.append('file', blob, `despesa-${Date.now()}.jpg`);
        form.append('documentType', 'OUTRO');
        const uploaded = await apiPostForm<{ id: string }>('/api/archive/upload', form);
        archiveDocumentId = uploaded.id;
      }
      await apiPost('/api/invoices', {
        supplierName: supplier.trim(),
        supplierNif: nif.replace(/\D/g, '') || undefined,
        docNumber: docNumber.trim() || `DEP-${Date.now()}`,
        totalAmount: Number(amount),
        dateIssued: date,
        expenseCategory: category,
        notes: notes.trim() || undefined,
        archiveDocumentId,
        atcud: atcud || undefined,
        qrCodeText: qrText || undefined,
        hasQrCode: !!qrText,
        hasAtcud: !!atcud,
        imageQualityOk: !!capturedImg,
        totalValidationStatus: 'NAO_VERIFICADO',
        lines: [],
      });
      setSaved(true);
      setCategory(''); setSupplier(''); setNif(''); setDocNumber('');
      setAmount(''); setNotes(''); setAtcud(''); setQrText('');
      setCapturedImg(null);
      setDate(new Date().toISOString().split('T')[0]);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch (e: any) {
      setError(e.message || 'Erro ao registar despesa.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasCaptured = !!capturedImg;
  const qrReady     = !!qrText;

  // ── Camera overlay ─────────────────────────────────────────
  const overlay = isCameraOpen ? createPortal(
    <div style={{ position:'fixed', inset:0, width:'100vw', height:`${viewportHeight}px`, zIndex:2147483647, background:'#020617', overflow:'hidden', touchAction:'none' }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between text-white bg-gradient-to-b from-black/75 to-transparent">
        <div>
          <h4 className="font-black uppercase text-sm">Despesa — {category || 'Câmara'}</h4>
          <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
            {(window as any).BarcodeDetector ? 'Aponte o QR Code da fatura' : 'Enquadre e fotografe a fatura'}
          </p>
        </div>
        <button onClick={closeCamera} className="p-3 bg-white/10 hover:bg-white/20 rounded-full"><X size={20} /></button>
      </div>

      {/* QR brackets */}
      {isCameraReady && (window as any).BarcodeDetector && (
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

      {cameraError && <p className="absolute left-4 right-4 bottom-28 z-10 p-3 rounded-2xl bg-red-500/90 text-xs font-bold text-white">{cameraError}</p>}

      {/* Bottom controls */}
      <div className="absolute left-0 right-0 bottom-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3 justify-end bg-gradient-to-t from-black/80 to-transparent">
        <button onClick={closeCamera} className="px-5 py-4 rounded-2xl border border-white/10 text-white/80 font-black uppercase text-xs hover:bg-white/10">Cancelar</button>
        <button
          onClick={() => captureRef.current?.()}
          disabled={!isCameraReady}
          className={`flex-1 px-8 py-4 rounded-2xl text-white font-black uppercase text-xs flex items-center justify-center gap-2 shadow-2xl transition-all ${
            !isCameraReady ? 'bg-orange-500/40 cursor-not-allowed'
            : qrDetected ? 'bg-emerald-500 hover:bg-emerald-400 scale-105'
            : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          <Camera size={18} />
          {!isCameraReady ? 'A preparar…' : qrDetected ? 'Fotografar — QR OK' : 'Fotografar'}
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
        <p className="text-sm text-slate-400 font-bold mt-1">Arquivo digital + conta corrente. O QR Code preenche os dados automaticamente.</p>
      </div>

      {/* Step 1 — Category */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1 · Categoria</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {expenseCategories.map(cat => {
            const ui = CATEGORY_UI[cat.id] ?? { icon: MoreHorizontal, color: 'bg-slate-50 text-slate-500 border-slate-200' };
            const Icon = ui.icon;
            const active = category === cat.id;
            return (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all text-center ${active ? ui.color + ' border-current shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                <Icon size={22} />
                <span className="text-[9px] font-black uppercase leading-tight">{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — Capture */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2 · Documento / Recibo</p>

        {hasCaptured ? (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-50">
              <img src={`data:image/jpeg;base64,${capturedImg}`} className="w-full h-full object-contain" />
              <button onClick={() => { setCapturedImg(null); setQrText(''); setNif(''); setDocNumber(''); setAmount(''); setAtcud(''); }}
                className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg">
                <X size={14} />
              </button>
            </div>
            {qrReady && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-700 text-xs font-black">
                <QrCode size={16} /> QR lido · dados preenchidos automaticamente
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

      {/* Step 3 — Details */}
      <div className="bg-white rounded-[2.5rem] p-6 border border-slate-200 shadow-sm space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          3 · Dados
          {qrReady && <span className="text-[9px] text-emerald-600 font-black normal-case">preenchidos via QR</span>}
        </p>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase">Fornecedor / Descrição *</label>
          <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
            placeholder="Ex: EEM, Altice, Seguros Fidelidade…"
            value={supplier} onChange={e => setSupplier(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
              NIF {qrReady && nif && <QrCode size={10} className="text-emerald-500" />}
            </label>
            <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
              placeholder="Opcional" value={nif} onChange={e => setNif(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
              Nº Documento {qrReady && docNumber && <QrCode size={10} className="text-emerald-500" />}
            </label>
            <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
              placeholder="Opcional" value={docNumber} onChange={e => setDocNumber(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
              Valor * {qrReady && amount && <QrCode size={10} className="text-emerald-500" />}
            </label>
            <div className="relative">
              <Euro size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="number" min="0" step="0.01"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-orange-400"
                placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">
              Data {qrReady && <QrCode size={10} className="text-emerald-500" />}
            </label>
            <input type="date"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
              value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] font-black text-slate-400 uppercase">Notas</label>
          <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-orange-400"
            placeholder="Opcional" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-red-600 text-sm font-bold">{error}</div>}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-emerald-700 text-sm font-black flex items-center gap-3">
          <Check size={18} /> Despesa registada com sucesso!
        </div>
      )}

      <button onClick={handleSave} disabled={isSaving}
        className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-sm shadow-2xl hover:bg-orange-500 transition-all disabled:opacity-50 flex items-center justify-center gap-3">
        {isSaving ? <><RefreshCcw size={18} className="animate-spin" /> A Registar…</> : <><Check size={18} /> Registar Despesa</>}
      </button>

      {overlay}
    </div>
  );
};

export default Expenses;
