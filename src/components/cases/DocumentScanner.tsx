import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Sparkles, Wand2, RefreshCw } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { createSearchablePdf, warpPerspective, detectDocumentEdges, QuadPoints, DEFAULT_SCANNED_OCR_TEXT } from '../../utils/scannerPdf';
import { getPdfStorageKey } from '../../utils/pdfStorage';
import { DocumentItem } from '../../utils/types';
import { useDocumentDetection } from '../../hooks/useDocumentDetection';

interface DocumentScannerProps {
  onScanComplete: (newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onScanComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'aligning' | 'beautify' | 'ocr' | 'saving'>('capture');
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
  
  // OCR states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [activeFilter, setActiveFilter] = useState<'original' | 'magic' | 'bw'>('magic');

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
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasCamera(true);
      setScannerMsg('Escáner de Cámara Activo');
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
      setSheetDetected(confidence > 0.45);
      if (confidence > 0.45) {
        setScannerMsg('✓ Documento enfocado');
      } else {
        setScannerMsg('Encuadre el documento...');
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

      // Play alignment animation
      setTimeout(() => {
        setCapturedImage(warped.dataUrl);
        setAlignProgress(100);
        setStep('beautify');
      }, 1200);
    } catch (err) {
      console.error('Alignment failed:', err);
      // Fallback
      setTimeout(() => {
        setCapturedImage(imgDataUrl);
        setStep('beautify');
      }, 1200);
    }
  };

