import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Sparkles, Cpu, ChevronRight, Wand2, RefreshCw, Eye, Plus, Files } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { createSearchablePdf, createMultiPagePdf, warpPerspective, detectDocumentEdges, QuadPoints, DEFAULT_SCANNED_OCR_TEXT, CroppedImageResult } from '../../utils/scannerPdf';
import { getPdfStorageKey, savePdfBlob } from '../../utils/pdfStorage';
import { Case, User, DocumentItem } from '../../utils/types';
import { useDocumentDetection } from '../../hooks/useDocumentDetection';
import { uploadPdfToSupabase, saveDocumentRecord, saveCaseRecord } from '../../utils/supabaseClient';

interface OcrScannerProps {
  currentUser: User;
  onOcrComplete: (newCase: Case, newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

type FilterType = 'original' | 'lighten' | 'magic' | 'bw' | 'grayscale';

export const enhanceImage = (
  imgSrc: string,
  filter: 'original' | 'magic' | 'bw' | 'grayscale' | 'lighten',
  brightness = 1.0,
  contrast = 1.0
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imgSrc);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const w = canvas.width;
      const h = canvas.height;
      const N = w * h;

      if (filter === 'original') {
        // Apply an effective white-balance shift to neutralize the warm/yellowish color cast 
        // captured from camera sensors under warm lighting, matching the user's perception of a white page.
        let rSum = 0, gSum = 0, bSum = 0;
        const sampleStep = Math.max(1, (N / 500) | 0);
        let samples = 0;
        for (let i = 0; i < N; i += sampleStep) {
          rSum += data[i * 4];
          gSum += data[i * 4 + 1];
          bSum += data[i * 4 + 2];
          samples++;
        }
        const rAvg = rSum / samples;
        const gAvg = gSum / samples;
        const bAvg = bSum / samples;

        // If there is any warm/yellowish cast (R and G are higher than B)
        if (rAvg > bAvg + 4 && gAvg > bAvg + 2) {
          const avgL = (rAvg + gAvg + bAvg) / 3;
          const rCorr = avgL / rAvg;
          const gCorr = avgL / gAvg;
          const bCorr = avgL / bAvg;

          // Blend 92% of the correction to completely neutralize the yellow paper background
          const blend = 0.92;
          const rScale = 1.0 + (rCorr - 1.0) * blend;
          const gScale = 1.0 + (gCorr - 1.0) * blend;
          const bScale = 1.0 + (bCorr - 1.0) * blend;

          for (let i = 0; i < N; i++) {
            data[i * 4] = Math.min(255, data[i * 4] * rScale);
            data[i * 4 + 1] = Math.min(255, data[i * 4 + 1] * gScale);
            data[i * 4 + 2] = Math.min(255, data[i * 4 + 2] * bScale);
          }
          ctx.putImageData(imgData, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 1.0));
          return;
        }

        resolve(imgSrc);
        return;
      }


      if (filter === 'grayscale') {
        for (let i = 0; i < N; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          data[i * 4] = gray;
          data[i * 4 + 1] = gray;
          data[i * 4 + 2] = gray;
        }
      }

      if (filter === 'bw') {
        // 1. Calculate luminance
        const lum = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        }

