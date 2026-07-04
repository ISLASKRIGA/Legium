import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Image as ImageIcon, Sparkles, Cpu, ChevronRight, Wand2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Case, User, DocumentItem, PracticeArea } from '../../utils/types';

interface OcrScannerProps {
  currentUser: User;
  onOcrComplete: (newCase: Case, newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

type FilterType = 'original' | 'magic' | 'bw';

export const OcrScanner: React.FC<OcrScannerProps> = ({ currentUser, onOcrComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'crop' | 'beautify' | 'ocr-processing' | 'ocr-confirm'>('capture');
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scannerMsg, setScannerMsg] = useState('CamScanner: Buscando bordes de hoja...');
  const [sheetDetected, setSheetDetected] = useState(false);

  // SVG Edge coordinates for real-time CamScanner simulation
  const [edgePoints, setEdgePoints] = useState({
    p1: { x: 15, y: 20 },
    p2: { x: 85, y: 18 },
    p3: { x: 82, y: 85 },
    p4: { x: 18, y: 82 }
  });
  
  // Beautify filter choice
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  
  // OCR processing states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('Iniciando motor de reconocimiento OCR...');

  // Extracted Metadata Form
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
  const cropContainerRef = useRef<HTMLDivElement | null>(null);

  // Crop Coordinates (percentages)
  const [cropBox, setCropBox] = useState({ top: 10, left: 10, width: 80, height: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<string | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Simulating CamScanner real-time edge detection drift
  useEffect(() => {
    if (step !== 'capture') return;

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      
      // Simulating paper edges locking on after 2 seconds
      if (frame > 12) {
        setSheetDetected(true);
        setScannerMsg('CamScanner: ¡Hoja Detectada! (Encuadre Óptimo)');
        setEdgePoints({
          p1: { x: 18, y: 15 },
          p2: { x: 82, y: 15 },
          p3: { x: 80, y: 85 },
          p4: { x: 20, y: 85 }
        });
      } else {
        setSheetDetected(false);
        setScannerMsg('CamScanner: Buscando bordes de hoja...');
        // Add minor random drift to show it is "calculating" edges
        const drift = () => Math.random() * 3 - 1.5;
        setEdgePoints({
          p1: { x: 15 + drift(), y: 20 + drift() },
          p2: { x: 85 + drift(), y: 18 + drift() },
          p3: { x: 82 + drift(), y: 85 + drift() },
          p4: { x: 18 + drift(), y: 82 + drift() }
        });
      }
    }, 180);

    return () => clearInterval(interval);
  }, [step]);

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
    } catch (err) {
      console.warn('Webcam not available for CamScanner simulation, using template.', err);
      setHasCamera(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  // Capturing photo
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
        setCapturedImage(canvas.toDataURL('image/jpeg'));
        stopCamera();
        setStep('crop');
      }
    } else {
      generateMockLegalDocument();
    }
  };

