import React, { Suspense, lazy, useState, useEffect } from 'react';
import { Navbar } from './components/shared/Navbar';
import { Topbar } from './components/shared/Topbar';
import { LoginView } from './components/shared/LoginView';
import { ToastContainer, ToastMessage } from './components/shared/Toast';

import { User, UserRole, Case, Client, AuditLog, Financials, Notification } from './utils/types';
import { LegiumDB, DEFAULT_USERS, DEFAULT_CASES, DEFAULT_CLIENTS, DEFAULT_AUDIT_LOGS, DEFAULT_FINANCIALS } from './utils/db';
const DashboardView = lazy(() => import('./components/dashboard/DashboardView').then((module) => ({ default: module.DashboardView })));
const ClientDashboard = lazy(() => import('./components/dashboard/ClientDashboard').then((module) => ({ default: module.ClientDashboard })));
const CasesView = lazy(() => import('./components/cases/CasesView').then((module) => ({ default: module.CasesView })));
const ClientsView = lazy(() => import('./components/clients/ClientsView').then((module) => ({ default: module.ClientsView })));
const ReportsView = lazy(() => import('./components/reports/ReportsView').then((module) => ({ default: module.ReportsView })));
const AdminView = lazy(() => import('./components/admin/AdminView').then((module) => ({ default: module.AdminView })));

const PageLoader = () => (
  <div className='page-loader' role='status' aria-live='polite'>
    Cargando módulo...
  </div>
);

