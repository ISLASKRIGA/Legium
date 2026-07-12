import React, { useState, useEffect, useRef } from 'react';
import { Camera, FileText, Briefcase, Calendar, Folder, ArrowRight, User as UserIcon, Building2, Eye, ShieldAlert, Download, Upload, X } from 'lucide-react';
import { Case, User, DocumentItem, Client } from '../../utils/types';
import { OcrScanner } from '../cases/OcrScanner';
import { getPdfObjectUrl, savePdfBlob } from '../../utils/pdfStorage';
import { GlassButton } from '../ui/glass-button';
import { uploadPdfToInsforge, saveDocumentRecord, saveCaseRecord } from '../../utils/insforgeClient';

interface ClientDashboardProps {
  currentUser: User;
  cases: Case[];
  clients: Client[];
  searchQuery: string;
  onUpdateCase: (updatedCase: Case) => void;
  onAddCase: (newCase: Case) => void;
  onAddLog: (action: string, status: 'Success' | 'Warning' | 'Denied') => void;
  onShowToast: (title: string, message: string, type: 'success' | 'warning' | 'danger') => void;
  onOpenScanner?: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  currentUser,
  cases,
  clients,
  searchQuery,
  onUpdateCase,
  onAddCase,
  onAddLog,
  onShowToast,
  onOpenScanner
}) => {
  const [activeModal, setActiveModal] = useState<'none' | 'scanner' | 'scanner-case' | 'pdf'>('none');
  const [scannerSheetOpen, setScannerSheetOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent, caseObj: Case) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processUploadedFile(files[0], caseObj);
    }
  };

  const processUploadedFile = async (file: File, caseObj: Case) => {
    if (file.type !== 'application/pdf') {
      onShowToast('Archivo no soportado', 'Solo se admiten documentos en formato PDF.', 'danger');
      return;
    }

    const docId = 'doc-' + Date.now();
    const uploadDate = new Date().toISOString().split('T')[0];
    const sizeStr = (file.size / 1024).toFixed(1) + ' KB';

    try {
      const storageKey = await savePdfBlob(docId, file);

      let pdfUrl: string | null = null;
      try {
        await saveCaseRecord(caseObj);
        pdfUrl = await uploadPdfToInsforge(docId, file, caseObj.id);
        await saveDocumentRecord({
          id: docId,
          caseId: caseObj.id,
          name: file.name,
          sizeKb: parseFloat((file.size / 1024).toFixed(1)),
          uploadDate,
          ocrText: '',
          pdfUrl
        });
      } catch (err) {
        console.error('[Supabase Upload] Failed syncing case or uploading document:', err);
      }

      const newDoc: DocumentItem = {
        id: docId,
        name: file.name,
        size: sizeStr,
        uploadDate,
        ocrText: '',
        storageKey,
        pdfUrl
      };

      const updated = { ...caseObj, documents: [...caseObj.documents, newDoc] };
      onUpdateCase(updated);
      onAddLog(`Cliente ${currentUser.name} cargó documento PDF ${file.name} en expediente ${caseObj.id}`, 'Success');
      onShowToast('Documento Cargado', `El PDF ${file.name} se ha cargado con éxito.`, 'success');
    } catch (err) {
      console.error('Error uploading file:', err);
      onShowToast('Error al cargar', 'No se pudo procesar el archivo PDF.', 'danger');
    }
  };

  const handleCaseScanComplete = async (scannedDoc: DocumentItem, fileBlob: Blob, caseObj: Case) => {
    const docId = scannedDoc.id || 'doc-' + Date.now();
    const uploadDate = scannedDoc.uploadDate || new Date().toISOString().split('T')[0];
    const sizeStr = (fileBlob.size / 1024).toFixed(1) + ' KB';

    try {
      const storageKey = await savePdfBlob(docId, fileBlob);

      let pdfUrl: string | null = null;
      try {
        await saveCaseRecord(caseObj);
        pdfUrl = await uploadPdfToInsforge(docId, fileBlob, caseObj.id);
        await saveDocumentRecord({
          id: docId,
          caseId: caseObj.id,
          name: scannedDoc.name.endsWith('.pdf') ? scannedDoc.name : scannedDoc.name + '.pdf',
          sizeKb: parseFloat((fileBlob.size / 1024).toFixed(1)),
          uploadDate,
          ocrText: scannedDoc.ocrText || '',
          pdfUrl
        });
      } catch (err) {
        console.error('[Supabase Upload] Failed syncing case or uploading document:', err);
      }

      const newDoc: DocumentItem = {
        ...scannedDoc,
        id: docId,
        name: scannedDoc.name.endsWith('.pdf') ? scannedDoc.name : scannedDoc.name + '.pdf',
        size: sizeStr,
        uploadDate,
        storageKey,
        pdfUrl
      };

      const updated = { ...caseObj, documents: [...caseObj.documents, newDoc] };
      onUpdateCase(updated);
      onAddLog(`Cliente ${currentUser.name} cargó documento PDF escaneado ${newDoc.name} en expediente ${caseObj.id}`, 'Success');
      onShowToast('Documento Escaneado', `El PDF escaneado ${newDoc.name} se ha guardado con éxito.`, 'success');
    } catch (err) {
      console.error('Error handling scanned document:', err);
      onShowToast('Error al escanear', 'No se pudo guardar el documento escaneado.', 'danger');
    }
  };

  // Resolve the client name dynamically from the clients list
  const clientRecord = clients.find(cl => cl.id === currentUser.clientId);
  const clientDisplayName = clientRecord?.name ?? currentUser.name;

  // Animate scanner sheet in/out
  useEffect(() => {
    if (activeModal === 'scanner') {
      // Small delay so the DOM element renders before we trigger the slide-up
      requestAnimationFrame(() => setScannerSheetOpen(true));
    } else {
      setScannerSheetOpen(false);
    }
  }, [activeModal]);

  const closeScanner = () => {
    setScannerSheetOpen(false);
    // Wait for the slide-down animation to finish before removing from DOM
    setTimeout(() => setActiveModal('none'), 380);
  };

  // PDF Viewer states
  const [activeDocName, setActiveDocName] = useState('');
  const [activeDocUrl, setActiveDocUrl] = useState('');

  // Filter cases for this specific client company
  const clientCases = cases.filter((c) => c.clientId === currentUser.clientId);

  // Apply search query to client's cases
  const query = searchQuery.toLowerCase().trim();
  const filteredCases = clientCases.filter((c) => {
    return (
      c.title.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query) ||
      c.opposingParty.toLowerCase().includes(query) ||
      c.practiceArea.toLowerCase().includes(query)
    );
  });

  // Calculate metrics
  const activeCasesCount = clientCases.filter((c) => c.status === 'Activo').length;
  
  // Pending client milestones
  const clientMilestonesCount = clientCases.reduce((acc, c) => {
    return acc + c.timeline.filter(t => !t.completed).length;
  }, 0);

  // Consolidated documents for this client
  const clientDocs: Array<{ doc: DocumentItem; caseId: string; caseTitle: string }> = [];
  clientCases.forEach((c) => {
    c.documents.forEach((d) => {
      clientDocs.push({
        doc: d,
        caseId: c.id,
        caseTitle: c.title
      });
    });
  });

  const handleOcrComplete = async (newCase: Case, newDoc: DocumentItem, fileBlob: Blob) => {
    // ✅ FIX: Persist the PDF blob to localStorage so it can be viewed later
    try {
      await savePdfBlob(newDoc.id, fileBlob);
    } catch (e) {
      console.warn('Could not persist PDF to localStorage:', e);
    }
    onAddCase(newCase);
    onAddLog(`Cliente ${currentUser.name} registró nuevo documento laboral vía OCR (${newCase.id})`, 'Success');
    onShowToast('Documento Ingresado', `El expediente de ${newCase.opposingParty} se creó con éxito y está disponible en su carpeta.`, 'success');
    setActiveModal('none');
  };

  const handleViewPDF = (docId: string, docName: string, remotePdfUrl?: string | null) => {
    setActiveDocName(docName);
    const localUrl = getPdfObjectUrl(docId);
    setActiveDocUrl(localUrl || remotePdfUrl || '');
    setActiveModal('pdf');
  };

  const selectedCase = clientCases.find(c => c.id === selectedCaseId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Welcome & Shutter trigger header */}
      <div className="section-header">
        <div>
          <span className="metric-trend up" style={{ background: 'rgba(0,122,255,0.08)', color: 'var(--primary-blue)' }}>
            Portal del Cliente Corporativo
          </span>
          <h2 className="serif" style={{ fontSize: '26px', marginTop: '4px' }}>
            {clientDisplayName}
          </h2>
        </div>
        

      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Causas en Asesoría</span>
            <div className="metric-icon" style={{ color: 'var(--primary-blue)' }}>
              <Briefcase size={20} />
            </div>
          </div>
          <div className="metric-value">{clientCases.length}</div>
          <div className="metric-sub">Historial total en despacho</div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Defensas Activas</span>
            <div className="metric-icon" style={{ color: 'var(--success)' }}>
              <Building2 size={20} />
            </div>
          </div>
          <div className="metric-value">{activeCasesCount}</div>
          <div className="metric-sub">Casos en tramitación laboral</div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Acciones Pendientes</span>
            <div className="metric-icon" style={{ color: 'var(--warning)' }}>
              <Calendar size={20} />
            </div>
          </div>
          <div className="metric-value">{clientMilestonesCount}</div>
          <div className="metric-sub">Hitos procesales siguientes</div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Carpeta Digital</span>
            <div className="metric-icon" style={{ color: 'var(--danger)' }}>
              <Folder size={20} />
            </div>
          </div>
          <div className="metric-value">{clientDocs.length}</div>
          <div className="metric-sub">Documentos y demandas PDF</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="ti-layout ti-layout-client">
        
        {/* Left Side: Cases List / Detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {selectedCase ? (
            /* Selected Case Details for Client */
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '14px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{selectedCase.id}</span>
                  <h3 className="serif" style={{ fontSize: '18px', marginTop: '2px' }}>{selectedCase.title}</h3>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCaseId(null)}>
                  Ver todos
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', fontSize: '13px', margin: '14px 0' }}>
                <div>
                  <span className="health-label">Demandante</span>
                  <p style={{ fontWeight: 600, marginTop: '2px' }}>{selectedCase.opposingParty}</p>
                </div>
                <div>
                  <span className="health-label">Tribunal</span>
                  <p style={{ fontWeight: 600, marginTop: '2px' }}>{selectedCase.court}</p>
                </div>
                <div>
                  <span className="health-label">Abogado Legium</span>
                  <p style={{ fontWeight: 600, marginTop: '2px' }}>{selectedCase.assignedLawyerName}</p>
                </div>
                <div>
                  <span className="health-label">Fecha de Inicio</span>
                  <p style={{ fontWeight: 600, marginTop: '2px' }}>{selectedCase.startDate}</p>
                </div>
              </div>

              <div style={{ margin: '12px 0' }}>
                <span className="health-label">Resumen de Defensa</span>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '4px' }}>
                  {selectedCase.description}
                </p>
              </div>

              {/* Read-Only Timeline */}
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={15} style={{ color: 'var(--primary-gold)' }} /> LÃ­nea de Tiempo Procesal
                </h4>
                <div className="timeline" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {selectedCase.timeline.map((t, idx) => (
                    <div key={idx} className={`timeline-item ${t.completed ? 'completed' : ''}`} style={{ paddingBottom: '12px' }}>
                      <div className="timeline-dot" />
                      <span className="timeline-date" style={{ fontSize: '10px' }}>{t.date}</span>
                      <div className="timeline-title" style={{ fontSize: '12px', fontWeight: 600 }}>{t.title}</div>
                      <div className="timeline-desc" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
                    {/* Case Specific Documents */}
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} style={{ color: 'var(--danger)' }} /> Documentos Adjuntos
                </h4>
                <div className="document-list">
                  {selectedCase.documents.map((doc) => (
                    <div key={doc.id} className="document-item">
                      <div className="doc-icon">
                        <FileText size={16} />
                      </div>
                      <div className="doc-info">
                        <div className="doc-name">{doc.name}</div>
                        <div className="doc-meta">{doc.size} • {doc.uploadDate}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleViewPDF(doc.id, doc.name, doc.pdfUrl)}>
                        Visualizar
                      </button>
                    </div>
                  ))}
                </div>

                <div 
                  className={`file-upload-zone ${dragOver ? 'dragover' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, selectedCase)}
                  style={{
                    border: '1.5px dashed var(--border-color)',
                    borderRadius: '12px',
                    padding: '16px',
                    textAlign: 'center',
                    background: dragOver ? 'rgba(0,122,255,0.04)' : 'rgba(0,0,0,0.01)',
                    borderColor: dragOver ? 'var(--primary-blue)' : 'var(--border-color)',
                    transition: 'all 0.2s ease',
                    marginTop: '12px',
                    cursor: 'pointer'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={22} style={{ color: 'var(--text-secondary)', margin: '0 auto 6px', opacity: 0.7 }} />
                  <p style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Arrastra tu demanda o PDF aquí
                  </p>
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Solo formato PDF (máx. 15MB)
                  </p>
                </div>

                <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                  <GlassButton
                    className="btn-secondary"
                    size="sm"
                    onClick={() => setActiveModal('scanner-case')}
                  >
                    <Camera size={13} /> Escanear
                  </GlassButton>
                  
                  <GlassButton
                    className="btn-secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={13} /> Adjuntar PDF
                  </GlassButton>
                  
                  <input
                    type="file"
                    id="client-case-pdf-input"
                    accept="application/pdf"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        processUploadedFile(e.target.files[0], selectedCase);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Client Cases Table */
            <div className="glass-card">
              <div className="section-header">
                <h3 className="section-title">Expedientes Laborales Corporativos</h3>
              </div>
              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Causa / Trabajador</th>
                      <th>Área</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '15px' }}>
                          No se encontraron expedientes con los criterios seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredCases.map((c) => (
                        <tr key={c.id}>
                          <td style={{ color: 'var(--primary-gold)', fontWeight: 600 }}>{c.id}</td>
                          <td style={{ fontWeight: 600 }}>
                            {c.opposingParty} <br />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                              {c.title.split(' vs. ')[0]}
                            </span>
                          </td>
                          <td>{c.practiceArea}</td>
                          <td>
                            <span className={`badge ${c.status === 'Cerrado' ? 'badge-closed' : c.status === 'En Apelación' ? 'badge-appealing' : 'badge-active'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCaseId(c.id)}>
                              Ver Ficha
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Consolidated Digital Folder */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
          <h3 className="section-title" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Folder size={18} style={{ color: 'var(--danger)' }} /> Carpeta Digital Consolidada
          </h3>
          <div className="document-list" style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '500px' }}>
            {clientDocs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                No hay documentos cargados en su carpeta digital.
              </p>
            ) : (
              clientDocs.map(({ doc, caseId }) => (
                <div
                  key={doc.id}
                  className="document-item"
                  onClick={() => handleViewPDF(doc.id, doc.name, doc.pdfUrl)}
                  style={{ padding: '8px', cursor: 'pointer' }}
                >
                  <div className="doc-icon">
                    <FileText size={16} />
                  </div>
                  <div className="doc-info" style={{ minWidth: 0, flex: 1 }}>
                    <div className="doc-name" style={{ fontSize: '12.5px' }} title={doc.name}>{doc.name}</div>
                    <div className="doc-meta" style={{ fontSize: '10.5px' }}>
                      {doc.size} • {doc.uploadDate} <br />
                      <span style={{ color: 'var(--primary-gold)', fontSize: '9px' }}>Exp: {caseId}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ==================== MODALS ==================== */}

      {/* 1. OCR SCANNER MODAL — Bottom Sheet that slides up from below */}
      {activeModal === 'scanner' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            background: scannerSheetOpen ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)',
            backdropFilter: scannerSheetOpen ? 'blur(8px)' : 'none',
            transition: 'background 0.38s ease, backdrop-filter 0.38s ease',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeScanner(); }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '100vw',
              height: '96vh',
              background: '#1c1c1e',
              borderRadius: '20px 20px 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
              transform: scannerSheetOpen ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Sheet drag handle */}
            <div style={{ padding: '10px 0 0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ width: '36px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.2)' }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} style={{ color: 'var(--primary-gold)' }} />
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>Escanear Documento</span>
              </div>
              <button
                onClick={closeScanner}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}
              >
                ✕
              </button>
            </div>
            {/* Scanner body */}
            <div style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <OcrScanner
                currentUser={currentUser}
                onOcrComplete={handleOcrComplete}
                onClose={closeScanner}
              />
            </div>
          </div>
        </div>
      )}

      {/* 1.5. CASE SPECIFIC SCANNER MODAL */}
      {activeModal === 'scanner-case' && selectedCase && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '100vw', height: '96vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column' }}>
            <div className="ios-grabber" />
            <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '16px', fontWeight: 700 }}>
                <Camera size={18} style={{ color: 'var(--primary-blue)' }} /> Escanear Documento
              </h3>
              <button className="modal-close" onClick={() => setActiveModal('none')} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600 }}>✕</button>
            </div>
            {/* Scanner body */}
            <div style={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <OcrScanner
                currentUser={currentUser}
                existingCase={selectedCase}
                onOcrComplete={(updatedCase, newDoc, fileBlob) => {
                  onUpdateCase(updatedCase);
                  onAddLog(`Cliente ${currentUser.name} cargó documento PDF escaneado ${newDoc.name} en expediente ${selectedCase.id}`, 'Success');
                  onShowToast('Documento Escaneado', `El PDF escaneado ${newDoc.name} se ha guardado con éxito.`, 'success');
                  setActiveModal('none');
                }}
                onClose={() => setActiveModal('none')}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. PDF VIEW MODAL — fullscreen */}
      {activeModal === 'pdf' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#1c1c1e',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            background: '#2c2c2e',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <button
              onClick={() => setActiveModal('none')}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            >
              <X size={22} />
            </button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 12px' }}>
              {activeDocName}
            </span>
            {activeDocUrl ? (
              <a
                href={activeDocUrl}
                download={activeDocName.endsWith('.pdf') ? activeDocName : activeDocName + '.pdf'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  background: 'rgba(0,122,255,0.15)', color: '#409cff',
                  border: '1px solid rgba(0,122,255,0.3)',
                  borderRadius: '8px', padding: '6px 12px',
                  fontSize: '12px', fontWeight: 600, textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                <Download size={14} /> Descargar
              </a>
            ) : (
              <div style={{ width: 80 }} />
            )}
          </div>

          {/* Viewer */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {activeDocUrl ? (
              <>
                {/* Primary: object tag (renders PDF natively on desktop) */}
                <object
                  data={activeDocUrl}
                  type="application/pdf"
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                >
                  {/* Fallback for mobile browsers that can't embed PDFs */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', gap: '16px', padding: '32px', textAlign: 'center',
                  }}>
                    <FileText size={56} style={{ color: 'var(--primary-gold)', opacity: 0.8 }} />
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', maxWidth: '280px' }}>
                      Tu navegador no puede mostrar el PDF integrado. Usa el botón para descargarlo o ábrelo directamente.
                    </p>
                    <a
                      href={activeDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        background: '#007aff', color: '#fff',
                        borderRadius: '12px', padding: '12px 24px',
                        fontSize: '14px', fontWeight: 700, textDecoration: 'none',
                      }}
                    >
                      <Eye size={16} /> Abrir PDF
                    </a>
                    <a
                      href={activeDocUrl}
                      download={activeDocName.endsWith('.pdf') ? activeDocName : activeDocName + '.pdf'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        background: 'rgba(255,255,255,0.1)', color: '#fff',
                        borderRadius: '12px', padding: '12px 24px',
                        fontSize: '14px', fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      <Download size={16} /> Descargar PDF
                    </a>
                  </div>
                </object>
              </>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', gap: '16px', padding: '32px', textAlign: 'center',
              }}>
                <FileText size={56} style={{ color: 'var(--primary-gold)', opacity: 0.6 }} />
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', maxWidth: '280px' }}>
                  El PDF no está disponible en esta sesión. Vuelve a escanear el documento para regenerarlo.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};