        // 2. Compute integral image of luminance
        const integral = new Uint32Array(N);
        for (let y = 0; y < h; y++) {
          let rowSum = 0;
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            rowSum += lum[idx];
            integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0);
          }
        }

        // 3. Local adaptive thresholding (B&W Bradley-Roth)
        const S = Math.max(16, (w / 16) | 0);
        const S2 = S >> 1;
        const T = 0.85; 

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const x1 = Math.max(0, x - S2);
            const x2 = Math.min(w - 1, x + S2);
            const y1 = Math.max(0, y - S2);
            const y2 = Math.min(h - 1, y + S2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            const sum = integral[y2 * w + x2]
                      - (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0)
                      - (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0)
                      + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);

            const avg = sum / count;
            const L = lum[idx];

            const val = L < avg * T ? 0 : 255;
            data[idx * 4] = val;
            data[idx * 4 + 1] = val;
            data[idx * 4 + 2] = val;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 1.0));
        return;
      }

      if (filter === 'magic') {
        // 1. Calculate luminance
        const lum = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        }

        // 2. Compute integral image of luminance
        const integral = new Uint32Array(N);
        for (let y = 0; y < h; y++) {
          let rowSum = 0;
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            rowSum += lum[idx];
            integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0);
          }
        }

        // 3. Local adaptive gain filter (Bradley-Roth style enhancement)
        const S = Math.max(16, (w / 16) | 0);
        const S2 = S >> 1;
        const C = 12 * brightness; // Slightly increased for better cleaning
        const exponent = 2.4 * contrast; // Steeper contrast for crisper text

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const x1 = Math.max(0, x - S2);
            const x2 = Math.min(w - 1, x + S2);
            const y1 = Math.max(0, y - S2);
            const y2 = Math.min(h - 1, y + S2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            const sum = integral[y2 * w + x2]
                      - (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0)
                      - (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0)
                      + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);

            const avg = sum / count;
            const L = lum[idx];

            let r = data[idx * 4];
            let g = data[idx * 4 + 1];
            let b = data[idx * 4 + 2];

            const maxVal = Math.max(r, g, b);
            const minVal = Math.min(r, g, b);
            const chroma = maxVal - minVal;

            // Detect warm/yellow white-balance cast on paper
            const isWarmCast = chroma < 65 && r > b && g > b;
            // Classify as color only if it has high chroma and is NOT just paper yellowing
            const isColor = chroma > 30 && !isWarmCast;

            // Aggressive whitening of background (especially if L is bright or it is warm cast paper)
            if (L >= avg - C && (!isColor || L > 200)) {
              // Whitening factor increases with brightness and warm cast detection
              const diff = L - (avg - C);
              const factor = L > 200 || isWarmCast ? 1.0 : Math.min(1.0, diff / 5);
              r = Math.round(r + (255 - r) * factor);
              g = Math.round(g + (255 - g) * factor);
              b = Math.round(b + (255 - b) * factor);
            } else {
              // Enhance color and contrast (Magic Color)
              const normFactor = 255 / Math.max(1, avg);
              const r_norm = Math.min(255, r * normFactor);
              const g_norm = Math.min(255, g * normFactor);
              const b_norm = Math.min(255, b * normFactor);

              const L_norm = 0.299 * r_norm + 0.587 * g_norm + 0.114 * b_norm;

              // Boost saturation of real colors
              const satFactor = isColor ? 2.2 : 1.0;
              const r_sat = L_norm + (r_norm - L_norm) * satFactor;
              const g_sat = L_norm + (g_norm - L_norm) * satFactor;
              const b_sat = L_norm + (b_norm - L_norm) * satFactor;

              // Darken text component
              const ratio = L / Math.max(1, avg);
              const enhancedRatio = Math.pow(ratio, exponent);

              const colorWeight = isColor ? (maxVal / 255) : 0;
              const finalRatio = enhancedRatio * (1 - colorWeight) + colorWeight;

              r = Math.min(255, Math.max(0, r_sat * finalRatio));
              g = Math.min(255, Math.max(0, g_sat * finalRatio));
              b = Math.min(255, Math.max(0, b_sat * finalRatio));
            }

            data[idx * 4] = r;
            data[idx * 4 + 1] = g;
            data[idx * 4 + 2] = b;
          }
        }

        // 4. Smooth Sharpening (9-point kernel optimized with unrolled loops & no inner boundary checks)
        const output = new Uint8ClampedArray(data.length);
        
        // Copy border pixels directly to output
        for (let x = 0; x < w; x++) {
          const topIdx = x * 4;
          const botIdx = ((h - 1) * w + x) * 4;
          for (let c = 0; c < 4; c++) {
            output[topIdx + c] = data[topIdx + c];
            output[botIdx + c] = data[botIdx + c];
          }
        }
        for (let y = 0; y < h; y++) {
          const leftIdx = y * w * 4;
          const rightIdx = (y * w + w - 1) * 4;
          for (let c = 0; c < 4; c++) {
            output[leftIdx + c] = data[leftIdx + c];
            output[rightIdx + c] = data[rightIdx + c];
          }
        }

        // Inner pixels
        const w4 = w * 4;
        for (let y = 1; y < h - 1; y++) {
          const rowStart = y * w4;
          for (let x = 1; x < w - 1; x++) {
            const idx = rowStart + x * 4;
            
            const idx_tl = idx - w4 - 4;
            const idx_t  = idx - w4;
            const idx_tr = idx - w4 + 4;
            const idx_l  = idx - 4;
            const idx_r  = idx + 4;
            const idx_bl = idx + w4 - 4;
            const idx_b  = idx + w4;
            const idx_br = idx + w4 + 4;

            for (let c = 0; c < 3; c++) {
              const sum = 
                (data[idx_tl + c] + data[idx_tr + c] + data[idx_bl + c] + data[idx_br + c]) * -0.1 +
                (data[idx_t + c] + data[idx_l + c] + data[idx_r + c] + data[idx_b + c]) * -0.2 +
                data[idx + c] * 2.2;
              
              output[idx + c] = sum < 0 ? 0 : (sum > 255 ? 255 : sum);
            }
            output[idx + 3] = data[idx + 3];
          }
        }

        ctx.putImageData(new ImageData(output, w, h), 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 1.0));
        return;
      }

      if (filter === 'lighten') {
        // 1. Calculate luminance
        const lum = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        }

        // 2. Compute integral image of luminance
        const integral = new Uint32Array(N);
        for (let y = 0; y < h; y++) {
          let rowSum = 0;
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            rowSum += lum[idx];
            integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0);
          }
        }

        // 3. Adaptive background whitening with color preservation
        const S = Math.max(16, (w / 16) | 0);
        const S2 = S >> 1;
        const C = 15 * brightness; // Higher margin for aggressive background whitening

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const x1 = Math.max(0, x - S2);
            const x2 = Math.min(w - 1, x + S2);
            const y1 = Math.max(0, y - S2);
            const y2 = Math.min(h - 1, y + S2);
            const count = (x2 - x1 + 1) * (y2 - y1 + 1);

            const sum = integral[y2 * w + x2]
                      - (x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0)
                      - (y1 > 0 ? integral[(y1 - 1) * w + x2] : 0)
                      + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0);

            const avg = sum / count;
            const L = lum[idx];

            let r = data[idx * 4];
            let g = data[idx * 4 + 1];
            let b = data[idx * 4 + 2];

            const maxVal = Math.max(r, g, b);
            const minVal = Math.min(r, g, b);
            const chroma = maxVal - minVal;
            const isWarmCast = chroma < 65 && r > b && g > b;

            if (L >= avg - C || L > 195 || isWarmCast) {
              // Smooth transition to pure white
              const diff = L - (avg - C);
              const factor = L > 195 || isWarmCast ? 1.0 : Math.min(1.0, diff / 8);
              r = Math.round(r + (255 - r) * factor);
              g = Math.round(g + (255 - g) * factor);
              b = Math.round(b + (255 - b) * factor);
            } else {
              // Slightly lighten and enhance contrast of the text/ink
              const factor = 1.15;
              r = Math.min(255, r * factor);
              g = Math.min(255, g * factor);
              b = Math.min(255, b * factor);
            }

            data[idx * 4] = r;
            data[idx * 4 + 1] = g;
            data[idx * 4 + 2] = b;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 1.0));
    };
    img.src = imgSrc;
  });
};

