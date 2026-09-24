import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Vercel's existing Supabase integration uses NEXT_PUBLIC_* names. Only these
  // explicitly public values may enter the browser bundle; never spread env.
  const env = loadEnv(mode, '.', '');
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (mode === 'production' && (!url || !key)) throw new Error('Falta la configuración pública de Supabase para compilar producción.');
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
    },
    build: {
      sourcemap: false, target: 'es2022',
      rolldownOptions: { output: { codeSplitting: { groups: [
        { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
        { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
        { name: 'validation', test: /node_modules[\\/]zod[\\/]/ },
      ] } } },
    },
    server: { port: 5173, strictPort: true },
  };
});
