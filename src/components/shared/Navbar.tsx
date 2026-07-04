import React from 'react';
import { LayoutDashboard, Briefcase, Users, BarChart3, Monitor, Scale } from 'lucide-react';
import { User, UserRole } from '../../utils/types';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentUser: User;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange, currentUser }) => {
  const isTabVisible = (tab: string) => {
    if (currentUser.role === 'Cliente') {
      return tab === 'dashboard';
    }
    if (tab === 'it-admin') {
      return currentUser.role === 'TI Administrador';
    }
    return true;
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'cases', label: 'Expedientes', icon: <Briefcase size={20} /> },
    { id: 'clients', label: 'Clientes', icon: <Users size={20} /> },
    { id: 'reports', label: 'Reportes', icon: <BarChart3 size={20} /> },
    { id: 'it-admin', label: 'TI Administrador', icon: <Monitor size={20} /> },
  ];

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-brand">
        <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Scale size={18} color="#fff" />
        </div>
        <span className="brand-name">
          Legium<span className="brand-tag">.</span>
        </span>
      </div>

      <ul className="sidebar-menu">
        {menuItems
          .filter((item) => isTabVisible(item.id))
          .map((item) => (
            <li
              key={item.id}
              className={`menu-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onTabChange(item.id)}
              style={{ cursor: 'pointer' }}
            >
              <a onClick={(e) => e.preventDefault()}>
                <span className="menu-icon" style={{ display: 'flex', alignItems: 'center', color: activeTab === item.id ? 'var(--primary-blue)' : 'var(--text-secondary)' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            </li>
          ))}
      </ul>

      <div className="sidebar-footer">
        <div className="user-badge" id="current-user-badge">
          <div 
            className="avatar" 
            id="current-user-avatar"
            style={{ 
              border: currentUser.role === 'TI Administrador' ? '2.2px solid var(--danger)' : '2.2px solid var(--primary-gold)' 
            }}
          >
            {currentUser.avatar}
          </div>
          <div className="user-info">
            <span className="user-name" id="current-user-name" title={currentUser.name}>
              {currentUser.name}
            </span>
            <span className="user-role" id="current-user-role">
              {currentUser.role}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
