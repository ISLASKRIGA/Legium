import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Scale } from 'lucide-react';
import { NeuralNoise } from '../NeuralNoise';

interface LoginViewProps {
  onLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const result = await onLogin(username.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Usuario o contraseña incorrectos.');
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.06)',
    color: '#FFF6F7',
    fontSize: '14px',
    outline: 'none',
  };

  return (
    <NeuralNoise>
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        style={{ textAlign: 'center', marginBottom: '28px' }}
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
            boxShadow: '0 8px 24px rgba(184, 134, 11, 0.35)',
            marginBottom: '16px',
          }}
        >
          <Scale size={28} color="#fff" />
        </div>
        <h1 className="serif" style={{ fontSize: '38px', color: '#FFF6F7', marginBottom: '6px' }}>
          Legium<span style={{ color: 'var(--primary-gold)' }}>.</span>
        </h1>
        <p style={{ color: 'rgba(255,246,247,0.6)', fontSize: '13px' }}>
          Sistema de Gestión Jurídica Premium
        </p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          width: '90%',
          maxWidth: '340px',
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario"
          autoFocus
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoComplete="current-password"
          style={inputStyle}
        />
        {error && (
          <div
            style={{
              color: '#ff8a80',
              fontSize: '12.5px',
              background: 'rgba(255,59,48,0.14)',
              border: '1px solid rgba(255,59,48,0.25)',
              padding: '8px 10px',
              borderRadius: '8px',
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !username || !password}
          style={{
            marginTop: '4px',
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: loading || !username || !password
              ? 'rgba(184, 134, 11, 0.4)'
              : 'linear-gradient(135deg, var(--primary-gold), #b38600)',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 700,
            cursor: loading || !username || !password ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </motion.form>
    </NeuralNoise>
  );
};
