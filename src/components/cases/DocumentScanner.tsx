import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Image as ImageIcon } from 'lucide-react';
import { cropImage, createSearchablePdf, DEFAULT_SCANNED_OCR_TEXT } from '../../utils/scannerPdf';
import { getPdfStorageKey } from '../../utils/pdfStorage';
import { DocumentItem } from '../../utils/types';

interface DocumentScannerProps {
  onScanComplete: (newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onScanComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'crop' | 'saving'>('capture');
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scannerMsg, setScannerMsg] = useState('Coloque el documento en el recuadro');
  const [fileName, setFileName] = useState(`Documento_Escaneado_${Date.now().toString().slice(-4)}.pdf`);
  const [ocrText, setOcrText] = useState(DEFAULT_SCANNED_OCR_TEXT);

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
      setScannerMsg('EscÃ¡ner de CÃ¡mara Activo');
    } catch (err) {
      console.warn('No webcam access or no camera found, using simulator.', err);
      setHasCamera(false);
      setScannerMsg('Modo SimulaciÃ³n: CÃ¡mara no detectada');
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
        'SECCIÃ“N PRIMERA - DE LAS OBLIGACIONES:',
        'El demandante conviene en acompaÃ±ar todos los documentos requeridos,',
        'incluyendo comprobantes de transferencia y copias de deslindes.',
        '',
        'SECCIÃ“N SEGUNDA - DE LOS PLAZOS:',
        'Los plazos fatales acordados para responder traslados se fijan en',
        'un tÃ©rmino mÃ¡ximo de 5 dÃ­as hÃ¡biles a contar de esta notificaciÃ³n.',
        '',
        'Firma y Constancia Legal de AceptaciÃ³n Digital:',
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

  // Convert to searchable OCR PDF
  const convertAndSave = async () => {
    if (!capturedImage) return;
    setStep('saving');

    try {
      const croppedImage = await cropImage(capturedImage, cropBox, 'contrast(1.18) brightness(1.04)', 0.88);
      const pdfBlob = createSearchablePdf(croppedImage, ocrText);
      const sizeKB = (pdfBlob.size / 1024).toFixed(1);
      const docId = 'doc-' + Date.now();

      const newDoc: DocumentItem = {
        id: docId,
        name: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
        size: sizeKB + ' KB',
        uploadDate: new Date().toISOString().split('T')[0],
        ocrText,
        storageKey: getPdfStorageKey(docId)
      };

      onScanComplete(newDoc, pdfBlob);
    } catch (err) {
      console.error('Error converting scan to OCR PDF', err);
      setStep('crop');
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
                  Simulador de EscÃ¡ner Activado
                </p>
                <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                  La cÃ¡mara no estÃ¡ disponible. Al hacer clic en "Capturar" se generarÃ¡ un documento formal de demostraciÃ³n procesal.
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
            Ajusta los bordes azules para recortar y enderezar el documento
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
                startCamera();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={16} /> Reintentar
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={convertAndSave}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              <Check size={16} /> Convertir a PDF
            </button>
          </div>
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
            Aplicando filtros de contraste judicial, recortando mÃ¡rgenes y empaquetando en formato vectorial.
          </p>
        </div>
      )}
    </div>
  );
};







