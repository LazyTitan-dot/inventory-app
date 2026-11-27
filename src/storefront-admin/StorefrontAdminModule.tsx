import { AdminPage, type AdminRepository } from './AdminPage';
import type { Role } from './presentation';
/** Host adapter only. Real session/permission checks must also be enforced by the repository/server. */
export function StorefrontAdminModule({
  role,
  manage_storefront,
  repository,
  theme,
}: {
  role: Role;
  manage_storefront: boolean;
  repository: AdminRepository;
  theme: 'light' | 'dark';
}) {
  if (!['owner', 'admin'].includes(role) || manage_storefront !== true)
    return (
      <section className="storefront-admin" data-theme={theme}>
        <p role="alert">No tienes acceso a Tienda online.</p>
      </section>
    );
  return <AdminPage repository={repository} hostTheme={theme} />;
}