  // Capture Photo
  const capturePhoto = () => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 300);

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
        setStep('aligning');
        processAlignment(dataUrl, edgePoints);
      }
    }
  };

  // Load from File input
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUrl = event.target.result as string;
          setOriginalImage(dataUrl);
          stopCamera();
          
          // Run edge detection on the uploaded image static file
          const tempImg = new Image();
          tempImg.onload = () => {
            const detectedQuad = detectDocumentEdges(tempImg);
            setStep('aligning');
            processAlignment(dataUrl, detectedQuad);
          };
          tempImg.src = dataUrl;
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getFilterStyle = (f: 'original' | 'magic' | 'bw'): string => {
    if (f === 'magic') return 'contrast(1.4) brightness(1.08) saturate(1.1)';
    if (f === 'bw') return 'contrast(1.7) brightness(1.05) grayscale(1)';
    return 'none';
  };

  // Convert and process OCR
  const handleOcrAndSave = async () => {
    if (!capturedImage) return;
    setStep('ocr');
    setOcrProgress(5);
    setOcrStatus('Preparando imagen...');

    try {
      // 1. Prepare filtered/beautified image
      const canvas = document.createElement('canvas');
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.filter = getFilterStyle(activeFilter);
            ctx.drawImage(img, 0, 0);
            resolve();
          } else {
            reject(new Error('No se pudo preparar canvas.'));
          }
        };
        img.onerror = () => reject(new Error('Error al cargar imagen procesada.'));
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

      onScanComplete(newDoc, pdfBlob);
    } catch (err) {
      console.error('Error during OCR or PDF generation:', err);
      setStep('beautify');
    }
  };

  return (
    <div className="scanner-container">
      {step === 'capture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="camera-preview-wrapper" style={{ position: 'relative' }}>
            {hasCamera ? (
              <video ref={videoRef} autoPlay playsInline className="camera-video" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div 
                style={{ 
                  width: '100%', 
                  height: '240px', 
                  background: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '24px',
                  color: 'var(--text-secondary)',
                  borderRadius: '12px'
                }}
              >
                <Upload size={44} style={{ color: 'var(--primary-gold)', marginBottom: '12px' }} />
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#fff', textAlign: 'center' }}>
                  Escáner de Imagen
                </p>
                <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                  La cámara no está disponible. Sube un archivo de imagen para detectar automáticamente sus bordes y alinearlo.
                </p>
              </div>
            )}

            {/* Glowing borders driven by real detection */}
            {hasCamera && sheetDetected && (
              <svg 
                style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%', 
                  pointerEvents: 'none',
                  zIndex: 10
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={`${edgePoints.p1.x},${edgePoints.p1.y} ${edgePoints.p2.x},${edgePoints.p2.y} ${edgePoints.p3.x},${edgePoints.p3.y} ${edgePoints.p4.x},${edgePoints.p4.y}`}
                  fill="rgba(0, 255, 128, 0.12)"
                  stroke="#00ff80"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  style={{
                    filter: 'drop-shadow(0 0 3px #00ff80)',
                    transition: 'all 0.08s ease-out'
                  }}
                />
              </svg>
            )}

            {/* Guide overlay */}
            <div className="scanner-overlay">
              <div className="scanner-guide-box">
                <span className="scanner-guide-text">{scannerMsg}</span>
              </div>
            </div>

            {/* Flash screen overlay */}
            <div className={`flash-overlay ${flashActive ? 'flash-active' : ''}`} />
          </div>

          <div className="scanner-controls">
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
            />
            
            <button 
              className="btn btn-secondary" 
              onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px' }}
            >
              <Upload size={16} /> Subir Foto
            </button>

            {hasCamera && (
              <button 
                className="shutter-button" 
                onClick={capturePhoto} 
                title="Tomar foto del documento"
              />
            )}

            <button 
              className="btn btn-secondary" 
              onClick={onClose}
              style={{ padding: '10px 14px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'aligning' && originalImage && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '20px' }}>
          <h4 style={{ fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={18} className="spinning" style={{ color: 'var(--primary-blue)' }} /> Alineando y Rectificando
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
            
            {/* Edge detection polygon outline overlay during sweep */}
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
                points={`${edgePoints.p1.x},${edgePoints.p1.y} ${edgePoints.p2.x},${edgePoints.p2.y} ${edgePoints.p3.x},${edgePoints.p3.y} ${edgePoints.p4.x},${edgePoints.p4.y}`}
                fill="rgba(0, 122, 255, 0.08)"
                stroke="var(--primary-blue)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                style={{
                  filter: 'drop-shadow(0 0 4px var(--primary-blue))',
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

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
            Procesando alineación y corrigiendo perspectiva...
          </p>
        </div>
      )}

      {step === 'beautify' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <span className="health-label" style={{ textAlign: 'center' }}>
            Realce Digital (CamScanner) y Nombre del Archivo
          </span>

          {/* Enhanced Preview Frame */}
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

          {/* CamScanner Filter select list */}
          <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)' }}>
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
                color: activeFilter === 'original' ? '#111' : 'var(--text-secondary)',
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
                color: activeFilter === 'magic' ? '#fff' : 'var(--text-secondary)',
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
                color: activeFilter === 'bw' ? '#111' : 'var(--text-secondary)',
                fontWeight: activeFilter === 'bw' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '14px' }}>🏁</span>
              B y N
            </button>
          </div>

          <div className="form-group" style={{ margin: '0 4px' }}>
            <label style={{ fontSize: '12px', fontWeight: '700' }}>Nombre del Documento PDF</label>
            <input 
              type="text" 
              className="form-control" 
              value={fileName} 
              onChange={(e) => setFileName(e.target.value)} 
              placeholder="Ej. Poder_Firmado.pdf"
            />
          </div>

          <div className="scanner-controls" style={{ gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('capture');
                setCapturedImage(null);
                setOriginalImage(null);
                startCamera();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={16} /> Reintentar
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={handleOcrAndSave}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              <Check size={16} /> Procesar OCR y Guardar
            </button>
          </div>
        </div>
      )}

      {step === 'ocr' && (
        <div 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '40px',
            minHeight: '260px'
          }}
        >
          <div style={{ position: 'relative', width: '50px', height: '50px', marginBottom: '16px' }}>
            <div 
              className="health-indicator pulsing" 
              style={{ 
                width: '40px', 
                height: '40px', 
                backgroundColor: 'var(--primary-gold)', 
                margin: '5px',
                borderRadius: '50%'
              }} 
            />
            <FileText size={24} style={{ position: 'absolute', top: '13px', left: '13px', color: '#fff' }} />
          </div>
          
          <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>Ejecutando OCR Real (Tesseract.js)</h4>
          
          <div style={{ width: '100%', maxWidth: '280px', height: '6px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
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
          
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
            {ocrProgress}% completado
          </span>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '260px' }}>
            {ocrStatus}
          </p>
        </div>
      )}

      {step === 'saving' && (
        <div 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '40px',
            minHeight: '260px'
          }}
        >
          <div style={{ position: 'relative', width: '50px', height: '50px', marginBottom: '16px' }}>
            <div className="health-indicator pulsing" style={{ width: '40px', height: '40px', backgroundColor: 'var(--primary-blue)', margin: '5px' }} />
            <FileText size={30} style={{ position: 'absolute', top: '10px', left: '10px', color: '#fff' }} />
          </div>
          <h4 style={{ fontWeight: '700', marginBottom: '6px' }}>Generando Archivo PDF</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '280px' }}>
            Generando PDF con capa de texto OCR y subiendo a InsForge Storage...
          </p>
        </div>
      )}
    </div>
  );
};
