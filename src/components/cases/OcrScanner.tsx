import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Sparkles, Cpu, ChevronRight, Wand2 } from 'lucide-react';
import { cropImage, createSearchablePdf } from '../../utils/scannerPdf';
import { getPdfStorageKey, savePdfBlob } from '../../utils/pdfStorage';
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
  const [forceSimulator, setForceSimulator] = useState(false); // Try real camera first; fall back to simulator if unavailable

  // SVG Edge coordinates for real-time CamScanner simulation
  const [edgePoints, setEdgePoints] = useState({
    p1: { x: 22, y: 18 },
    p2: { x: 78, y: 16 },
    p3: { x: 76, y: 84 },
    p4: { x: 24, y: 82 }
  });
  
  // Beautify filter choice
  const [activeFilter, setActiveFilter] = useState<FilterType>('magic');
  
  // OCR processing states
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('Iniciando motor de reconocimiento OCR...');

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
  const cropContainerRef = useRef<HTMLDivElement | null>(null);

  // Crop Coordinates (percentages)
  const [cropBox, setCropBox] = useState({ top: 12, left: 12, width: 76, height: 74 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<string | null>(null);

  useEffect(() => {
    // Start real camera on mount
    startCamera();
    return () => {
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream to video element whenever stream changes
  // This fixes the chicken-and-egg: videoRef.current wasn't available when startCamera ran
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // CamScanner-style edge detection animation (only in simulator mode or as overlay hint)
  useEffect(() => {
    if (step !== 'capture') return;

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame > 10) {
        setSheetDetected(true);
        setScannerMsg('Listo — presiona el botón para capturar');
        setEdgePoints({
          p1: { x: 25, y: 15 },
          p2: { x: 75, y: 15 },
          p3: { x: 73, y: 85 },
          p4: { x: 27, y: 85 }
        });
      } else {
        setSheetDetected(false);
        setScannerMsg('Apunta la cámara al documento...');
        const drift = () => Math.random() * 2 - 1;
        setEdgePoints({
          p1: { x: 22 + drift(), y: 18 + drift() },
          p2: { x: 78 + drift(), y: 16 + drift() },
          p3: { x: 76 + drift(), y: 84 + drift() },
          p4: { x: 24 + drift(), y: 82 + drift() }
        });
      }
    }, 180);

    return () => clearInterval(interval);
  }, [step]);

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      // Store the stream; the useEffect above will attach it to videoRef
      setCameraStream(stream);
      setHasCamera(true);
      setForceSimulator(false);
    } catch (err) {
      console.warn('Camera unavailable, using document simulator.', err);
      setHasCamera(false);
      setForceSimulator(true);
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

    if (!forceSimulator && hasCamera && videoRef.current) {
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

      // Place document on desk
      const deskCanvas = document.createElement('canvas');
      deskCanvas.width = 1000;
      deskCanvas.height = 1300;
      const dCtx = deskCanvas.getContext('2d');
      if (dCtx) {
        dCtx.fillStyle = '#121214'; // dark desk surface
        dCtx.fillRect(0, 0, deskCanvas.width, deskCanvas.height);
        
        // draw shadow and tilt
        dCtx.save();
        dCtx.translate(deskCanvas.width / 2, deskCanvas.height / 2);
        dCtx.rotate((1.5 * Math.PI) / 180); // tilt
        dCtx.shadowColor = 'rgba(0,0,0,0.5)';
        dCtx.shadowBlur = 30;
        dCtx.shadowOffsetX = 8;
        dCtx.shadowOffsetY = 12;
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

  const handleFinalSubmit = async () => {
    if (!capturedImage) return;

    const ocrText = [
      'Trabajador demandante: ' + workerName,
      'Cuantia estimada: ' + claimAmount,
      'Tribunal asignado: ' + court,
      'Juez a cargo: ' + judge,
      'Resumen: ' + description,
      'Documento procesado por OCR y realce CamScanner en Legium.'
    ].join('\n');

    try {
      const croppedImage = await cropImage(capturedImage, cropBox, getFilterStyle(activeFilter), 0.88);
      const pdfBlob = createSearchablePdf(croppedImage, ocrText);
      const sizeKB = (pdfBlob.size / 1024).toFixed(1);

      const docId = 'doc-' + Date.now();
      const uploadDate = new Date().toISOString().split('T')[0];

      // ✅ FIX: Persist PDF to localStorage so it survives modal close/reopen
      await savePdfBlob(docId, pdfBlob);

      const newDoc: DocumentItem = {
        id: docId,
        name: fileName.endsWith('.pdf') ? fileName : fileName + '.pdf',
        size: sizeKB + ' KB',
        uploadDate,
        ocrText,
        storageKey: getPdfStorageKey(docId)
      };

      const caseId = 'LEG-2026-' + Math.floor(100 + Math.random() * 900);
      const newCase: Case = {
        id: caseId,
        title: (workerName.trim() ? workerName : 'Trabajador') + ' vs. Constructora Alfa',
        clientId: currentUser.clientId || 'cli-01',
        clientName: 'Constructora Alfa S.A.',
        opposingParty: workerName,
        opposingLawyer: 'Estudio Patrocinante Gomez & Asociados',
        practiceArea: 'Laboral',
        status: 'Activo',
        court: court,
        judge: judge,
        assignedLawyerId: 'usr-03',
        assignedLawyerName: 'Lic. Mateo Rios',
        startDate: uploadDate,
        description: description,
        timeline: [
          {
            date: uploadDate,
            title: 'Ingreso por Portal Cliente (OCR)',
            desc: 'Cargado y embellecido via modulo CamScanner. Pre-lectura de metadatos automatica.',
            completed: true
          }
        ],
        tasks: [
          { id: 'tsk-' + Date.now().toString().slice(-4), title: 'Revisar y contestar demanda laboral en tribunal', dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], assignedTo: 'usr-03', completed: false }
        ],
        notes: [
          { id: 'nt-' + Date.now(), date: uploadDate + ' ' + new Date().toTimeString().slice(0, 5), author: 'OCR Extraccion Inteligente', text: 'Metadatos extraidos de la demanda. Cuantia economica: ' + claimAmount + '. Tribunal: ' + court + '.' }
        ],
        documents: [newDoc]
      };

      onOcrComplete(newCase, newDoc, pdfBlob);
    } catch (err) {
      console.error('Error generating OCR PDF', err);
    }
  };
  // Get CSS filter string for preview based on state
  const getFilterStyle = (f: FilterType): string => {
    if (f === 'magic') return 'contrast(1.4) brightness(1.08) saturate(1.1)';
    if (f === 'bw') return 'contrast(1.7) brightness(1.05) grayscale(1)';
    return 'none';
  };

  return (
    <div className="scanner-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1c1c1e', padding: 0 }}>
      
      {step === 'capture' && (
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, position: 'relative', height: '100%', justifyContent: 'space-between' }}>
          
          {/* Full Screen Camera Viewport */}
          <div className="camera-preview-wrapper" style={{ flexGrow: 1, height: 'calc(100vh - 160px)', width: '100%', position: 'relative', borderRadius: 0, overflow: 'hidden', background: '#000' }}>

            {/* ALWAYS-RENDERED video element — stream attaches via useEffect */}
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
                display: hasCamera ? 'block' : 'none'
              }}
            />

            {/* Fallback: simulator document (shown only if camera is unavailable) */}
            {forceSimulator && (
              <div
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  background: '#121214',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1
                }}
              >
                <div
                  style={{
                    width: '210px', height: '280px', backgroundColor: '#fbfbf9',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)', borderRadius: '2px',
                    padding: '12px', transform: 'rotate(1.5deg)', fontSize: '3px',
                    color: '#333', lineHeight: '5px', border: '1px solid rgba(0,0,0,0.08)',
                    display: 'flex', flexDirection: 'column', gap: '4px'
                  }}
                >
                  <div style={{ height: '6px', width: '90%', borderBottom: '1px solid #aaa', marginBottom: '8px', fontWeight: 'bold' }}>EN LO PRINCIPAL: DEMANDA LABORAL</div>
                  <div>S.J.L. DEL TRABAJO DE SANTIAGO</div>
                  <div>JUAN PABLO MARTINEZ DIAZ, técnico en construcción...</div>
                  <div style={{ color: 'var(--primary-blue)', fontWeight: 'bold' }}>CONSTRUCTORA ALFA S.A...</div>
                  <div>I. RELACIÓN LABORAL Y HECHOS:</div>
                  <div>El trabajador sufrió un accidente en faena...</div>
                  <div>Se solicita indemnización: $18,500,000 CLP</div>
                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ borderTop: '0.5px solid #888', width: '40px', marginTop: '10px' }}>Firma Trabajador</div>
                    <div style={{ borderTop: '0.5px solid #888', width: '40px', marginTop: '10px' }}>Firma Abogado</div>
                  </div>
                </div>
              </div>
            )}

            {/* Camera loading state */}
            {!hasCamera && !forceSimulator && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ color: '#ccc', fontSize: '13px' }}>Iniciando cámara...</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* SVG Edge Detection Overlay */}
            <svg
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                pointerEvents: 'none', zIndex: 4
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
                  fill: 'rgba(0, 122, 255, 0.1)',
                  stroke: sheetDetected ? '#34c759' : '#007aff',
                  strokeWidth: '2.5',
                  transition: 'all 0.25s ease'
                }}
              />
              <circle cx={`${edgePoints.p1.x}%`} cy={`${edgePoints.p1.y}%`} r="6" fill={sheetDetected ? '#34c759' : '#007aff'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
              <circle cx={`${edgePoints.p2.x}%`} cy={`${edgePoints.p2.y}%`} r="6" fill={sheetDetected ? '#34c759' : '#007aff'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
              <circle cx={`${edgePoints.p3.x}%`} cy={`${edgePoints.p3.y}%`} r="6" fill={sheetDetected ? '#34c759' : '#007aff'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
              <circle cx={`${edgePoints.p4.x}%`} cy={`${edgePoints.p4.y}%`} r="6" fill={sheetDetected ? '#34c759' : '#007aff'} style={{ filter: 'drop-shadow(0 0 4px #007aff)', transition: 'all 0.25s ease' }} />
            </svg>

            {/* Status badge */}
            <div
              style={{
                position: 'absolute', bottom: '16px', left: '50%',
                transform: 'translateX(-50%)',
                background: sheetDetected ? 'rgba(52,199,89,0.95)' : 'rgba(0,122,255,0.95)',
                color: '#fff', fontSize: '12px', padding: '6px 16px',
                borderRadius: '99px', fontWeight: 600,
                backdropFilter: 'blur(10px)', zIndex: 5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                transition: 'all 0.3s ease', whiteSpace: 'nowrap'
              }}
            >
              {forceSimulator ? '🧩 Simulador (cámara no disponible)' : scannerMsg}
            </div>

            <div className={`flash-overlay ${flashActive ? 'flash-active' : ''}`} />
          </div>

          {/* Bottom controls */}
          <div className="scanner-controls" style={{ background: '#1c1c1e', padding: '16px 24px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <Upload size={16} /> Subir Imagen
            </button>

            <button
              className="shutter-button"
              onClick={capturePhoto}
              style={{ border: sheetDetected ? '4px solid #34c759' : '4px solid var(--primary-gold)' }}
            />

            <button
              className="btn btn-secondary"
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'crop' && capturedImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, justifyContent: 'space-between', height: '100%', background: '#1c1c1e', padding: '16px' }}>
          <span className="health-label" style={{ textAlign: 'center', color: '#fff' }}>
            Ajustar recorte del escrito judicial
          </span>

          <div 
            className="crop-editor-container"
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            style={{ flexGrow: 1, height: 'calc(100vh - 200px)', background: '#121214' }}
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

          <div className="scanner-controls" style={{ gap: '12px', background: 'transparent' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('capture');
                setCapturedImage(null);
              }}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, justifyContent: 'space-between', height: '100%', background: '#1c1c1e', padding: '16px' }}>
          <span className="health-label" style={{ textAlign: 'center', color: '#fff' }}>
            Embellecer Escrito - Filtros de Realce CamScanner
          </span>

          {/* Enhanced Preview Frame */}
          <div 
            style={{ 
              flexGrow: 1,
              height: 'calc(100vh - 280px)', 
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
          <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setActiveFilter('original')}
              style={{ 
                background: activeFilter === 'original' ? '#fff' : 'transparent',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                boxShadow: activeFilter === 'original' ? '0 4px 10px rgba(0,0,0,0.2)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: activeFilter === 'original' ? '#111' : '#ccc',
                fontWeight: activeFilter === 'original' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '16px' }}>ðŸ“·</span>
              Original
            </button>

            <button
              onClick={() => setActiveFilter('magic')}
              style={{ 
                background: activeFilter === 'magic' ? 'var(--primary-blue)' : 'transparent',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                boxShadow: activeFilter === 'magic' ? '0 4px 10px rgba(0,122,255,0.3)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#fff',
                fontWeight: activeFilter === 'magic' ? 600 : 400
              }}
            >
              <Sparkles size={14} style={{ color: activeFilter === 'magic' ? '#fff' : 'var(--primary-gold)' }} />
              Realce Mágico
            </button>

            <button
              onClick={() => setActiveFilter('bw')}
              style={{ 
                background: activeFilter === 'bw' ? '#fff' : 'transparent',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                boxShadow: activeFilter === 'bw' ? '0 4px 10px rgba(0,0,0,0.2)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: activeFilter === 'bw' ? '#111' : '#ccc',
                fontWeight: activeFilter === 'bw' ? 600 : 400
              }}
            >
              <span style={{ fontSize: '16px' }}>ðŸ“„</span>
              Blanco y Negro
            </button>
          </div>

          <div className="scanner-controls" style={{ gap: '12px', background: 'transparent' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('crop');
              }}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
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
          <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#fff' }}>Procesando Análisis OCR</h4>
          
          <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '3px', overflow: 'hidden', margin: '10px 0 16px' }}>
            <div style={{ width: `${ocrProgress}%`, height: '100%', backgroundColor: 'var(--primary-gold)', transition: 'width 0.2s ease-in-out' }} />
          </div>

          <p style={{ fontSize: '13px', color: '#ccc', textAlign: 'center', minHeight: '38px' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#1c1c1e', padding: '20px', height: '100%', overflowY: 'auto' }}>
          <div 
            style={{ 
              background: 'rgba(52, 199, 89, 0.1)', 
              border: '1px solid rgba(52, 199, 89, 0.3)', 
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#ccc' }}>Trabajador Demandante (Contraparte)</label>
              <input 
                type="text" 
                className="form-control" 
                value={workerName} 
                onChange={(e) => setWorkerName(e.target.value)} 
                required 
                style={{ background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#ccc' }}>Cuantía Estimada</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={claimAmount} 
                  onChange={(e) => setClaimAmount(e.target.value)} 
                  required 
                  style={{ background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '700', color: '#ccc' }}>Área de Especialidad</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value="Laboral (Especialidad)" 
                  disabled 
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#aaa', border: '1px solid rgba(255,255,255,0.05)' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#ccc' }}>Tribunal Asignado</label>
              <input 
                type="text" 
                className="form-control" 
                value={court} 
                onChange={(e) => setCourt(e.target.value)} 
                required 
                style={{ background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#ccc' }}>Nombre del Documento PDF</label>
              <input 
                type="text" 
                className="form-control" 
                value={fileName} 
                onChange={(e) => setFileName(e.target.value)} 
                required 
                style={{ background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="form-group">
              <label style={{ fontSize: '11px', fontWeight: '700', color: '#ccc' }}>Resumen de las Pretensiones</label>
              <textarea 
                className="form-control" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                required 
                style={{ minHeight: '60px', fontSize: '12.5px', background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>

          <div className="scanner-controls" style={{ gap: '12px', marginTop: '10px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep('beautify');
              }}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
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



