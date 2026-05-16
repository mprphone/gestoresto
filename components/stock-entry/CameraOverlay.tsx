import React from 'react';
import { Camera, Check, X } from 'lucide-react';
import { PageQuality, PortugueseQrData } from './invoiceProcessor';

interface CameraOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraViewportHeight: number;
  isCameraReady: boolean;
  cameraIsMultiMode: boolean;
  capturedParts: number;
  qrLiveDetected: boolean;
  liveQrNifError: string | null;
  livePageQuality: PageQuality | null;
  qrData: PortugueseQrData | null;
  cameraError: string | null;
  isDuplicate: boolean;
  closeCamera: () => void;
  analyzeCameraParts: () => void | Promise<void>;
  captureCameraPage: () => void | Promise<void>;
}

export const CameraOverlay: React.FC<CameraOverlayProps> = ({
  videoRef,
  cameraViewportHeight,
  isCameraReady,
  cameraIsMultiMode,
  capturedParts,
  qrLiveDetected,
  liveQrNifError,
  livePageQuality,
  qrData,
  cameraError,
  isDuplicate,
  closeCamera,
  analyzeCameraParts,
  captureCameraPage
}) => (
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

    {isCameraReady && (
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center px-4 py-20">
        <div className={`w-full ${livePageQuality?.isLongReceipt ? 'max-w-[16rem]' : 'max-w-[calc(100vw-2rem)]'} h-full max-h-[calc(100vh-10rem)] rounded-3xl border-4 border-dashed transition-all duration-300 ${
          livePageQuality?.isReadable ? 'border-emerald-400' : 'border-white/60'
        }`} />
      </div>
    )}

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

    {livePageQuality && !liveQrNifError && (
      <div className={`absolute left-4 right-4 z-20 p-3 rounded-2xl text-white text-[10px] font-black uppercase ${
        qrLiveDetected ? 'top-40' : 'top-20'
      } ${livePageQuality.isReadable ? 'bg-emerald-500/95' : 'bg-orange-500/95'}`}>
        {livePageQuality.isReadable
          ? `Boa para arquivo · ${livePageQuality.isLongReceipt ? 'Talão' : 'Documento'} enquadrado · Nitidez ${livePageQuality.sharpnessScore}%`
          : `${livePageQuality.qualityReasons.join(' · ')} · Nitidez ${livePageQuality.sharpnessScore}%`}
      </div>
    )}

    {cameraIsMultiMode && capturedParts > 0 && !qrLiveDetected && (
      <div className="absolute top-20 left-4 right-4 z-10 p-3 rounded-2xl bg-emerald-500/90 text-white text-[10px] font-black uppercase flex items-center gap-2">
        <Check size={14} /> {capturedParts === 1 ? '1 parte capturada' : `${capturedParts} partes capturadas`} — enquadre a parte seguinte e fotografe
      </div>
    )}

    {cameraError && <p className="absolute left-4 right-4 bottom-28 z-10 p-3 rounded-2xl bg-red-500/90 text-xs font-bold text-white">{cameraError}</p>}

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
        disabled={!isCameraReady || !livePageQuality?.isReadable || !!liveQrNifError || isDuplicate}
        className={`flex-1 sm:flex-none px-8 py-4 rounded-2xl text-white font-black uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-2xl ${
          !isCameraReady || !livePageQuality?.isReadable || !!liveQrNifError || isDuplicate ? 'bg-orange-500/40 cursor-not-allowed'
          : qrLiveDetected ? 'bg-emerald-500 hover:bg-emerald-400 scale-105'
          : 'bg-orange-500 hover:bg-orange-600'
        }`}
      >
        <Camera size={18} />
        {!isCameraReady
          ? 'A preparar…'
          : isDuplicate
            ? 'Fatura duplicada'
          : !livePageQuality?.isReadable
            ? 'Ajuste a fatura'
            : qrLiveDetected
              ? 'Capturar — QR OK'
              : cameraIsMultiMode
                ? `Fotografar Parte ${capturedParts + 1}`
                : 'Fotografar'}
      </button>
    </div>
  </div>
);
