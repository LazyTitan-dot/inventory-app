import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import {
  Activity,
  BadgePercent,
  Building2,
  ChevronRight,
  ClipboardList,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Truck,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { AuthPage } from './pages/Auth';
import { RetailProvider } from './state/RetailProvider';
import { useRetail } from './state/useRetail';
import { BUSINESS_TIMEZONE, roleLabels } from './lib/format';
import { createAuthSessionStore } from './lib/authSession';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useMobileSidebar } from './design-system/useMobileSidebar';
import { CommandPalette } from './components/CommandPalette';

const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const Reports = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.ReportsPage })));
const Catalog = lazy(() => import('./pages/Catalog').then((m) => ({ default: m.CatalogPage })));
const Contacts = lazy(() => import('./pages/Contacts').then((m) => ({ default: m.ContactsPage })));
const Commerce = lazy(() => import('./pages/Commerce').then((m) => ({ default: m.CommercePage })));
const AfterSales = lazy(() =>
  import('./pages/AfterSales').then((m) => ({ default: m.AfterSalesPage })),
);
const Deliveries = lazy(() =>
  import('./pages/Operations').then((m) => ({ default: m.DeliveriesPage })),
);
const Promotions = lazy(() =>
  import('./pages/Operations').then((m) => ({ default: m.PromotionsPage })),
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const Audit = lazy(() => import('./pages/Settings').then((m) => ({ default: m.AuditPage })));

export function Shell() {
  const { data, refresh, refreshing, lastUpdated, notify } = useRetail();
  const [menu, setMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const openSearch = () => { setMenu(false); setSearchOpen(true); };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
        if (dialog) {
          if (dialog.getAttribute('aria-label') === 'Buscar en el negocio') {
            event.preventDefault();
            dialog.querySelector<HTMLInputElement>('[role=combobox]')?.focus();
          }
          return;
        }
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('smartliving:search', openSearch);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('smartliving:search', openSearch);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  const { sidebar, openSidebar } = useMobileSidebar(menu, setMenu);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const selected = window.localStorage.getItem('smartliving-theme');
      if (selected === 'light' || selected === 'dark') return selected;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('smartliving-theme', theme);
    } catch { /* Storage can be unavailable in private browsers. */ }
  }, [theme]);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const p = data.permissions;
  const viewCommerce = p.sell || p.manage_business;
  const nav = [
    { to: '/', label: 'Resumen', icon: LayoutDashboard, show: true },
    { to: '/inventario', label: 'Inventario', icon: Package, show: true },
    { to: '/ventas', label: 'Ventas', icon: ShoppingBag, show: viewCommerce },
    { to: '/compras', label: 'Compras', icon: ClipboardList, show: p.purchase },
    { to: '/clientes', label: 'Clientes', icon: UsersRound, show: viewCommerce },
    { to: '/proveedores', label: 'Proveedores', icon: Building2, show: p.purchase },
    { to: '/cotizaciones', label: 'Cotizaciones', icon: FileText, show: viewCommerce },
    { to: '/posventa', label: 'Posventa', icon: Wrench, show: viewCommerce },
    { to: '/entregas', label: 'Entregas', icon: Truck, show: viewCommerce || p.purchase },
    { to: '/promociones', label: 'Promociones', icon: BadgePercent, show: viewCommerce },
    { to: '/reportes', label: 'Reportes', icon: FileBarChart2, show: p.manage_business },
    { to: '/auditoria', label: 'Auditoría', icon: Activity, show: p.view_audit },
    { to: '/configuracion', label: 'Configuración', icon: Settings2, show: p.manage_business },
  ].filter((item) => item.show);
  const active = nav.find((item) => item.to === location.pathname);
  async function logout() {
    if (!supabase || loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
    } catch {
      notify('No pudimos cerrar la sesión. Comprueba la conexión y vuelve a intentar.');
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <div className="app-layout" data-theme={theme}>
      <a className="skip-link" href="#contenido" inert={menu}>
        Saltar al contenido
      </a>
      {menu && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          tabIndex={-1}
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="menu-principal"
        className={`sidebar ${menu ? 'open' : ''}`}
        role={menu ? 'dialog' : undefined}
        aria-modal={menu || undefined}
        aria-label="Menú principal"
      >
        <Link to="/" className="brand sidebar-brand" onClick={() => setMenu(false)}>
          <img src="/brand/primary_dark.png" alt="S-mart Living" />
        </Link>
        <button
          className="mobile-sidebar-close icon-button"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        >
          <X size={22} />
        </button>
        <div className="business-switch">
          <span className="business-avatar">
            <img src="/brand/square_icon.png" alt="" />
          </span>
          <span>
            <strong>{data.settings.business_name}</strong>
            <small>Tienda principal · RD$</small>
          </span>
          <ChevronRight size={15} />
        </div>
        <nav aria-label="Navegación principal">
          <span className="nav-caption">ESPACIO DE TRABAJO</span>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenu(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} />
              <span>{label}</span>
              {to === '/inventario' && (
                <span className="nav-count">
                  {data.products.filter((row) => row.active).length}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar">
            {data.profile.display_name.slice(0, 2).toUpperCase() || 'SL'}
          </div>
          <div>
            <strong>{data.profile.display_name || data.profile.email}</strong>
            <small>{roleLabels[data.profile.role]}</small>
          </div>
          <button
            className="icon-button"
            disabled={loggingOut}
            aria-label={loggingOut ? 'Cerrando sesión' : 'Cerrar sesión'}
            onClick={() => void logout()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      <div className="app-main" inert={menu}>
        <header className="topbar">
          <div className="toolbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              aria-controls="menu-principal"
              aria-expanded={menu}
              onClick={(event) => openSidebar(event.currentTarget)}
            >
              <Menu size={23} />
            </button>
            <span className="breadcrumb">
              Mi negocio <ChevronRight size={14} />
              <strong>{active?.label ?? 'Página'}</strong>
            </span>
          </div>
          <div className="toolbar">
            <span className="sync-status">
              <span />
              {refreshing
                ? 'Actualizando…'
                : `Actualizado ${lastUpdated.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIMEZONE })}`}
            </span>
            <button
              type="button"
              className="icon-button sl-global-search"
              aria-label="Buscar en el negocio"
              title="Buscar (Ctrl / ⌘ K)"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              className="icon-button sl-theme-toggle"
              aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
              title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
              onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="icon-button"
              disabled={refreshing}
              aria-label="Actualizar información"
              onClick={() => void refresh().catch(() => undefined)}
            >
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </button>
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="page-content" key={location.pathname}>
          <Suspense
            fallback={
              <div className="page-skeleton" role="status" aria-label="Cargando pantalla">
                <div />
                <div />
                <div />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inventario" element={<Catalog />} />
              <Route
                path="/ventas"
                element={
                  viewCommerce ? <Commerce kind="sale" /> : <Navigate to="/inventario" replace />
                }
              />
              <Route
                path="/compras"
                element={
                  p.purchase ? <Commerce kind="purchase" /> : <Navigate to="/inventario" replace />
                }
              />
              <Route
                path="/cotizaciones"
                element={
                  viewCommerce ? <Commerce kind="quote" /> : <Navigate to="/inventario" replace />
                }
              />
              <Route
                path="/clientes"
                element={
                  viewCommerce ? (
                    <Contacts kind="customer" />
                  ) : (
                    <Navigate to="/inventario" replace />
                  )
                }
              />
              <Route
                path="/proveedores"
                element={
                  p.purchase ? <Contacts kind="supplier" /> : <Navigate to="/inventario" replace />
                }
              />
              <Route
                path="/posventa"
                element={viewCommerce ? <AfterSales /> : <Navigate to="/inventario" replace />}
              />
              <Route
                path="/entregas"
                element={
                  viewCommerce || p.purchase ? (
                    <Deliveries />
                  ) : (
                    <Navigate to="/inventario" replace />
                  )
                }
              />
              <Route
                path="/promociones"
                element={viewCommerce ? <Promotions /> : <Navigate to="/inventario" replace />}
              />
              <Route
                path="/reportes"
                element={p.manage_business ? <Reports /> : <Navigate to="/inventario" replace />}
              />
              <Route
                path="/configuracion"
                element={p.manage_business ? <Settings /> : <Navigate to="/inventario" replace />}
              />
              <Route
                path="/auditoria"
                element={p.view_audit ? <Audit /> : <Navigate to="/inventario" replace />}
              />
              <Route
                path="*"
                element={
                  <section className="panel empty-state">
                    <h1>Esta página no existe</h1>
                    <p>Vuelve al resumen para continuar con tu negocio.</p>
                    <Link className="button primary" to="/">
                      Ir al resumen
                    </Link>
                  </section>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>S-mart Living · Operaciones con claridad</span>
          <span>Pesos dominicanos · Hora de Santo Domingo</span>
        </footer>
        <nav className="sl-bottom-dock" aria-label="Navegación móvil">
          <NavLink to="/" end className="sl-bottom-tab">
            <span className="sl-bottom-lens"><LayoutDashboard size={20} /></span>
            <span>Inicio</span>
          </NavLink>
          <NavLink to="/inventario" className="sl-bottom-tab">
            <span className="sl-bottom-lens"><Package size={20} /></span>
            <span>Inventario</span>
          </NavLink>
          {viewCommerce ? (
            <NavLink to="/ventas" className="sl-bottom-tab">
              <span className="sl-bottom-lens"><ShoppingBag size={20} /></span>
              <span>Ventas</span>
            </NavLink>
          ) : p.purchase ? (
            <NavLink to="/compras" className="sl-bottom-tab">
              <span className="sl-bottom-lens"><ClipboardList size={20} /></span>
              <span>Compras</span>
            </NavLink>
          ) : null}
          <button
            type="button"
            className={`sl-bottom-tab ${menu ? 'is-current' : ''}`}
            aria-label="Más secciones"
            aria-controls="menu-principal"
            aria-expanded={menu}
            onClick={(event) => openSidebar(event.currentTarget)}
          >
            <span className="sl-bottom-lens"><Menu size={20} /></span>
            <span>Más</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  const store = useMemo(
    () => createAuthSessionStore(supabase?.auth ?? null, window.location.href),
    [],
  );
  const { session, loading, recovery, recoveryRequested, error } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => store.start(), [store]);
  function finishRecovery() {
    window.history.replaceState({}, '', '/');
    store.finishRecovery();
  }
  if (loading)
    return (
      <main className="center-screen">
        <div className="loading-panel" role="status">
          <span className="brand-mark">S</span>
          <p>Comprobando tu sesión…</p>
          <div className="loading-line" />
        </div>
      </main>
    );
  return (
    <ErrorBoundary>
      {!session || recovery || recoveryRequested ? (
        <AuthPage
          key={recovery ? 'recovery' : recoveryRequested ? 'invalid-recovery' : 'login'}
          recovery={Boolean(session && recovery)}
          recoveryInvalid={recoveryRequested && !recovery}
          sessionError={error}
          onRetrySession={error ? () => void store.refresh() : undefined}
          onRecoveryComplete={finishRecovery}
          onExitRecovery={recoveryRequested ? finishRecovery : undefined}
        />
      ) : (
        <RetailProvider key={session.user.id} userId={session.user.id}>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </RetailProvider>
      )}
    </ErrorBoundary>
  );
}
