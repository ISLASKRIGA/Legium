import React from 'react';
import { Briefcase, Activity, Users, DollarSign, Calendar, CheckSquare, ShieldCheck, Clock, Award } from 'lucide-react';
import { User, Case, AuditLog, Financials } from '../../utils/types';

interface DashboardViewProps {
  currentUser: User;
  cases: Case[];
  auditLogs: AuditLog[];
  financials: Financials;
  onViewCase: (caseId: string) => void;
  onToggleTask: (caseId: string, taskId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  cases,
  auditLogs,
  financials,
  onViewCase,
  onToggleTask
}) => {
  // Metrics calculations
  const activeCasesCount = cases.filter((c) => c.status === 'Activo').length;
  const appealingCasesCount = cases.filter((c) => c.status === 'En Apelación').length;
  const clientsCount = financials.summary.hoursBilledThisMonth > 0 ? 6 : 0; // We have 6 clients in default seed

  // Upcoming Milestones (Hitos Procesales)
  const milestones: Array<{ date: string; caseId: string; caseTitle: string; title: string }> = [];
  cases.forEach((c) => {
    // Only show milestones of cases that are visible to user (e.g. if Junior, only their cases)
    const isVisible = currentUser.role !== 'Abogado Junior' || c.assignedLawyerId === currentUser.id;
    if (isVisible) {
      c.timeline.forEach((t) => {
        if (!t.completed) {
          milestones.push({
            date: t.date,
            caseId: c.id,
            caseTitle: c.title,
            title: t.title
          });
        }
      });
    }
  });
  // Sort by date ascending and take top 4
  const upcomingMilestones = milestones
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4);

  // User tasks
  const pendingTasks: Array<{ id: string; caseId: string; title: string; dueDate: string; assignedTo: string }> = [];
  cases.forEach((c) => {
    c.tasks.forEach((t) => {
      if (!t.completed) {
        pendingTasks.push({
          id: t.id,
          caseId: c.id,
          title: t.title,
          dueDate: t.dueDate,
          assignedTo: t.assignedTo
        });
      }
    });
  });

  // Filter tasks based on role (Juniors and Seniors only see their own tasks)
  const filteredTasks = (
    currentUser.role === 'Abogado Junior' || currentUser.role === 'Abogado Senior'
      ? pendingTasks.filter((t) => t.assignedTo === currentUser.id)
      : pendingTasks
  )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 4);

  // Security logs (top 4)
  const recentLogs = auditLogs.slice(0, 4);

  // Display name formatting
  const firstName = currentUser.name.replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, '').split(' ')[0];

  return (
    <section className="view-panel active" id="view-dashboard">
      <div className="section-header">
        <div>
          <span className="metric-trend up">Bienvenido a Legium</span>
          <h2 className="serif" style={{ fontSize: '26px', marginTop: '4px' }}>Panel de Control</h2>
        </div>
        <span className="badge badge-active" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="pulsing" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'currentColor', display: 'inline-block' }} />
          Conectado en Tiempo Real
        </span>
      </div>

      {/* Welcome Banner Card */}
      <div 
        className="glass-card welcome-banner" 
        style={{ 
          background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.04), rgba(184, 134, 11, 0.04))', 
          border: '1.5px solid rgba(0, 122, 255, 0.12)', 
          marginBottom: '24px', 
          padding: '20px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '20px', 
          flexWrap: 'wrap' 
        }}
      >
        <div style={{ flexGrow: 1, minWidth: '280px' }}>
          <h3 className="serif" style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '4px' }}>
            ¡Hola, {firstName}!
          </h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: '1.5', maxWidth: '650px' }}>
            Este es el centro digital de tu despacho jurídico. Hemos estructurado todo para que tus expedientes, clientes y reportes estén al alcance de un clic.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <span className="badge badge-active" style={{ background: 'rgba(0, 122, 255, 0.08)', color: 'var(--primary-blue)', padding: '6px 12px', borderRadius: '99px', fontWeight: 600, fontSize: '11.5px' }}>
              📂 Expedientes
            </span>
            <span className="badge badge-active" style={{ background: 'rgba(52, 199, 89, 0.08)', color: 'var(--success)', padding: '6px 12px', borderRadius: '99px', fontWeight: 600, fontSize: '11.5px' }}>
              👥 Clientes
            </span>
            {currentUser.role !== 'Abogado Senior' && currentUser.role !== 'Abogado Junior' && (
              <span className="badge badge-active" style={{ background: 'rgba(184, 134, 11, 0.08)', color: 'var(--primary-gold)', padding: '6px 12px', borderRadius: '99px', fontWeight: 600, fontSize: '11.5px' }}>
                📈 Reportes
              </span>
            )}
          </div>
        </div>
        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', fontSize: '22px', flexShrink: 0, justifyContent: 'center' }}>
          ✨
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Casos Activos</span>
            <div className="metric-icon" style={{ color: 'var(--primary-blue)' }}>
              <Briefcase size={20} />
            </div>
          </div>
          <div className="metric-value" id="metric-active-cases">{activeCasesCount}</div>
          <div className="metric-sub">Bajo seguimiento judicial</div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">En Apelación</span>
            <div className="metric-icon" style={{ color: 'var(--warning)' }}>
              <Activity size={20} />
            </div>
          </div>
          <div className="metric-value" id="metric-appealing-cases">{appealingCasesCount}</div>
          <div className="metric-sub">En tribunales superiores</div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Total Clientes</span>
            <div className="metric-icon" style={{ color: 'var(--success)' }}>
              <Users size={20} />
            </div>
          </div>
          <div className="metric-value" id="metric-total-clients">{clientsCount || 6}</div>
          <div className="metric-sub">Corporativos e individuales</div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-header">
            <span className="metric-title">Ingresos Mensuales</span>
            <div className="metric-icon" style={{ color: 'var(--primary-gold)' }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div className="metric-value" id="metric-total-revenue">
            ${(currentUser.role === 'Abogado Junior' || currentUser.role === 'Abogado Senior' ? 0 : financials.summary.totalRevenue).toLocaleString()}
          </div>
          <div className="metric-sub">Cobros del mes en curso</div>
        </div>
      </div>

      {/* Dashboard Layout */}
      <div className="dashboard-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Milestones Card */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: 'var(--primary-gold)' }} />
                Próximos Hitos Judiciales
              </h3>
            </div>
            <div className="table-responsive">
              <table className="custom-table" id="dashboard-milestones-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Expediente</th>
                    <th>Hito Programado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingMilestones.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                        No hay hitos procesales pendientes programados.
                      </td>
                    </tr>
                  ) : (
                    upcomingMilestones.map((m, idx) => (
                      <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => onViewCase(m.caseId)}>
                        <td style={{ color: 'var(--primary-gold)', fontWeight: 600 }}>{m.date}</td>
                        <td>
                          {m.caseTitle} <span className="metric-sub">({m.caseId})</span>
                        </td>
                        <td>{m.title}</td>
                        <td>
                          <span className="badge badge-suspended">Pendiente</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Key Tasks Card */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckSquare size={18} style={{ color: 'var(--primary-blue)' }} />
                Mis Tareas Pendientes
              </h3>
            </div>
            <div className="tasks-list" id="dashboard-tasks-container">
              {filteredTasks.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '13px' }}>
                  No tienes tareas pendientes asignadas.
                </div>
              ) : (
                filteredTasks.map((t) => (
                  <div key={t.id} className="task-item">
                    <div 
                      className="checkbox-custom" 
                      onClick={() => onToggleTask(t.caseId, t.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span className="task-label">
                      {t.title}{' '}
                      <span 
                        className="metric-sub" 
                        style={{ textDecoration: 'underline', cursor: 'pointer' }} 
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewCase(t.caseId);
                        }}
                      >
                        ({t.caseId})
                      </span>
                    </span>
                    <span className="task-date">{t.dueDate}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Session Details Card */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
                Sesión y Privilegios
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Rol Actual:</span>
                <span className="user-role" style={{ fontWeight: 600 }}>{currentUser.role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Acceso a Expedientes:</span>
                <span className={`badge ${currentUser.role === 'Abogado Junior' ? 'badge-suspended' : currentUser.role === 'Abogado Senior' ? 'badge-appealing' : 'badge-active'}`}>
                  {currentUser.role === 'TI Administrador' || currentUser.role === 'Socio Principal' 
                    ? 'ACCESO TOTAL' 
                    : currentUser.role === 'Abogado Senior' 
                    ? 'PROPIOS Y ASIGNADOS' 
                    : 'SOLO ASIGNADOS'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Gestión Financiera:</span>
                <span className={`badge ${currentUser.role === 'Abogado Junior' ? 'badge-closed' : currentUser.role === 'Abogado Senior' ? 'badge-suspended' : 'badge-active'}`}>
                  {currentUser.role === 'TI Administrador' || currentUser.role === 'Socio Principal' 
                    ? 'HABILITADA' 
                    : currentUser.role === 'Abogado Senior' 
                    ? 'RESTRINGIDA' 
                    : 'BLOQUEADA'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Configuración TI:</span>
                <span className={`badge ${currentUser.role === 'TI Administrador' ? 'badge-active' : 'badge-suspended'}`}>
                  {currentUser.role === 'TI Administrador' ? 'ACCESO TOTAL' : 'RESTRINGIDO'}
                </span>
              </div>
            </div>
          </div>

          {/* Audit Logs Card */}
          <div className="glass-card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} style={{ color: 'var(--text-muted)' }} />
                Seguridad (Auditoría)
              </h3>
            </div>
            <div className="audit-logs-list" id="dashboard-logs-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {recentLogs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '15px' }}>
                  No hay logs de seguridad registrados.
                </div>
              ) : (
                recentLogs.map((l, idx) => (
                  <div key={idx} className="audit-log-item">
                    <div className={`audit-log-status ${l.status.toLowerCase()}`} />
                    <div className="audit-log-details">
                      <div className="audit-log-text">
                        <strong>{l.userName}:</strong> {l.action}
                      </div>
                      <div className="audit-log-meta">
                        <span className="audit-log-time">{l.timestamp}</span>
                        <span>•</span>
                        <span>{l.userRole}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
