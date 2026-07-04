import React from 'react';

export interface ToastMessage {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'danger' | 'info';
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="alert-popup-container" id="alert-container" style={{ zIndex: 9999 }}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`alert-toast ${toast.type}`}>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => onClose(toast.id)}>
            &times;
          </button>
        </div>
      ))}
    </div>
  );
};
