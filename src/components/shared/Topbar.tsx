import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Menu, LogOut, CheckCheck, Inbox, FileText } from 'lucide-react';
import { User, Notification } from '../../utils/types';
import { GlassButton } from '../ui/glass-button';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentUser: User;
  onLogout: () => void;
  onMobileToggle: () => void;
  notifications: Notification[];
  onNotificationClick: (caseId: string, notificationId: string) => void;
  onMarkAllNotificationsAsRead: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  currentUser,
  onLogout,
  onMobileToggle,
  notifications,
  onNotificationClick,
  onMarkAllNotificationsAsRead
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatNotificationTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <header className="topbar" style={{ position: 'relative', zIndex: 90 }}>
      <div className="topbar-left">
        <button className="mobile-toggle" id="mobile-toggle" onClick={onMobileToggle}>
          <Menu size={20} />
        </button>
        <div className="search-container">
          <Search className="search-icon" size={18} style={{ stroke: 'var(--text-secondary)' }} />
          <input
            type="text"
            className="search-input"
            id="universal-search"
            placeholder="Buscar expedientes, clientes, abogados, PDFs..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        


        {/* Notification Bell with Dropdown */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button 
            className="notification-bell" 
            id="notification-bell" 
            onClick={() => setShowNotifications(!showNotifications)}
            style={{ 
              position: 'relative',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              transition: 'background var(--transition-fast)'
            }}
          >
            <Bell size={20} style={{ color: 'var(--text-primary)' }} />
            {unreadCount > 0 && (
              <span 
                className="notification-badge" 
                id="noti-badge"
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  backgroundColor: 'var(--danger)',
                  color: '#fff',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  borderRadius: '50%',
                  minWidth: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  border: '2px solid var(--bg-main)'
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '10px',
                width: '340px',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.12)',
                zIndex: 1000,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                animation: 'fade-in 0.2s ease-out'
              }}
            >
              <div 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  background: 'rgba(0,0,0,0.015)'
                }}
              >
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Notificaciones</span>
                {unreadCount > 0 && (
                  <button 
                    onClick={onMarkAllNotificationsAsRead}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      color: 'var(--primary-blue)', 
                      fontSize: '11px', 
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <CheckCheck size={12} /> Leer todas
                  </button>
                )}
              </div>

              {/* Notification list body */}
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Inbox size={28} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                    <p style={{ fontSize: '12px' }}>No tienes notificaciones pendientes</p>
                  </div>
                ) : (
                  notifications.map((noti) => (
                    <div 
                      key={noti.id}
                      onClick={() => {
                        if (noti.caseId) {
                          onNotificationClick(noti.caseId, noti.id);
                        } else {
                          // just close dropdown and read
                          onNotificationClick('', noti.id);
                        }
                        setShowNotifications(false);
                      }}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        backgroundColor: noti.read ? 'transparent' : 'rgba(0, 122, 255, 0.03)',
                        transition: 'background var(--transition-fast)'
                      }}
                      className="notification-item"
                    >
                      <div 
                        style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '8px', 
                          background: noti.read ? 'rgba(0,0,0,0.04)' : 'rgba(0, 122, 255, 0.08)',
                          color: noti.read ? 'var(--text-secondary)' : 'var(--primary-blue)',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <FileText size={16} />
                      </div>
                      <div style={{ flexGrow: 1, minWidth: 0 }}>
                        <div 
                          style={{ 
                            fontSize: '12px', 
                            fontWeight: noti.read ? 600 : 700, 
                            color: 'var(--text-primary)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {noti.title}
                          </span>
                          {!noti.read && (
                            <span 
                              style={{ 
                                width: '6px', 
                                height: '6px', 
                                borderRadius: '50%', 
                                backgroundColor: 'var(--primary-blue)',
                                flexShrink: 0
                              }} 
                            />
                          )}
                        </div>
                        <p 
                          style={{ 
                            fontSize: '11px', 
                            color: 'var(--text-secondary)', 
                            lineHeight: 1.4, 
                            marginTop: '2px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                        >
                          {noti.message}
                        </p>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                          {formatNotificationTime(noti.date)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .notification-item:hover {
          background-color: rgba(0, 0, 0, 0.02) !important;
        }
      `}</style>
    </header>
  );
};
