import React from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { User } from '../../utils/types';
import { DEFAULT_USERS } from '../../utils/db';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentUser: User;
  onUserChange: (user: User) => void;
  onMobileToggle: () => void;
  users: User[];
  notificationsCount?: number;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  currentUser,
  onUserChange,
  onMobileToggle,
  users,
  notificationsCount = 0
}) => {
  const handleRoleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = e.target.value;
    const selected = users.find((u) => u.id === userId);
    if (selected) {
      onUserChange(selected);
    }
  };

  return (
    <header className="topbar">
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

      <div className="topbar-right">
        {/* Role Simulator */}
        <div className="role-simulator">
          <span className="role-simulator-label">Simular Rol:</span>
          <select
            className="role-select"
            id="simulator-role-select"
            value={currentUser.id}
            onChange={handleRoleSelect}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.role} ({u.name.replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, '').split(' ')[0]})
              </option>
            ))}
          </select>
        </div>

        {/* Notification Bell */}
        <button className="notification-bell" id="notification-bell" style={{ position: 'relative' }}>
          <Bell size={20} />
          {notificationsCount > 0 && (
            <span className="notification-badge" id="noti-badge">
              {notificationsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
