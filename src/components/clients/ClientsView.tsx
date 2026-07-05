import React, { useState } from 'react';
import { Plus, ArrowLeft, Building2, User as UserIcon, FileText } from 'lucide-react';
import { Client, Case, User, DocumentItem } from '../../utils/types';
import { getPdfObjectUrl } from '../../utils/pdfStorage';

interface ClientsViewProps {
  clients: Client[];
  cases: Case[];
  currentUser: User;
  searchQuery: string;
  onAddClient: (newClient: Client) => void;
  onAddLog: (action: string, status: 'Success' | 'Warning' | 'Denied') => void;
  onShowToast: (title: string, message: string, type: 'success' | 'warning' | 'danger') => void;
  onViewCase: (caseId: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  cases,
  currentUser,
  searchQuery,
  onAddClient,
  onAddLog,
  onShowToast,
  onViewCase
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form states
  const [clientName, setClientName] = useState('');
  const [clientType, setClientType] = useState<'Corporativo' | 'Individual'>('Corporativo');
  const [clientRfc, setClientRfc] = useState('');
  const [clientContact, setClientContact] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  // PDF Viewer Modal inside Clients
  const [activeDocName, setActiveDocName] = useState('');
  const [activeDocUrl, setActiveDocUrl] = useState('');
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Filter clients based on search query
  const query = searchQuery.toLowerCase().trim();
  const filteredClients = clients.filter((c) => {
    return (
      c.name.toLowerCase().includes(query) ||
      c.contactPerson.toLowerCase().includes(query) ||
      c.rfc.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query)
    );
  });