export const OcrScanner: React.FC<OcrScannerProps> = ({ currentUser, onOcrComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'preview-full' | 'aligning' | 'decide' | 'beautify' | 'ocr-processing' | 'ocr-confirm'>('capture');
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scanPhase, setScanPhase] = useState<'idle' | 'captured' | 'cropping' | 'scanning' | 'enhancing' | 'done'>('idle');
  const capturedRawRef = useRef<string | null>(null);
  const [scannerMsg, setScannerMsg] = useState('Apunta la cámara al escrito judicial...');
  const [alignProgress, setAlignProgress] = useState(0);

  // SVG Edge coordinates driven by real detection
  const [edgePoints, setEdgePoints] = useState<QuadPoints>({
    p1: { x: 15, y: 10 },
    p2: { x: 85, y: 10 },
    p3: { x: 83, y: 90 },
    p4: { x: 17, y: 90 }
  });
  const [sheetDetected, setSheetDetected] = useState(false);
  const [detectionConfidence, setDetectionConfidence] = useState(0);

  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const magicBrightness = 1.18;
  const magicContrast = 1.35;
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [scanMode, setScanMode] = useState<'individual' | 'lote'>('individual');

  useEffect(() => {
    // Reset zoom when switching filters or images
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });

    if (capturedImage) {
      setIsEnhancing(true);
      enhanceImage(capturedImage, activeFilter, magicBrightness, magicContrast)
        .then((url) => {
          setProcessedImage(url);
          setIsEnhancing(false);
        })
        .catch((err) => {
          console.error("Enhancement failed:", err);
          setIsEnhancing(false);
        });
    } else {
      setProcessedImage(null);
    }
  }, [capturedImage, activeFilter, magicBrightness, magicContrast]);

  // Multi-page: accumulated processed pages (filtered data URLs + dimensions)
  const [scannedPages, setScannedPages] = useState<CroppedImageResult[]>([]);
  const [finalPdfUrl, setFinalPdfUrl] = useState<string | null>(null);

  // Zoom and pan states for high-res preview
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1);
  const isPinchModeRef = useRef(false);

  // Drag corners state
  const [activeCorner, setActiveCorner] = useState<'p1' | 'p2' | 'p3' | 'p4' | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const [magnifier, setMagnifier] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const updateImageSize = useCallback(() => {
    if (previewImageRef.current) {
      const rect = previewImageRef.current.getBoundingClientRect();
      setImageSize({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    if (step === 'preview-full' && originalImage) {
      const timer = setTimeout(updateImageSize, 100);
      window.addEventListener('resize', updateImageSize);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateImageSize);
      };
    }
  }, [step, originalImage, updateImageSize]);

  // OCR processing states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('Iniciando OCR...');

  // Extracted Metadata Form - editable by user after OCR
  const [workerName, setWorkerName] = useState('Juan Pablo Martínez Díaz');
  const [claimAmount, setClaimAmount] = useState('18,500,000 CLP');
  const [court, setCourt] = useState('1° Juzgado de Letras del Trabajo de Santiago');
  const [judge, setJudge] = useState('Dra. Eliana Rodríguez');
  const [description, setDescription] = useState(
    'Demanda laboral de tutela laboral por vulneración de derechos fundamentales con ocasión del despido injustificado e indemnización de perjuicios. Se reclaman recargos legales y años de servicio.'
  );
  const [fileName, setFileName] = useState('Documento_Escaneado.pdf');

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    startCamera();

    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('touchstart', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });

    return () => {
      stopCamera();
      document.removeEventListener('touchstart', preventZoom);
      document.removeEventListener('touchmove', preventZoom);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
    };
  }, []);

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 3072 } }
      });
      setCameraStream(stream);
      setHasCamera(true);
      setScannerMsg('Encuadre el documento...');
    } catch (err) {
      console.warn('Camera failed, using fallback/upload mode.', err);
      setHasCamera(false);
      setScannerMsg('Cámara no disponible. Sube un archivo de imagen.');
    }
  };

  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  // Real-time document detection via useDocumentDetection hook
  useDocumentDetection({
    videoRef,
    active: step === 'capture' && hasCamera,
    onDetection: (quad, confidence) => {
      setEdgePoints(quad);
      setDetectionConfidence(confidence);
      const detected = confidence > 0.34;
      setSheetDetected(detected);

      if (detected) {
        setScannerMsg('Pagina detectada - listo para capturar');
      } else {
        setScannerMsg('Alinea una pagina dentro del marco');
      }
    }
  });

  // Alignment process: warp immediately → show cropped doc → laser sweep → reveal action bar
  const processAlignment = async (imgDataUrl: string, quad: QuadPoints) => {
    setAlignProgress(15);
    setScanPhase('cropping');
    try {
      // 1. Let the crop & lift animation play for 1.2s
      setTimeout(async () => {
        try {
          const warped = await warpPerspective(imgDataUrl, quad, 2000, 2800);
          setCapturedImage(warped.dataUrl);
          setAlignProgress(70);
          setScanPhase('scanning');

          // 2. Let the laser sweep run for 1.5s
          setTimeout(() => {
            setAlignProgress(100);
            setScanPhase('done');
          }, 1500);
        } catch (innerErr) {
          console.error('Perspective warp failed inside timeout:', innerErr);
          setCapturedImage(imgDataUrl);
          setScanPhase('done');
        }
      }, 1200);
    } catch (err) {
      console.error('Perspective warp outer failed:', err);
      setCapturedImage(imgDataUrl);
      setScanPhase('done');
    }
  };

  // Capturing photo — grey flash → capture raw frame → start aligning animation
  const capturePhoto = () => {
    // Trigger grey shutter flash
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 350);

    if (hasCamera && videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
        capturedRawRef.current = dataUrl; // store raw immediately for display
        setOriginalImage(dataUrl);

        // Short delay so grey flash is visible, then transition to aligning
        setScanPhase('captured');
        setTimeout(() => {
          setStep('aligning');
          stopCamera();
          processAlignment(dataUrl, edgePoints);
        }, 300);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUrl = event.target.result as string;
          setOriginalImage(dataUrl);
          stopCamera();

          const tempImg = new Image();
          tempImg.onload = () => {
            const detectedQuad = detectDocumentEdges(tempImg);
            setEdgePoints(detectedQuad);
            // Immediately start perspective warp and align transition!
            setStep('aligning');
            processAlignment(dataUrl, detectedQuad);
          };
          tempImg.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    }
  };



  const updateCropPoint = (clientX: number, clientY: number, corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    if (!previewImageRef.current) return;

    const rect = previewImageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((clientX - rect.left) / rect.width) * 100), 100);
    const y = Math.min(Math.max(0, ((clientY - rect.top) / rect.height) * 100), 100);

    setMagnifier({ x, y, width: rect.width, height: rect.height });
    setEdgePoints((prev) => ({
      ...prev,
      [corner]: { x, y }
    }));
  };

  // Drag Corners event handlers
  const handleCornerMouseDown = (e: React.MouseEvent, corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(corner);
    updateCropPoint(e.clientX, e.clientY, corner);
  };

  const handleCornerTouchStart = (e: React.TouchEvent, corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    setActiveCorner(corner);
    if (touch) updateCropPoint(touch.clientX, touch.clientY, corner);
  };

  const handleCornerMouseMove = (e: React.MouseEvent) => {
    if (!activeCorner) return;
    e.preventDefault();
    updateCropPoint(e.clientX, e.clientY, activeCorner);
  };

  const handleCornerTouchMove = (e: React.TouchEvent) => {
    if (!activeCorner) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    updateCropPoint(touch.clientX, touch.clientY, activeCorner);
  };
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setActiveCorner(null);
      setMagnifier(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    window.addEventListener('touchcancel', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      window.removeEventListener('touchcancel', handleGlobalMouseUp);
    };
  }, []);

  // Run Tesseract OCR and parse results
  const runRealOcr = async (imageSrc: string) => {
    setStep('ocr-processing');
    setOcrProgress(5);
    setOcrStatus('Cargando motor de reconocimiento de texto...');

    try {
      const result = await Tesseract.recognize(imageSrc, 'spa', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(10 + m.progress * 85);
            setOcrProgress(pct);
            setOcrStatus(
              pct < 30 ? 'Segmentando bloques de texto...' :
              pct < 60 ? 'Reconociendo caracteres (OCR en progreso)...' :
              pct < 90 ? 'Analizando estructura del documento...' :
              'Finalizando extracción de texto...'
            );
          }
        }
      });

      const rawText = result.data.text;
      setOcrProgress(100);
      setOcrStatus('Texto extraído correctamente.');

      // Initialize default values for the parsed results
      let parsedName = '';
      let parsedAmount = 'Por determinar';
      let parsedCourt = '1° Juzgado de Letras del Trabajo';
      let parsedJudge = 'Por designar';
      let parsedDesc = rawText.substring(0, 250).trim() || 'Sin texto extraído en el escaneo';

      // Advanced parser
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      const nameMatch = rawText.match(/(?:demandante|trabajador|contrade|persona|don|doña)[:\s]+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,40})/i);
      if (nameMatch && nameMatch[1]) {
        parsedName = nameMatch[1].trim();
      } else {
        const nameLine = lines.find(l => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/.test(l));
        if (nameLine) parsedName = nameLine;
      }

      const amountMatch = rawText.match(/(\d+[\d\.,]*\s*(?:CLP|\$|pesos))/i) || rawText.match(/(\$\s*\d+[\d\.,]*)/i);
      if (amountMatch) {
        parsedAmount = amountMatch[1].trim();
      }

      const courtMatch = rawText.match(/(?:juzgado|tribunal|corte)[^\n]{0,50}/i);
      if (courtMatch) {
        parsedCourt = courtMatch[0].trim();
      }

      setWorkerName(parsedName || 'Trabajador Detectado');
      setClaimAmount(amountMatch ? parsedAmount : '18,500,000 CLP'); // Fallback to realistic value if parsing fails
      setCourt(parsedCourt || '1° Juzgado de Letras del Trabajo de Santiago');
      setJudge(parsedJudge || 'Dra. Eliana Rodríguez');
      setDescription(parsedDesc);

      setTimeout(() => setStep('ocr-confirm'), 500);
    } catch (err) {
      console.error('Tesseract OCR error:', err);
      setWorkerName('Demanda Escaneada');
      setClaimAmount('Por determinar');
      setCourt('Juzgado del Trabajo');
      setJudge('Por designar');
      setDescription('No se pudo procesar el texto automáticamente. Ingrese descripción.');
      setOcrStatus('Error en OCR. Puedes editar los campos manualmente.');
      setTimeout(() => setStep('ocr-confirm'), 1200);
    }
  };

  const startOcrProcessing = async () => {
    const sourceImage = scannedPages.length > 0 ? scannedPages[0].dataUrl : capturedImage;
    if (!sourceImage) return;
    try {
      setStep('ocr-processing');
      setOcrProgress(2);
      setOcrStatus('Preparando imagen...');
      // Pages are already filtered — use directly
      await runRealOcr(sourceImage);
    } catch (err) {
      console.error('Error preparing image for OCR:', err);
      await runRealOcr(sourceImage);
    }
  };

  const handleFinalSubmit = async () => {
    if (scannedPages.length === 0) return;

    const ocrText = [
      'Trabajador demandante: ' + workerName,
      'Cuantia estimada: ' + claimAmount,
      'Tribunal asignado: ' + court,
      'Juez a cargo: ' + judge,
      'Resumen: ' + description,
      'Documento procesado con OCR real (Tesseract.js) en Legium.'
    ].join('\n');

    try {
      // Build multi-page PDF from all scanned pages
      const pdfBlob = createMultiPagePdf(scannedPages, ocrText);
      const sizeKB = (pdfBlob.size / 1024).toFixed(1);

      const docId = 'doc-' + Date.now();
      const uploadDate = new Date().toISOString().split('T')[0];
      const caseId = 'LEG-2026-' + Math.floor(100 + Math.random() * 900);

      // 1. Persist PDF locally
      await savePdfBlob(docId, pdfBlob);

      // 2. Upload to InsForge Storage
      const pdfUrl = await uploadPdfToSupabase(docId, pdfBlob, caseId);
      if (pdfUrl) setFinalPdfUrl(pdfUrl);

      const newDoc: DocumentItem = {
        id: docId,
        name: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
        size: sizeKB + ' KB',
        uploadDate,
        ocrText,
        storageKey: caseId => caseId + '/' + docId + '.pdf'
      };

      const newCase: Case = {
        id: caseId,
        title: (workerName.trim() ? workerName : 'Trabajador') + ' vs. Constructora Alfa',
        clientId: currentUser.clientId || 'cli-01',
        clientName: 'Constructora Alfa S.A.',
        opposingParty: workerName,
        opposingLawyer: 'Estudio Patrocinante Gómez & Asociados',
        practiceArea: 'Laboral',
        status: 'Activo',
        court: court,
        judge: judge,
        assignedLawyerId: 'usr-03',
        assignedLawyerName: 'Lic. Mateo Ríos',
        startDate: uploadDate,
        description: description,
        timeline: [{
          date: uploadDate,
          title: 'Ingreso por Portal Cliente (OCR Real)',
          desc: 'Escaneado con cámara real. OCR con Tesseract.js. PDF guardado ' + (pdfUrl ? 'en InsForge Storage' : 'localmente') + '.',
          completed: true
        }],
        tasks: [{
          id: 'tsk-' + Date.now().toString().slice(-4),
          title: 'Revisar y contestar demanda laboral',
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          assignedTo: 'usr-03',
          completed: false
        }],
        notes: [{
          id: 'nt-' + Date.now(),
          date: uploadDate + ' ' + new Date().toTimeString().slice(0, 5),
          author: 'OCR Real (Tesseract.js)',
          text: 'Texto extraído automáticamente del documento. Cuantía: ' + claimAmount + '. Tribunal: ' + court + '.'
        }],
        documents: [newDoc]
      };

      // 3. Save case & document record to InsForge Database
      await saveCaseRecord(newCase);
      await saveDocumentRecord({
        id: docId,
        caseId,
        name: newDoc.name,
        sizeKb: parseFloat(sizeKB),
        uploadDate,
        ocrText,
        pdfUrl,
      });

      onOcrComplete(newCase, newDoc, pdfBlob);
    } catch (err) {
      console.error('Error generating OCR PDF:', err);
    }
  };

  const handleImageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomScale > 1) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoomScale(3.0);
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left - rect.width / 2;
      const clickY = e.clientY - rect.top - rect.height / 2;
      setPanOffset({ x: -clickX * 2.0, y: -clickY * 2.0 });
    }
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if ('touches' in e) {
      if (e.touches.length === 2) {
        setIsPanning(false);
        isPinchModeRef.current = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDistRef.current = Math.hypot(dx, dy);
        touchStartScaleRef.current = zoomScale;
        return;
      }
      if (e.touches.length === 1 && isPinchModeRef.current) {
        return;
      }
    }

    if (zoomScale === 1) return;
    setIsPanning(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    panStartRef.current = { x: clientX - panOffset.x, y: clientY - panOffset.y };
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if ('touches' in e) {
      if (e.touches.length === 2 && touchStartDistRef.current !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        
        if (Math.abs(dist - touchStartDistRef.current) > 3) {
          const scale = touchStartScaleRef.current * (dist / touchStartDistRef.current);
          const clampedScale = Math.max(1.0, Math.min(4.0, scale));
          setZoomScale(clampedScale);
          if (clampedScale === 1.0) {
            setPanOffset({ x: 0, y: 0 });
          }
        }
        return;
      }
      if (e.touches.length > 1 || isPinchModeRef.current) {
        return;
      }
    }

    if (!isPanning || zoomScale === 1) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPanOffset({
      x: clientX - panStartRef.current.x,
      y: clientY - panStartRef.current.y
    });
  };

  const handlePointerUp = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if ('touches' in e) {
      if (e.touches.length === 0) {
        setIsPanning(false);
        isPinchModeRef.current = false;
        touchStartDistRef.current = null;
      }
    } else {
      setIsPanning(false);
    }
  };

  const p1 = edgePoints.p1;
  const p2 = edgePoints.p2;
  const p3 = edgePoints.p3;
  const p4 = edgePoints.p4;

  const getMidpointProps = (pt1: typeof p1, pt2: typeof p1) => {
    const mx = (pt1.x + pt2.x) / 2;
    const my = (pt1.y + pt2.y) / 2;
    const angle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x) * (180 / Math.PI);
    return { mx, my, angle };
  };

  const mid1 = getMidpointProps(p1, p2);
  const mid2 = getMidpointProps(p2, p3);
  const mid3 = getMidpointProps(p3, p4);
  const mid4 = getMidpointProps(p4, p1);

  return (
    <div className="scanner-container" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', background: '#000', padding: 0, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes shutterFlash {
          0% { opacity: 0; }
          15% { opacity: 0.85; background-color: #666; }
          100% { opacity: 0; }
        }
        @keyframes liftSheet {
          0% {
            transform: scale(1) translate(0, 0);
            filter: drop-shadow(0 0 0 rgba(0,0,0,0));
          }
          100% {
            transform: scale(1.04) translate(0, -8px);
            filter: drop-shadow(0 20px 40px rgba(0,0,0,0.65));
          }
        }
        @keyframes fadeOutBackground {
          0% { opacity: 1; filter: blur(0px); }
          100% { opacity: 0.25; filter: blur(15px); }
        }
        @keyframes fadeOutLine {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.01); }
        }
      `}</style>

      {/* Hidden SVG filter definitions — legium-sharpen used by 'magic' filter */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          <filter id="legium-sharpen" x="0" y="0" width="100%" height="100%" color-interpolation-filters="linearRGB">
            {/* Unsharp mask: feConvolveMatrix with sharpening kernel 0,-1,0,-1,5,-1,0,-1,0 */}
            <feConvolveMatrix
              order="3"
              kernelMatrix="0 -1 0 -1 5 -1 0 -1 0"
              divisor="1"
              bias="0"
              preserveAlpha="true"
            />
          </filter>
        </defs>
      </svg>

      {/* Top Bar for camera */}
      {step === 'capture' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '16px 20px', color: '#fff', alignItems: 'center', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)', height: '54px', zIndex: 10 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', outline: 'none' }}>
            <X size={24} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <span style={{ fontSize: '20px', cursor: 'pointer' }}>⚡</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ border: '1.5px solid #fff', borderRadius: '4px', padding: '1px 6px', fontSize: '9px', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>HD</span>
              <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '6px', height: '6px', backgroundColor: '#ff3b30', borderRadius: '50%' }} />
            </div>
            <span style={{ fontSize: '20px', cursor: 'pointer', opacity: 0.9 }}>👥</span>
            <span style={{ fontSize: '20px', cursor: 'pointer', opacity: 0.9 }}>•••</span>
          </div>
        </div>
      )}

      {step === 'capture' && (
        <>
          <div className="camera-preview-wrapper" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000', zIndex: 1 }}>
            {hasCamera ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  zIndex: 2
                }}
              />
            ) : (
              <div 
                style={{ 
                  position: 'absolute', 
                  inset: 0, 
                  background: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '24px',
                  color: 'var(--text-secondary)',
                  zIndex: 2
                }}
              >
                <Upload size={48} style={{ color: '#00ff80', marginBottom: '12px' }} />
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#fff', textAlign: 'center' }}>
                  Escáner de Escritos Judiciales
                </p>
                <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                  Cámara no disponible. Sube una foto de tu documento para ajustar sus esquinas y recortarlo.
                </p>
              </div>
            )}

            {/* ── SVG Perspective Quad Overlay ── */}
            {hasCamera && (
              <svg
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '100%',
                  pointerEvents: 'none', zIndex: 4,
                  overflow: 'visible',
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <defs>
                  <filter id="ocr-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="0.7" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* Translucent fill */}
                <polygon
                  points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                  fill={sheetDetected ? 'rgba(0,255,128,0.16)' : 'rgba(0,255,128,0.04)'}
                  stroke={sheetDetected ? '#00ff80' : 'rgba(0,255,128,0.45)'}
                  strokeWidth={sheetDetected ? '0.95' : '0.6'}
                  strokeLinejoin="round"
                  strokeDasharray="0"
                  filter="url(#ocr-glow)"
                  style={{ transition: 'all 0.25s ease-out' }}
                />
              </svg>
            )}

            <div className={`flash-overlay ${flashActive ? 'flash-active' : ''}`} />
          </div>

          {/* Floating Bottom Menu & Controls */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.4) 80%, transparent)', zIndex: 10, paddingBottom: '24px', paddingTop: '10px' }}>
            {/* Mode selector: Raised Individual / Lote pills */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '8px 0 16px 0', userSelect: 'none' }}>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.65)', padding: '3px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
                <span
                  onClick={() => setScanMode('individual')}
                  style={{
                    background: scanMode === 'individual' ? 'rgba(255,255,255,0.22)' : 'transparent',
                    color: scanMode === 'individual' ? '#00ff80' : 'rgba(255,255,255,0.5)',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '5px 16px',
                    borderRadius: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Individual
                </span>
                <span
                  onClick={() => setScanMode('lote')}
                  style={{
                    background: scanMode === 'lote' ? 'rgba(255,255,255,0.22)' : 'transparent',
                    color: scanMode === 'lote' ? '#00ff80' : 'rgba(255,255,255,0.5)',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '5px 16px',
                    borderRadius: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Lote
                </span>
              </div>
            </div>

            {/* Camera controls */}
            <div className="scanner-controls" style={{
              padding: '8px 36px 8px 36px',
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center'
            }}>
              {/* Left Placeholder */}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ width: '24px' }} />
              </div>

              {/* Center capture button */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {hasCamera ? (
                  <button
                    onClick={capturePhoto}
                    style={{ 
                      width: '68px', 
                      height: '68px', 
                      borderRadius: '50%', 
                      border: '5px solid #00ff80', 
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      outline: 'none',
                      boxShadow: '0 0 16px rgba(0,255,128,0.2)'
                    }}
                  >
                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fff' }} />
                  </button>
                ) : (
                  <div style={{ width: '68px', height: '68px' }} />
                )}
              </div>

              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              
              {/* Import gallery button (Right) */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-icon"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', outline: 'none' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M20.4 14.5L16 10 4 20" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {step === 'preview-full' && originalImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, padding: '16px', background: '#1c1c1e', height: '100%', justifyContent: 'space-between', touchAction: 'none', overscrollBehavior: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 600, userSelect: 'none', WebkitUserSelect: 'none' }}>
            Ajusta los puntos en las esquinas para encuadrar la hoja
          </span>

          <div 
            onMouseMove={handleCornerMouseMove}
            onTouchMove={handleCornerTouchMove}
            style={{ 
              position: 'relative', 
              width: '100%', 
              flexGrow: 1,
              height: 'calc(100vh - 220px)',
              borderRadius: '12px', 
              overflow: 'hidden', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
              background: '#121214',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none'
            }}
          >
            <div 
              ref={previewContainerRef}
              style={{ 
                position: 'relative', 
                display: 'inline-block', 
                width: imageSize ? `${imageSize.width}px` : 'auto',
                height: imageSize ? `${imageSize.height}px` : 'auto',
                maxWidth: '100%', 
                maxHeight: '100%', 
                userSelect: 'none', 
                WebkitUserSelect: 'none', 
                WebkitTouchCallout: 'none', 
                WebkitTapHighlightColor: 'transparent' 
              }}
            >
              <img 
                ref={previewImageRef}
                src={originalImage} 
                alt="Scan Preview Full"
                draggable={false}
                onLoad={updateImageSize}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  display: 'block',
                  width: 'auto',
                  height: 'auto'
                }} 
              />
            
            {/* Draggable Polygon and Edge Bars Overlay */}
            <svg 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                zIndex: 10,
                touchAction: 'none'
              }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                style={{
                  fill: 'rgba(0, 255, 128, 0.12)',
                  stroke: '#00ff80',
                  strokeWidth: '0.8',
                  filter: 'drop-shadow(0 0 3px rgba(0,255,128,0.2))'
                }}
              />
              
              
              {/* Corner handles are rendered outside SVG to prevent vertical oval distortion */}
            </svg>

            {/* HTML Corner Circular Handles (White with green border, larger touch area) */}
            <div 
              style={{
                position: 'absolute',
                left: `${p1.x}%`,
                top: `${p1.y}%`,
                width: '40px',
                height: '40px',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'move',
                zIndex: 25,
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
              onMouseDown={(e) => handleCornerMouseDown(e, 'p1')}
              onTouchStart={(e) => handleCornerTouchStart(e, 'p1')}
            >
              <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#fff', border: '2px solid #00ff80', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
            </div>
            
            <div 
              style={{
                position: 'absolute',
                left: `${p2.x}%`,
                top: `${p2.y}%`,
                width: '40px',
                height: '40px',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'move',
                zIndex: 25,
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
              onMouseDown={(e) => handleCornerMouseDown(e, 'p2')}
              onTouchStart={(e) => handleCornerTouchStart(e, 'p2')}
            >
              <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#fff', border: '2px solid #00ff80', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
            </div>

            <div 
              style={{
                position: 'absolute',
                left: `${p3.x}%`,
                top: `${p3.y}%`,
                width: '40px',
                height: '40px',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'move',
                zIndex: 25,
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
              onMouseDown={(e) => handleCornerMouseDown(e, 'p3')}
              onTouchStart={(e) => handleCornerTouchStart(e, 'p3')}
            >
              <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#fff', border: '2px solid #00ff80', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
            </div>

            <div 
              style={{
                position: 'absolute',
                left: `${p4.x}%`,
                top: `${p4.y}%`,
                width: '40px',
                height: '40px',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'move',
                zIndex: 25,
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
              onMouseDown={(e) => handleCornerMouseDown(e, 'p4')}
              onTouchStart={(e) => handleCornerTouchStart(e, 'p4')}
            >
              <div style={{ width: '13px', height: '13px', borderRadius: '50%', background: '#fff', border: '2px solid #00ff80', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
            </div>

            {/* Edge Pill/Bar handles (White rects rotated along edges, drawn as HTML to prevent oval scaling) */}
            <div 
              style={{
                position: 'absolute',
                left: `${mid1.mx}%`,
                top: `${mid1.my}%`,
                width: '16px',
                height: '6px',
                background: '#fff',
                border: '1.2px solid #00ff80',
                borderRadius: '3px',
                transform: `translate(-50%, -50%) rotate(${mid1.angle}deg)`,
                zIndex: 20,
                pointerEvents: 'none'
              }}
            />
            <div 
              style={{
                position: 'absolute',
                left: `${mid2.mx}%`,
                top: `${mid2.my}%`,
                width: '16px',
                height: '6px',
                background: '#fff',
                border: '1.2px solid #00ff80',
                borderRadius: '3px',
                transform: `translate(-50%, -50%) rotate(${mid2.angle}deg)`,
                zIndex: 20,
                pointerEvents: 'none'
              }}
            />
            <div 
              style={{
                position: 'absolute',
                left: `${mid3.mx}%`,
                top: `${mid3.my}%`,
                width: '16px',
                height: '6px',
                background: '#fff',
                border: '1.2px solid #00ff80',
                borderRadius: '3px',
                transform: `translate(-50%, -50%) rotate(${mid3.angle}deg)`,
                zIndex: 20,
                pointerEvents: 'none'
              }}
            />
            <div 
              style={{
                position: 'absolute',
                left: `${mid4.mx}%`,
                top: `${mid4.my}%`,
                width: '16px',
                height: '6px',
                background: '#fff',
                border: '1.2px solid #00ff80',
                borderRadius: '3px',
                transform: `translate(-50%, -50%) rotate(${mid4.angle}deg)`,
                zIndex: 20,
                pointerEvents: 'none'
              }}
            />
            {magnifier && originalImage && (() => {
              const lensSize = 132;
              const zoom = 2.7;
              const pointX = (magnifier.x / 100) * magnifier.width;
              const pointY = (magnifier.y / 100) * magnifier.height;
              const left = Math.min(Math.max(8, pointX + (magnifier.x < 50 ? 32 : -lensSize - 32)), magnifier.width - lensSize - 8);
              const top = Math.min(Math.max(8, pointY - lensSize - 24), magnifier.height - lensSize - 8);

              return (
                <div
                  style={{
                    position: 'absolute',
                    left,
                    top,
                    width: lensSize,
                    height: lensSize,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '3px solid #fff',
                    boxShadow: '0 10px 32px rgba(0,0,0,0.45), 0 0 0 2px #00ff80',
                    background: '#111',
                    pointerEvents: 'none',
                    zIndex: 20
                  }}
                >
                  <img
                    src={originalImage}
                    alt="Lupa de recorte"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      width: magnifier.width * zoom,
                      height: magnifier.height * zoom,
                      left: lensSize / 2 - pointX * zoom,
                      top: lensSize / 2 - pointY * zoom,
                      display: 'block',
                      maxWidth: 'none',
                      maxHeight: 'none',
                      transform: 'translateZ(0)',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none'
                    }}
                  />
                  <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, background: 'rgba(0,255,128,0.75)', transform: 'translateX(-50%)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: 10, right: 10, height: 1, background: 'rgba(0,255,128,0.75)', transform: 'translateY(-50%)' }} />




                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: 9, height: 9, borderRadius: '50%', border: '2px solid #00ff80', background: '#fff', transform: 'translate(-50%, -50%)' }} />
                </div>
              );
            })()}
            </div>
          </div>

          {/* Bottom toolbar - matches CamScanner example */}
          <div style={{ background: '#000', padding: '16px 28px', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '12px' }}>
            <button 
              onClick={() => {
                setStep('aligning');
                processAlignment(originalImage, edgePoints);
              }}
              style={{ 
                width: '46px', 
                height: '46px', 
                borderRadius: '50%', 
                background: '#00ff80', 
                color: '#000', 
                border: 'none', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,255,128,0.3)',
                padding: 0,
                outline: 'none'
              }}
            >
              <Check size={24} style={{ strokeWidth: 3 }} />
            </button>
          </div>
        </div>
      )}

      {step === 'aligning' && originalImage && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#111', display: 'flex', flexDirection: 'column', zIndex: 100 }}>

          {/* ── Blurred original as full background ── */}
          <img
            src={originalImage}
            alt="bg"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(22px) brightness(0.18) saturate(0.4)', zIndex: 1 }}
          />

          {/* ── Top bar ── */}
          <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'rgba(0,0,0,0.5)' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', outline: 'none', opacity: 0.8 }}>
              <X size={22} />
            </button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.3px' }}>
              {scanPhase === 'scanning' ? 'Escaneando...' : '✓ Listo'}
            </span>
            <div style={{ width: 22 }} />
          </div>

          {/* ── Cropped document in center ── */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2, padding: '12px 20px' }}>
            <div
              style={{
                position: 'relative',
                maxWidth: '82%',
                maxHeight: '100%',
                borderRadius: '6px',
                overflow: 'hidden',
                boxShadow: scanPhase === 'cropping' ? 'none' : '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                background: scanPhase === 'cropping' ? 'transparent' : '#fff',
                animation: scanPhase === 'cropping' ? 'none' : 'slideUpDoc 0.45s cubic-bezier(0.22,1,0.36,1) both',
              }}
            >
              {scanPhase === 'cropping' ? (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Fading background of full original photo */}
                  <img
                    src={originalImage}
                    alt="Uncropped bg"
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: 'calc(100vh - 280px)',
                      objectFit: 'contain',
                      animation: 'fadeOutBackground 1.2s forwards ease-in-out',
                    }}
                  />
                  {/* Lifting clipped sheet */}
                  <img
                    src={originalImage}
                    alt="Clipped sheet"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      clipPath: `polygon(${p1.x}% ${p1.y}%, ${p2.x}% ${p2.y}%, ${p3.x}% ${p3.y}%, ${p4.x}% ${p4.y}%)`,
                      animation: 'liftSheet 1.2s forwards ease-in-out',
                    }}
                  />
                  {/* Fading green crop outline */}
                  <svg
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      animation: 'fadeOutLine 1.2s forwards ease-in-out',
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <polygon
                      points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                      fill="rgba(0, 229, 160, 0.15)"
                      stroke="#00ff80"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              ) : (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={processedImage || capturedImage}
                    alt="Documento recortado"
                    style={{
                      display: 'block',
                      maxWidth: '100%',
                      maxHeight: 'calc(100vh - 280px)',
                      objectFit: 'contain',
                      opacity: isEnhancing ? 0.5 : 1,
                      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                      transformOrigin: 'center center',
                      cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'zoom-in',
                      transition: (isPanning || touchStartDistRef.current !== null) ? 'none' : 'transform 0.2s ease-out, opacity 0.25s ease',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      touchAction: zoomScale > 1 ? 'none' : 'auto',
                    }}
                    onMouseDown={handlePointerDown}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    onTouchStart={handlePointerDown}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                    onDoubleClick={handleImageDoubleClick}
                  />

                  {/* ── Green laser sweep ── */}
                  {scanPhase === 'scanning' && (
                    <>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '2px',
                        background: 'linear-gradient(to right, transparent 3%, #00e5a0 35%, #ffffff 50%, #00e5a0 65%, transparent 97%)',
                        boxShadow: '0 0 16px 5px rgba(0,229,160,0.65), 0 0 4px rgba(255,255,255,0.8)',
                        animation: 'sweepLaser 1.4s ease-in-out infinite',
                        zIndex: 10,
                      }} />
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '90px',
                        background: 'linear-gradient(to bottom, rgba(0,229,160,0.10) 0%, transparent 100%)',
                        animation: 'sweepLaser 1.4s ease-in-out infinite',
                        zIndex: 9, pointerEvents: 'none',
                      }} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom: filter row + action bar (shown when done) ── */}
          <div
            style={{
              position: 'relative', zIndex: 3,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(12px)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              opacity: scanPhase === 'done' ? 1 : 0,
              transform: scanPhase === 'done' ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
              pointerEvents: scanPhase === 'done' ? 'auto' : 'none',
            }}
          >
            {/* Filter chips row */}
            <div style={{ overflowX: 'auto', display: 'flex', gap: '8px', padding: '12px 16px 6px', scrollbarWidth: 'none' }}>
              {([['original', 'Sin filtro'], ['magic', 'Mejorar'], ['bw', 'B&N']] as [FilterType, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveFilter(id)}
                  style={{
                    flexShrink: 0,
                    background: activeFilter === id ? '#00e5a0' : 'rgba(255,255,255,0.08)',
                    color: activeFilter === id ? '#000' : '#fff',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '5px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >{label}</button>
              ))}
            </div>



            {/* Action bar */}
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '10px 20px 20px' }}>
              {/* Volver a tomar */}
              <button
                onClick={() => { setScanPhase('idle'); setCapturedImage(null); setStep('capture'); startCamera(); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 600, opacity: 0.85 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={18} />
                </div>
                Volver a tomar
              </button>

              {/* Recortar / ajustar esquinas */}
              <button
                onClick={() => { setScanPhase('idle'); setStep('preview-full'); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '10px', fontWeight: 600, opacity: 0.85 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 6 9 6" /><polyline points="15 6 18 6 18 9" />
                    <polyline points="18 15 18 18 15 18" /><polyline points="9 18 6 18 6 15" />
                  </svg>
                </div>
                Recortar
              </button>

              {/* ✓ Palomita → pantalla decide o directamente procesa */}
              <button
                disabled={isEnhancing}
                onClick={() => {
                  const finalImg = processedImage || capturedImage;
                  if (!finalImg) return;
                  const img = new Image();
                  img.onload = () => {
                    const rendered: CroppedImageResult = {
                      dataUrl: finalImg,
                      width: img.width,
                      height: img.height,
                    };
                    const nextPages = [...scannedPages, rendered];
                    setScannedPages(nextPages);
                    setScanPhase('idle');
                    if (scanMode === 'individual') {
                      // Trigger OCR directly on this single page!
                      setStep('ocr-processing');
                      setOcrProgress(2);
                      setOcrStatus('Preparando imagen...');
                      runRealOcr(finalImg);
                    } else {
                      // Multi-page batch mode -> go to decide screen
                      setStep('decide');
                    }
                  };
                  img.src = finalImg;
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#00e5a0', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: '#00e5a0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,229,160,0.45)',
                }}>
                  <Check size={26} strokeWidth={3} color="#000" />
                </div>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
          DECIDE: ¿Añadir página o Continuar?
      ═══════════════════════════════════════════ */}
      {step === 'decide' && scannedPages.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, background: '#0e0e10', display: 'flex', flexDirection: 'column', zIndex: 100 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.6)' }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}><X size={20} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Files size={15} style={{ color: '#00e5a0' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                {scannedPages.length} {scannedPages.length === 1 ? 'página' : 'páginas'} escaneadas
              </span>
            </div>
            <div style={{ width: 20 }} />
          </div>

          {/* Page thumbnails */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
            {scannedPages.map((page, i) => (
              <div key={i} style={{ position: 'relative', width: '78%', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', background: '#fff', animation: 'slideUpDoc 0.35s ease both', animationDelay: `${i * 0.06}s` }}>
                <img src={page.dataUrl} alt={`Página ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                {/* Page badge */}
                <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backdropFilter: 'blur(4px)' }}>
                  Pág. {i + 1}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom action bar */}
          <div style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '16px 28px 28px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>

            {/* Añadir otra página */}
            <button
              onClick={() => {
                // Keep scannedPages, go back to capture for next page
                setCapturedImage(null);
                setOriginalImage(null);
                setScanPhase('idle');
                setStep('capture');
                startCamera();
              }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
            >
              <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)' }}>
                <Plus size={24} />
              </div>
              Añadir página
            </button>

            {/* Continuar → OCR + PDF + subir */}
            <button
              onClick={handleFinalSubmit}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: '#00e5a0', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
            >
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#00e5a0', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 24px rgba(0,229,160,0.5)' }}>
                <Check size={30} strokeWidth={2.8} color="#000" />
              </div>
              Continuar
            </button>

          </div>
        </div>
      )}

      {step === 'beautify' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between', height: '100%', background: '#000', padding: 0, position: 'relative' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', color: '#fff', alignItems: 'center', background: 'rgba(0,0,0,0.8)', height: '54px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={() => { setStep('preview-full'); }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', outline: 'none' }}>
              <X size={24} />
            </button>
            <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.3px' }}>Ajuste de Filtro y PDF</span>
            <div style={{ width: '24px' }} />
          </div>

          {/* Central Image Container */}
          <div 
            style={{ 
              flexGrow: 1,
              width: '100%', 
              background: '#0a0a0c', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative',
              padding: '20px'
            }}
          >
            <div 
              style={{ 
                position: 'relative', 
                maxWidth: '100%', 
                maxHeight: '100%', 
                boxShadow: '0 15px 35px rgba(0,0,0,0.6)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}
            >
              <img 
                src={processedImage || capturedImage} 
                alt="Enhanced Preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '52vh', 
                  display: 'block',
                  transition: 'all 0.25s ease'
                }} 
              />
            </div>
          </div>

          {/* Bottom control panel */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(10,10,12,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingBottom: '24px' }}>
            
            {/* Horizontal Filter Picker list */}
            <div style={{ overflowX: 'auto', padding: '14px 10px', display: 'flex', justifyContent: 'center', gap: '14px', whiteSpace: 'nowrap', userSelect: 'none', background: 'rgba(0,0,0,0.3)' }}>
              <button
                onClick={() => setActiveFilter('original')}
                style={{ 
                  background: activeFilter === 'original' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: activeFilter === 'original' ? '#00ff80' : 'rgba(255,255,255,0.6)',
                  fontWeight: 600,
                  outline: 'none'
                }}
              >
                <span>Sin Manusc.</span>
              </button>

              <button
                onClick={() => setActiveFilter('magic')}
                style={{ 
                  background: activeFilter === 'magic' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: activeFilter === 'magic' ? '#00ff80' : 'rgba(255,255,255,0.6)',
                  fontWeight: 600,
                  outline: 'none'
                }}
              >
                <span>Mejorar</span>
              </button>

              <button
                onClick={() => setActiveFilter('bw')}
                style={{ 
                  background: activeFilter === 'bw' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  color: activeFilter === 'bw' ? '#00ff80' : 'rgba(255,255,255,0.6)',
                  fontWeight: 600,
                  outline: 'none'
                }}
              >
                <span>B&N</span>
              </button>
            </div>

            {/* Document PDF filename entry */}
            <div style={{ padding: '8px 24px 0 24px' }}>
              <input 
                type="text" 
                value={fileName} 
                onChange={(e) => setFileName(e.target.value)} 
                placeholder="Nombre del PDF"
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', textAlign: 'center' }}
              />
            </div>

            {/* Bottom action panel - matches CamScanner example */}
            <div className="scanner-controls" style={{ padding: '14px 28px 4px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              
              <button 
                onClick={() => {
                  setStep('capture');
                  startCamera();
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '10px', width: '60px' }}
              >
                <RotateCcw size={18} />
                <span>Re-tomar</span>
              </button>


              <button 
                onClick={() => setStep('preview-full')}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '10px', width: '60px' }}
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>📐</span>
                <span>Recortar</span>
              </button>

              <button 
                onClick={startOcrProcessing}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '10px', width: '60px' }}
              >
                <FileText size={18} style={{ color: 'var(--primary-gold)' }} />
                <span>OCR</span>
              </button>

              <button 
                onClick={startOcrProcessing}
                style={{ 
                  width: '42px', 
                  height: '42px', 
                  borderRadius: '50%', 
                  background: '#00ff80', 
                  color: '#000', 
                  border: 'none', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,255,128,0.3)',
                  padding: 0,
                  outline: 'none'
                }}
              >
                <Check size={22} style={{ strokeWidth: 3 }} />
              </button>

            </div>
          </div>
        </div>
      )}

      {step === 'ocr-processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', flexGrow: 1, background: '#1c1c1e', minHeight: '300px' }}>
          <div style={{ position: 'relative', width: '50px', height: '50px', marginBottom: '16px' }}>
            <div className="health-indicator pulsing" style={{ width: '40px', height: '40px', backgroundColor: 'var(--primary-gold)', margin: '5px' }} />
            <Cpu size={24} style={{ position: 'absolute', top: '13px', left: '13px', color: '#fff' }} />
          </div>
          
          <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#fff' }}>Generando PDF y Procesando OCR</h4>
          
          <div style={{ width: '100%', maxWidth: '280px', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
            <div 
              style={{ 
                width: `${ocrProgress}%`, 
                height: '100%', 
                backgroundColor: 'var(--primary-blue)', 
                borderRadius: '10px', 
                transition: 'width 0.2s ease-out' 
              }} 
            />
          </div>
          
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
            {ocrProgress}% completado
          </span>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: '260px' }}>
            {ocrStatus}
          </p>
        </div>
      )}

      {step === 'ocr-confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, background: '#1c1c1e', padding: '16px', overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(52,199,89,0.15)', color: '#34c759', marginBottom: '8px' }}>
              <Check size={20} />
            </div>
            <h4 style={{ fontWeight: '700', color: '#fff', margin: 0 }}>Información Extraída del Escrito</h4>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
              {scannedPages.length > 1 ? `${scannedPages.length} páginas • ` : ''}Revisa los campos autocompletados mediante OCR real antes de guardarlos.
            </p>
            {/* Eye button — view uploaded PDF */}
            {finalPdfUrl && (
              <a
                href={finalPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '6px 16px', borderRadius: '20px', background: 'rgba(0,229,160,0.12)', color: '#00e5a0', fontSize: '12px', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(0,229,160,0.25)' }}
              >
                <Eye size={14} /> Ver PDF subido
              </a>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, marginBottom: '16px' }}>
            <div className="form-group">
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Nombre del Trabajador (Demandante)</label>
              <input 
                type="text" 
                className="form-control" 
                value={workerName} 
                onChange={(e) => setWorkerName(e.target.value)} 
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Cuantía Estimada Reclamada</label>
              <input 
                type="text" 
                className="form-control" 
                value={claimAmount} 
                onChange={(e) => setClaimAmount(e.target.value)} 
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Tribunal Competente</label>
              <input 
                type="text" 
                className="form-control" 
                value={court} 
                onChange={(e) => setCourt(e.target.value)} 
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Juez Asignado</label>
              <input 
                type="text" 
                className="form-control" 
                value={judge} 
                onChange={(e) => setJudge(e.target.value)} 
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '13px' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Resumen Técnico / Reseña Fáctica</label>
              <textarea 
                className="form-control" 
                rows={3}
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: '12.5px', resize: 'none' }}
              />
            </div>
          </div>

          <div className="scanner-controls" style={{ gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setStep('beautify')}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}
            >
              Atrás
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleFinalSubmit}
              style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Check size={16} /> Crear Caso y Subir PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
