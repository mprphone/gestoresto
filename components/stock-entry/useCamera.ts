import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import {
  analyzeCanvasQuality,
  cropDetectedDocumentForArchive,
  normalizeWithoutCrop,
  PageQuality,
  PortugueseQrData,
  scanQrFromCanvas,
  scanQrPayloads
} from './invoiceProcessor';

interface UseCameraArgs {
  pages: string[];
  originalPages: string[];
  qrPayloads: string[];
  qrData: PortugueseQrData | null;
  isDuplicate: boolean;
  suppliersKey: unknown;
  restaurantNif?: string;
  setPages: Dispatch<SetStateAction<string[]>>;
  setOriginalPages: Dispatch<SetStateAction<string[]>>;
  setQrPayloads: Dispatch<SetStateAction<string[]>>;
  setPageQualities: Dispatch<SetStateAction<PageQuality[]>>;
  setNifMismatch: Dispatch<SetStateAction<string | null>>;
  applyQrData: (qrText: string) => PortugueseQrData;
  checkQrDuplicate: (parsed: PortugueseQrData) => Promise<boolean>;
  checkQrBuyerNif: (qr: string | PortugueseQrData) => string | null;
  processAllPages: (currentPages: string[], currentQrPayloads?: string[]) => Promise<void>;
  qualityErrorMessage: (quality: PageQuality) => string;
}

export const useCamera = ({
  pages,
  originalPages,
  qrPayloads,
  qrData,
  isDuplicate,
  suppliersKey,
  restaurantNif,
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
}: UseCameraArgs) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraIsMultiMode, setCameraIsMultiMode] = useState(false);
  const [capturedParts, setCapturedParts] = useState(0);
  const [qrLiveDetected, setQrLiveDetected] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveQrNifError, setLiveQrNifError] = useState<string | null>(null);
  const [livePageQuality, setLivePageQuality] = useState<PageQuality | null>(null);
  const [cameraViewportHeight, setCameraViewportHeight] = useState(720);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
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
    setLivePageQuality(null);
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
    } catch {
      setCameraError('Não consegui abrir a câmara. Confirme as permissões do browser e se está em HTTPS ou localhost.');
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

    const normalized = await normalizeWithoutCrop(rawDataUrl);
    if (!normalized.quality.isReadable) {
      setCameraError(qualityErrorMessage(normalized.quality));
      return;
    }

    const updated = [...pages, normalized.data];
    const archivePage = await cropDetectedDocumentForArchive(rawDataUrl);
    const updatedOriginals = [...originalPages, `data:image/jpeg;base64,${archivePage}`];
    const newQrPayloads = await scanQrPayloads([normalized.data]);
    const updatedQrPayloads = [...qrPayloads, ...newQrPayloads];

    if (updatedQrPayloads.length > 0) {
      const parsedQr = applyQrData(updatedQrPayloads[0]);
      if (await checkQrDuplicate(parsedQr)) {
        setCameraError('Esta fatura já foi registada anteriormente.');
        closeCamera();
        return;
      }
      const nifErr = checkQrBuyerNif(parsedQr);
      setNifMismatch(nifErr);
      if (nifErr) {
        setCameraError(`${nifErr}. Não é possível analisar esta fatura.`);
        return;
      }
    } else {
      setNifMismatch(null);
    }

    setPages(updated);
    setOriginalPages(updatedOriginals);
    setQrPayloads(updatedQrPayloads);
    setPageQualities(prev => [...prev, { ...normalized.quality, hasQrCode: Boolean(newQrPayloads[0]) }]);

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

  const analyzeCameraParts = async () => {
    const currentPages = originalPages.length > 0 ? originalPages : pages;
    const currentQrPayloads = qrPayloads;
    closeCamera();
    await processAllPages(currentPages, currentQrPayloads);
  };

  const resetCameraState = () => {
    setLiveQrNifError(null);
    setLivePageQuality(null);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!isCameraReady || !isCameraOpen) return;
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
          if (ctx) {
            const sw = video.videoWidth || 0;
            const sh = video.videoHeight || 0;
            if (sw > 0 && sh > 0) {
              const scanWidth = Math.min(720, sw);
              canvas.width = scanWidth;
              canvas.height = Math.round(scanWidth * (sh / sw));
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              setLivePageQuality(analyzeCanvasQuality(canvas));
              if (!qrText) qrText = scanQrFromCanvas(canvas) || null;
            }
          }

          if (qrText) {
            const parsedQr = applyQrData(qrText);
            setQrPayloads(prev => prev.includes(qrText) ? prev : [...prev, qrText]);
            if (await checkQrDuplicate(parsedQr)) {
              setCameraError('Esta fatura já foi registada anteriormente.');
              return;
            }
            const nifErr = checkQrBuyerNif(parsedQr);
            if (nifErr) {
              setLiveQrNifError(nifErr);
              setNifMismatch(nifErr);
              if (active) setTimeout(scan, 1200);
              return;
            }
            setLiveQrNifError(null);
            setNifMismatch(null);
            setQrLiveDetected(true);
          }
        } catch {
          // Ignore per-frame errors.
        }
      }
      if (active) setTimeout(scan, 600);
    };

    scan();
    return () => { active = false; };
  }, [isCameraReady, isCameraOpen, suppliersKey, restaurantNif]);

  useEffect(() => {
    if (!isCameraOpen) return;

    setIsCameraReady(false);
    const stream = cameraStreamRef.current;
    const video = videoRef.current;
    if (!video || !stream) return;

    let warmupTimer: ReturnType<typeof setTimeout> | null = null;

    const onCanPlay = () => {
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

  return {
    isCameraOpen,
    isCameraReady,
    cameraIsMultiMode,
    capturedParts,
    qrLiveDetected,
    cameraError,
    liveQrNifError,
    livePageQuality,
    cameraViewportHeight,
    videoRef: videoRef as RefObject<HTMLVideoElement>,
    openCamera,
    closeCamera,
    captureCameraPage,
    analyzeCameraParts,
    resetCameraState,
    overlayProps: {
      videoRef: videoRef as RefObject<HTMLVideoElement>,
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
    }
  };
};
