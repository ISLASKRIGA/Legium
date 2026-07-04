import React, { useState } from 'react';
import { ShieldAlert, Database, Wifi, HardDrive, RotateCcw, Plus, Trash2 } from 'lucide-react';
import { User, UserRole, AuditLog } from '../../utils/types';

interface AdminViewProps {
  currentUser: User;
  users: User[];
  auditLogs: AuditLog[];
  onUpdateUserActive: (userId: string, active: boolean) => void;
  onUpdateUserRole: (userId: string, role: UserRole) => void;
  onAddUser: (newUser: User) => void;
  onAddLog: (action: string, status: 'Success' | 'Warning' | 'Denied') => void;
  onShowToast: (title: string, message: string, type: 'success' | 'warning' | 'danger') => void;
  onResetDB: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  currentUser,
  users,
  auditLogs,
  onUpdateUserActive,
  onUpdateUserRole,
  onAddUser,
  onAddLog,
  onShowToast,
  onResetDB
}) => {
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [backupStatusText, setBackupStatusText] = useState('ACTIVO (15:00)');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [highLatency, setHighLatency] = useState(false);

  // Form states for creating a new user
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('Abogado Junior');

  // Permissions Check (TI Administrador only)
  const isAllowed = currentUser.role === 'TI Administrador';

  if (!isAllowed) {
    return (
      <section className="view-panel active" id="view-it-admin">
        <div className="permission-blocked">
          <div className="blocked-message">
            <h3 className="serif" style={{ fontSize: '20px', marginBottom: '8px' }}>Acceso Restringido</h3>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Solo los usuarios con el rol de TI Administrador tienen privilegios para acceder a la Consola de Administración y monitoreo de servidores.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Force Backup action
  const handleForceBackup = () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    setBackupStatusText('RESPALDANDO...');

    setTimeout(() => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      setBackupStatusText(`RESPALDO EXITOSO (${timeStr})`);
      setIsBackingUp(false);
      onAddLog('Copia de seguridad forzada del sistema completada (Backup Manual S3)', 'Success');
      onShowToast('Backup Exitoso', 'Respaldo completo de la base de datos subido a AWS S3 correctamente.', 'success');
    }, 1500);
  };

  // Simulate High Latency action
  const handleToggleLatency = () => {
    const nextLatency = !highLatency;
    setHighLatency(nextLatency);

    if (nextLatency) {
      onAddLog('Simulación de alta latencia de red ACTIVADA por el administrador', 'Warning');
      onShowToast('Advertencia de Sistema', 'Simulación de cuello de botella de red activada (latencia > 450ms).', 'warning');
    } else {
      onAddLog('Simulación de alta latencia de red DESACTIVADA por el administrador', 'Success');
      onShowToast('Sistema Optimizado', 'Latencia de API reestablecida a valores normales (12ms).', 'success');
    }
  };

  // Factory reset action
  const handleFactoryReset = () => {
    if (window.confirm('🚨 ¿ATENCIÓN! ¿Está seguro de restablecer por completo la base de datos a los valores iniciales de fábrica? Todos los expedientes y clientes nuevos se borrarán permanentemente.')) {
      onResetDB();
    }
  };

  // Create User submit
  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    // Generate avatar initials
    const cleanName = newUserName.replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, '');
    const initials = cleanName
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const newId = `usr-${String(users.length + 1).padStart(2, '0')}`;
    const newUser: User = {
      id: newId,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      active: true,
      avatar: initials || 'US'
    };

    onAddUser(newUser);
    onAddLog(`Usuario creado: ${newUserName} con rol ${newUserRole}`, 'Success');
    onShowToast('Usuario Creado', `La cuenta de ${newUserName} ha sido registrada.`, 'success');

    // Reset & close
    setNewUserName('');
    setNewUserEmail('');
    setNewUserRole('Abogado Junior');
    setIsNewUserModalOpen(false);
  };

  return (
    <section className="view-panel active" id="view-it-admin">
      <div id="it-blocked-overlay">
        <div className="section-header">
          <div>
            <span className="metric-trend down">Consola del Administrador</span>
            <h2 className="serif" style={{ fontSize: '26px', marginTop: '4px' }}>Administración del Sistema de TI</h2>
          </div>
        </div>

        <div className="ti-layout">
          {/* Left Column: Status & Users */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Infrastructure Health Status */}
            <div className="glass-card">
              <h3 className="section-title" style={{ marginBottom: '14px' }}>
                Estado de Salud de la Infraestructura
              </h3>
              <div className="system-health-grid">
                <div className="health-item">
                  <span className="health-label">Base de Datos SQL</span>
                  <div className="health-status-row">
                    <div className="health-indicator pulsing" id="health-db-indicator" style={{ backgroundColor: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
                    <span className="health-value">ONLINE</span>
                  </div>
                </div>

                <div className="health-item">
                  <span className="health-label">Latencia de API</span>
                  <div className="health-status-row">
                    <div 
                      className={`health-indicator ${!highLatency ? 'pulsing' : ''}`}
                      id="health-latency-indicator" 
                      style={{ 
                        backgroundColor: highLatency ? 'var(--danger)' : 'var(--success)', 
                        boxShadow: highLatency ? '0 0 8px var(--danger)' : '0 0 8px var(--success)' 
                      }} 
                    />
                    <span className="health-value" id="health-latency-value">
                      {highLatency ? '480 ms' : '12 ms'}
                    </span>
                  </div>
                </div>

                <div className="health-item">
                  <span className="health-label">Almacenamiento S3</span>
                  <div className="health-status-row">
                    <div className="health-indicator" style={{ backgroundColor: 'var(--success)' }} />
                    <span className="health-value">34.2 GB (8%)</span>
                  </div>
                </div>

                <div className="health-item">
                  <span className="health-label">Estado de Backups</span>
                  <div className="health-status-row">
                    <div className={`health-indicator ${isBackingUp ? 'pulsing' : ''}`} style={{ backgroundColor: 'var(--success)' }} />
                    <span className="health-value" id="health-backup-status">
                      {backupStatusText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }} 
                  onClick={handleForceBackup}
                >
                  <Database size={16} /> Forzar Respaldo del Sistema (S3)
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }} 
                  onClick={handleToggleLatency}
                >
                  <Wifi size={16} /> Simular Alta Latencia de Red
                </button>
                <button 
                  className="btn btn-danger" 
                  style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }} 
                  onClick={handleFactoryReset}
                >
                  <RotateCcw size={16} /> Restablecer Base de Datos de Fábrica
                </button>
              </div>
            </div>

            {/* User Management */}
            <div className="glass-card">
              <div className="section-header">
                <h3 className="section-title">Control de Accesos y Cuentas</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setIsNewUserModalOpen(true)}>
                  Nuevo Usuario
                </button>
              </div>
              <div className="table-responsive">
                <table className="custom-table" id="it-users-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Rol de Seguridad</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div 
                              className="avatar" 
                              style={{ 
                                width: '28px', 
                                height: '28px', 
                                fontSize: '11px',
                                border: u.role === 'TI Administrador' ? '1.5px solid var(--danger)' : '1.5px solid var(--primary-gold)' 
                              }}
                            >
                              {u.avatar}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, fontSize: '13px' }}>{u.name}</span>
                              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '12px', width: '140px', background: 'transparent' }}
                            value={u.role}
                            onChange={(e) => onUpdateUserRole(u.id, e.target.value as UserRole)}
                          >
                            <option value="TI Administrador">TI Administrador</option>
                            <option value="Socio Principal">Socio Principal</option>
                            <option value="Abogado Senior">Abogado Senior</option>
                            <option value="Abogado Junior">Abogado Junior</option>
                          </select>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              checked={u.active}
                              onChange={(e) => onUpdateUserActive(u.id, e.target.checked)}
                              style={{ cursor: 'pointer', accentColor: 'var(--primary-blue)' }}
                            />
                            <span style={{ fontSize: '12px', color: u.active ? 'var(--success)' : 'var(--text-muted)', fontWeight: u.active ? 600 : 400 }}>
                              {u.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Live Audit Logs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
              <div className="section-header">
                <h3 className="section-title">Registro de Auditoría de Seguridad (Audit Logs)</h3>
                <span className="badge badge-active" style={{ fontSize: '9px', padding: '2px 6px' }}>En vivo</span>
              </div>
              <div className="audit-logs-list" id="it-logs-container" style={{ maxHeight: '520px', overflowY: 'auto', flexGrow: 1 }}>
                {auditLogs.map((l, idx) => (
                  <div key={idx} className="audit-log-item">
                    <div className={`audit-log-status ${l.status.toLowerCase()}`} />
                    <div className="audit-log-details">
                      <div className="audit-log-text">
                        <strong>{l.userName}</strong> ({l.userRole}): {l.action}
                      </div>
                      <div className="audit-log-meta">
                        <span className="audit-log-time">{l.timestamp}</span>
                        <span>•</span>
                        <span style={{ 
                          color: l.status === 'Denied' 
                            ? 'var(--danger)' 
                            : l.status === 'Warning' 
                            ? 'var(--warning)' 
                            : 'var(--success)',
                          fontWeight: 600 
                        }}>
                          {l.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NEW USER MODAL */}
      {isNewUserModalOpen && (
        <div className="modal active">
          <div className="modal-content">
            <div className="ios-grabber" />
            <div className="modal-header">
              <h3 className="modal-title">Registrar Nuevo Usuario</h3>
              <button className="modal-close" onClick={() => setIsNewUserModalOpen(false)}>Cancelar</button>
            </div>
            <form onSubmit={handleCreateUserSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nombre Completo</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    required
                    placeholder="Ej. Dra. Valentina Paz"
                  />
                </div>
                
                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <input
                    type="email"
                    className="form-control"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                    placeholder="Ej. valentina.paz@legium.law"
                  />
                </div>

                <div className="form-group">
                  <label>Rol / Permisos de Seguridad</label>
                  <select
                    className="form-control"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    required
                  >
                    <option value="TI Administrador">TI Administrador</option>
                    <option value="Socio Principal">Socio Principal</option>
                    <option value="Abogado Senior">Abogado Senior</option>
                    <option value="Abogado Junior">Abogado Junior</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
