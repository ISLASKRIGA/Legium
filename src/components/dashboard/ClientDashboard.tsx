import React, { useState } from 'react';
import { Camera, FileText, Briefcase, Calendar, Folder, ArrowRight, User as UserIcon, Building2, Eye, ShieldAlert } from 'lucide-react';
import { Case, User, DocumentItem } from '../../utils/types';
import { OcrScanner } from '../cases/OcrScanner';
import { getPdfObjectUrl, savePdfBlob } from '../../utils/pdfStorage';

interface ClientDashboardProps {
  currentUser: User;
  cases: Case[];
  searchQuery: string;
  onAddCase: (newCase: Case) => void;
  onAddLog: (action: string, status: 'Success' | 'Warning' | 'Denied') => void;
  onShowToast: (title: string, message: string, type: 'success' | 'warning' | 'danger') => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  currentUser,
  cases,
  searchQuery,
  onAddCase,
  onAddLog,
  onShowToast
}) => {
  const [activeModal, setActiveModal] = useState<'none' | 'scanner' | 'pdf'>('none');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

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
    const storageKey = await savePdfBlob(newDoc.id, fileBlob);
    const storedCase = {
      ...newCase,
      documents: newCase.documents.map((doc) =>
        doc.id === newDoc.id ? { ...doc, storageKey } : doc
      )
    };

    onAddCase(storedCase);
    onAddLog('Cliente Ing. Luis Fuentes registro nueva demanda laboral via OCR (' + newCase.id + ')', 'Success');
    onShowToast('Demanda Ingresada', 'La demanda de ' + newCase.opposingParty + ' se ingreso con exito y quedo almacenada como PDF OCR.', 'success');
    setActiveModal('none');
  };

  const handleViewPDF = (docId: string, docName: string) => {
    setActiveDocName(docName);
    const url = getPdfObjectUrl(docId);
    setActiveDocUrl(url || '');
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
            Constructora Alfa S.A.
          </h2>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-primary" 
            onClick={() => setActiveModal('scanner')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Camera size={16} /> Escanear Nuevo Documento
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Causas en AsesorÃ­a</span>
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
          <div className="metric-sub">Casos en tramitaciÃ³n laboral</div>
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
                        <div className="doc-meta">{doc.size} â€¢ {doc.uploadDate}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleViewPDF(doc.id, doc.name)}>
                        Visualizar
                      </button>
                    </div>
                  ))}
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
                      <th>CÃ³digo</th>
                      <th>Causa / Trabajador</th>
                      <th>Ãrea</th>
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
                            <span className={`badge ${c.status === 'Cerrado' ? 'badge-closed' : c.status === 'En ApelaciÃ³n' ? 'badge-appealing' : 'badge-active'}`}>
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
                <div key={doc.id} className="document-item" style={{ padding: '8px' }}>
                  <div className="doc-icon">
                    <FileText size={16} />
                  </div>
                  <div className="doc-info" style={{ minWidth: 0 }}>
                    <div className="doc-name" style={{ fontSize: '12.5px' }} title={doc.name}>{doc.name}</div>
                    <div className="doc-meta" style={{ fontSize: '10.5px' }}>
                      {doc.size} â€¢ {doc.uploadDate} <br />
                      <span style={{ color: 'var(--primary-gold)', fontSize: '9px' }}>Exp: {caseId}</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleViewPDF(doc.id, doc.name)}>
                    <Eye size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ==================== MODALS ==================== */}

      {/* 1. OCR SCANNER MODAL */}
      {activeModal === 'scanner' && (
        <div className="modal active" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '100vw', width: '100vw', height: '100vh', maxHeight: '100vh', borderRadius: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ border: 'none', background: '#1c1c1e', color: '#fff', padding: '14px 20px' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', justifyContent: 'center' }}>
                <Camera size={18} style={{ color: 'var(--primary-gold)' }} /> Escaneo de Documentos Judiciales (CamScanner)
              </h3>
              <button className="modal-close" onClick={() => setActiveModal('none')} style={{ color: 'var(--primary-blue)' }}>Cerrar</button>
            </div>
            <div className="modal-body" style={{ flexGrow: 1, padding: 0, display: 'flex', flexDirection: 'column', background: '#1c1c1e', overflow: 'hidden', maxHeight: '100%' }}>
              <OcrScanner 
                currentUser={currentUser}
                onOcrComplete={handleOcrComplete}
                onClose={() => setActiveModal('none')}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. PDF VIEW MODAL */}
      {activeModal === 'pdf' && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '820px', width: '90%' }}>
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">{activeDocName}</h3>
              <button className="modal-close" onClick={() => setActiveModal('none')}>Cerrar</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div id="pdf-viewer-container" style={{ width: '100%', height: '70vh', backgroundColor: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {activeDocUrl ? (
                  <iframe src={activeDocUrl} style={{ width: '100%', height: '100%', border: 'none' }} title={activeDocName} />
                ) : (
                  <div id="pdf-viewer-fallback" style={{ textAlign: 'center', padding: '40px' }}>
                    <FileText size={48} style={{ color: 'var(--primary-gold)', margin: '0 auto 12px', display: 'block' }} />
                    <h4 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Vista Previa de Metadatos</h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '340px', margin: '0 auto 16px' }}>
                      El archivo PDF fÃ­sico ya no estÃ¡ cargado en la sesiÃ³n del navegador. Los metadatos siguen guardados de forma segura en LocalStorage.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