  const handleCreateClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !clientRfc || !clientContact || !clientEmail) return;

    const count = clients.length + 1;
    const newId = `cli-${String(count).padStart(2, '0')}`;

    const newClient: Client = {
      id: newId,
      name: clientName,
      type: clientType,
      rfc: clientRfc,
      contactPerson: clientContact,
      phone: clientPhone,
      email: clientEmail
    };

    onAddClient(newClient);
    onAddLog(`Registro de nuevo cliente ${clientName} (${clientType})`, 'Success');
    onShowToast('Cliente Registrado', `El cliente ${clientName} fue añadido al directorio.`, 'success');

    // Reset form
    setClientName('');
    setClientRfc('');
    setClientContact('');
    setClientPhone('');
    setClientEmail('');
    setIsCreateModalOpen(false);
  };

  const handleViewPDF = (docId: string, docName: string) => {
    setActiveDocName(docName);
    const url = getPdfObjectUrl(docId);
    setActiveDocUrl(url || '');
    setIsPdfModalOpen(true);
  };

  // Find selected client & associated cases/docs
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const clientCases = selectedClient ? cases.filter((c) => c.clientId === selectedClient.id) : [];
  
  // Aggregate all documents from all cases of this client
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

  return (
    <section className="view-panel active" id="view-clients">
      {selectedClient ? (
        /* CLIENT DETAIL VIEW */
        <div id="client-detail-panel">
          <div className="section-header">
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setSelectedClientId(null)} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={14} /> Volver a la Lista
            </button>
            <div>
              <span className="badge badge-active">{selectedClient.type}</span>
            </div>
          </div>

          <div className="detail-layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* General Info */}
              <div className="glass-card">
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
                  <span className="metric-trend up" style={{ fontSize: '12px', fontWeight: 600 }}>{selectedClient.id}</span>
                  <h2 className="serif" style={{ fontSize: '22px', marginTop: '4px' }}>{selectedClient.name}</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                  <div>
                    <span className="health-label">Identificación Tributaria (RFC/RUT)</span>
                    <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{selectedClient.rfc}</p>
                  </div>
                  <div>
                    <span className="health-label">Representante / Contacto</span>
                    <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{selectedClient.contactPerson}</p>
                  </div>
                  <div>
                    <span className="health-label">Teléfono</span>
                    <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{selectedClient.phone}</p>
                  </div>
                  <div>
                    <span className="health-label">Correo Electrónico</span>
                    <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{selectedClient.email}</p>
                  </div>
                </div>
              </div>

              {/* Associated Cases */}
              <div className="glass-card">
                <h3 className="section-title" style={{ marginBottom: '14px' }}>Expedientes Asociados</h3>
                <div className="table-responsive">
                  <table className="custom-table" id="client-cases-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Carátula / Caso</th>
                        <th>Área</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientCases.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '15px' }}>
                            No hay expedientes asociados a este cliente.
                          </td>
                        </tr>
                      ) : (
                        clientCases.map((cc) => (
                          <tr 
                            key={cc.id} 
                            style={{ cursor: 'pointer' }}
                            onClick={() => onViewCase(cc.id)}
                            title="Haga clic para ver ficha del caso"
                          >
                            <td style={{ color: 'var(--primary-gold)', fontWeight: 600 }}>{cc.id}</td>
                            <td style={{ fontWeight: 600 }}>{cc.title}</td>
                            <td>{cc.practiceArea}</td>
                            <td>
                              <span className={`badge ${
                                cc.status === 'Cerrado' 
                                  ? 'badge-closed' 
                                  : cc.status === 'En Apelación' 
                                  ? 'badge-appealing' 
                                  : cc.status === 'Suspendido' 
                                  ? 'badge-suspended' 
                                  : 'badge-active'
                              }`}>
                                {cc.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Consolidated Documents */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-card">
                <h3 className="section-title" style={{ marginBottom: '14px' }}>Documentos Consolidados (PDF)</h3>
                <div className="document-list" id="detail-client-documents">
                  {clientDocs.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '15px' }}>
                      No hay documentos PDF cargados para este cliente.
                    </p>
                  ) : (
                    clientDocs.map(({ doc, caseId, caseTitle }) => (
                      <div key={doc.id} className="document-item">
                        <div className="doc-icon">
                          <FileText size={18} />
                        </div>
                        <div className="doc-info">
                          <div className="doc-name" title={doc.name}>{doc.name}</div>
                          <div className="doc-meta">
                            {doc.size} • {doc.uploadDate} <br />
                            <span style={{ fontSize: '10px', color: 'var(--primary-gold)' }}>Caso: {caseId}</span>
                          </div>
                        </div>
                        <div className="doc-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => handleViewPDF(doc.id, doc.name)}>
                            Visualizar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* CLIENTS LIST VIEW */
        <div id="clients-list-panel">
          <div className="section-header">
            <div>
              <span className="metric-trend up">Directorio</span>
              <h2 className="serif" style={{ fontSize: '26px', marginTop: '4px' }}>Clientes Legium</h2>
            </div>
            <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Nuevo Cliente
            </button>
          </div>

          <div className="glass-card">
            <div className="table-responsive">
              <table className="custom-table" id="clients-table">
                <thead>
                  <tr>
                    <th>Nombre / Razón Social</th>
                    <th>Tipo</th>
                    <th>Identificación Tributaria</th>
                    <th>Contacto Principal</th>
                    <th>Correo Electrónico</th>
                    <th>Teléfono</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                        No hay clientes registrados en el despacho.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((cl) => (
                      <tr key={cl.id}>
                        <td style={{ fontWeight: 600 }}>{cl.name}</td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            {cl.type === 'Corporativo' ? <Building2 size={13} /> : <UserIcon size={13} />}
                            {cl.type}
                          </span>
                        </td>
                        <td style={{ color: 'var(--primary-gold)', fontWeight: 500 }}>{cl.rfc}</td>
                        <td>{cl.contactPerson}</td>
                        <td>{cl.email}</td>
                        <td>{cl.phone}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedClientId(cl.id)}>
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
        </div>
      )}

      {/* ==================== MODALS ==================== */}

      {/* 1. Create Client Modal */}
      {isCreateModalOpen && (
        <div className="modal active">
          <div className="modal-content">
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">Registrar Nuevo Cliente</h3>
              <button className="modal-close" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
            </div>
            <form onSubmit={handleCreateClientSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nombre Completo o Razón Social</label>
                  <input
                    type="text"
                    className="form-control"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    placeholder="Ej. Inversiones Pacífico S.A. o Juan Valenzuela"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo de Persona</label>
                    <select
                      className="form-control"
                      value={clientType}
                      onChange={(e) => setClientType(e.target.value as 'Corporativo' | 'Individual')}
                      required
                    >
                      <option value="Corporativo">Corporativo (Persona Jurídica)</option>
                      <option value="Individual">Individual (Persona Física)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Identificación Tributaria (RFC/RUT)</label>
                    <input
                      type="text"
                      className="form-control"
                      value={clientRfc}
                      onChange={(e) => setClientRfc(e.target.value)}
                      required
                      placeholder="Ej. IPAC890912-XX2"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Representante / Contacto</label>
                    <input
                      type="text"
                      className="form-control"
                      value={clientContact}
                      onChange={(e) => setClientContact(e.target.value)}
                      required
                      placeholder="Ej. Don Antonio Ríos"
                    />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input
                      type="tel"
                      className="form-control"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      required
                      placeholder="Ej. +56 9 8877 6655"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Correo Electrónico de Contacto</label>
                  <input
                    type="email"
                    className="form-control"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    required
                    placeholder="Ej. contacto@empresa.com"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Registrar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. PDF Viewer Modal */}
      {isPdfModalOpen && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '820px', width: '90%' }}>
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">{activeDocName}</h3>
              <button className="modal-close" onClick={() => setIsPdfModalOpen(false)}>Cerrar</button>
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
                      El archivo PDF físico ya no está cargado en la sesión del navegador. Los metadatos siguen guardados de forma segura en LocalStorage.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

