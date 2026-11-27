import { ChevronRight, CircleCheck, ClipboardList, PackageCheck, Plus, Search, ShoppingBag, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useId, useState } from 'react';
import { useRetail } from '../state/useRetail';
import {
  businessDate,
  BUSINESS_TIMEZONE,
  dateTime,
  documentNumber,
  integer,
  money,
  shortDate,
} from '../lib/format';
import { inventoryFinancialSummary } from '../lib/pricing';
import { reportForPeriod, stockOverview } from '../lib/reports';
import { dashboardActivity, dashboardTasks, salesTrend, type DashboardTask } from '../lib/dashboard';
import type { RetailData } from '../lib/contracts';
import './dashboard.css';
import { NavigationChevron } from '../components/NavigationChevron';
import {
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from '../components/ui';

function useBusinessDay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return { today: businessDate(now), now };
}

const activityTime = new Intl.DateTimeFormat('es-DO', { timeStyle: 'short', timeZone: BUSINESS_TIMEZONE });
const taskIcons = { stock: PackageCheck, purchase: ClipboardList, delivery: Truck };

function TaskIcon({ kind }: Pick<DashboardTask, 'kind'>) {
  const Icon = taskIcons[kind];
  return <Icon size={19} aria-hidden="true" />;
}

function PriorityBanner({ tasks }: { tasks: DashboardTask[] }) {
  const first = tasks[0];
  return (
    <section className="sl-priority-banner" aria-label="Prioridades del negocio">
      {first ? (
        <Link className="sl-priority-row" to={first.to}>
          <span className={`sl-priority-icon ${first.level}`}><TaskIcon kind={first.kind} /></span>
          <span className="sl-priority-heading">
            <small>{integer(tasks.length)} {tasks.length === 1 ? 'prioridad' : 'prioridades'}</small>
            <strong>{first.title}</strong>
          </span>
          <span className="sl-priority-detail">{first.detail}</span>
          <span className="sl-priority-context">{first.context}</span>
          <span className="sl-priority-open"><span>Revisar</span><ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
      ) : (
        <p className="sl-priority-empty"><CircleCheck size={21} aria-hidden="true" />Tu operación está al día.</p>
      )}
    </section>
  );
}

function SalesTrendChart({ data, today }: { data: RetailData; today: string }) {
  const [days, setDays] = useState<7 | 30>(7);
  const gradientId = useId();
  const points = salesTrend(data.documents, today, days);
  const min = Math.min(0, ...points.map((point) => point.amount));
  const max = Math.max(1, ...points.map((point) => point.amount));
  const range = max - min;
  const y = (amount: number) => 148 - ((amount - min) / range) * 126;
  const coordinates = points.map((point, index) => ({ x: 12 + (index / (days - 1)) * 636, y: y(point.amount) }));
  const line = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const area = `${line} L 648 ${y(0).toFixed(2)} L 12 ${y(0).toFixed(2)} Z`;
  const total = points.reduce((sum, point) => sum + point.amount, 0);
  return (
    <article className="panel sl-insight-card sl-sales-insight">
      <div className="sl-insight-heading">
        <h2>Ventas registradas</h2><p>Con ITBIS · neto de devoluciones</p>
      </div>
      <div className="sl-period-toggle" role="group" aria-label="Período de ventas">
        {([7, 30] as const).map((period) => <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)}>{period} días</button>)}
      </div>
      <div className="sl-sales-total"><div><span>Total del período</span><strong>{money(total)}</strong></div><div><span>Hoy</span><strong>{money(points.at(-1)!.amount)}</strong></div></div>
      <div className="sl-chart-layout"><div className="sl-chart-axis" aria-hidden="true">{[max,(max+min)/2,min].map((value,index)=><span key={index}>{money(value)}</span>)}</div><svg className="sl-sales-chart" viewBox="0 0 660 170" preserveAspectRatio="none" role="img" aria-label={`Ventas netas de los últimos ${days} días: ${money(total)}. Hoy: ${money(points.at(-1)!.amount)}.`}>
        <title>{`Ventas netas registradas, últimos ${days} días`}</title>
        <desc>Se descuentan las devoluciones en la fecha de su registro. Los días sin operaciones muestran cero. Las cifras diarias están disponibles debajo del gráfico.</desc>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.18" /><stop offset="100%" stopColor="currentColor" stopOpacity="0.01" /></linearGradient></defs>
        {[22, 85, 148].map((gridY) => <path key={gridY} d={`M 12 ${gridY} H 648`} className="sl-chart-grid" />)}
        {min < 0 && <path d={`M 12 ${y(0)} H 648`} className="sl-chart-zero" />}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={coordinates.at(-1)!.x} cy={coordinates.at(-1)!.y} r="4" fill="currentColor" />
      </svg>
        <div className="sl-plot-dates"><span>{shortDate(`${points[0]!.day}T12:00:00-04:00`)}</span><span className="sr-only">Fechas de República Dominicana</span><span>Hoy</span></div>
      </div>
      <div className="sl-chart-tools">
        <details className="sl-chart-data">
          <summary><ChevronRight size={15} aria-hidden="true" /> Ver importes diarios</summary>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th>Ventas netas RD$</th></tr></thead><tbody>{points.map((point) => <tr key={point.day}><td>{shortDate(`${point.day}T12:00:00-04:00`)}</td><td className="numeric">{money(point.amount)}</td></tr>)}</tbody></table></div>
        </details>
        {data.permissions.manage_business && <Link className="text-link" to="/reportes">Ver reportes <NavigationChevron size={14} /></Link>}
      </div>
    </article>
  );
}