  const generateMockLegalDocument = () => {
    // Generate high resolution mock labor complaint sheet
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw background paper
      ctx.fillStyle = '#fcfbf7'; // warm paper tint
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

      ctx.fillStyle = '#222';
      ctx.font = 'bold 22px Times New Roman, serif';
      ctx.fillText('EN LO PRINCIPAL: DEMANDA DE TUTELA LABORAL Y DESPIDO INJUSTIFICADO', 70, 100);
      ctx.fillText('OTROSÍ: ACOMPAÑA DOCUMENTOS E INSTRUMENTALES', 70, 130);

      ctx.font = 'bold 18px Times New Roman, serif';
      ctx.fillText('S.J.L. DEL TRABAJO DE SANTIAGO (1°)', 70, 190);

      ctx.font = '16px Times New Roman, serif';
      ctx.fillText('JUAN PABLO MARTÍNEZ DÍAZ, técnico en construcción, domiciliado en Av. Vicuña Mackenna 450,', 70, 250);
      ctx.fillText('a S.S. con respeto digo: Que interpongo demanda en contra de mi ex empleadora,', 70, 280);
      ctx.fillStyle = '#007aff';
      ctx.fillText('CONSTRUCTORA ALFA S.A., representada por don Luis Fuentes, ambos domiciliados en Colina,', 70, 310);
      ctx.fillStyle = '#222';
      ctx.fillText('fundado en los hechos de vulneración de integridad física que paso a exponer:', 70, 340);

      // Paragraph body
      ctx.font = '15px Times New Roman, serif';
      let y = 390;
      const lines = [
        'I. RELACIÓN LABORAL Y FUNCIONES:',
        'Ingresé a prestar servicios el día 15 de marzo de 2018 como Supervisor de Obra.',
        'Mi remuneración promedio de los últimos meses ascendía a la suma de $1,850,000 CLP.',
        '',
        'II. DESPIDO INDIRECTO O AUTODESPIDO:',
        'Con fecha 3 de junio de 2026, me vi en la obligación de poner término al contrato',
        'de trabajo por graves incumplimientos del empleador en medidas de seguridad e higiene,',
        'tras sufrir un accidente en faena sin recibir los implementos de protección.',
        '',
        'POR TANTO, ruego a S.S. acoger esta demanda, decretar el pago de las indemnizaciones',
        'por años de servicio con recargo del 50%, y compensación por daño moral por la suma de',
        '$18,500,000 CLP más costas procesales.'
      ];

      lines.forEach((l) => {
        ctx.fillText(l, 70, y);
        y += 26;
      });

      // Signatures
      ctx.font = 'italic 18px Times New Roman';
      ctx.fillText('Juan P. Martínez D.', 100, y + 40);
      ctx.font = '13px Times New Roman';
      ctx.fillText('Trabajador Demandante', 100, y + 60);

      ctx.font = 'italic 18px Times New Roman';
      ctx.fillText('Esteban Gómez V.', 480, y + 40);
      ctx.font = '13px Times New Roman';
      ctx.fillText('Abogado Patrocinante (Reg. 908)', 480, y + 60);

      // Distort slightly on desktop to simulate photography scanner
      const deskCanvas = document.createElement('canvas');
      deskCanvas.width = 1000;
      deskCanvas.height = 1300;
      const dCtx = deskCanvas.getContext('2d');
      if (dCtx) {
        dCtx.fillStyle = '#1c1c1e'; // desk background
        dCtx.fillRect(0, 0, deskCanvas.width, deskCanvas.height);
        
        // draw shadow and tilt
        dCtx.save();
        dCtx.translate(deskCanvas.width / 2, deskCanvas.height / 2);
        dCtx.rotate((1.5 * Math.PI) / 180); // tilt
        dCtx.shadowColor = 'rgba(0,0,0,0.4)';
        dCtx.shadowBlur = 24;
        dCtx.shadowOffsetX = 6;
        dCtx.shadowOffsetY = 10;
        dCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        dCtx.restore();

        setCapturedImage(deskCanvas.toDataURL('image/jpeg'));
        setStep('crop');
      }
    }
  };

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

  // Drag handles for crop
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

  const handleCropNext = () => {
    setStep('beautify');
  };

  // OCR Processing Simulation
  const startOcrProcessing = () => {
    setStep('ocr-processing');
    setOcrProgress(0);
    setOcrStatus('Iniciando lectura lingüística de caracteres OCR...');

    const statuses = [
      { p: 15, msg: 'Segmentando bloques de texto optimizados...' },
      { p: 40, msg: 'Detectando demandante (Juan Pablo Martínez Díaz)...' },
      { p: 70, msg: 'Buscando cuantía del reclamo ($18,500,000 CLP)...' },
      { p: 90, msg: 'Identificando tribunal (1° Juzgado de Letras de Santiago)...' },
      { p: 100, msg: 'Reconocimiento completado e indexado.' }
    ];

    statuses.forEach((s) => {
      setTimeout(() => {
        setOcrProgress(s.p);
        setOcrStatus(s.msg);
        if (s.p === 100) {
          setTimeout(() => {
            setStep('ocr-confirm');
          }, 800);
        }
      }, s.p * 25);
    });
  };

  const handleFinalSubmit = () => {
    if (!capturedImage) return;

    // Create Image and crop
    const img = new Image();
    img.src = capturedImage;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const startX = (cropBox.left / 100) * img.width;
        const startY = (cropBox.top / 100) * img.height;
        const cropW = (cropBox.width / 100) * img.width;
        const cropH = (cropBox.height / 100) * img.height;

        canvas.width = cropW;
        canvas.height = cropH;

        // Apply CamScanner filter enhancement values directly on canvas drawing if possible
        if (activeFilter === 'magic') {
          ctx.filter = 'contrast(1.4) brightness(1.08) saturate(1.1)';
        } else if (activeFilter === 'bw') {
          ctx.filter = 'contrast(1.7) brightness(1.05) grayscale(1)';
        } else {
          ctx.filter = 'none';
        }

        ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
        const croppedUrl = canvas.toDataURL('image/jpeg', 0.88);

        // Compile jsPDF
        const pdf = new jsPDF({
          orientation: cropW > cropH ? 'landscape' : 'portrait',
          unit: 'px',
          format: [cropW, cropH]
        });
        pdf.addImage(croppedUrl, 'JPEG', 0, 0, cropW, cropH);

        const pdfBlob = pdf.output('blob');
        const sizeKB = (pdfBlob.size / 1024).toFixed(1);

        // Document item
        const docId = `doc-${Date.now()}`;
        const uploadDate = new Date().toISOString().split('T')[0];
        const newDoc: DocumentItem = {
          id: docId,
          name: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
          size: `${sizeKB} KB`,
          uploadDate
        };

        // Save Object URL in-session
        const objUrl = URL.createObjectURL(pdfBlob);
        (window as any).pdfSessionUrls = (window as any).pdfSessionUrls || new Map();
        (window as any).pdfSessionUrls.set(docId, objUrl);

        // Create new Case structure
        const caseId = `LEG-2026-${Math.floor(100 + Math.random() * 900)}`;
        const newCase: Case = {
          id: caseId,
          title: `Demanda Laboral: ${workerName} vs. Constructora Alfa`,
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
          timeline: [
            {
              date: uploadDate,
              title: 'Ingreso por Portal Cliente (OCR)',
              desc: 'Cargado y embellecido vía módulo CamScanner. Pre-lectura de metadatos automática.',
              completed: true
            }
          ],
          tasks: [
            { id: `tsk-${Date.now().toString().slice(-4)}`, title: 'Contestar demanda laboral en tribunal', dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], assignedTo: 'usr-03', completed: false }
          ],
          notes: [
            { id: 'nt-001', date: `${uploadDate} 12:00`, author: 'OCR Extracción Inteligente', text: `Metadatos extraídos de la demanda: Cuantía económica: ${claimAmount}. Tribunal asignado: ${court}.` }
          ],
          documents: [newDoc]
        };

        onOcrComplete(newCase, newDoc, pdfBlob);
      }
    };
  };

  // Get CSS filter string for preview based on state
  const getFilterStyle = (f: FilterType): string => {
    if (f === 'magic') return 'contrast(1.4) brightness(1.08) saturate(1.1)';
    if (f === 'bw') return 'contrast(1.7) brightness(1.05) grayscale(1)';
    return 'none';
  };

  return (
    <div className="scanner-container" style={{ minHeight: '380px' }}>
      
      {step === 'capture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
          {/* Full height/width camera block to look like CamScanner */}
          <div className="camera-preview-wrapper" style={{ height: '360px', width: '100%', position: 'relative' }}>
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
                  color: '#fff'
                }}
              >
                <Sparkles size={40} style={{ color: 'var(--primary-gold)', marginBottom: '10px' }} className="pulsing" />
                <p style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '-0.3px' }}>
                  CamScanner: Inteligencia de Bordes
                </p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: '290px', marginTop: '4px' }}>
                  Simulando detección inteligente de escritos. Presione capturar para recortar y procesar.
                </p>
              </div>
            )}

            {/* Glowing Edge Detection SVG Overlays */}
            <svg 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                pointerEvents: 'none',
                zIndex: 4 
              }}
            >
              <polygon 
                points={`
                  ${edgePoints.p1.x}%,${edgePoints.p1.y}% 
                  ${edgePoints.p2.x}%,${edgePoints.p2.y}% 
                  ${edgePoints.p3.x}%,${edgePoints.p3.y}% 
                  ${edgePoints.p4.x}%,${edgePoints.p4.y}%
                `}
                style={{ 
                  fill: 'rgba(0, 122, 255, 0.12)', 
                  stroke: sheetDetected ? 'var(--success)' : 'var(--primary-blue)', 
                  strokeWidth: '2.5',
                  transition: 'all 0.25s ease' 
                }} 
              />
              
              {/* Corner handle dots */}
              <circle cx={`${edgePoints.p1.x}%`} cy={`${edgePoints.p1.y}%`} r="6" fill={sheetDetected ? 'var(--success)' : 'var(--primary-blue)'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
              <circle cx={`${edgePoints.p2.x}%`} cy={`${edgePoints.p2.y}%`} r="6" fill={sheetDetected ? 'var(--success)' : 'var(--primary-blue)'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
              <circle cx={`${edgePoints.p3.x}%`} cy={`${edgePoints.p3.y}%`} r="6" fill={sheetDetected ? 'var(--success)' : 'var(--primary-blue)'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
              <circle cx={`${edgePoints.p4.x}%`} cy={`${edgePoints.p4.y}%`} r="6" fill={sheetDetected ? 'var(--success)' : 'var(--primary-blue)'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
            </svg>

            {/* Glowing bottom badge for CamScanner state */}
            <div 
              style={{ 
                position: 'absolute', 
                bottom: '12px', 
                left: '50%', 
                transform: 'translateX(-50%)', 
                background: sheetDetected ? 'rgba(52,199,89,0.9)' : 'rgba(0,122,255,0.9)', 
                color: '#fff', 
                fontSize: '11px', 
                padding: '4px 12px', 
                borderRadius: '99px',
                fontWeight: 600,
                backdropFilter: 'blur(10px)',
                zIndex: 5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'all 0.3s ease'
              }}
            >
              {scannerMsg}
            </div>
            
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
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={16} /> Subir Imagen
            </button>

            <button 
              className="shutter-button" 
              onClick={capturePhoto} 
              style={{ border: sheetDetected ? '4px solid var(--success)' : '4px solid var(--primary-gold)' }}
            />

            <button 
              className="btn btn-secondary" 
              onClick={onClose}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'crop' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <span className="health-label" style={{ textAlign: 'center' }}>
            Ajustar recorte del escrito judicial
          </span>

          <div 
            className="crop-editor-container"
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            style={{ height: '320px' }}
          >
            <div className="crop-canvas-wrapper" ref={cropContainerRef}>
              <img src={capturedImage} className="crop-image" alt="Captured Document" draggable={false} />
              
              <div 
                className="crop-overlay-rect"
                style={{
                  top: `${cropBox.top}%`,
                  left: `${cropBox.left}%`,
                  width: `${cropBox.width}%`,
                  height: `${cropBox.height}%`,
                  borderColor: 'var(--primary-gold)'
                }}
                onMouseDown={(e) => handleMouseDown(e, 'move')}
              >
                <div className="crop-handle tl" style={{ borderColor: 'var(--primary-gold)' }} onMouseDown={(e) => handleMouseDown(e, 'tl')} />
                <div className="crop-handle tr" style={{ borderColor: 'var(--primary-gold)' }} onMouseDown={(e) => handleMouseDown(e, 'tr')} />
                <div className="crop-handle bl" style={{ borderColor: 'var(--primary-gold)' }} onMouseDown={(e) => handleMouseDown(e, 'bl')} />
                <div className="crop-handle br" style={{ borderColor: 'var(--primary-gold)' }} onMouseDown={(e) => handleMouseDown(e, 'br')} />
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
            >
              <RotateCcw size={16} /> Reintentar
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={handleCropNext}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              Recortar y Siguiente <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 'beautify' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <span className="health-label" style={{ textAlign: 'center' }}>
            Embellecer Escrito - Filtros de Realce CamScanner
          </span>

          {/* Enhanced Preview Frame */}
          <div 
            style={{ 
              height: '240px', 
              width: '100%', 
              background: '#2c2c2e', 
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
          <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(0,0,0,0.02)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setActiveFilter('original')}
              style={{ 
                background: activeFilter === 'original' ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                boxShadow: activeFilter === 'original' ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: activeFilter === 'original' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '16px' }}>📷</span>
              Original
            </button>

            <button
              onClick={() => setActiveFilter('magic')}
              style={{ 
                background: activeFilter === 'magic' ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                boxShadow: activeFilter === 'magic' ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: activeFilter === 'magic' ? 600 : 400,
                color: activeFilter === 'magic' ? 'var(--primary-blue)' : 'inherit'
              }}
            >
              <Sparkles size={14} style={{ color: 'var(--primary-gold)' }} />
              Realce Mágico
            </button>

            <button
              onClick={() => setActiveFilter('bw')}
              style={{ 
                background: activeFilter === 'bw' ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                boxShadow: activeFilter === 'bw' ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: activeFilter === 'bw' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '16px' }}>📄</span>
              Blanco y Negro
            </button>
          </div>

          <div className="scanner-controls" style={{ gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('crop');
              }}
            >
              Atrás
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={startOcrProcessing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              Procesar OCR <Cpu size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 'ocr-processing' && (
        <div 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '40px',
            minHeight: '300px',
            position: 'relative',
            background: 'linear-gradient(135deg, rgba(184, 134, 11, 0.02), rgba(0,0,0,0.01))',
            borderRadius: '12px',
            overflow: 'hidden'
          }}
        >
          {/* Animated laser line */}
          <div 
            style={{ 
              position: 'absolute', 
              left: 0, 
              right: 0, 
              height: '4px', 
              background: 'linear-gradient(90deg, transparent, var(--primary-gold), transparent)', 
              boxShadow: '0 0 12px var(--primary-gold)',
              animation: 'laser-scan 1.5s infinite ease-in-out',
              top: '50%'
            }} 
          />

          <Cpu className="pulsing" size={44} style={{ color: 'var(--primary-gold)', marginBottom: '16px' }} />
          <h4 style={{ fontWeight: '700', marginBottom: '8px' }}>Procesando Análisis OCR</h4>
          
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden', margin: '10px 0 16px' }}>
            <div style={{ width: `${ocrProgress}%`, height: '100%', backgroundColor: 'var(--primary-gold)', transition: 'width 0.2s ease-in-out' }} />
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', minHeight: '38px' }}>
            {ocrStatus}
          </p>

          <style>{`
            @keyframes laser-scan {
              0% { top: 10%; }
              50% { top: 90%; }
              100% { top: 10%; }
            }
          `}</style>
        </div>
      )}

      {step === 'ocr-confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div 
            style={{ 
              background: 'rgba(52, 199, 89, 0.06)', 
              border: '1px solid rgba(52, 199, 89, 0.2)', 
              borderRadius: '8px', 
              padding: '10px 14px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            <Sparkles size={18} style={{ color: 'var(--success)' }} />
            <span style={{ fontSize: '12.5px', color: 'var(--success)', fontWeight: 600 }}>
              CamScanner OCR: Metadatos extraídos con éxito:
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700' }}>Trabajador Demandante (Contraparte)</label>
              <input 
                type="text" 
                className="form-control" 
                value={workerName} 
                onChange={(e) => setWorkerName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '700' }}>Cuantía Estimada</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={claimAmount} 
                  onChange={(e) => setClaimAmount(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '700' }}>Área de Especialidad</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value="Laboral (Especialidad)" 
                  disabled 
                  style={{ background: 'rgba(0,0,0,0.02)' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700' }}>Tribunal Asignado</label>
              <input 
                type="text" 
                className="form-control" 
                value={court} 
                onChange={(e) => setCourt(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700' }}>Nombre del Documento PDF</label>
              <input 
                type="text" 
                className="form-control" 
                value={fileName} 
                onChange={(e) => setFileName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700' }}>Resumen de las Pretensiones</label>
              <textarea 
                className="form-control" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                required 
                style={{ minHeight: '60px', fontSize: '12.5px' }}
              />
            </div>
          </div>

          <div className="scanner-controls" style={{ gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('beautify');
              }}
            >
              Atrás
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={handleFinalSubmit}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              <Check size={16} /> Confirmar e Ingresar Documento
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
