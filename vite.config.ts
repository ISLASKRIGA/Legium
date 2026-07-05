import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const vendorChunks: Record<string, string> = {
  react: 'react',
  'react-dom': 'react',
  '@supabase/supabase-js': 'supabase',
  'chart.js': 'charts',
  'react-chartjs-2': 'charts',
  jspdf: 'documents',
  html2canvas: 'documents',
  'tesseract.js': 'ocr',
  'framer-motion': 'motion',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const match = Object.entries(vendorChunks).find(([pkg]) => id.includes('/node_modules/' + pkg + '/') || id.includes('\\node_modules\\' + pkg + '\\'));
          return match?.[1] ?? 'vendor';
        },
      },
    },
  },
});