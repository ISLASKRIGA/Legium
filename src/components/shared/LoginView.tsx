import React from 'react';
import { motion } from 'framer-motion';
import { Scale, Building2, Briefcase, ShieldAlert, User, ArrowRight } from 'lucide-react';
import { User as UserType } from '../../utils/types';

interface LoginViewProps {
  users: UserType[];
  onLogin: (user: UserType) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ users, onLogin }) => {
  // Map users to roles with descriptions and icons
  const roleCards = [
    {
      roleName: 'TI Administrador' as const,
      user: users.find(u => u.role === 'TI Administrador') || users[3],
      description: 'Gestión de accesos, registros de auditoría y configuración de infraestructura legal.',
      icon: <ShieldAlert size={24} />,
      color: 'var(--danger)',
      bg: 'rgba(255, 59, 48, 0.08)'
    },
    {
      roleName: 'Socio Principal' as const,
      user: users.find(u => u.role === 'Socio Principal') || users[0],
      description: 'Supervisión de finanzas, rendimiento del despacho y expedientes de alto perfil.',
      icon: <Scale size={24} />,
      color: 'var(--primary-gold)',
      bg: 'rgba(184, 134, 11, 0.08)'
    },
    {
      roleName: 'Abogado Senior' as const,
      user: users.find(u => u.role === 'Abogado Senior') || users[1],
      description: 'Dirección técnica de causas complejas, litigación y control de hitos procesales.',
      icon: <Briefcase size={24} />,
      color: 'var(--primary-blue)',
      bg: 'rgba(0, 122, 255, 0.08)'
    },
    {
      roleName: 'Abogado Junior' as const,
      user: users.find(u => u.role === 'Abogado Junior') || users[2],
      description: 'Seguimiento de tareas, redacción de escritos judiciales y soporte operativo.',
      icon: <User size={24} />,
      color: 'var(--info)',
      bg: 'rgba(72, 186, 196, 0.08)'
    },
    {
      roleName: 'Cliente' as const,
      user: users.find(u => u.role === 'Cliente') || users[5],
      description: 'Ingreso rápido de demandas vía cámara, carpeta digital y notificaciones de avances.',
      icon: <Building2 size={24} />,
      color: 'var(--success)',
      bg: 'rgba(52, 199, 89, 0.08)'
    }
  ];

  return (
    <div 
      className="login-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100vw',
        padding: '40px 20px',
        backgroundColor: 'var(--bg-main)',
        backgroundImage: `
          radial-gradient(at 0% 0%, rgba(0, 122, 255, 0.05) 0px, transparent 40%),
          radial-gradient(at 100% 100%, rgba(184, 134, 11, 0.04) 0px, transparent 45%)
        `,
        backgroundAttachment: 'fixed',
        overflowY: 'auto'
      }}
    >
      {/* Branding Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: '40px' }}
      >
        <div 
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: '54px', 
            height: '54px', 
            borderRadius: '16px', 
            background: 'linear-gradient(135deg, var(--primary-gold), #b38600)',
            boxShadow: '0 8px 24px rgba(184, 134, 11, 0.25)',
            marginBottom: '16px'
          }}
        >
          <Scale size={28} color="#fff" />
        </div>
        <h1 className="serif" style={{ fontSize: '38px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Legium<span style={{ color: 'var(--primary-gold)' }}>.</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
          Sistema de Gestión Jurídica Premium & Escaneo Inteligente. Selecciona un perfil para ingresar sin autenticación.
        </p>
      </motion.div>

      {/* Roles Grid */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >
        {roleCards.map((card, index) => (
          <motion.div
            key={card.roleName}
            whileHover={{ y: -6, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onLogin(card.user)}
            style={{
              background: 'var(--bg-card)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--border-color)',
              borderRadius: '20px',
              padding: '24px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: 'var(--glass-shadow)',
              transition: 'border-color var(--transition-fast), background-color var(--transition-fast)'
            }}
            className="role-login-card"
          >
            <div>
              {/* Header Icon + Label */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div 
                  style={{ 
                    width: '46px', 
                    height: '46px', 
                    borderRadius: '12px', 
                    background: card.bg, 
                    color: card.color,
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}
                >
                  {card.icon}
                </div>
                <span 
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    color: card.color, 
                    background: card.bg, 
                    padding: '3px 8px', 
                    borderRadius: '99px' 
                  }}
                >
                  {card.user.role}
                </span>
              </div>

              {/* Title & Desc */}
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {card.user.name.replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, '')}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px', minHeight: '60px' }}>
                {card.description}
              </p>
            </div>

            {/* Footer action */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                borderTop: '1px solid rgba(0,0,0,0.05)', 
                paddingTop: '14px', 
                marginTop: '10px' 
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
                {card.user.email}
              </span>
              <div 
                className="arrow-circle" 
                style={{ 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '50%', 
                  background: 'rgba(0,0,0,0.03)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  transition: 'background var(--transition-fast)' 
                }}
              >
                <ArrowRight size={14} style={{ color: 'var(--text-primary)' }} />
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Footer Info */}
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        style={{ marginTop: '40px', fontSize: '12px', color: 'var(--text-muted)' }}
      >
        Legium Case Management v1.0 • Impulsado por Inteligencia Artificial
      </motion.p>
    </div>
  );
};
