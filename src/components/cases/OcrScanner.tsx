import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Sparkles, Cpu, ChevronRight, Wand2, RefreshCw, Plus, Files } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { createSearchablePdf, createMultiPagePdf, warpPerspective, detectDocumentEdges, QuadPoints, DEFAULT_SCANNED_OCR_TEXT, CroppedImageResult } from '../../utils/scannerPdf';
import { getPdfStorageKey, savePdfBlob, registerPdfSession } from '../../utils/pdfStorage';
import { Case, User, DocumentItem, PracticeArea } from '../../utils/types';
import { LegiumDB } from '../../utils/db';
import { useDocumentDetection } from '../../hooks/useDocumentDetection';
import { uploadPdfToInsforge, saveDocumentRecord, saveCaseRecord, saveNotificationRecord } from '../../utils/insforgeClient';

interface OcrScannerProps {
  currentUser: User;
  onOcrComplete: (newCase: Case, newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
  existingCase?: Case;
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
        const C = 16 * brightness; // Increased for stronger shadow and gradient cleaning
        const exponent = 2.8 * contrast; // Increased contrast for crisper text

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

            // Aggressive whitening of background (shadows/paper details)
            if (L >= avg - C && (!isColor || L > 190)) {
              // Whitening factor: force pure white for bright/warm-cast paper or pixels significantly above average
              const diff = L - (avg - C);
              const factor = (L > 180 || isWarmCast || diff > 6) ? 1.0 : Math.min(1.0, diff / 4);
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
              const satFactor = isColor ? 2.5 : 1.0;
              const r_sat = L_norm + (r_norm - L_norm) * satFactor;
              const g_sat = L_norm + (g_norm - L_norm) * satFactor;
              const b_sat = L_norm + (b_norm - L_norm) * satFactor;

              // Darken text component
              const ratio = L / Math.max(1, avg);
              const enhancedRatio = Math.pow(ratio, exponent);

              const colorWeight = isColor ? (maxVal / 255) : 0;
              const finalRatio = enhancedRatio * (1 - colorWeight) + colorWeight;

              // Force dark ink to be even darker for crisp text reading
              const scaleRatio = finalRatio < 0.38 && !isColor ? finalRatio * 0.70 : finalRatio;

              r = Math.min(255, Math.max(0, r_sat * scaleRatio));
              g = Math.min(255, Math.max(0, g_sat * scaleRatio));
              b = Math.min(255, Math.max(0, b_sat * scaleRatio));
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
        const C = 20 * brightness; // Increased threshold for cleaner white background margins

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

            if (L >= avg - C || L > 185 || isWarmCast) {
              // Bleach background to pure white aggressively
              const diff = L - (avg - C);
              const factor = (L > 180 || isWarmCast || diff > 5) ? 1.0 : Math.min(1.0, diff / 5);
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

export const OcrScanner: React.FC<OcrScannerProps> = ({ currentUser, onOcrComplete, onClose, existingCase }) => {
  const [step, setStep] = useState<'capture' | 'preview-full' | 'aligning' | 'decide' | 'ocr-processing'>('capture');
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scanPhase, setScanPhase] = useState<'idle' | 'captured' | 'cropping' | 'straightening' | 'scanning' | 'enhancing' | 'done'>('idle');
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
      
      let stream: MediaStream;
      try {
        // Try 4K resolution first to get maximum sensor detail for document OCR scanning!
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment', 
            width: { ideal: 4096 }, 
            height: { ideal: 3072 } 
          }
        });
      } catch (e) {
        console.warn('4K camera constraints failed, trying FHD constraints:', e);
        try {
          // Try Full HD - high-res, standard aspect ratio, highly compatible
          stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: 'environment', 
              width: { ideal: 1920, max: 2560 }, 
              height: { ideal: 1080, max: 1440 } 
            }
          });
        } catch (e2) {
          console.warn('FHD camera constraints failed, trying basic HD constraints:', e2);
          try {
            // Fallback to standard HD 720p
            stream = await navigator.mediaDevices.getUserMedia({
              video: { 
                facingMode: 'environment', 
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
              }
            });
          } catch (e3) {
            console.warn('HD camera constraints failed, trying basic video:', e3);
            // Ultimate fallback with no resolution requirements
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' }
            });
          }
        }
      }
      
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
      videoRef.current.play().catch((err) => {
        console.warn('Error playing camera stream, retrying:', err);
        setTimeout(() => {
          videoRef.current?.play().catch(e => console.error('Play retry failed:', e));
        }, 150);
      });
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
    try {
      // 1. Run perspective warp immediately!
      const warped = await warpPerspective(imgDataUrl, quad, 2480, 3508);
      setCapturedImage(warped.dataUrl);
      setAlignProgress(70);

      // 2. Start the slow lift phase (cropping) using the flat warped document
      setScanPhase('cropping');

      // Let the slow lift animation play for 800ms
      setTimeout(() => {
        setScanPhase('scanning');

        // 3. Let the laser sweep scan the flat doc for 800ms
        setTimeout(() => {
          setScanPhase('enhancing');

          // 4. Let the magic enhancement flash fade in for 400ms
          setTimeout(() => {
            setAlignProgress(100);
            setScanPhase('done');
            setStep('aligning');
          }, 400);
        }, 800);
      }, 800);
    } catch (err) {
      console.error('Perspective warp failed:', err);
      setCapturedImage(imgDataUrl);
      setScanPhase('done');
      setStep('aligning');
    }
  };

  // Capturing photo — grey flash → capture raw frame → start aligning animation
  const capturePhoto = async () => {
    // Trigger grey shutter flash
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 350);

    if (hasCamera) {
      let dataUrl: string | null = null;

      // Try ImageCapture API for highest resolution possible (Chromium / Chrome Android)
      const track = cameraStream?.getVideoTracks()[0];
      if (track && typeof window !== 'undefined' && 'ImageCapture' in window) {
        try {
          const imageCapture = new (window as any).ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.warn('ImageCapture failed, falling back to canvas:', err);
        }
      }

      // Fallback: draw current frame from video element to canvas
      if (!dataUrl && videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL('image/jpeg', 1.0);
        }
      }

      if (dataUrl) {
        capturedRawRef.current = dataUrl; // store raw immediately for display
        setOriginalImage(dataUrl);

        // Freeze frame, and start processing alignment (keeping step as 'capture'!)
        setScanPhase('captured');
        setTimeout(() => {
          stopCamera();
          processAlignment(dataUrl!, edgePoints);
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

  // Downscale a dataUrl to maxWidth px, returns {dataUrl, width, height} — single image load
  const downscaleImage = (dataUrl: string, maxWidth: number, quality = 0.85): Promise<{ dataUrl: string; width: number; height: number }> =>
    new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxWidth) {
          resolve({ dataUrl, width: img.width, height: img.height });
          return;
        }
        const scale = maxWidth / img.width;
        const w = maxWidth;
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h });
      };
      img.onerror = () => resolve({ dataUrl, width: 800, height: 1000 });
      img.src = dataUrl;
    });

  // Parse OCR text and auto-submit — no confirmation screen
  const runRealOcr = async (imageSrc: string, pages: typeof scannedPages) => {
    setStep('ocr-processing');
    setOcrProgress(5);
    setOcrStatus('Preparando imagen...');

    // Downscale to 1400px max for OCR — 4-8x faster than full 4K
    const { dataUrl: ocrImage } = await downscaleImage(imageSrc, 1400, 0.92);
    setOcrProgress(10);

    let rawText = '';
    try {
      const result = await Tesseract.recognize(ocrImage, 'spa', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(12 + m.progress * 78);
            setOcrProgress(pct);
            setOcrStatus(
              pct < 35 ? 'Reconociendo caracteres...' :
              pct < 70 ? 'Analizando estructura del documento...' :
              'Extrayendo información clave...'
            );
          }
        }
      });
      rawText = result.data.text;
    } catch (err) {
      console.error('Tesseract OCR error:', err);
      rawText = '';
    }

    setOcrProgress(92);
    setOcrStatus('Extrayendo información clave...');

    // ── Improved extraction ──────────────────────────────────────────
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const fullText = lines.join(' ');

    // Document type detection
    const isCompraventa = /compraventa|escritura\s+p[úu]blica|contrato\s+de\s+compra/i.test(fullText);
    const isLaboral     = /demanda|demandante|trabajador|cuant[íi]a|despido/i.test(fullText);
    const isNotarial    = /notario|notaría|escritura|volumen/i.test(fullText);

    // ── Party / name extraction ───────────────────────────────────────
    let parsedName = '';

    // 1) Compradora / comprador
    const compradorMatch = fullText.match(/(?:compradora?|adquirente)[:\s"«]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑA-Za-záéíóúñ\s]{4,50}?)(?:\s*[,."»]|\s{2,}|$)/i);
    if (compradorMatch) parsedName = compradorMatch[1].trim();

    // 2) Demandante / trabajador
    if (!parsedName) {
      const demanMatch = fullText.match(/(?:demandante|trabajador)[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{4,40}?)(?=[,\n]|$)/i);
      if (demanMatch) parsedName = demanMatch[1].trim();
    }

    // 3) Don / Doña / señor / señora
    if (!parsedName) {
      const donMatch = fullText.match(/(?:\bdon\b|\bdoña\b|\bse[ñn]or[a]?\b)[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{4,45}?)(?=[,\n]|\s{2,}|$)/i);
      if (donMatch) parsedName = donMatch[1].trim();
    }

    // 4) Capitalize-only full name on its own line (e.g. "MARIA DE LOURDES ESPINO TORRES")
    if (!parsedName) {
      const capsLine = lines.find(l => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{8,50}$/.test(l) && l.split(' ').length >= 2);
      if (capsLine) parsedName = capsLine.trim();
    }

    // ── Amount extraction ─────────────────────────────────────────────
    let parsedAmount = 'Por determinar';
    const amtMatch =
      fullText.match(/\$\s*([\d,\.]+)\s*(M\.?N\.?|MXN|pesos?|CLP|USD)?/i) ||
      fullText.match(/([\d,\.]{5,})\s*(pesos?|MXN|CLP|USD)/i) ||
      fullText.match(/(?:cuant[íi]a|monto|valor)[^\d]*([\d,\.]{4,})/i);
    if (amtMatch) parsedAmount = amtMatch[0].replace(/(?:cuant[íi]a|monto|valor)[^\d]*/i, '').trim();

    // ── Court / Notary extraction ──────────────────────────────────────
    let parsedCourt = 'Por determinar';
    const courtMatch =
      fullText.match(/(?:juzgado|tribunal|corte)[^\n.]{0,80}/i) ||
      fullText.match(/notaría[^\n.]{0,60}/i) ||
      fullText.match(/notario\s+p[úu]blico[^\n.]{0,60}/i);
    if (courtMatch) parsedCourt = courtMatch[0].trim().replace(/\s+/g, ' ');

    // ── Authority / Judge / Notary name ───────────────────────────────
    let parsedJudge = 'Por designar';
    const judgeMatch =
      fullText.match(/(?:juez|magistrado)[:\s]+([A-Za-záéíóúñÁÉÍÓÚÑ\s\.]{5,50}?)(?=[,\n]|$)/i) ||
      fullText.match(/(?:Lic\.|Dr\.|Dra\.|Ing\.)\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{4,40}?)(?=[,\n]|$)/);
    if (judgeMatch) parsedJudge = judgeMatch[1]?.trim() || judgeMatch[0].trim();

    // ── Description / Summary ─────────────────────────────────────────
    // Use first ~400 chars of meaningful text, clean OCR artifacts
    const parsedDesc = lines
      .filter(l => l.length > 15 && !/^[-–—|]+$/.test(l))
      .slice(0, 8)
      .join(' ')
      .substring(0, 400)
      .replace(/\s{2,}/g, ' ')
      .trim() || 'Documento legal procesado con OCR.';

    // ── Practice area ─────────────────────────────────────────────────
    const practiceArea: PracticeArea = isLaboral ? 'Laboral' : isCompraventa ? 'Inmobiliario' : isNotarial ? 'Notarial' : 'Civil';

    // ── Document title ────────────────────────────────────────────────
    const docTitle = isCompraventa
      ? (parsedName ? parsedName + ' — Contrato de Compraventa' : 'Contrato de Compraventa')
      : isLaboral
      ? (parsedName ? parsedName + ' vs. ' + (currentUser.name || 'Empresa') : 'Demanda Laboral')
      : parsedName
      ? parsedName + ' — Documento Legal'
      : 'Escrito Judicial Escaneado';

    await autoSubmit({
      name: parsedName || 'Parte Detectada',
      amount: parsedAmount,
      court: parsedCourt,
      judge: parsedJudge,
      description: parsedDesc,
      practiceArea,
      docTitle,
      rawText,
      pages,
    });
  };

  const autoSubmit = async (parsed: {
    name: string; amount: string; court: string; judge: string;
    description: string; practiceArea: PracticeArea; docTitle: string;
    rawText: string; pages: typeof scannedPages;
  }) => {
    const { name, amount, court: parsedCourt, judge: parsedJudge, description, practiceArea, docTitle, rawText, pages: pgs } = parsed;

    const ocrText = [
      rawText,
      '---',
      'Extracción automática Legium OCR:',
      'Parte principal: ' + name,
      'Monto/Cuantía: ' + amount,
      'Tribunal/Notaría: ' + parsedCourt,
      'Autoridad/Juez: ' + parsedJudge,
    ].join('\n');

    try {
      if (pgs.length === 0) { console.error('autoSubmit: no pages'); return; }

      // Downscale pages to max 1600px before PDF generation — keeps blobs under ~300 KB
      const pdfPages = await Promise.all(
        pgs.map(p =>
          Promise.race([
            downscaleImage(p.dataUrl, 1600, 0.88),
            new Promise<{ dataUrl: string; width: number; height: number }>(r =>
              setTimeout(() => r({ dataUrl: p.dataUrl, width: p.width || 800, height: p.height || 1000 }), 5000)
            )
          ])
        )
      );
      const pdfBlob = createMultiPagePdf(pdfPages, ocrText);
      const sizeKB = (pdfBlob.size / 1024).toFixed(1);

      const docId = 'doc-' + Date.now();
      const uploadDate = new Date().toISOString().split('T')[0];
      const caseId = existingCase ? existingCase.id : 'LEG-2026-' + Math.floor(100 + Math.random() * 900);
      const pdfName = fileName.endsWith('.pdf') ? fileName : fileName + '.pdf';

      // 1. Register ObjectURL immediately — PDF viewable right now
      registerPdfSession(docId, pdfBlob);

      // 2. Save to IndexedDB (awaited — guarantees local persistence before scanner closes)
      await savePdfBlob(docId, pdfBlob).catch(e => console.warn('[PDF] local save failed:', e));

      // 3. Build case/doc with pdfUrl = null for now; cloud upload updates it in background
      const newDoc: DocumentItem = {
        id: docId,
        name: pdfName,
        size: sizeKB + ' KB',
        uploadDate,
        ocrText,
        pdfUrl: null,
        storageKey: caseId + '/' + docId + '.pdf'
      };

      let finalCase: Case;
      if (existingCase) {
        finalCase = { ...existingCase, documents: [...existingCase.documents, newDoc] };
      } else {
        finalCase = {
          id: caseId,
          title: docTitle,
          clientId: currentUser.clientId || 'cli-01',
          clientName: currentUser.name,
          opposingParty: name,
          opposingLawyer: 'Por determinar',
          practiceArea,
          status: 'Activo',
          court: parsedCourt,
          judge: parsedJudge,
          assignedLawyerId: 'usr-02',
          assignedLawyerName: 'Dra. Sofía Valenzuela',
          startDate: uploadDate,
          description,
          timeline: [{ date: uploadDate, title: 'Ingreso por Portal Cliente (OCR)', desc: 'Documento escaneado y procesado automáticamente.', completed: true }],
          tasks: [{ id: 'tsk-' + Date.now().toString().slice(-4), title: 'Revisar documento y asignar estrategia legal', dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], assignedTo: 'usr-02', completed: false }],
          notes: [{ id: 'nt-' + Date.now(), date: uploadDate + ' ' + new Date().toTimeString().slice(0, 5), author: 'Legium OCR', text: 'Extracción: Parte=' + name + ' | Monto=' + amount + ' | ' + parsedCourt }],
          documents: [newDoc]
        };
      }

      // 4. Notify UI immediately — don't wait for cloud
      setOcrProgress(100);
      setOcrStatus('¡Listo!');
      onOcrComplete(finalCase, newDoc, pdfBlob);

      // 5. Cloud saves fire-and-forget — run after UI is updated
      uploadPdfToInsforge(docId, pdfBlob, caseId)
        .then(remoteUrl => {
          if (!remoteUrl) return;
          // Patch pdfUrl into localStorage so it's available after reload
          const stored = LegiumDB.get<Case[]>('cases', []);
          const ci = stored.findIndex(c => c.id === caseId);
          if (ci !== -1) {
            const di = stored[ci].documents.findIndex(d => d.id === docId);
            if (di !== -1) { stored[ci].documents[di].pdfUrl = remoteUrl; LegiumDB.set('cases', stored); }
          }
        })
        .catch(e => console.warn('[InsForge] upload failed:', e));

      // Case must be saved before documents/notifications (FK constraint)
      saveCaseRecord(finalCase)
        .then(() => Promise.all([
          saveDocumentRecord({ id: docId, caseId, name: pdfName, sizeKb: parseFloat(sizeKB), uploadDate, ocrText, pdfUrl: null })
            .catch(e => console.warn('[DB] doc sync failed:', e)),
          saveNotificationRecord({ id: 'noti-' + Date.now(), title: 'Nuevo PDF subido por cliente', message: `El cliente ${currentUser.name || 'Portal'} subió "${pdfName}" (expediente ${caseId}).`, date: uploadDate, read: false, caseId })
            .catch(e => console.warn('[DB] notification sync failed:', e))
        ]))
        .catch(e => console.warn('[DB] case sync failed:', e));
    } catch (err) {
      console.error('Error generating OCR PDF:', err);
      setOcrProgress(100);
      setOcrStatus('Error al generar PDF');
    }
  };

  const startOcrProcessing = async () => {
    const img = processedImage || capturedImage;
    const pages = scannedPages.length > 0
      ? scannedPages
      : img ? [{ dataUrl: img, width: 0, height: 0 }] : [];
    if (pages.length === 0 || !pages[0].dataUrl) return;
    setStep('ocr-processing');
    setOcrProgress(2);
    setOcrStatus('Preparando imagen...');
    await runRealOcr(pages[0].dataUrl, pages);
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
        @keyframes straightenDoc {
          0% {
            transform: scale(0.9) rotate(-3deg);
            opacity: 0;
            filter: drop-shadow(0 5px 15px rgba(0,0,0,0.3));
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
            filter: drop-shadow(0 20px 50px rgba(0,0,0,0.7));
          }
        }
        @keyframes liftFlatSheet {
          0% {
            transform: scale(0.85) translateY(30px);
            opacity: 0;
            filter: drop-shadow(0 4px 10px rgba(0,0,0,0.15));
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
            filter: drop-shadow(0 20px 60px rgba(0,0,0,0.85));
          }
        }
        @keyframes liftAndMorphSkewedSheet {
          0% {
            clip-path: polygon(${p1.x}% ${p1.y}%, ${p2.x}% ${p2.y}%, ${p3.x}% ${p3.y}%, ${p4.x}% ${p4.y}%);
            transform: scale(1) translate(0, 0);
            opacity: 1;
            filter: drop-shadow(0 0 0 rgba(0,0,0,0));
          }
          100% {
            clip-path: polygon(10% 5%, 90% 5%, 90% 95%, 10% 95%);
            transform: scale(1.05) translate(0, -15px);
            opacity: 0;
            filter: drop-shadow(0 20px 40px rgba(0,0,0,0.65));
          }
        }
        @keyframes fadeInWarpedSheet {
          0% {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes fadeOutDoc {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes fadeInDoc {
          0% { opacity: 0; filter: brightness(1.25) contrast(1.15) saturate(0.8); }
          100% { opacity: 1; filter: none; }
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
            {scanPhase === 'idle' ? (
              hasCamera ? (
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
              )
            ) : scanPhase === 'captured' ? (
              <img
                src={originalImage || ''}
                alt="Captured still"
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  zIndex: 2
                }}
              />
            ) : scanPhase === 'cropping' ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
                {/* Crisp background of full original photo */}
                <img
                  src={originalImage || ''}
                  alt="Uncropped bg"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />

                {/* 1. Skewed original sheet (peeling off, morphing to a rectangle and fading out) */}
                <img
                  src={originalImage || ''}
                  alt="Peeling sheet"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    animation: 'liftAndMorphSkewedSheet 0.8s cubic-bezier(0.25, 1, 0.5, 1) both',
                    zIndex: 3,
                  }}
                />

                {/* 2. Flat warped document card (fading in and settling in the center) */}
                <div style={{ position: 'absolute', top: '54px', bottom: '140px', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 4 }}>
                  <div
                    style={{
                      position: 'relative',
                      maxWidth: '85%',
                      maxHeight: '100%',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                      background: '#fff',
                      animation: 'fadeInWarpedSheet 0.8s cubic-bezier(0.25, 1, 0.5, 1) both',
                    }}
                  >
                    <img
                      src={capturedImage || ''}
                      alt="Documento recortado"
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 'calc(100vh - 210px)',
                        objectFit: 'contain',
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : scanPhase === 'scanning' ? (
              <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
                {/* Frozen original background image (crisp) */}
                <img
                  src={originalImage || ''}
                  alt="Uncropped bg"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {/* Straightened document centered (fully straight and static, raw image) */}
                <div style={{ position: 'absolute', top: '54px', bottom: '140px', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 3 }}>
                  <div
                    style={{
                      position: 'relative',
                      maxWidth: '85%',
                      maxHeight: '100%',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                      background: '#fff',
                    }}
                  >
                    <img
                      src={capturedImage || ''}
                      alt="Documento recortado"
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 'calc(100vh - 210px)',
                        objectFit: 'contain',
                      }}
                    />
                    {/* Green laser sweep */}
                    <>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '2px',
                        background: 'linear-gradient(to right, transparent 3%, #00e5a0 35%, #ffffff 50%, #00e5a0 65%, transparent 97%)',
                        boxShadow: '0 0 16px 5px rgba(0,229,160,0.65), 0 0 4px rgba(255,255,255,0.8)',
                        animation: 'sweepLaser 0.8s ease-in-out infinite',
                        zIndex: 10,
                      }} />
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '90px',
                        background: 'linear-gradient(to bottom, rgba(0,229,160,0.10) 0%, transparent 100%)',
                        animation: 'sweepLaser 0.8s ease-in-out infinite',
                        zIndex: 9, pointerEvents: 'none',
                      }} />
                    </>
                  </div>
                </div>
              </div>
            ) : (
              /* scanPhase === 'enhancing' or done fallback */
              <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
                {/* Frozen original background image (crisp) */}
                <img
                  src={originalImage || ''}
                  alt="Uncropped bg"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {/* Cross-fading raw and enhanced documents */}
                <div style={{ position: 'absolute', top: '54px', bottom: '140px', left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 3 }}>
                  <div
                    style={{
                      position: 'relative',
                      maxWidth: '85%',
                      maxHeight: '100%',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                      background: '#fff',
                    }}
                  >
                    {/* Raw warped image (fading out) */}
                    <img
                      src={capturedImage || ''}
                      alt="Raw doc"
                      style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 'calc(100vh - 210px)',
                        objectFit: 'contain',
                        opacity: 0,
                        animation: 'fadeOutDoc 0.4s forwards ease-in-out',
                      }}
                    />
                    {/* Enhanced image (fading in) */}
                    <img
                      src={processedImage || capturedImage || ''}
                      alt="Enhanced doc"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        opacity: 0,
                        animation: 'fadeInDoc 0.4s forwards ease-in-out',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── SVG Perspective Quad Overlay ── */}
            {hasCamera && scanPhase === 'idle' && (
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
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#f4f4f7', display: 'flex', flexDirection: 'column', zIndex: 100, transition: 'background-color 0.5s ease' }}>

          {/* Full screen background image (crisp during cropping & scanning, fades out to white when done) */}
          <img
            src={originalImage}
            alt="bg"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 1,
              opacity: scanPhase === 'done' ? 0 : 1,
              transition: 'opacity 0.5s ease-out'
            }}
          />

          {/* ── Top bar ── */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            background: scanPhase === 'done' ? '#ffffff' : 'rgba(0,0,0,0.4)',
            borderBottom: scanPhase === 'done' ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid transparent',
            color: scanPhase === 'done' ? '#2c2c2e' : '#ffffff',
            transition: 'all 0.5s ease'
          }}>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', outline: 'none', opacity: 0.8 }}>
              <X size={22} />
            </button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'inherit', letterSpacing: '0.3px' }}>
              {scanPhase === 'scanning' ? 'Escaneando...' : scanPhase === 'cropping' ? 'Recortando...' : '✓ Listo'}
            </span>
            <div style={{ width: 22 }} />
          </div>

          {/* Main workspace container (overlay layout for crop alignment matching capture step bounds!) */}
          <div style={{ position: 'absolute', top: '54px', bottom: '140px', left: 0, right: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            {scanPhase === 'cropping' ? (
              <div style={{ position: 'absolute', inset: 0 }}>
                {/* Pixel-perfect clipped sheet lifting up */}
                <img
                  src={originalImage}
                  alt="Clipped sheet"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    clipPath: `polygon(${p1.x}% ${p1.y}%, ${p2.x}% ${p2.y}%, ${p3.x}% ${p3.y}%, ${p4.x}% ${p4.y}%)`,
                    animation: 'liftSheet 0.45s forwards ease-in-out',
                    zIndex: 3
                  }}
                />
                {/* Fading green crop outline */}
                <svg
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    animation: 'fadeOutLine 0.45s forwards ease-in-out',
                    zIndex: 4
                  }}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polygon
                    points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                    fill="rgba(0, 229, 160, 0.12)"
                    stroke="#00ff80"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
            ) : (
              /* Scanning & Done: Render centered matching capture step bounds exactly! */
              <div
                style={{
                  position: 'relative',
                  maxWidth: '85%',
                  maxHeight: '100%',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
                  background: '#fff',
                }}
              >
                <img
                  src={processedImage || capturedImage}
                  alt="Documento recortado"
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    maxHeight: 'calc(100vh - 210px)',
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
                      animation: 'sweepLaser 0.8s ease-in-out infinite',
                      zIndex: 10,
                    }} />
                    <div style={{
                      position: 'absolute', top: 0, left: 0, width: '100%', height: '90px',
                      background: 'linear-gradient(to bottom, rgba(0,229,160,0.10) 0%, transparent 100%)',
                      animation: 'sweepLaser 0.8s ease-in-out infinite',
                      zIndex: 9, pointerEvents: 'none',
                    }} />
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Bottom: filter row + action bar (shown when done) ── */}
          <div
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
              background: '#ffffff',
              borderTop: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 -8px 30px rgba(0,0,0,0.06)',
              opacity: scanPhase === 'done' ? 1 : 0,
              transform: scanPhase === 'done' ? 'translateY(0)' : 'translateY(100%)',
              transition: 'opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1), transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: scanPhase === 'done' ? 'auto' : 'none',
              paddingBottom: '24px',
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
                    background: activeFilter === id ? '#00b37e' : 'rgba(0, 0, 0, 0.05)',
                    color: activeFilter === id ? '#ffffff' : '#2c2c2e',
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
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#2c2c2e', cursor: 'pointer', fontSize: '10px', fontWeight: 600, opacity: 0.9 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={18} color="#2c2c2e" />
                </div>
                Volver a tomar
              </button>

              {/* Recortar / ajustar esquinas */}
              <button
                onClick={() => { setScanPhase('idle'); setStep('preview-full'); }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#2c2c2e', cursor: 'pointer', fontSize: '10px', fontWeight: 600, opacity: 0.9 }}
              >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2c2c2e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
                      setStep('ocr-processing');
                      setOcrProgress(2);
                      setOcrStatus('Preparando imagen...');
                      runRealOcr(finalImg, nextPages);
                    } else {
                      setStep('decide');
                    }
                  };
                  img.src = finalImg;
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#00b37e', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: '#00b37e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(0,179,126,0.3)',
                }}>
                  <Check size={26} strokeWidth={3} color="#ffffff" />
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

    </div>
  );
};