function StockHealth({ data }: { data: RetailData }) {
  const inventory = stockOverview(data);
  const out = inventory.filter((row) => row.available === 0).length;
  const low = inventory.filter((row) => row.available > 0 && row.available <= row.variant.min_stock).length;
  const groups = [
    { name: 'Disponibles', count: inventory.length - low - out, color: 'var(--sl-success)', filter: 'available' },
    { name: 'Bajo stock', count: low, color: 'var(--sl-warning)', filter: 'low' },
    { name: 'Agotadas', count: out, color: 'var(--sl-danger)', filter: 'out' },
  ];
  const circumference = 2 * Math.PI * 58;
  let offset = 0;
  const arcs = groups.map((group) => {
    const length = inventory.length ? (group.count / inventory.length) * circumference : 0;
    const arc = { ...group, length, offset };
    offset += length;
    return arc;
  });
  return (
    <article className="panel sl-insight-card">
      <div className="sl-insight-heading"><h2>Estado de las existencias</h2><p>Variantes activas y necesidad de reposición</p></div>
      <div className="sl-stock-visual">
        <div className="sl-stock-donut"><svg viewBox="0 0 160 160" role="img" aria-label={`${inventory.length} variantes activas: ${groups[0]!.count} disponibles, ${low} con bajo stock y ${out} agotadas.`}><circle cx="80" cy="80" r="58" fill="none" stroke="var(--sl-line)" strokeWidth="14" />{arcs.filter((arc) => arc.length > 0).map((arc) => <circle key={arc.name} cx="80" cy="80" r="58" fill="none" stroke={arc.color} strokeWidth="14" strokeDasharray={`${Math.max(0, arc.length - 2)} ${circumference}`} strokeDashoffset={-arc.offset} transform="rotate(-90 80 80)" />)}</svg><div><strong>{integer(inventory.length)}</strong><span>variantes</span></div></div>
        <ul className="sl-stock-legend">{groups.map((group) => <li key={group.name}><Link to={`/inventario?estado=${group.filter}`}><span className="sl-legend-dot" style={{ background: group.color }} /><span>{group.name}</span><strong>{integer(group.count)}</strong></Link></li>)}</ul>
      </div>
      <div className="sl-stock-summary"><strong>{integer(low + out)} requieren atención</strong><span>{out} agotadas · {low} por reponer</span></div>
      <div className="sl-insight-footer"><span>Existencias actuales del negocio</span><Link className="text-link" to="/inventario">Ver inventario <NavigationChevron size={14} /></Link></div>
    </article>
  );
}

