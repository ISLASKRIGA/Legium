import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Sparkles, Wand2, RefreshCw, ChevronRight, Plus, Files } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { createSearchablePdf, createMultiPagePdf, warpPerspective, detectDocumentEdges, QuadPoints, DEFAULT_SCANNED_OCR_TEXT, CroppedImageResult } from '../../utils/scannerPdf';
import { getPdfStorageKey, savePdfBlob } from '../../utils/pdfStorage';
import { DocumentItem } from '../../utils/types';
import { useDocumentDetection } from '../../hooks/useDocumentDetection';
import { enhanceImage } from './OcrScanner';

interface DocumentScannerProps {
  onScanComplete: (newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

type FilterType = 'original' | 'magic' | 'bw';

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onScanComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'preview-full' | 'aligning' | 'beautify' | 'decide' | 'ocr' | 'saving'>('capture');
  const [scanMode, setScanMode] = useState<'individual' | 'lote'>('individual');
  const [scannedPages, setScannedPages] = useState<CroppedImageResult[]>([]);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scannerMsg, setScannerMsg] = useState('Coloque el documento en el recuadro');
  const [fileName, setFileName] = useState(`Documento_Escaneado_${Date.now().toString().slice(-4)}.pdf`);
  
  // Real-time detection state
  const [edgePoints, setEdgePoints] = useState<QuadPoints>({
    p1: { x: 15, y: 10 },
    p2: { x: 85, y: 10 },
    p3: { x: 83, y: 90 },
    p4: { x: 17, y: 90 }
  });
  const [sheetDetected, setSheetDetected] = useState(false);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [alignProgress, setAlignProgress] = useState(0);
  const [scanPhase, setScanPhase] = useState<'idle' | 'captured' | 'cropping' | 'straightening' | 'scanning' | 'done'>('idle');
  
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

  // OCR states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

  useEffect(() => {
    // Reset zoom on filter/step/image changes
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });

    if (capturedImage && step === 'beautify') {
      setIsEnhancing(true);
      enhanceImage(capturedImage, activeFilter)
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
  }, [capturedImage, activeFilter, step]);

  // Video Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check camera access and start
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
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setCameraStream(stream);
      setHasCamera(true);
      setScannerMsg('Encuadre el documento...');
    } catch (err) {
      console.warn('No webcam access or no camera found, using file upload mode.', err);
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

  // Run real-time edge detection when in capture step
  useDocumentDetection({
    videoRef,
    active: step === 'capture' && hasCamera,
    onDetection: (quad, confidence) => {
      setEdgePoints(quad);
      setDetectionConfidence(confidence);
      const detected = confidence > 0.45;
      setSheetDetected(detected);

      if (detected) {
        setScannerMsg('✓ Documento enfocado');
      } else {
        setScannerMsg('Apunta la cámara al escrito...');
      }
    }
  });

  // Alignment and Warping Process
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
            setStep('beautify');
          }, 1500);
        } catch (innerErr) {
          console.error('Perspective warp failed inside timeout:', innerErr);
          setCapturedImage(imgDataUrl);
          setScanPhase('done');
          setStep('beautify');
        }
      }, 1200);
    } catch (err) {
      console.error('Perspective warp failed:', err);
      setCapturedImage(imgDataUrl);
      setStep('beautify');
    }
  };

  // Capture photo from video feed
  const capturePhoto = () => {
    setFlashActive(true);
    setScanPhase('captured');

    if (hasCamera && videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
        setOriginalImage(dataUrl);
        
        setTimeout(() => {
          setFlashActive(false);
          setStep('preview-full');
          stopCamera();
        }, 250);
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
            setStep('preview-full');
          };
          tempImg.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Rotate image 90 degrees Left or Right
  const rotateImage = (direction: 'left' | 'right') => {
    if (!originalImage) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (direction === 'left') {
          ctx.translate(0, img.width);
          ctx.rotate(-Math.PI / 2);
        } else {
          ctx.translate(img.height, 0);
          ctx.rotate(Math.PI / 2);
        }
        ctx.drawImage(img, 0, 0);
        const rotatedUrl = canvas.toDataURL('image/jpeg');
        setOriginalImage(rotatedUrl);

        // Run edge detection on rotated image
        const tempImg = new Image();
        tempImg.onload = () => {
          const detectedQuad = detectDocumentEdges(tempImg);
          setEdgePoints(detectedQuad);
        };
        tempImg.src = rotatedUrl;
      }
    };
    img.src = originalImage;
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

  // Drag Corners event handlers
  const handleCornerMouseDown = (e: React.MouseEvent, corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(corner);
  };

  const handleCornerTouchStart = (e: React.TouchEvent, corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(corner);
  };

  const handleCornerMouseMove = (e: React.MouseEvent) => {
    if (!activeCorner || !previewImageRef.current) return;
    e.preventDefault();

    const rect = previewImageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((e.clientX - rect.left) / rect.width) * 100), 100);
    const y = Math.min(Math.max(0, ((e.clientY - rect.top) / rect.height) * 100), 100);

    setEdgePoints((prev) => ({
      ...prev,
      [activeCorner]: { x, y }
    }));
  };

  const handleCornerTouchMove = (e: React.TouchEvent) => {
    if (!activeCorner || !previewImageRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = previewImageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((touch.clientX - rect.left) / rect.width) * 100), 100);
    const y = Math.min(Math.max(0, ((touch.clientY - rect.top) / rect.height) * 100), 100);

    setEdgePoints((prev) => ({
      ...prev,
      [activeCorner]: { x, y }
    }));
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setActiveCorner(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  const runOcrAndSave = async (pages: CroppedImageResult[]) => {
    if (pages.length === 0) return;
    setStep('ocr');
    setOcrProgress(5);
    setOcrStatus('Preparando documento...');

    try {
      setOcrStatus('Iniciando motor de OCR...');
      const firstPageUrl = pages[0].dataUrl;
      const result = await Tesseract.recognize(firstPageUrl, 'spa', {
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

      const extractedText = result.data.text || DEFAULT_SCANNED_OCR_TEXT;
      setOcrProgress(100);
      setOcrStatus('Texto extraído correctamente.');

      // 3. Generate PDF and complete
      setStep('saving');
      
      const pdfBlob = pages.length > 1 
        ? createMultiPagePdf(pages, extractedText)
        : createSearchablePdf(pages[0], extractedText);

      const sizeKB = (pdfBlob.size / 1024).toFixed(1);
      const docId = 'doc-' + Date.now();

      const newDoc: DocumentItem = {
        id: docId,
        name: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
        size: sizeKB + ' KB',
        uploadDate: new Date().toISOString().split('T')[0],
        ocrText: extractedText,
        storageKey: caseId => caseId + '/' + docId + '.pdf'
      };

      // Wait a moment for UX
      setTimeout(() => {
        onScanComplete(newDoc, pdfBlob);
      }, 500);
    } catch (err) {
      console.error('Error during OCR or PDF generation:', err);
      setStep('beautify');
    }
  };

  const handleFinalSave = async () => {
    const finalImg = processedImage || capturedImage;
    if (!finalImg) return;

    const img = new Image();
    img.onload = () => {
      const rendered = {
        dataUrl: finalImg,
        width: img.width,
        height: img.height
      };
      const nextPages = [...scannedPages, rendered];
      setScannedPages(nextPages);
      if (scanMode === 'individual') {
        runOcrAndSave(nextPages);
      } else {
        setStep('decide');
      }
    };
    img.src = finalImg;
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
    <div className="scanner-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1c1c1e', padding: 0 }}>
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
      `}</style>
       {/* Top Bar for camera */}
      {step === 'capture' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', color: '#fff', alignItems: 'center', background: '#000', height: '54px' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', height: '100%', justifyContent: 'space-between' }}>
          <div className="camera-preview-wrapper" style={{ flexGrow: 1, height: 'calc(100vh - 240px)', width: '100%', position: 'relative', borderRadius: 0, overflow: 'hidden', background: '#000' }}>
            {hasCamera && scanPhase !== 'captured' ? (
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
                  zIndex: 2,
                  transform: 'translate3d(0, 0, 0)',
                  WebkitTransform: 'translate3d(0, 0, 0)',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden'
                }}
              />
            ) : (
              (scanPhase === 'captured' && originalImage) ? (
                <img
                  src={originalImage}
                  alt="Captured still"
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
                    Escáner de Documento de Caso
                  </p>
                  <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                    Cámara no disponible. Sube una foto de tu documento para ajustar sus esquinas y recortarlo.
                  </p>
                </div>
              )
            )}

            {/* ── SVG Perspective Quad Overlay ── */}
            {hasCamera && sheetDetected && (
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
                  <filter id="doc-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="0.7" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                {/* Translucent perspective fill */}
                <polygon
                  points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                  fill="rgba(0,212,170,0.10)"
                  stroke="#00d4aa"
                  strokeWidth="0.9"
                  strokeLinejoin="round"
                  filter="url(#doc-glow)"
                  style={{ transition: 'all 0.1s ease-out' }}
                />
              </svg>
            )}

            <div className={`flash-overlay ${flashActive ? 'flash-active' : ''}`} />
          </div>

          {/* Floating Bottom Menu & Controls */}
          <div style={{ background: '#000', display: 'flex', flexDirection: 'column', borderTop: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0', paddingTop: '10px' }}>
            {/* Mode selector: Raised Individual / Lote pills */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '8px 0 6px 0', userSelect: 'none' }}>
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
          </div>

          {/* Camera controls - matches CamScanner example */}
          <div className="scanner-controls" style={{
            background: '#000',
            padding: '16px 36px 28px 36px',
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
            
            {/* Draggable Polygon Overlay */}
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
            </div>
          </div>

          {/* Bottom toolbar */}
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '320px', gap: '20px', background: '#1c1c1e', flexGrow: 1 }}>
          <h4 style={{ fontWeight: '700', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={18} className="spinning" style={{ color: '#00ff80' }} /> Alineando y Rectificando
          </h4>
          
          <div 
            style={{ 
              position: 'relative', 
              width: '220px', 
              height: '300px', 
              borderRadius: '10px', 
              overflow: 'hidden', 
              boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
              background: '#121214'
            }}
          >
            {scanPhase === 'cropping' ? (
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Background of full original photo (remains frozen) */}
                <img
                  src={originalImage}
                  alt="Uncropped bg"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
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
                    top: 0,
                    left: 0,
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
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Frozen original background image */}
                <img
                  src={originalImage}
                  alt="Uncropped bg"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.65,
                    zIndex: 1
                  }}
                />
                <img
                  src={capturedImage}
                  alt="Documento recortado"
                  style={{
                    position: 'relative',
                    width: '90%',
                    height: '90%',
                    objectFit: 'contain',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    zIndex: 2
                  }}
                />
                {/* Sweep laser line */}
                <div 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '3px',
                    background: 'linear-gradient(to right, transparent, #007aff, #00ff80, #007aff, transparent)',
                    boxShadow: '0 0 10px #00ff80, 0 0 3px #007aff',
                    animation: 'sweepLaser 0.8s ease-in-out infinite',
                    zIndex: 5
                  }}
                />
              </div>
            )}
          </div>

          <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Procesando alineación y corrigiendo perspectiva...
          </p>
        </div>
      )}

      {step === 'beautify' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, justifyContent: 'space-between', height: '100%', background: '#1c1c1e', padding: '16px' }}>
          <span className="health-label" style={{ textAlign: 'center', color: '#fff' }}>
            Realce Digital (CamScanner) e Inicio de OCR
          </span>

          <div 
            style={{ 
              height: '240px', 
              width: '100%', 
              background: '#121214', 
              borderRadius: '12px', 
              overflow: 'hidden', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.5)',
              position: 'relative'
            }}
          >
            <div 
              style={{ 
                position: 'relative', 
                maxWidth: '90%', 
                maxHeight: '90%', 
                overflow: 'hidden',
                boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                borderRadius: '4px' 
              }}
            >
              <img 
                src={processedImage || capturedImage} 
                alt="Enhanced Preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  display: 'block',
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
            </div>
            
            <div 
              style={{ 
                position: 'absolute', 
                top: '10px', 
                right: '10px', 
                background: 'rgba(0,122,255,0.85)', 
                color: '#fff', 
                fontSize: '10px', 
                fontWeight: 700, 
                padding: '3px 8px', 
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Wand2 size={10} /> Realce Automático Activo
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(255,255,255,0.04)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              onClick={() => setActiveFilter('original')}
              style={{ 
                background: activeFilter === 'original' ? '#fff' : 'transparent',
                border: activeFilter === 'original' ? '1px solid rgba(0,0,0,0.1)' : 'none',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: activeFilter === 'original' ? '#111' : 'rgba(255,255,255,0.6)',
                fontWeight: activeFilter === 'original' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '14px' }}>📷</span>
              Original
            </button>

            <button
              onClick={() => setActiveFilter('magic')}
              style={{ 
                background: activeFilter === 'magic' ? 'var(--primary-blue)' : 'transparent',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: activeFilter === 'magic' ? '#fff' : 'rgba(255,255,255,0.6)',
                fontWeight: activeFilter === 'magic' ? 600 : 400
              }}
            >
              <Sparkles size={12} style={{ color: activeFilter === 'magic' ? '#fff' : 'var(--primary-gold)' }} />
              Realce Mágico
            </button>

            <button
              onClick={() => setActiveFilter('bw')}
              style={{ 
                background: activeFilter === 'bw' ? '#fff' : 'transparent',
                border: activeFilter === 'bw' ? '1px solid rgba(0,0,0,0.1)' : 'none',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: activeFilter === 'bw' ? '#111' : 'rgba(255,255,255,0.6)',
                fontWeight: activeFilter === 'bw' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '14px' }}>🏁</span>
              B y N
            </button>
          </div>

          <div className="form-group" style={{ margin: '0 4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#fff' }}>Nombre del Documento PDF</label>
            <input 
              type="text" 
              className="form-control" 
              value={fileName} 
              onChange={(e) => setFileName(e.target.value)} 
              placeholder="Ej. Escrito_Tribunal.pdf"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          <div className="scanner-controls" style={{ gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('preview-full');
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.08)', color: '#fff' }}
            >
              Ajustar Esquinas
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={handleFinalSave}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              Procesar y Guardar <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

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
              <div key={i} style={{ position: 'relative', width: '78%', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.6)', background: '#fff' }}>
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

            {/* Continuar → OCR + PDF + finalización */}
            <button
              onClick={() => runOcrAndSave(scannedPages)}
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

      {step === 'ocr' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', flexGrow: 1, background: '#1c1c1e', minHeight: '300px' }}>
          <div style={{ position: 'relative', width: '50px', height: '50px', marginBottom: '16px' }}>
            <div className="health-indicator pulsing" style={{ width: '40px', height: '40px', backgroundColor: 'var(--primary-gold)', margin: '5px' }} />
            <RefreshCw size={24} className="spinning" style={{ position: 'absolute', top: '13px', left: '13px', color: '#fff' }} />
          </div>
          
          <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#fff' }}>Extrayendo Texto (OCR)</h4>
          
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

      {step === 'saving' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', flexGrow: 1, background: '#1c1c1e', minHeight: '300px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'rgba(52,199,89,0.15)', color: '#34c759', marginBottom: '16px' }}>
            <Check size={24} />
          </div>
          <h4 style={{ fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Guardando PDF</h4>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
            Procesando y guardando documento en el expediente...
          </p>
        </div>
      )}

    </div>
  );
};