export const App: React.FC = () => {
  // State Variables (Initialize DB synchronously first)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    LegiumDB.initialize();
    return LegiumDB.getCurrentUser();
  });
  const [users, setUsers] = useState<User[]>(() => LegiumDB.get<User[]>('users', DEFAULT_USERS));
  const [cases, setCases] = useState<Case[]>(() => LegiumDB.get<Case[]>('cases', DEFAULT_CASES));
  const [clients, setClients] = useState<Client[]>(() => LegiumDB.get<Client[]>('clients', DEFAULT_CLIENTS));
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => LegiumDB.get<AuditLog[]>('logs', DEFAULT_AUDIT_LOGS));
  const [financials, setFinancials] = useState<Financials>(() => LegiumDB.get<Financials>('financials', DEFAULT_FINANCIALS));
  const [notifications, setNotifications] = useState<Notification[]>(() => LegiumDB.getNotifications());

  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    return ['dashboard', 'cases', 'clients', 'reports', 'it-admin'].includes(hash) ? hash : 'dashboard';
  });

  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Hash URL Sync
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['dashboard', 'cases', 'clients', 'reports', 'it-admin'].includes(hash)) {
        setActiveTab(hash);
        // Reset case detail view when changing tabs
        if (hash !== 'cases') {
          setActiveCaseId(null);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Synchronize URL hash when state activeTab changes
  const handleTabChange = (tab: string) => {
    // Role checks before navigating
    if (currentUser && (currentUser.role === 'Abogado Senior' || currentUser.role === 'Abogado Junior') && (tab === 'reports' || tab === 'it-admin')) {
      showToast('Acceso Denegado', 'No tienes permisos para visualizar esta sección.', 'danger');
      return;
    }
    window.location.hash = tab;
    setActiveTab(tab);
    setMobileOpen(false);
    setSearchQuery('');
    if (tab !== 'cases') {
      setActiveCaseId(null);
    }
  };

  // Toast System Helper
  const showToast = (title: string, message: string, type: 'success' | 'warning' | 'danger' | 'info' = 'success') => {
    const id = Date.now().toString();
    const newToast: ToastMessage = { id, title, message, type };
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove toast after 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleCloseToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Audit Logger Helper
  const addLogEntry = (action: string, status: 'Success' | 'Warning' | 'Denied' = 'Success') => {
    if (currentUser) {
      LegiumDB.addLog(currentUser.id, action, status);
    }
    // Reload logs from localstorage to update UI
    setAuditLogs(LegiumDB.get<AuditLog[]>('logs', DEFAULT_AUDIT_LOGS));
  };

  // User Simulator Handler
  const handleUserChange = (user: User) => {
    LegiumDB.setCurrentUser(user);
    setCurrentUser(user);
    showToast(
      'Cambio de Rol Exitoso',
      `Ahora estás navegando como ${user.name} (${user.role}).`,
      'success'
    );
    
    // Siempre redirigir al dashboard para mostrar el correcto según el rol
    handleTabChange('dashboard');
    
    // Reload logs
    setAuditLogs(LegiumDB.get<AuditLog[]>('logs', DEFAULT_AUDIT_LOGS));
  };

  const handleLogout = () => {
    LegiumDB.setCurrentUser(null);
    setCurrentUser(null);
    showToast('Sesión Cerrada', 'Has cerrado tu sesión de forma segura.', 'info');
  };

  const handleNotificationClick = (caseId: string, notificationId: string) => {
    LegiumDB.markNotificationAsRead(notificationId);
    setNotifications(LegiumDB.getNotifications());
    if (caseId && currentUser && currentUser.role !== 'Cliente') {
      handleViewCaseFromDashboard(caseId);
    }
  };

  const handleMarkAllNotificationsAsRead = () => {
    LegiumDB.markAllNotificationsAsRead();
    setNotifications(LegiumDB.getNotifications());
    showToast('Notificaciones Leídas', 'Todas las notificaciones han sido marcadas como leídas.', 'success');
  };

  // --- CRUD ACTIONS ---

  // Update single case
  const handleUpdateCase = (updatedCase: Case) => {
    const updatedCases = cases.map((c) => (c.id === updatedCase.id ? updatedCase : c));
    LegiumDB.set('cases', updatedCases);
    setCases(updatedCases);
  };

  // Create new case
  const handleAddCase = (newCase: Case) => {
    const updatedCases = [...cases, newCase];
    LegiumDB.set('cases', updatedCases);
    setCases(updatedCases);

    if (currentUser?.role === 'Cliente') {
      // Notificar solo a Abogados Senior
      LegiumDB.addNotification(
        'Nueva Demanda Recibida',
        `El cliente ${currentUser.name} ha subido una nueva demanda: ${newCase.title}. Extracción OCR y PDF realizados.`,
        newCase.id,
        'Abogado Senior'
      );
      setNotifications(LegiumDB.getNotifications());
      showToast('Demanda Notificada', 'Se ha enviado una notificación al equipo de Abogados Senior.', 'info');
    }
  };

  // Create new client
  const handleAddClient = (newClient: Client) => {
    const updatedClients = [...clients, newClient];
    LegiumDB.set('clients', updatedClients);
    setClients(updatedClients);
  };

  // Create new user
  const handleAddUser = (newUser: User) => {
    const updatedUsers = [...users, newUser];
    LegiumDB.set('users', updatedUsers);
    setUsers(updatedUsers);
  };

  // Toggle user active status
  const handleUpdateUserActive = (userId: string, active: boolean) => {
    const updatedUsers = users.map((u) => (u.id === userId ? { ...u, active } : u));
    LegiumDB.set('users', updatedUsers);
    setUsers(updatedUsers);

    const targetUser = users.find((u) => u.id === userId);
    addLogEntry(
      `Estado de cuenta del usuario ${targetUser?.name} modificado a: ${active ? 'Activo' : 'Inactivo'}`,
      active ? 'Success' : 'Warning'
    );
    showToast(
      'Usuario Modificado',
      `La cuenta de ${targetUser?.name} ha sido ${active ? 'activada' : 'desactivada'} con éxito.`,
      active ? 'success' : 'warning'
    );
  };

  // Change user security role
  const handleUpdateUserRole = (userId: string, newRole: UserRole) => {
    const updatedUsers = users.map((u) => (u.id === userId ? { ...u, role: newRole } : u));
    LegiumDB.set('users', updatedUsers);
    setUsers(updatedUsers);

    const targetUser = users.find((u) => u.id === userId);
    addLogEntry(
      `Permisos del usuario ${targetUser?.name} modificados de '${targetUser?.role}' a '${newRole}'`,
      'Success'
    );
    showToast(
      'Permisos Actualizados',
      `El rol de ${targetUser?.name} ahora es ${newRole}.`,
      'success'
    );

    // If changing current simulated user, sync state
    if (currentUser && userId === currentUser.id) {
      const updatedSelf = { ...currentUser, role: newRole };
      LegiumDB.setCurrentUser(updatedSelf);
      setCurrentUser(updatedSelf);

      // If downgraded, check redirects
      if ((newRole === 'Abogado Senior' || newRole === 'Abogado Junior') && (activeTab === 'reports' || activeTab === 'it-admin')) {
        handleTabChange('dashboard');
      }
    }
  };

  // Toggle case task status directly from Dashboard
  const handleToggleDashboardTask = (caseId: string, taskId: string) => {
    const updatedCases = cases.map((c) => {
      if (c.id === caseId) {
        const updatedTasks = c.tasks.map((t) => {
          if (t.id === taskId) {
            const nextState = !t.completed;
            addLogEntry(
              `Tarea '${t.title}' en caso ${caseId} marcada como ${nextState ? 'Completada' : 'Pendiente'}`,
              'Success'
            );
            showToast(
              'Tarea Actualizada',
              `La tarea fue marcada como ${nextState ? 'completada' : 'pendiente'}.`,
              'success'
            );
            return { ...t, completed: nextState };
          }
          return t;
        });
        return { ...c, tasks: updatedTasks };
      }
      return c;
    });

    LegiumDB.set('cases', updatedCases);
    setCases(updatedCases);
  };

  // Factory Database Reset
  const handleResetDB = () => {
    LegiumDB.reset();
    setCurrentUser(LegiumDB.getCurrentUser());
    setUsers(LegiumDB.get<User[]>('users', DEFAULT_USERS));
    setCases(LegiumDB.get<Case[]>('cases', DEFAULT_CASES));
    setClients(LegiumDB.get<Client[]>('clients', DEFAULT_CLIENTS));
    setAuditLogs(LegiumDB.get<AuditLog[]>('logs', DEFAULT_AUDIT_LOGS));
    setFinancials(LegiumDB.get<Financials>('financials', DEFAULT_FINANCIALS));
    showToast('Sistema Restablecido', 'La base de datos se ha formateado y reestablecido con éxito.', 'danger');
    
    // Redirect to dashboard
    handleTabChange('dashboard');
  };

  const handleViewCaseFromDashboard = (caseId: string) => {
    // Check permissions
    const c = cases.find(item => item.id === caseId);
    if (!c) return;

    if (currentUser?.role === 'Abogado Junior' && c.assignedLawyerId !== currentUser.id) {
      addLogEntry(`Intento no autorizado de visualización de expediente ${caseId}`, 'Denied');
      showToast('Acceso Denegado', 'No tienes permisos para visualizar este expediente.', 'danger');
      return;
    }

    setActiveCaseId(caseId);
    handleTabChange('cases');
  };

  if (!currentUser) {
    return (
      <LoginView 
        users={users} 
        onLogin={(user) => {
          LegiumDB.setCurrentUser(user);
          setCurrentUser(user);
          setNotifications(LegiumDB.getNotifications());
          // Siempre arrancar en dashboard para mostrar el correcto según el rol
          window.location.hash = 'dashboard';
          setActiveTab('dashboard');
          showToast('Sesión Iniciada', `Bienvenido al sistema, ${user.name}.`, 'success');
        }}
      />
    );
  }

  return (
    <div className="app-container">
      <Navbar 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        currentUser={currentUser} 
        mobileOpen={mobileOpen}
      />

      {/* Main Content Area */}
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column' }}>
        
        {/* Topbar Header */}
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          currentUser={currentUser}
          onLogout={handleLogout}
          onMobileToggle={() => setMobileOpen(!mobileOpen)}
          notifications={notifications.filter(n => !n.targetRole || n.targetRole === currentUser.role)}
          onNotificationClick={handleNotificationClick}
          onMarkAllNotificationsAsRead={handleMarkAllNotificationsAsRead}
        />

        {/* Page Container */}
        <div className="page-container" style={{ flexGrow: 1, overflowY: 'auto', padding: '24px' }}>
          <Suspense fallback={<PageLoader />}>
            {activeTab === 'dashboard' && (
              currentUser.role === 'Cliente' ? (
                <ClientDashboard
                  currentUser={currentUser}
                  cases={cases}
                  clients={clients}
                  searchQuery={searchQuery}
                  onAddCase={handleAddCase}
                  onAddLog={addLogEntry}
                  onShowToast={showToast}
                />
              ) : (
                <DashboardView
                  currentUser={currentUser}
                  cases={cases}
                  auditLogs={auditLogs}
                  financials={financials}
                  onViewCase={handleViewCaseFromDashboard}
                  onToggleTask={handleToggleDashboardTask}
                />
              )
            )}

            {activeTab === 'cases' && (
              <CasesView
                cases={cases}
                currentUser={currentUser}
                users={users}
                clients={clients}
                searchQuery={searchQuery}
                onUpdateCase={handleUpdateCase}
                onAddCase={handleAddCase}
                onAddLog={addLogEntry}
                onShowToast={showToast}
                activeCaseId={activeCaseId}
                setActiveCaseId={setActiveCaseId}
              />
            )}

            {activeTab === 'clients' && (
              <ClientsView
                clients={clients}
                cases={cases}
                currentUser={currentUser}
                searchQuery={searchQuery}
                onAddClient={handleAddClient}
                onAddLog={addLogEntry}
                onShowToast={showToast}
                onViewCase={handleViewCaseFromDashboard}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                currentUser={currentUser}
                cases={cases}
                financials={financials}
              />
            )}

            {activeTab === 'it-admin' && (
              <AdminView
                currentUser={currentUser}
                users={users}
                auditLogs={auditLogs}
                onUpdateUserActive={handleUpdateUserActive}
                onUpdateUserRole={handleUpdateUserRole}
                onAddUser={handleAddUser}
                onAddLog={addLogEntry}
                onShowToast={showToast}
                onResetDB={handleResetDB}
              />
            )}
          </Suspense>

        </div>
      </main>

      {/* Floating Alerts Toasts */}
      <ToastContainer 
        toasts={toasts} 
        onClose={handleCloseToast} 
      />
    </div>
  );
};