export function DashboardPage() {
  const { data } = useRetail();
  const { today, now } = useBusinessDay();
  const tasks = dashboardTasks(data, now);
  const activity = dashboardActivity(data);
  const commerce = data.permissions.sell || data.permissions.manage_business;
  const purchasing = data.permissions.purchase;
  const deliveryAccess = commerce || purchasing;
  const report = reportForPeriod(data, today, today);
  const inventory = stockOverview(data);
  const low = inventory
    .filter((row) => row.available <= row.variant.min_stock)
    .sort((a, b) => a.available - b.available);
  const pending = data.documents.filter(
    (doc) => doc.type === 'purchase' && ['pending', 'partial'].includes(doc.status),
  );
  const deliveries = data.deliveries.filter(
    (delivery) =>
      !['delivered', 'cancelled'].includes(delivery.status) &&
      businessDate(new Date(delivery.scheduled_at)) <= today,
  );
  const recentType = commerce ? 'sale' : 'purchase';
  const recent = data.documents
    .filter((doc) => doc.type === recentType)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);
  const recentRoute = commerce ? '/ventas' : '/compras';
  const financials = data.permissions.view_costs ? inventoryFinancialSummary(inventory, data.settings.tax_rate) : null;
  return (
    <div className="sl-dashboard-v1 sl-refined-theme">
      <PageHeader
        eyebrow={`${shortDate(now.toISOString())} · REPÚBLICA DOMINICANA`}
        title="Resumen"
        actions={<>
          <button type="button" className="button secondary sl-dashboard-search" onClick={() => window.dispatchEvent(new Event('smartliving:search'))}><Search size={18} /> Buscar cualquier cosa <kbd>⌘ / Ctrl K</kbd></button>
          {data.permissions.sell ? <Link className="button primary" to="/ventas?nuevo=1"><Plus size={18} /> Nueva venta</Link> : purchasing ? <Link className="button primary" to="/compras?nuevo=1"><Plus size={18} /> Nueva compra</Link> : null}
        </>}
      />
      <PriorityBanner tasks={tasks} />
      <div className="stats-grid sl-dashboard-kpis">
        {commerce && (
          <StatCard
            label="Ventas de hoy"
            tone="sl-kpi-featured"
            value={money(report.total)}
            hint={`${report.sales.length} ventas · neto de devoluciones`}
          />
        )}
        <StatCard
          label="Unidades disponibles"
          value={integer(inventory.reduce((total, row) => total + row.available, 0))}
          hint={`${inventory.length} variantes activas`}
        />
        <StatCard
          label="Necesitan reposición"
          value={integer(low.length)}
          hint={`${low.filter((row) => row.available === 0).length} variantes agotadas`}
          tone="warning"
        />
        {purchasing ? (
          <StatCard
            label="Compras pendientes"
            tone={commerce ? 'sl-kpi-summary' : ''}
            value={integer(pending.length)}
            hint="Órdenes con mercancía por recibir"
          />
        ) : deliveryAccess ? (
          <StatCard
            label="Entregas por atender"
            tone="sl-kpi-summary"
            value={integer(deliveries.length)}
            hint="Programadas para hoy o antes"
          />
        ) : (
          <StatCard
            label="Productos activos"
            tone="sl-kpi-summary"
            value={integer(data.products.filter((product) => product.active).length)}
            hint="Catálogo disponible para consulta"
          />
        )}
        {purchasing && !commerce && (
          <StatCard
            label="Unidades en camino"
            value={integer(inventory.reduce((total, row) => total + row.incoming, 0))}
            hint="Cantidades pendientes de recibir"
          />
        )}
      </div>
      <section className="sl-dashboard-insights" aria-label="Rendimiento y existencias">
        {commerce && <SalesTrendChart data={data} today={today} />}
        <StockHealth data={data} />
      </section>
      {financials && <section className="panel sl-inventory-financials" aria-label="Resumen financiero del inventario">
        <div className="section-heading"><div><h2>Valor del inventario</h2><p>Existencias disponibles · estimaciones, no ventas realizadas.</p></div><Link className="text-link" to="/inventario">Ver inventario <NavigationChevron size={16} /></Link></div>
        <div className="sl-financial-grid">
          <StatCard label="Valor del inventario" value={money(financials.value)} hint="Existencias disponibles a costo"/>
          <StatCard label="Ingreso potencial" value={money(financials.revenue)} hint="Precio final con ITBIS × unidades disponibles"/>
          <StatCard label="Ganancia potencial" value={money(financials.potentialProfit)} hint="(Precio final con ITBIS − costo) × unidades con precio"/>
        </div>
        <p className="sl-financial-caveat">La ganancia potencial conserva el cálculo de Inventario e incluye ITBIS en el precio final. No equivale a beneficio bruto sin ITBIS ni a utilidad realizada. Los costos sin registrar se consideran cero en esta estimación.</p>
      </section>}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PRIORIDADES</span>
              <h2>Prioridades operativas</h2>
            </div>
            <Link className="text-link" to="/inventario?estado=low">
              Ver reposición <NavigationChevron size={15} />
            </Link>
          </div>
          {tasks.length ? (
            <div className="sl-work-list">
              {tasks.slice(0, 6).map((task) => (
                <div className="sl-work-item" key={task.id}>
                  <span className={`sl-work-status ${task.level}`}><TaskIcon kind={task.kind} /></span>
                  <div><span>{task.title}</span><strong>{task.detail}</strong><small>{task.context}</small></div>
                  <Link
                    className="text-link sl-work-action"
                    to={task.to}
                    aria-label={`Revisar ${task.title}: ${task.detail}. ${task.context}`}
                  >
                    <ChevronRight className="sl-work-chevron" size={23} strokeWidth={2.7} aria-hidden="true" />
                  </Link>
                </div>
              ))}
              {tasks.length > 6 && <p className="sl-task-note">Mostrando las 6 prioridades más urgentes de {tasks.length}. Revisa las secciones para ver el detalle completo.</p>}
            </div>
          ) : (
            <EmptyState title={inventory.length ? 'Inventario al día' : 'Aún no hay inventario activo'} description={inventory.length ? 'No hay existencias ni operaciones pendientes que requieran atención.' : 'Los productos registrados aparecerán aquí cuando estén disponibles.'} />
          )}
          {purchasing && low.some((row) => row.suggested > 0) && (
            <Link className="panel-footer-link" to="/compras?nuevo=1">
              Preparar reposición <NavigationChevron size={16} />
            </Link>
          )}
        </section>
        {deliveryAccess ? (
          <section className="panel dark-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">OPERACIÓN DEL DÍA</span>
                <h2>Del mostrador a su hogar</h2>
              </div>
              <Truck size={25} />
            </div>
            <div className="delivery-highlight">
              <strong>{deliveries.length}</strong>
              <span>
                entregas pendientes
                <br />
                para hoy o anteriores
              </span>
            </div>
            <p>Organiza las salidas y mantén al equipo informado en cada paso.</p>
            <Link className="button light" to="/entregas">
              Gestionar entregas <NavigationChevron size={16} />
            </Link>
            <div className="delivery-note">
              Una entrega confirmada conserva su historial y receptor.
            </div>
          </section>
        ) : (
          <section className="panel dark-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">CONSULTA DEL CATÁLOGO</span>
                <h2>Encuentra lo que necesitas</h2>
              </div>
              <PackageCheck size={25} />
            </div>
            <p>
              Busca por marca, modelo, SKU o código de barras y consulta las existencias
              disponibles.
            </p>
            <Link className="button light" to="/inventario">
              Consultar inventario <NavigationChevron size={16} />
            </Link>
          </section>
        )}
      </div>
      <section className="panel sl-quick-actions" aria-label="Accesos rápidos">
        <div className="section-heading"><h2>Accesos rápidos</h2></div>
        <div className="sl-quick-grid">
          {data.permissions.sell && <Link to="/ventas?nuevo=1"><ShoppingBag size={21} /><span><strong>Registrar una venta</strong><small>Cliente, productos y medio de pago</small></span><NavigationChevron size={16} /></Link>}
          {data.permissions.manage_catalog && <Link to="/inventario?nuevo=1"><Plus size={21} /><span><strong>Agregar producto</strong><small>Crear producto y variantes</small></span><NavigationChevron size={16} /></Link>}
          {purchasing && <Link to="/compras?nuevo=1"><ClipboardList size={21} /><span><strong>Registrar compra</strong><small>Ordenar y recibir productos</small></span><NavigationChevron size={16} /></Link>}
          <button type="button" onClick={() => window.dispatchEvent(new Event('smartliving:search'))}><Search size={21} /><span><strong>Encontrar algo</strong><small>Productos, contactos y operaciones</small></span><NavigationChevron size={16} /></button>
        </div>
      </section>
      <section className="panel sl-recent-activity">
        <div className="section-heading">
          <h2>Actividad reciente</h2>
          {data.permissions.view_audit && (
            <Link
              className="text-link sl-activity-open"
              to="/auditoria"
              aria-label="Ver actividad en Auditoría"
              title="Ver actividad en Auditoría"
            >
              <span>Ver actividad</span>
              <NavigationChevron className="sl-activity-chevron" size={23} strokeWidth={2.7} />
            </Link>
          )}
        </div>
        {activity.length ? (
          <ul>{activity.map((item) => (
            <li key={item.id}>
              <Link to={item.to}>
                <strong>{item.title}</strong>
                {item.amount !== null ? (
                  <b>{money(item.amount)}</b>
                ) : item.quantity !== null ? (
                  <b>{item.quantity > 0 ? '+' : ''}{integer(item.quantity)} un.</b>
                ) : null}
                <small>{item.detail && `${item.detail} · `}<time dateTime={item.at}>{shortDate(item.at)}</time></small>
                <small className="sl-activity-time"><time dateTime={item.at}>{activityTime.format(new Date(item.at))}</time></small>
                <NavigationChevron className="sl-activity-chevron" size={23} strokeWidth={2.7} />
              </Link>
            </li>
          ))}</ul>
        ) : <EmptyState title="Sin actividad registrada" description="Las operaciones y ajustes autorizados para tu rol aparecerán aquí." />}
      </section>
      {(commerce || purchasing) && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{commerce ? 'ACTIVIDAD COMERCIAL' : 'ABASTECIMIENTO'}</span>
              <h2>{commerce ? 'Ventas recientes' : 'Compras recientes'}</h2>
            </div>
            <Link className="text-link" to={recentRoute}>
              Ver historial <NavigationChevron size={15} />
            </Link>
          </div>
          {recent.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{commerce ? 'Venta' : 'Compra'}</th>
                    <th>{commerce ? 'Cliente' : 'Proveedor'}</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <Link to={`${recentRoute}?documento=${doc.id}`}>{documentNumber(doc)}</Link>
                      </td>
                      <td>
                        {typeof doc.contact_snapshot.name === 'string'
                          ? doc.contact_snapshot.name
                          : commerce
                            ? 'Cliente de mostrador'
                            : 'Proveedor'}
                      </td>
                      <td>{dateTime(doc.created_at)}</td>
                      <td>
                        <StatusBadge status={doc.status} />
                      </td>
                      <td className="numeric">{money(doc.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={commerce ? 'Aún no hay ventas registradas' : 'Aún no hay compras registradas'}
              description={
                commerce
                  ? 'Las ventas aparecerán aquí, con su cliente, estado y total.'
                  : 'Las órdenes de compra aparecerán aquí, con su proveedor y estado de recepción.'
              }
            />
          )}
        </section>
      )}
    </div>
  );
}

export { ReportsPage } from './Reports';
