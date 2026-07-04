import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, X, RotateCcw, Upload, Check, Image as ImageIcon, Sparkles, Cpu, ChevronRight } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Case, User, DocumentItem } from '../../utils/types';

interface OcrScannerProps {
  currentUser: User;
  onOcrComplete: (newCase: Case, newDoc: DocumentItem, fileBlob: Blob) => void;
  onClose: () => void;
}

export const OcrScanner: React.FC<OcrScannerProps> = ({ currentUser, onOcrComplete, onClose }) => {
  const [step, setStep] = useState<'capture' | 'crop' | 'ocr-processing' | 'ocr-confirm'>('capture');
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [scannerMsg, setScannerMsg] = useState('Encuadre la demanda laboral en el recuadro');
  
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
  const [fileName, setFileName] = useState('Demanda_Laboral_Recibida.pdf');

  // Video Ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Crop Coordinates (percentages)
  const [cropBox, setCropBox] = useState({ top: 15, left: 15, width: 70, height: 70 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const cropContainerRef = useRef<HTMLDivElement | null>(null);

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
      console.warn('Webcam not available for OCR, using simulator.', err);
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

  // Capturing photo
  const capturePhoto = () => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 250);

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
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Law firm/Court Header
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1;
      ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);

      ctx.fillStyle = '#000';
      ctx.font = 'bold 24px Times New Roman, serif';
      ctx.fillText('EN LO PRINCIPAL: DEMANDA DE TUTELA LABORAL Y DESPIDO INJUSTIFICADO', 80, 120);
      ctx.fillText('OTROSÍ: ACOMPAÑA DOCUMENTOS E INSTRUMENTALES', 80, 160);

      // Tribunal
      ctx.font = 'bold 20px Times New Roman, serif';
      ctx.fillText('S.J.L. DEL TRABAJO DE SANTIAGO (1°)', 80, 220);

      ctx.font = '18px Times New Roman, serif';
      ctx.fillText('JUAN PABLO MARTÍNEZ DÍAZ, técnico en construcción, domiciliado en Av. Vicuña Mackenna 450,', 80, 280);
      ctx.fillText('a S.S. con respeto digo: Que interpongo demanda en contra de mi ex empleadora,', 80, 310);
      ctx.fillStyle = '#007aff'; // highlight company in simulator
      ctx.fillText('CONSTRUCTORA ALFA S.A., representada por don Luis Fuentes, ambos domiciliados en Colina,', 80, 340);
      ctx.fillStyle = '#000';
      ctx.fillText('fundado en los hechos de vulneración de integridad física que paso a exponer:', 80, 370);

      // Paragraph body
      ctx.font = '16px Times New Roman, serif';
      let y = 430;
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
        ctx.fillText(l, 80, y);
        y += 30;
      });

      // Signatures
      ctx.font = 'italic 20px Times New Roman';
      ctx.fillText('Juan P. Martínez D.', 120, y + 50);
      ctx.font = '14px Times New Roman';
      ctx.fillText('Trabajador Demandante', 120, y + 75);

      ctx.font = 'italic 20px Times New Roman';
      ctx.fillText('Esteban Gómez V.', 500, y + 50);
      ctx.font = '14px Times New Roman';
      ctx.fillText('Abogado Patrocinante (Reg. 908)', 500, y + 75);

      // Distort slightly on desktop to simulate photography scanner
      const deskCanvas = document.createElement('canvas');
      deskCanvas.width = 1000;
      deskCanvas.height = 1300;
      const dCtx = deskCanvas.getContext('2d');
      if (dCtx) {
        dCtx.fillStyle = '#2c2c2e'; // dark desk surface
        dCtx.fillRect(0, 0, deskCanvas.width, deskCanvas.height);
        
        // Draw wood textures
        dCtx.fillStyle = 'rgba(255,255,255,0.015)';
        for (let i = 0; i < deskCanvas.height; i += 8) {
          dCtx.fillRect(0, i, deskCanvas.width, 3);
        }

        dCtx.save();
        dCtx.translate(deskCanvas.width / 2, deskCanvas.height / 2);
        dCtx.rotate((1.5 * Math.PI) / 180); // 1.5 degree rotation
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

  // OCR Processing Simulation
  const startOcrProcessing = () => {
    setStep('ocr-processing');
    setOcrProgress(0);
    setOcrStatus('Inicializando reconocimiento de caracteres OCR...');

    const statuses = [
      { p: 15, msg: 'Segmentando bloques de texto en el expediente...' },
      { p: 35, msg: 'Detectando partes procesales (Demandante: Juan Pablo Martínez)...' },
      { p: 60, msg: 'Identificando cuantía económica e indemnizaciones reclamadas ($18,500,000 CLP)...' },
      { p: 80, msg: 'Buscando sellos, firmas y asignación de tribunal (1° Juzgado de Letras)...' },
      { p: 100, msg: 'Análisis OCR completado con éxito.' }
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
      }, s.p * 30);
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
        ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
        const croppedUrl = canvas.toDataURL('image/jpeg', 0.85);

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
          assignedLawyerId: 'usr-03', // Mateo Rios (Junior)
          assignedLawyerName: 'Lic. Mateo Ríos',
          startDate: uploadDate,
          description: description,
          timeline: [
            {
              date: uploadDate,
              title: 'Ingreso por Portal Cliente (OCR)',
              desc: 'El cliente cargó la demanda en el portal. Se ejecutó pre-lectura OCR e indexación automática.',
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

  return (
    <div className="scanner-container">
      {step === 'capture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="camera-preview-wrapper" style={{ height: '320px' }}>
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
                <Cpu size={44} style={{ color: 'var(--primary-gold)', marginBottom: '12px' }} />
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#fff', textAlign: 'center' }}>
                  Simulador de OCR Activo
                </p>
                <p style={{ fontSize: '11px', textAlign: 'center', maxWidth: '280px', marginTop: '4px' }}>
                  Presione "Capturar" para simular la fotografía y posterior lectura de una demanda laboral judicial.
                </p>
              </div>
            )}

            <div className="scanner-overlay">
              <div className="scanner-guide-box" style={{ border: '2.5px dashed var(--primary-blue)' }}>
                <span className="scanner-guide-text" style={{ background: 'var(--primary-blue)' }}>
                  Alinee la demanda aquí
                </span>
              </div>
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
              <Upload size={16} /> Subir Archivo
            </button>

            <button 
              className="shutter-button" 
              onClick={capturePhoto} 
              style={{ border: '4px solid var(--primary-gold)' }}
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
            Ajuste el recorte al documento de la demanda
          </span>

          <div 
            className="crop-editor-container"
            onMouseMove={handleMouseMove}
            onMouseUp={() => setIsDragging(false)}
            style={{ height: '320px' }}
          >
            <div className="crop-canvas-wrapper" ref={cropContainerRef}>
              <img src={capturedImage} className="crop-image" alt="Captured Demand" draggable={false} />
              
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
              onClick={startOcrProcessing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              <Cpu size={16} /> Procesar OCR
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
              OCR completado con alta confianza (98%). Confirme los metadatos:
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
                <label style={{ fontSize: '11px', fontWeight: '700' }}>Área del Despacho</label>
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
                setStep('crop');
              }}
            >
              Atrás
            </button>
            
            <button 
              className="btn btn-primary" 
              onClick={handleFinalSubmit}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', flexGrow: 1, justifyContent: 'center' }}
            >
              <Check size={16} /> Confirmar e Ingresar Demanda
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
