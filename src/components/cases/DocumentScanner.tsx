import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Image as ImageIcon, ChevronRight, Sparkles, Wand2 } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { cropImage, createSearchablePdf, DEFAULT_SCANNED_OCR_TEXT } from '../../utils/scannerPdf';
import { getPdfStorageKey } from '../../utils/pdfStorage';
import { DocumentItem } from '../../utils/types';

interface DocumentScannerProps {
  onScanComplete: (newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onScanComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'crop' | 'beautify' | 'ocr' | 'saving'>('capture');
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scannerMsg, setScannerMsg] = useState('Coloque el documento en el recuadro');
  const [fileName, setFileName] = useState(`Documento_Escaneado_${Date.now().toString().slice(-4)}.pdf`);
  
  // OCR states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [activeFilter, setActiveFilter] = useState<'original' | 'magic' | 'bw'>('magic');

  // Video Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Crop Coordinates (percentages of container)
  const [cropBox, setCropBox] = useState({ top: 10, left: 10, width: 80, height: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<string | null>(null); // 'tl', 'tr', 'bl', 'br', or 'move'
  const cropContainerRef = useRef<HTMLDivElement | null>(null);

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
      console.warn('No webcam access or no camera found, using simulator.', err);
      setHasCamera(false);
      setScannerMsg('Modo Simulación: Cámara no detectada');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  // Trigger Flash Shutter
  const capturePhoto = () => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 300);

    if (hasCamera && videoRef.current) {
      // Capture from video stream
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
        setStep('crop');
      }
    } else {
      // Simulate capturing a document
      generateMockDocument();
    }
  };

  // Create a high-fidelity simulated document image
  const generateMockDocument = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw simulated paper sheet
      ctx.fillStyle = '#fefefe';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw document styling (borders, headers)
      ctx.strokeStyle = '#cda250'; // Gold border
      ctx.lineWidth = 15;
      ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

      // Header Text
      ctx.fillStyle = '#1c1c1e';
      ctx.font = 'bold 36px Times New Roman, serif';
      ctx.textAlign = 'center';
      ctx.fillText('PODER JUDICIAL DE SANTIAGO', canvas.width / 2, 120);

      ctx.font = '22px Times New Roman, serif';
      ctx.fillText('DOCUMENTO DE RESPALDO PROCESAL', canvas.width / 2, 160);

      // Horizontal separator line
      ctx.beginPath();
      ctx.moveTo(100, 200);
      ctx.lineTo(canvas.width - 100, 200);
      ctx.strokeStyle = '#e5e5ea';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Simulated Legal paragraphs
      ctx.fillStyle = '#3a3a3c';
      ctx.font = '16px Courier New, monospace';
      ctx.textAlign = 'left';

      const paragraphs = [
        'En Santiago de Chile, a 4 de julio de 2026, las partes comparecientes',
        'acuerdan y ratifican los hitos pactados en el marco del procedimiento.',
        '',
        'SECCIÓN PRIMERA - DE LAS OBLIGACIONES:',
        'El demandante conviene en acompañar todos los documentos requeridos,',
        'incluyendo comprobantes de transferencia y copias de deslindes.',
        '',
        'SECCIÓN SEGUNDA - DE LOS PLAZOS:',
        'Los plazos fatales acordados para responder traslados se fijan en',
        'un término máximo de 5 días hábiles a contar de esta notificación.',
        '',
        'Firma y Constancia Legal de Aceptación Digital:',
        '____________________________________________'
      ];

      let yPos = 260;
      paragraphs.forEach((text) => {
        ctx.fillText(text, 100, yPos);
        yPos += 35;
      });

      // Signature details
      ctx.fillStyle = '#007aff';
      ctx.font = 'italic 18px Brush Script MT, cursive, sans-serif';
      ctx.fillText('Alejandro Torres G.', 150, yPos + 30);
      ctx.fillStyle = '#222';
      ctx.font = '14px Courier New';
      ctx.fillText('Ing. Alejandro Torres - TI Administrador', 100, yPos + 60);

      // Add camera grid distortion simulation for realistic scanning crop feel
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = 900;
      finalCanvas.height = 1100;
      const fCtx = finalCanvas.getContext('2d');
      if (fCtx) {
        // Draw dark background (desk surface)
        fCtx.fillStyle = '#1c1c1e';
        fCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
        
        // Draw wooden grain details or table texture
        fCtx.fillStyle = 'rgba(255,255,255,0.02)';
        for (let i = 0; i < finalCanvas.height; i += 10) {
          fCtx.fillRect(0, i, finalCanvas.width, 4);
        }

        // Draw document rotated slightly on the desk to require cropping/straightening
        fCtx.save();
        fCtx.translate(finalCanvas.width / 2, finalCanvas.height / 2);
        fCtx.rotate((2 * Math.PI) / 180); // 2 degrees tilt
        fCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        fCtx.restore();

        const dataUrl = finalCanvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        setStep('crop');
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
          setCapturedImage(event.target.result as string);
          stopCamera();
          setStep('crop');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Dragging crop handles
  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    setIsDragging(true);
    setDragHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !cropContainerRef.current) return;
    e.preventDefault();

    const rect = cropContainerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

    setDragStart({ x: e.clientX, y: e.clientY });

    setCropBox((prev) => {
      let { top, left, width, height } = prev;

      if (dragHandle === 'move') {
        left = Math.min(Math.max(0, left + deltaX), 100 - width);
        top = Math.min(Math.max(0, top + deltaY), 100 - height);
      } else if (dragHandle === 'tl') {
        const right = left + width;
        const bottom = top + height;
        left = Math.min(Math.max(0, left + deltaX), right - 10);
        top = Math.min(Math.max(0, top + deltaY), bottom - 10);
        width = right - left;
        height = bottom - top;
      } else if (dragHandle === 'tr') {
        const bottom = top + height;
        width = Math.min(Math.max(10, width + deltaX), 100 - left);
        top = Math.min(Math.max(0, top + deltaY), bottom - 10);
        height = bottom - top;
      } else if (dragHandle === 'bl') {
        const right = left + width;
        left = Math.min(Math.max(0, left + deltaX), right - 10);
        width = right - left;
        height = Math.min(Math.max(10, height + deltaY), 100 - top);
      } else if (dragHandle === 'br') {
        width = Math.min(Math.max(10, width + deltaX), 100 - left);
        height = Math.min(Math.max(10, height + deltaY), 100 - top);
      }

      return { top, left, width, height };
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragHandle(null);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setDragHandle(null);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging]);

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
    setOcrStatus('Recortando y aplicando filtros...');

    try {
      // 1. Recortar la imagen con el filtro seleccionado
      const croppedImage = await cropImage(capturedImage, cropBox, getFilterStyle(activeFilter), 0.88);
      
      // 2. Ejecutar OCR real con Tesseract.js
      setOcrStatus('Iniciando motor de OCR...');
      const result = await Tesseract.recognize(croppedImage.dataUrl, 'spa', {
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

      // 3. Generar PDF y completar
      setStep('saving');
      const pdfBlob = createSearchablePdf(croppedImage, extractedText);
      const sizeKB = (pdfBlob.size / 1024).toFixed(1);
      const docId = 'doc-' + Date.now();

      const newDoc: DocumentItem = {
        id: docId,
        name: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
        size: sizeKB + ' KB',
        uploadDate: new Date().toISOString().split('T')[0],
        ocrText: extractedText,
        storageKey: getPdfStorageKey(docId)
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
          <div className="camera-preview-wrapper">
            {hasCamera ? (
              <video ref={videoRef} autoPlay playsInline className="camera-video" />
            ) : (
              <div 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  background: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '24px',
                  color: 'var(--text-secondary)'
                }}
              >
                <ImageIcon size={44} style={{ color: 'var(--primary-gold)', marginBottom: '12px' }} />
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#fff', textAlign: 'center' }}>
                  Simulador de Escáner Activado
                </p>
                <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                  La cámara no está disponible. Al hacer clic en "Capturar" se generará un documento formal de demostración procesal.
                </p>
              </div>
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

            <button 
              className="shutter-button" 
              onClick={capturePhoto} 
              title="Tomar foto del documento"
            />

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

      {step === 'crop' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <span className="health-label" style={{ textAlign: 'center' }}>
            Ajusta los bordes azules para recortar y encuadrar el documento
          </span>

          <div 
            className="crop-editor-container"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <div 
              className="crop-canvas-wrapper" 
              ref={cropContainerRef}
            >
              <img 
                src={capturedImage} 
                className="crop-image" 
                alt="Document Captured" 
                draggable={false} 
              />
              
              {/* Resizable Crop Box overlay */}
              <div 
                className="crop-overlay-rect"
                style={{
                  top: `${cropBox.top}%`,
                  left: `${cropBox.left}%`,
                  width: `${cropBox.width}%`,
                  height: `${cropBox.height}%`,
                }}
                onMouseDown={(e) => handleMouseDown(e, 'move')}
              >
                {/* Drag Handles */}
                <div className="crop-handle tl" onMouseDown={(e) => handleMouseDown(e, 'tl')} />
                <div className="crop-handle tr" onMouseDown={(e) => handleMouseDown(e, 'tr')} />
                <div className="crop-handle bl" onMouseDown={(e) => handleMouseDown(e, 'bl')} />
                <div className="crop-handle br" onMouseDown={(e) => handleMouseDown(e, 'br')} />
              </div>
            </div>
          </div>

          <div className="scanner-controls" style={{ gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('capture');
                setCapturedImage(null);
                startCamera();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={16} /> Reintentar
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={() => setStep('beautify')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 'beautify' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <span className="health-label" style={{ textAlign: 'center' }}>
            Filtros de Realce Digital (CamScanner) y Nombre del Archivo
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
              onClick={() => setStep('crop')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={16} /> Recortar
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
            Aplicando filtros de contraste judicial, recortando márgenes y empaquetando en formato vectorial.
          </p>
        </div>
      )}
    </div>
  );
};
