import React, { useState } from 'react';
import { ArrowLeft, Plus, Calendar, CheckSquare, MessageSquare, FileText, Trash2, Camera, Upload } from 'lucide-react';
import { Case, User, DocumentItem, TimelineItem, TaskItem } from '../../utils/types';
import { DocumentScanner } from './DocumentScanner';
import { deletePdfBlob, getPdfObjectUrl, savePdfBlob } from '../../utils/pdfStorage';
import { uploadPdfToSupabase, saveDocumentRecord, saveCaseRecord } from '../../utils/supabaseClient';
import { GlassButton } from '../ui/glass-button';

interface CaseDetailProps {
  c: Case;
  currentUser: User;
  users: User[];
  onBack: () => void;
  onUpdateCase: (updatedCase: Case) => void;
  onAddLog: (action: string, status: 'Success' | 'Warning' | 'Denied') => void;
  onShowToast: (title: string, message: string, type: 'success' | 'warning' | 'danger') => void;
}

export const CaseDetail: React.FC<CaseDetailProps> = ({
  c,
  currentUser,
  users,
  onBack,
  onUpdateCase,
  onAddLog,
  onShowToast
}) => {
  // Modal states
  const [activeModal, setActiveModal] = useState<'none' | 'milestone' | 'task' | 'scanner' | 'pdf'>('none');
  
  // PDF Viewer State
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeDocName, setActiveDocName] = useState<string>('');
  const [activeDocUrl, setActiveDocUrl] = useState<string>('');

  // Form states
  const [milestoneDate, setMilestoneDate] = useState(new Date().toISOString().split('T')[0]);
  const [milestoneCompleted, setMilestoneCompleted] = useState('false');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDesc, setMilestoneDesc] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskLawyer, setTaskLawyer] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(new Date().toISOString().split('T')[0]);

  const [noteText, setNoteText] = useState('');

  // Timeline Sorting: completed first, then by date descending
  const sortedTimeline = [...c.timeline].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Notes sorting: by date descending
  const sortedNotes = [...c.notes].sort((a, b) => b.date.localeCompare(a.date));

  // Timeline checkbox toggle
  const handleToggleMilestone = (idx: number) => {
    const updatedTimeline = [...c.timeline];
    updatedTimeline[idx].completed = !updatedTimeline[idx].completed;
    const item = updatedTimeline[idx];

    const updated = { ...c, timeline: updatedTimeline };
    onUpdateCase(updated);
    onAddLog(
      `Hito procesal '${item.title}' en caso ${c.id} marcado como ${item.completed ? 'Concluido' : 'Pendiente'}`,
      'Success'
    );
    onShowToast('Hito Actualizado', `El hito procesal fue marcado como ${item.completed ? 'realizado' : 'pendiente'}.`, 'success');
  };

  // Task toggle
  const handleToggleTask = (taskId: string) => {
    const updatedTasks = c.tasks.map((t) => {
      if (t.id === taskId) {
        const nextState = !t.completed;
        onAddLog(
          `Tarea '${t.title}' en caso ${c.id} marcada como ${nextState ? 'Completada' : 'Pendiente'}`,
          'Success'
        );
        onShowToast('Tarea Actualizada', `La tarea fue marcada como ${nextState ? 'completada' : 'pendiente'}.`, 'success');
        return { ...t, completed: nextState };
      }
      return t;
    });

    const updated = { ...c, tasks: updatedTasks };
    onUpdateCase(updated);
  };

  // Add Note
  const handleSaveNote = () => {
    const text = noteText.trim();
    if (!text) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const formattedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const newNote = {
      id: `nt-${Date.now().toString().slice(-6)}`,
      date: formattedDate,
      author: currentUser.name,
      text
    };

    const updated = { ...c, notes: [...c.notes, newNote] };
    onUpdateCase(updated);
    onAddLog(`Añadida nota de abogado en expediente ${c.id}`, 'Success');
    onShowToast('Nota Guardada', 'La nota interna ha sido registrada de manera confidencial.', 'success');
    setNoteText('');
  };

  // Create Milestone submit
  const handleCreateMilestoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!milestoneTitle.trim() || !milestoneDesc.trim()) return;

    const newItem: TimelineItem = {
      date: milestoneDate,
      title: milestoneTitle,
      desc: milestoneDesc,
      completed: milestoneCompleted === 'true'
    };

    const updated = { ...c, timeline: [...c.timeline, newItem] };
    onUpdateCase(updated);
    onAddLog(`Hito procesal '${milestoneTitle}' registrado en caso ${c.id}`, 'Success');
    onShowToast('Hito Registrado', 'El hito fue añadido a la línea de tiempo.', 'success');
    
    // Reset form & close
    setMilestoneTitle('');
    setMilestoneDesc('');
    setMilestoneCompleted('false');
    setActiveModal('none');
  };

  // Create Task submit
  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskLawyer) return;

    const newId = `tsk-${Date.now().toString().slice(-4)}`;
    const newTask: TaskItem = {
      id: newId,
      title: taskTitle,
      dueDate: taskDueDate,
      assignedTo: taskLawyer,
      completed: false
    };

    const updated = { ...c, tasks: [...c.tasks, newTask] };
    onUpdateCase(updated);
    onAddLog(`Nueva tarea '${taskTitle}' añadida en caso ${c.id}`, 'Success');
    onShowToast('Tarea Creada', 'La tarea fue asignada correctamente.', 'success');

    // Reset & close
    setTaskTitle('');
    setTaskLawyer('');
    setActiveModal('none');
  };

  // PDF Upload handler
  const handlePDFFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadPDFBlob(file.name, file);
      e.target.value = ''; // reset
    }
  };

  const uploadPDFBlob = async (name: string, fileBlob: Blob, scannedDoc?: DocumentItem) => {
    // If it's not a PDF and does not end in .pdf, show error
    if (fileBlob.type !== 'application/pdf' && !name.toLowerCase().endsWith('.pdf')) {
      onShowToast('Formato Inválido', 'Solo se admiten archivos en formato PDF.', 'danger');
      return;
    }
    if (fileBlob.size > 10 * 1024 * 1024) {
      onShowToast('Archivo muy grande', 'El tamaño máximo permitido es 10MB.', 'danger');
      return;
    }

    const docId = scannedDoc?.id || 'doc-' + Date.now();
    const uploadDate = scannedDoc?.uploadDate || new Date().toISOString().split('T')[0];
    const sizeStr = (fileBlob.size / 1024).toFixed(1) + ' KB';
    
    // 1. Save locally to localStorage (fallback/offline view)
    const storageKey = await savePdfBlob(docId, fileBlob);

    // 2. Upload to Supabase Storage and DB (if configured)
    let pdfUrl: string | null = null;
    try {
      // Upsert the case record to avoid foreign key failures
      await saveCaseRecord(c);
      
      // Upload the PDF blob
      pdfUrl = await uploadPdfToSupabase(docId, fileBlob, c.id);
      
      // Save document record
      await saveDocumentRecord({
        id: docId,
        caseId: c.id,
        name: name.endsWith('.pdf') ? name : name + '.pdf',
        sizeKb: parseFloat((fileBlob.size / 1024).toFixed(1)),
        uploadDate,
        ocrText: scannedDoc?.ocrText || '',
        pdfUrl
      });
    } catch (err) {
      console.error('[Supabase Upload] Failed syncing case or uploading document:', err);
    }

    const newDoc: DocumentItem = {
      ...scannedDoc,
      id: docId,
      name: name.endsWith('.pdf') ? name : name + '.pdf',
      size: sizeStr,
      uploadDate,
      storageKey,
      pdfUrl
    };

    const updated = { ...c, documents: [...c.documents, newDoc] };
    onUpdateCase(updated);
    onAddLog('Cargado documento PDF OCR ' + name + ' en caso ' + c.id, 'Success');
    onShowToast('Documento Cargado', 'El PDF OCR ' + name + ' se ha cargado y almacenado con éxito.', 'success');
  };

  // Delete PDF
  const handleDeletePDF = (docId: string, docName: string) => {
    if (currentUser.role === 'Abogado Junior') {
      onAddLog(`Intento no autorizado de eliminar documento en caso ${c.id}`, 'Denied');
      onShowToast('Acceso Denegado', 'Los Abogados Junior no tienen permisos para eliminar documentos.', 'danger');
      return;
    }

    const updatedDocs = c.documents.filter((d) => d.id !== docId);
    
    deletePdfBlob(docId);

    const updated = { ...c, documents: updatedDocs };
    onUpdateCase(updated);
    onAddLog(`Eliminado documento PDF '${docName}' en caso ${c.id}`, 'Warning');
    onShowToast('Documento Eliminado', `El archivo '${docName}' fue removido de la ficha.`, 'warning');
  };

  // Open PDF Viewer
  const handleViewPDF = (docId: string, docName: string) => {
    setActiveDocId(docId);
    setActiveDocName(docName);
    
    // Check if the document has a Supabase public URL
    const doc = c.documents.find((d) => d.id === docId);
    if (doc?.pdfUrl) {
      setActiveDocUrl(doc.pdfUrl);
    } else {
      const url = getPdfObjectUrl(docId);
      setActiveDocUrl(url || '');
    }
    setActiveModal('pdf');
  };

  // Drag and drop events
  const [dragOver, setDragOver] = useState(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => {
    setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      uploadPDFBlob(file.name, file);
    }
  };

  // Filter lawyers list for tasks
  const lawyers = users.filter((u) => u.role !== 'TI Administrador' && u.active);

  return (
    <div id="case-detail-panel">
      <div className="section-header">
        <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={14} /> Volver a la Lista
        </button>
        <div>
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
        </div>
      </div>

      <div className="detail-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* General Info */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <span className="metric-trend up" style={{ fontSize: '12px', fontWeight: 600 }}>{c.id}</span>
                <h2 className="serif" style={{ fontSize: '22px', marginTop: '4px' }}>{c.title}</h2>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <span className="health-label">Cliente</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.clientName}</p>
              </div>
              <div>
                <span className="health-label">Contraparte</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.opposingParty || 'No registrada'}</p>
              </div>
              <div>
                <span className="health-label">Abogado Contraparte</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.opposingLawyer || 'No registrado'}</p>
              </div>
              <div>
                <span className="health-label">Área de Práctica</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.practiceArea}</p>
              </div>
              <div>
                <span className="health-label">Tribunal / Sede</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.court}</p>
              </div>
              <div>
                <span className="health-label">Juez a Cargo</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.judge || 'No asignado'}</p>
              </div>
              <div>
                <span className="health-label">Abogado Responsable</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.assignedLawyerName}</p>
              </div>
              <div>
                <span className="health-label">Fecha de Apertura</span>
                <p style={{ fontWeight: 600, marginTop: '2px', fontSize: '13.5px' }}>{c.startDate}</p>
              </div>
            </div>

            <div>
              <span className="health-label">Descripción de la Causa</span>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.5', marginTop: '4px' }}>
                {c.description}
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: 'var(--primary-gold)' }} />
                Línea de Tiempo Procesal
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveModal('milestone')}>
                Registrar Hito
              </button>
            </div>

            <div className="timeline" id="detail-case-timeline">
              {sortedTimeline.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '10px' }}>No hay hitos procesales registrados.</p>
              ) : (
                sortedTimeline.map((t, index) => {
                  const originalIndex = c.timeline.indexOf(t);
                  return (
                    <div key={index} className={`timeline-item ${t.completed ? 'completed' : ''}`}>
                      <div className="timeline-dot" />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <div className="timeline-date">{t.date}</div>
                        <input
                          type="checkbox"
                          checked={t.completed}
                          onChange={() => handleToggleMilestone(originalIndex)}
                          className="switch-timeline"
                          style={{ cursor: 'pointer', accentColor: 'var(--primary-gold)' }}
                        />
                      </div>
                      <div className="timeline-title">{t.title}</div>
                      <div className="timeline-desc">{t.desc}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Tasks */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare size={18} style={{ color: 'var(--primary-blue)' }} />
                Tareas del Expediente
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveModal('task')}>
                Nueva Tarea
              </button>
            </div>
            <div className="tasks-list" id="detail-case-tasks">
              {c.tasks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '15px' }}>
                  No hay tareas registradas en este expediente.
                </p>
              ) : (
                c.tasks.map((t) => {
                  const assignedUser = users.find(u => u.id === t.assignedTo);
                  return (
                    <div key={t.id} className={`task-item ${t.completed ? 'completed' : ''}`}>
                      <div 
                        className={`checkbox-custom ${t.completed ? 'checked' : ''}`}
                        onClick={() => handleToggleTask(t.id)}
                      >
                        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <span className="task-label" title={assignedUser ? `Asignado a: ${assignedUser.name}` : ''}>
                        {t.title} <span className="metric-sub" style={{ fontSize: '10px' }}>({assignedUser?.avatar || 'Unassigned'})</span>
                      </span>
                      <span className="task-date">{t.dueDate}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} style={{ color: 'var(--info)' }} />
                Notas Internas (Confidenciales)
              </h3>
            </div>
            <div className="notes-container" id="detail-case-notes" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {sortedNotes.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '10px', textAlign: 'center' }}>
                  No hay notas internas registradas en este caso.
                </p>
              ) : (
                sortedNotes.map((n) => (
                  <div key={n.id} className="note-card">
                    <div className="note-meta">
                      <span>{n.author}</span>
                      <span>{n.date}</span>
                    </div>
                    <div className="note-text">{n.text}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ marginTop: '12px' }}>
              <textarea 
                className="form-control" 
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Añadir una nota interna confidencial..." 
                style={{ fontSize: '13px', minHeight: '70px' }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleSaveNote} style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}>
                Guardar Nota
              </button>
            </div>
          </div>

          {/* Documents */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} style={{ color: 'var(--danger)' }} />
                Documentos PDF
              </h3>
              <GlassButton 
                className="btn-secondary" 
                size="sm"
                onClick={() => setActiveModal('scanner')}
              >
                <Camera size={13} /> Escanear
              </GlassButton>
            </div>

            <div 
              className={`file-upload-zone ${dragOver ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('case-pdf-file-input')?.click()}
              style={{ border: '2px dashed var(--border-color)', borderRadius: '12px', padding: '16px', textAlign: 'center', cursor: 'pointer', background: 'rgba(0,0,0,0.01)', transition: 'all 0.2s' }}
            >
              <Upload size={24} style={{ color: 'var(--primary-blue)', margin: '0 auto 6px', display: 'block' }} />
              <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '2px' }}>Arrastra un PDF aquí o haz clic</p>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Soporta PDF (Máx. 10MB)</span>
              <input 
                type="file" 
                id="case-pdf-file-input" 
                accept="application/pdf" 
                style={{ display: 'none' }} 
                onChange={handlePDFFileInput}
              />
            </div>

            <div className="document-list" id="detail-case-documents" style={{ marginTop: '16px' }}>
              {c.documents.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', padding: '10px' }}>
                  No hay documentos PDF cargados en este expediente.
                </p>
              ) : (
                c.documents.map((doc) => (
                  <div key={doc.id} className="document-item">
                    <div className="doc-icon">
                      <FileText size={18} />
                    </div>
                    <div className="doc-info">
                      <div className="doc-name" title={doc.name}>{doc.name}</div>
                      <div className="doc-meta">{doc.size} • {doc.uploadDate}</div>
                    </div>
                    <div className="doc-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleViewPDF(doc.id, doc.name)}>
                        Visualizar
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeletePDF(doc.id, doc.name)} style={{ padding: '6px 10px', minWidth: 'unset', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        &times;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== iOS SHEETS / MODALS ==================== */}

      {/* 1. Milestone Modal */}
      {activeModal === 'milestone' && (
        <div className="modal active">
          <div className="modal-content">
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">Registrar Hito Procesal</h3>
              <button className="modal-close" onClick={() => setActiveModal('none')}>Cancelar</button>
            </div>
            <form onSubmit={handleCreateMilestoneSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha del Hito</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={milestoneDate} 
                      onChange={(e) => setMilestoneDate(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label>Â¿Hito Concluido?</label>
                    <select 
                      className="form-control" 
                      value={milestoneCompleted} 
                      onChange={(e) => setMilestoneCompleted(e.target.value)} 
                      required
                    >
                      <option value="false">Programado / Pendiente</option>
                      <option value="true">Realizado / Concluido</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Título del Evento Procesal</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={milestoneTitle} 
                    onChange={(e) => setMilestoneTitle(e.target.value)} 
                    required 
                    placeholder="Ej. Comparendo de conciliación"
                  />
                </div>
                <div className="form-group">
                  <label>Detalles / Anotaciones</label>
                  <textarea 
                    className="form-control" 
                    value={milestoneDesc} 
                    onChange={(e) => setMilestoneDesc(e.target.value)} 
                    required 
                    placeholder="Describa brevemente lo ocurrido..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Registrar Hito
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Task Modal */}
      {activeModal === 'task' && (
        <div className="modal active">
          <div className="modal-content">
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">Crear Tarea del Expediente</h3>
              <button className="modal-close" onClick={() => setActiveModal('none')}>Cancelar</button>
            </div>
            <form onSubmit={handleCreateTaskSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Descripción de la Tarea</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={taskTitle} 
                    onChange={(e) => setTaskTitle(e.target.value)} 
                    required 
                    placeholder="Ej. Redactar minuta de demanda"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Responsable Asignado</label>
                    <select 
                      className="form-control" 
                      value={taskLawyer} 
                      onChange={(e) => setTaskLawyer(e.target.value)} 
                      required
                    >
                      <option value="" disabled>Seleccione un responsable...</option>
                      {lawyers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fecha Límite</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      value={taskDueDate} 
                      onChange={(e) => setTaskDueDate(e.target.value)} 
                      required 
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Crear Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Document Scanner Modal */}
      {activeModal === 'scanner' && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} style={{ color: 'var(--primary-blue)' }} /> Escáner de Documentos Judiciales
              </h3>
              <button className="modal-close" onClick={() => setActiveModal('none')}>Cerrar</button>
            </div>
            <div className="modal-body" style={{ padding: '16px' }}>
              <DocumentScanner 
                onScanComplete={(newDoc, blob) => {
                  uploadPDFBlob(newDoc.name, blob, newDoc);
                  setActiveModal('none');
                }} 
                onClose={() => setActiveModal('none')} 
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. View PDF Modal */}
      {activeModal === 'pdf' && (
        <div className="modal active">
          <div className="modal-content" style={{ maxWidth: '820px', width: '90%' }}>
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title" id="pdf-viewer-title">{activeDocName}</h3>
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
                      El archivo PDF físico ya no está cargado en la sesión del navegador. Los metadatos siguen guardados de forma segura en LocalStorage.
                    </p>
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const fileInputTemp = document.createElement('input');
                        fileInputTemp.type = 'file';
                        fileInputTemp.accept = 'application/pdf';
                        fileInputTemp.addEventListener('change', (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            if (activeDocId) {
                              savePdfBlob(activeDocId, file).then(() => {
                                setActiveDocUrl(getPdfObjectUrl(activeDocId) || '');
                              });
                            }
                            onAddLog(`Recargado archivo físico para PDF '${activeDocName}' en caso ${c.id}`, 'Success');
                            onShowToast('Archivo Cargado', `El archivo físico '${file.name}' ha sido recargado para la visualización.`, 'success');
                          }
                        });
                        fileInputTemp.click();
                      }}
                    >
                      Cargar Archivo Físico
                    </button>
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





