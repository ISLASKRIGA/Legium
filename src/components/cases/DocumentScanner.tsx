import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Sparkles, Wand2, RefreshCw, ChevronRight } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { createSearchablePdf, warpPerspective, detectDocumentEdges, QuadPoints, DEFAULT_SCANNED_OCR_TEXT } from '../../utils/scannerPdf';
import { getPdfStorageKey, savePdfBlob } from '../../utils/pdfStorage';
import { DocumentItem } from '../../utils/types';
import { useDocumentDetection } from '../../hooks/useDocumentDetection';

interface DocumentScannerProps {
  onScanComplete: (newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

type FilterType = 'original' | 'magic' | 'bw';

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onScanComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'preview-full' | 'aligning' | 'beautify' | 'ocr' | 'saving'>('capture');
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
  
  // Drag corners state
  const [activeCorner, setActiveCorner] = useState<'p1' | 'p2' | 'p3' | 'p4' | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // OCR states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');

  // Video Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check camera access and start
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasCamera(true);
      setScannerMsg('Encuadre el documento...');
    } catch (err) {
      console.warn('No webcam access or no camera found, using file upload mode.', err);
      setHasCamera(false);
      setScannerMsg('Cámara no disponible. Sube un archivo de imagen.');
    }
  };

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
    try {
      // Warp perspective to flatten/straighten sheet
      const warped = await warpPerspective(imgDataUrl, quad, 800, 1100);
      setAlignProgress(70);

      // Animation buffer
      setTimeout(() => {
        setCapturedImage(warped.dataUrl);
        setAlignProgress(100);
        setStep('beautify');
      }, 1200);
    } catch (err) {
      console.error('Perspective warp failed:', err);
      setTimeout(() => {
        setCapturedImage(imgDataUrl);
        setStep('beautify');
      }, 1200);
    }
  };

  // Capture photo from video feed
  const capturePhoto = () => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);

    if (hasCamera && videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setOriginalImage(dataUrl);
        stopCamera();
        setStep('preview-full');
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

  // Drag Corners event handlers
  const handleCornerMouseDown = (e: React.MouseEvent, corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(corner);
  };

  const handleCornerTouchStart = (corner: 'p1' | 'p2' | 'p3' | 'p4') => {
    setActiveCorner(corner);
  };

  const handleCornerMouseMove = (e: React.MouseEvent) => {
    if (!activeCorner || !previewContainerRef.current) return;
    e.preventDefault();

    const rect = previewContainerRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((e.clientX - rect.left) / rect.width) * 100), 100);
    const y = Math.min(Math.max(0, ((e.clientY - rect.top) / rect.height) * 100), 100);

    setEdgePoints((prev) => ({
      ...prev,
      [activeCorner]: { x, y }
    }));
  };

  const handleCornerTouchMove = (e: React.TouchEvent) => {
    if (!activeCorner || !previewContainerRef.current) return;
    const touch = e.touches[0];
    const rect = previewContainerRef.current.getBoundingClientRect();
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

  const handleFinalSave = async () => {
    if (!capturedImage) return;

    setStep('ocr');
    setOcrProgress(5);
    setOcrStatus('Preparando documento...');

    try {
      // 1. Prepare filtered canvas
      const canvas = document.createElement('canvas');
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.filter = getFilterStyle(activeFilter);
            ctx.drawImage(img, 0, 0);
          }
          resolve();
        };
        img.src = capturedImage;
      });

      const processedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const croppedImageResult = {
        dataUrl: processedDataUrl,
        width: canvas.width,
        height: canvas.height
      };

      // 2. OCR real with Tesseract.js
      setOcrStatus('Iniciando motor de OCR...');
      const result = await Tesseract.recognize(processedDataUrl, 'spa', {
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
      const pdfBlob = createSearchablePdf(croppedImageResult, extractedText);
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

  const getFilterStyle = (f: FilterType): string => {
    if (f === 'magic') return 'contrast(1.4) brightness(1.08) saturate(1.1)';
    if (f === 'bw') return 'contrast(1.7) brightness(1.05) grayscale(1)';
    return 'none';
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
                  Escáner de Documento de Caso
                </p>
                <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                  Cámara no disponible. Sube una foto de tu documento para ajustar sus esquinas y recortarlo.
                </p>
              </div>
            )}

            {/* SVG Edge Detection Overlay */}
            {hasCamera && sheetDetected && (
              <svg
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  pointerEvents: 'none', zIndex: 4
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                  style={{
                    fill: 'rgba(0, 255, 128, 0.08)',
                    stroke: '#00ff80',
                    strokeWidth: '1.2',
                    transition: 'all 0.08s ease-out',
                    filter: 'drop-shadow(0 0 3px #00ff80)'
                  }}
                />
              </svg>
            )}

            {/* Status badge */}
            <div
              style={{
                position: 'absolute', bottom: '52px', left: '50%',
                transform: 'translateX(-50%)',
                background: sheetDetected ? 'rgba(0, 255, 128, 0.9)' : 'rgba(255, 255, 255, 0.25)',
                color: '#fff', fontSize: '11px', padding: '6px 14px',
                borderRadius: '99px', fontWeight: 600,
                backdropFilter: 'blur(10px)', zIndex: 5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                transition: 'all 0.3s ease', whiteSpace: 'nowrap'
              }}
            >
              {scannerMsg}
            </div>

            {/* Floating Individual / Lote pill inside camera feed */}
            <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', display: 'flex', background: 'rgba(0,0,0,0.6)', padding: '3px', borderRadius: '20px', zIndex: 5, border: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', fontSize: '11.5px', fontWeight: 600, padding: '5px 14px', borderRadius: '18px' }}>Individual</span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11.5px', fontWeight: 600, padding: '5px 14px', borderRadius: '18px', cursor: 'pointer' }}>Lote</span>
            </div>

            <div className={`flash-overlay ${flashActive ? 'flash-active' : ''}`} />
          </div>

          {/* Mode selector slider */}
          <div style={{ background: '#000', overflowX: 'auto', padding: '12px 0 6px 0', display: 'flex', justifyContent: 'center', gap: '20px', whiteSpace: 'nowrap', borderTop: '1px solid rgba(255,255,255,0.05)', userSelect: 'none' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11.5px', fontWeight: 600 }}>Tarjeta de identidad</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11.5px', fontWeight: 600 }}>Firmar</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-11px', width: '5px', height: '5px', backgroundColor: '#e2883e', borderRadius: '50%' }} />
              <span style={{ color: '#00ff80', fontSize: '11.5px', fontWeight: 700 }}>Escanear</span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11.5px', fontWeight: 600 }}>A Word</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11.5px', fontWeight: 600 }}>Conjunto</span>
          </div>

          {/* Camera controls - matches CamScanner example */}
          <div className="scanner-controls" style={{ background: '#000', padding: '16px 36px 28px 36px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Grid button (Left) */}
            <button
              onClick={() => {}}
              style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', outline: 'none', opacity: 0.9 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="5" height="5" />
                <rect x="10" y="3" width="5" height="5" />
                <rect x="17" y="3" width="5" height="5" />
                <rect x="3" y="10" width="5" height="5" />
                <rect x="10" y="10" width="5" height="5" />
                <rect x="17" y="10" width="5" height="5" />
                <rect x="3" y="17" width="5" height="5" />
                <rect x="10" y="17" width="5" height="5" />
                <rect x="17" y="17" width="5" height="5" />
              </svg>
            </button>

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

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            
            {/* Import gallery button (Right) */}
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
      )}

      {step === 'preview-full' && originalImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, padding: '16px', background: '#1c1c1e', height: '100%', justifyContent: 'space-between' }}>
          <span style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 600 }}>
            Ajusta los puntos en las esquinas para encuadrar la hoja
          </span>

          <div 
            ref={previewContainerRef}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img 
              src={originalImage} 
              alt="Scan Preview Full"
              draggable={false}
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%', 
                objectFit: 'contain',
                display: 'block'
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
                zIndex: 10
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
              
              {/* Corner Circular Handles */}
              <circle cx={p1.x} cy={p1.y} r="2.8" fill="#fff" stroke="#00ff80" strokeWidth="0.8" style={{ cursor: 'move' }} onMouseDown={(e) => handleCornerMouseDown(e, 'p1')} onTouchStart={() => handleCornerTouchStart('p1')} />
              <circle cx={p2.x} cy={p2.y} r="2.8" fill="#fff" stroke="#00ff80" strokeWidth="0.8" style={{ cursor: 'move' }} onMouseDown={(e) => handleCornerMouseDown(e, 'p2')} onTouchStart={() => handleCornerTouchStart('p2')} />
              <circle cx={p3.x} cy={p3.y} r="2.8" fill="#fff" stroke="#00ff80" strokeWidth="0.8" style={{ cursor: 'move' }} onMouseDown={(e) => handleCornerMouseDown(e, 'p3')} onTouchStart={() => handleCornerTouchStart('p3')} />
              <circle cx={p4.x} cy={p4.y} r="2.8" fill="#fff" stroke="#00ff80" strokeWidth="0.8" style={{ cursor: 'move' }} onMouseDown={(e) => handleCornerMouseDown(e, 'p4')} onTouchStart={() => handleCornerTouchStart('p4')} />

              {/* Edge mid-point pills */}
              <g transform={`translate(${mid1.mx}, ${mid1.my}) rotate(${mid1.angle})`}>
                <rect x="-4" y="-1.1" width="8" height="2.2" rx="1.1" fill="#fff" stroke="#00ff80" strokeWidth="0.3" />
              </g>
              <g transform={`translate(${mid2.mx}, ${mid2.my}) rotate(${mid2.angle})`}>
                <rect x="-4" y="-1.1" width="8" height="2.2" rx="1.1" fill="#fff" stroke="#00ff80" strokeWidth="0.3" />
              </g>
              <g transform={`translate(${mid3.mx}, ${mid3.my}) rotate(${mid3.angle})`}>
                <rect x="-4" y="-1.1" width="8" height="2.2" rx="1.1" fill="#fff" stroke="#00ff80" strokeWidth="0.3" />
              </g>
              <g transform={`translate(${mid4.mx}, ${mid4.my}) rotate(${mid4.angle})`}>
                <rect x="-4" y="-1.1" width="8" height="2.2" rx="1.1" fill="#fff" stroke="#00ff80" strokeWidth="0.3" />
              </g>
            </svg>
          </div>

          {/* Bottom toolbar */}
          <div style={{ background: '#000', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px' }}>
            <button 
              onClick={() => setEdgePoints({ p1: { x: 5, y: 5 }, p2: { x: 95, y: 5 }, p3: { x: 95, y: 95 }, p4: { x: 5, y: 95 } })}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '11px', opacity: 0.9 }}
            >
              <span style={{ fontSize: '18px' }}>🔳</span>
              All
            </button>

            <button 
              onClick={() => rotateImage('left')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '11px', opacity: 0.9 }}
            >
              <span style={{ fontSize: '18px' }}>↩️</span>
              Left
            </button>

            <button 
              onClick={() => rotateImage('right')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '11px', opacity: 0.9 }}
            >
              <span style={{ fontSize: '18px' }}>↪️</span>
              Right
            </button>

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
              <ChevronRight size={24} style={{ strokeWidth: 3 }} />
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
            <img 
              src={originalImage} 
              alt="Scan aligning"
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                opacity: 0.65
              }} 
            />
            
            {/* Outline overlay */}
            <svg 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                pointerEvents: 'none'
              }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                fill="rgba(0, 255, 128, 0.08)"
                stroke="#00ff80"
                strokeWidth="1.5"
                strokeLinejoin="round"
                style={{
                  filter: 'drop-shadow(0 0 4px #00ff80)',
                  animation: 'warpPulse 1.2s ease-in-out infinite'
                }}
              />
            </svg>

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
                animation: 'sweepLaser 1.2s ease-in-out infinite',
                zIndex: 5
              }}
            />
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
                src={capturedImage} 
                alt="Enhanced Preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  display: 'block',
                  filter: getFilterStyle(activeFilter),
                  transition: 'all 0.3s ease'
                }} 
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
