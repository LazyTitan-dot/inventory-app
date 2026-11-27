import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useRetail } from '../state/useRetail';
import { StorefrontAdminModule } from '../storefront-admin/StorefrontAdminModule';
import type { AdminRepository } from '../storefront-admin/AdminPage';
import type { AdminState, Command } from '../storefront-admin/presentation';
import { decodeAdminState } from '../storefront-admin/repository';
import approvedStyles from '../storefront-admin/embedded.css?inline';

export default function StorefrontAdmin({ theme }: { theme: 'light' | 'dark' }) {
  const { data } = useRetail();
  const [surface, setSurface] = useState<ShadowRoot | null>(null);
  const mount = useMemo(
    () => (element: HTMLDivElement | null) => {
      if (element) setSurface(element.shadowRoot ?? element.attachShadow({ mode: 'open' }));
    },
    [],
  );
  const repository = useMemo<AdminRepository>(() => {
    async function request(command?: Command): Promise<AdminState> {
      if (!supabase) throw Error('Conexión comercial no disponible.');
      const result = command
        ? await supabase.rpc('storefront_admin_command_v1', { command })
        : await supabase.rpc('storefront_admin_state_v1');
      if (result.error) throw Error(result.error.message || 'Acceso denegado.');
      return decodeAdminState(result.data, {
        products: data.products,
        promotions: data.promotions,
      });
    }
    return { read: () => request(), command: request };
  }, [data.products, data.promotions]);
  return (
    <div ref={mount}>
      {surface &&
        createPortal(
          <>
            <style>{approvedStyles}</style>
            <style>
              {'.storefront-admin{background:var(--canvas)}.storefront-admin .page{padding:0}'}
            </style>
            <StorefrontAdminModule
              role={data.profile.role}
              manage_storefront={data.profile.role === 'owner' || data.profile.role === 'admin'}
              repository={repository}
              theme={theme}
            />
          </>,
          surface,
        )}
    </div>
  );
}
