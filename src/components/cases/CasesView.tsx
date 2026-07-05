import React, { useState } from 'react';
import { Plus, Search, Scale, Briefcase } from 'lucide-react';
import { Case, User, DocumentItem, PracticeArea, CaseStatus } from '../../utils/types';
import { CaseDetail } from './CaseDetail';

interface CasesViewProps {
  cases: Case[];
  currentUser: User;
  users: User[];
  clients: Array<{ id: string; name: string; type: string }>;
  searchQuery: string;
  onUpdateCase: (updatedCase: Case) => void;
  onAddCase: (newCase: Case) => void;
  onAddLog: (action: string, status: 'Success' | 'Warning' | 'Denied') => void;
  onShowToast: (title: string, message: string, type: 'success' | 'warning' | 'danger') => void;
  activeCaseId: string | null;
  setActiveCaseId: (id: string | null) => void;
}

export const CasesView: React.FC<CasesViewProps> = ({
  cases,
  currentUser,
  users,
  clients,
  searchQuery,
  onUpdateCase,
  onAddCase,
  onAddLog,
  onShowToast,
  activeCaseId,
  setActiveCaseId
}) => {
  const [selectedStatus, setSelectedStatus] = useState<CaseStatus | 'Todos'>('Todos');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form states
  const [caseTitle, setCaseTitle] = useState('');
  const [caseClient, setCaseClient] = useState('');
  const caseArea: PracticeArea = 'Laboral';
  const [caseOpposing, setCaseOpposing] = useState('');
  const [caseOpposingLawyer, setCaseOpposingLawyer] = useState('');
  const [caseCourt, setCaseCourt] = useState('');
  const [caseJudge, setCaseJudge] = useState('');
  const [caseLawyer, setCaseLawyer] = useState('');
  const [caseStartDate, setCaseStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [caseDesc, setCaseDesc] = useState('');

  // Filter cases based on role
  let filteredCases = cases;
  if (currentUser.role === 'Abogado Junior') {
    filteredCases = cases.filter((c) => c.assignedLawyerId === currentUser.id);
  }

  // Filter based on search query
  const query = searchQuery.toLowerCase().trim();
  filteredCases = filteredCases.filter((c) => {
    const matchesDocName = c.documents && c.documents.some(doc => doc.name.toLowerCase().includes(query));
    const matchesSearch =
      c.title.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query) ||
      c.clientName.toLowerCase().includes(query) ||
      c.assignedLawyerName.toLowerCase().includes(query) ||
      matchesDocName;
    const matchesStatus = selectedStatus === 'Todos' || c.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCreateCaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseTitle || !caseClient || !caseLawyer || !caseCourt) return;

    const selectedClient = clients.find((cl) => cl.id === caseClient);
    const selectedLawyer = users.find((u) => u.id === caseLawyer);

    const year = new Date().getFullYear();
    const uniqueNum = String(Date.now()).slice(-4) + String(Math.floor(Math.random() * 9) + 1);
    const newId = `LEG-${year}-${uniqueNum}`;

    const newCase: Case = {
      id: newId,
      title: caseTitle,
      clientId: caseClient,
      clientName: selectedClient ? selectedClient.name : 'Cliente Desconocido',
      opposingParty: caseOpposing,
      opposingLawyer: caseOpposingLawyer,
      practiceArea: caseArea,
      status: 'Activo',
      court: caseCourt,
      judge: caseJudge,
      assignedLawyerId: caseLawyer,
      assignedLawyerName: selectedLawyer ? selectedLawyer.name : 'Abogado Sin Asignar',
      startDate: caseStartDate,
      description: caseDesc,
      timeline: [
        {
          date: caseStartDate,
          title: 'Apertura de Expediente',
          desc: 'Se crea el archivo digital del caso en Legium.',
          completed: true
        }
      ],
      tasks: [],
      notes: [],
      documents: []
    };

    onAddCase(newCase);
    onAddLog(`Creación de nuevo expediente jurídico ${newId}: ${caseTitle}`, 'Success');
    onShowToast('Expediente Creado', `El caso ${newId} ha sido registrado correctamente.`, 'success');

    // Reset Form and close
    setCaseTitle('');
    setCaseClient('');
    setCaseOpposing('');
    setCaseOpposingLawyer('');
    setCaseCourt('');
    setCaseJudge('');
    setCaseLawyer('');
    setCaseDesc('');
    setIsCreateModalOpen(false);
  };

  // Render detail view if a case is active
  const activeCase = cases.find((c) => c.id === activeCaseId);
  if (activeCase) {
    return (
      <CaseDetail
        c={activeCase}
        currentUser={currentUser}
        users={users}
        onBack={() => setActiveCaseId(null)}
        onUpdateCase={onUpdateCase}
        onAddLog={onAddLog}
        onShowToast={onShowToast}
      />
    );
  }

  // Filter lawyers for case creation select list
  const activeLawyers = users.filter((u) => u.role !== 'TI Administrador' && u.active);

  const areas: Array<PracticeArea | 'Todas'> = ['Todas', 'Civil', 'Penal', 'Laboral', 'Tributario', 'Corporativo'];
  const statuses: Array<CaseStatus | 'Todos'> = ['Todos', 'Activo', 'En Apelación', 'Cerrado', 'Suspendido'];

  return (
    <section className="view-panel active" id="view-cases">
      <div id="cases-list-panel">
        <div className="section-header">
          <div>
            <span className="metric-trend up">Archivo Digital</span>
            <h2 className="serif" style={{ fontSize: '26px', marginTop: '4px' }}>Expedientes Jurídicos</h2>
          </div>
          <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> Nuevo Expediente
          </button>
        </div>

        {/* iOS Segmented Filters Bar */}
        <div className="glass-card filter-bar" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="health-label" style={{ marginLeft: '2px' }}>Especialidad del Despacho</span>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--primary-blue)', padding: '6px 12px', background: 'rgba(0,122,255,0.06)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Scale size={14} /> Defensa Laboral Corporativa
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="health-label" style={{ marginLeft: '2px' }}>Estado Procesal</span>
            <div className="segmented-filters" id="segmented-filter-status">
              {statuses.map((status) => (
                <div
                  key={status}
                  className={`segment-item ${selectedStatus === status ? 'active' : ''}`}
                  onClick={() => setSelectedStatus(status)}
                  style={{ cursor: 'pointer' }}
                >
                  {status === 'Todos' ? 'Todos' : status === 'Activo' ? 'Activos' : status === 'En Apelación' ? 'Apelación' : status === 'Cerrado' ? 'Cerrados' : 'Suspendidos'}
                </div>
              ))}
            </div>
          </div>

          <div style={{ flexGrow: 1 }} />
          <span className="metric-sub" style={{ alignSelf: 'flex-end', paddingBottom: '8px' }}>
            Mostrando {filteredCases.length} expedientes
          </span>
        </div>

        {/* Cases Table */}
        <div className="glass-card">
          <div className="table-responsive">
            <table className="custom-table" id="cases-table">
              <thead>
                <tr>
                  <th>Código ID</th>
                  <th>Carátula / Caso</th>
                  <th>Cliente</th>
                  <th>Área</th>
                  <th>Estado</th>
                  <th>Abogado Asignado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                      No se encontraron expedientes con los criterios seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredCases.map((c) => (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--primary-gold)', fontWeight: 600 }}>{c.id}</td>
                      <td style={{ fontWeight: 600 }}>{c.title}</td>
                      <td>{c.clientName}</td>
                      <td>{c.practiceArea}</td>
                      <td>
                        <span className={`badge ${
                          c.status === 'Cerrado' 
                            ? 'badge-closed' 
                            : c.status === 'En Apelación' 
                            ? 'badge-appealing' 
                            : c.status === 'Suspendido' 
                            ? 'badge-suspended' 
                            : 'badge-active'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td>{c.assignedLawyerName}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveCaseId(c.id)}>
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

      {/* CREATE CASE MODAL */}
      {isCreateModalOpen && (
        <div className="modal active">
          <div className="modal-content">
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">Registrar Nuevo Expediente</h3>
              <button className="modal-close" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
            </div>
            <form onSubmit={handleCreateCaseSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Carátula / Nombre del Caso</label>
                  <input
                    type="text"
                    className="form-control"
                    value={caseTitle}
                    onChange={(e) => setCaseTitle(e.target.value)}
                    required
                    placeholder="Ej. Juicio de Arrendamiento Gómez vs. Valdés"
                  />
                </div>

                <div className="form-group">
                  <label>Cliente Corporativo</label>
                  <select
                    className="form-control"
                    value={caseClient}
                    onChange={(e) => setCaseClient(e.target.value)}
                    required
                  >
                    <option value="" disabled>Seleccione un cliente corporativo...</option>
                    {clients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name} ({cl.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Contraparte</label>
                    <input
                      type="text"
                      className="form-control"
                      value={caseOpposing}
                      onChange={(e) => setCaseOpposing(e.target.value)}
                      placeholder="Ej. Juan Pérez / Empresa S.A."
                    />
                  </div>
                  <div className="form-group">
                    <label>Abogado Contraparte</label>
                    <input
                      type="text"
                      className="form-control"
                      value={caseOpposingLawyer}
                      onChange={(e) => setCaseOpposingLawyer(e.target.value)}
                      placeholder="Ej. Estudio Jurídico Gomez & Cía"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tribunal / Sede</label>
                    <input
                      type="text"
                      className="form-control"
                      value={caseCourt}
                      onChange={(e) => setCaseCourt(e.target.value)}
                      required
                      placeholder="Ej. 1er Juzgado de Letras de Trabajo"
                    />
                  </div>
                  <div className="form-group">
                    <label>Juez a Cargo</label>
                    <input
                      type="text"
                      className="form-control"
                      value={caseJudge}
                      onChange={(e) => setCaseJudge(e.target.value)}
                      placeholder="Ej. Don Ricardo Morales"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Abogado Asignado</label>
                    <select
                      className="form-control"
                      value={caseLawyer}
                      onChange={(e) => setCaseLawyer(e.target.value)}
                      required
                    >
                      <option value="" disabled>Seleccione un abogado...</option>
                      {activeLawyers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fecha de Apertura</label>
                    <input
                      type="date"
                      className="form-control"
                      value={caseStartDate}
                      onChange={(e) => setCaseStartDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Resumen General de los Hechos</label>
                  <textarea
                    className="form-control"
                    value={caseDesc}
                    onChange={(e) => setCaseDesc(e.target.value)}
                    required
                    placeholder="Escriba los antecedentes claves de la demanda o defensa jurídica..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Registrar Expediente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
