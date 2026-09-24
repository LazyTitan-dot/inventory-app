import { ArrowDownToLine, ArrowRight, PackageCheck, Plus, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useRetail } from '../state/useRetail';
import { businessDate, categoryName, dateTime, documentNumber, downloadCsv, integer, money, paymentLabels, shortDate, statusLabels } from '../lib/format';
import { reportForPeriod, stockOverview } from '../lib/reports';
import { EmptyState, ErrorNotice, Field, PageHeader, StatCard, StatusBadge } from '../components/ui';

function useBusinessDay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  return { today: businessDate(now), now };
}

export function DashboardPage() {
  const { data } = useRetail(); const { today, now } = useBusinessDay();
  const commerce = data.permissions.sell || data.permissions.manage_business;
  const purchasing = data.permissions.purchase;
  const deliveryAccess = commerce || purchasing;
  const report = reportForPeriod(data, today, today);
  const inventory = stockOverview(data);
  const low = inventory.filter(row => row.available <= row.variant.min_stock).sort((a, b) => a.available - b.available);
  const pending = data.documents.filter(doc => doc.type === 'purchase' && ['pending', 'partial'].includes(doc.status));
  const deliveries = data.deliveries.filter(delivery => !['delivered', 'cancelled'].includes(delivery.status) && businessDate(new Date(delivery.scheduled_at)) <= today);
  const recentType = commerce ? 'sale' : 'purchase';
  const recent = data.documents.filter(doc => doc.type === recentType).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
  const recentRoute = commerce ? '/ventas' : '/compras';
  return <>
    <PageHeader eyebrow={`${shortDate(now.toISOString())} · REPÚBLICA DOMINICANA`} title={`Hola, ${data.profile.display_name.trim().split(' ')[0] || 'equipo'}`} description={commerce ? 'Tu negocio de un vistazo. Esto es lo que necesita tu atención hoy.' : purchasing ? 'Existencias, compras y entregas disponibles para tu rol.' : 'Consulta las existencias y el estado del inventario.'} actions={data.permissions.sell ? <Link className="button primary" to="/ventas?nuevo=1"><Plus size={18} /> Nueva venta</Link> : purchasing ? <Link className="button primary" to="/compras?nuevo=1"><Plus size={18} /> Nueva compra</Link> : undefined} />
    <div className="stats-grid">
      {commerce && <StatCard label="Ventas de hoy" value={money(report.total)} hint={`${report.sales.length} ventas · neto de devoluciones`} />}
      <StatCard label="Unidades disponibles" value={integer(inventory.reduce((total, row) => total + row.available, 0))} hint={`${inventory.length} variantes activas`} />
      <StatCard label="Necesitan reposición" value={integer(low.length)} hint={`${low.filter(row => row.available === 0).length} variantes agotadas`} tone="warning" />
      {purchasing ? <StatCard label="Compras pendientes" value={integer(pending.length)} hint="Órdenes con mercancía por recibir" /> : deliveryAccess ? <StatCard label="Entregas por atender" value={integer(deliveries.length)} hint="Programadas para hoy o antes" /> : <StatCard label="Productos activos" value={integer(data.products.filter(product => product.active).length)} hint="Catálogo disponible para consulta" />}
      {purchasing && !commerce && <StatCard label="Unidades en camino" value={integer(inventory.reduce((total, row) => total + row.incoming, 0))} hint="Cantidades pendientes de recibir" />}
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="section-heading"><div><span className="eyebrow">PRIORIDADES</span><h2>Atención al inventario</h2></div><Link className="text-link" to="/inventario?estado=low">Ver todos <ArrowRight size={15} /></Link></div>
        {low.length ? <div className="alert-list">{low.slice(0, 5).map(row => <div className="inventory-alert" key={row.variant.id}><div className={`alert-marker ${row.available === 0 ? 'danger' : ''}`}><PackageCheck size={19} /></div><div><strong>{row.product.brand} {row.product.model}</strong><small>{row.variant.name} · {row.variant.sku}</small></div><div className="alert-quantity"><strong>{row.available} <span>disp.</span></strong><small>{purchasing && row.incoming ? `${row.incoming} en camino` : `Mínimo ${row.variant.min_stock}`}</small></div></div>)}</div> : <EmptyState title={inventory.length ? 'Inventario al día' : 'Aún no hay inventario activo'} description={inventory.length ? 'No hay productos en el mínimo o por debajo.' : 'Los productos registrados aparecerán aquí cuando estén disponibles.'} />}
        {purchasing && low.some(row => row.suggested > 0) && <Link className="panel-footer-link" to="/compras?nuevo=1">Preparar reposición <ArrowRight size={16} /></Link>}
      </section>
      {deliveryAccess ? <section className="panel dark-panel"><div className="section-heading"><div><span className="eyebrow">OPERACIÓN DEL DÍA</span><h2>Del mostrador a su hogar</h2></div><Truck size={25} /></div><div className="delivery-highlight"><strong>{deliveries.length}</strong><span>entregas pendientes<br />para hoy o anteriores</span></div><p>Organiza las salidas y mantén al equipo informado en cada paso.</p><Link className="button light" to="/entregas">Gestionar entregas <ArrowRight size={16} /></Link><div className="delivery-note">Una entrega confirmada conserva su historial y receptor.</div></section> : <section className="panel dark-panel"><div className="section-heading"><div><span className="eyebrow">CONSULTA DEL CATÁLOGO</span><h2>Encuentra lo que necesitas</h2></div><PackageCheck size={25} /></div><p>Busca por marca, modelo, SKU o código de barras y consulta las existencias disponibles.</p><Link className="button light" to="/inventario">Consultar inventario <ArrowRight size={16} /></Link></section>}
    </div>
    {(commerce || purchasing) && <section className="panel"><div className="section-heading"><div><span className="eyebrow">{commerce ? 'ACTIVIDAD COMERCIAL' : 'ABASTECIMIENTO'}</span><h2>{commerce ? 'Ventas recientes' : 'Compras recientes'}</h2></div><Link className="text-link" to={recentRoute}>Ver historial <ArrowRight size={15} /></Link></div>
      {recent.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>{commerce ? 'Venta' : 'Compra'}</th><th>{commerce ? 'Cliente' : 'Proveedor'}</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead><tbody>{recent.map(doc => <tr key={doc.id}><td><Link to={`${recentRoute}?documento=${doc.id}`}>{documentNumber(doc)}</Link></td><td>{typeof doc.contact_snapshot.name === 'string' ? doc.contact_snapshot.name : commerce ? 'Cliente de mostrador' : 'Proveedor'}</td><td>{dateTime(doc.created_at)}</td><td><StatusBadge status={doc.status} /></td><td className="numeric">{money(doc.total)}</td></tr>)}</tbody></table></div> : <EmptyState title={commerce ? 'Aún no hay ventas registradas' : 'Aún no hay compras registradas'} description={commerce ? 'Las ventas aparecerán aquí, con su cliente, estado y total.' : 'Las órdenes de compra aparecerán aquí, con su proveedor y estado de recepción.'} />}
    </section>}
  </>;
}

export function ReportsPage() {
  const { data } = useRetail(); const { today } = useBusinessDay();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`); const [to, setTo] = useState(today);
  const allowed = data.permissions.manage_business && ['owner', 'admin'].includes(data.profile.role);
  const validRange = Boolean(from && to && from <= to && to <= today);
  const report = reportForPeriod(data, from, to); const inventory = stockOverview(data);
  function exportReport() {
    if (!allowed || !validRange) return;
    downloadCsv(`ventas-${from}-${to}.csv`, [['Documento', 'Fecha', 'Tipo', 'Estado', 'Base sin impuesto RD$', 'ITBIS RD$', 'Total RD$', 'Medio de pago'], ...report.included.map(doc => { const sign = doc.type === 'return' ? -1 : 1; return [documentNumber(doc), dateTime(doc.created_at), doc.type === 'return' ? 'Devolución' : 'Venta', statusLabels[doc.status] ?? doc.status, (doc.total - doc.tax) * sign, doc.tax * sign, doc.total * sign, paymentLabels[doc.payment_method ?? 'other'] ?? 'Otro']; })]);
  }
  const maxCategory = Math.max(1, ...report.categories.map(([, amount]) => Math.abs(amount)));
  if (!allowed) return <><PageHeader title="Reportes" description="Información de gestión del negocio." /><section className="panel"><EmptyState title="Tu rol no tiene acceso a los reportes financieros" description="Puedes seguir consultando el inventario y las funciones habilitadas para tu cuenta." action={<Link className="button secondary" to="/inventario">Ir al inventario</Link>} /></section></>;
  return <>
    <PageHeader eyebrow="DATOS PARA DECIDIR" title="Reportes" description="Ventas y devoluciones conciliadas, con fechas de República Dominicana." actions={<button className="button secondary" disabled={!validRange} onClick={exportReport}><ArrowDownToLine size={17} /> Exportar detalle</button>} />
    <section className="panel report-filters"><Field label="Desde"><input type="date" value={from} max={to || today} onChange={event => setFrom(event.target.value)} /></Field><Field label="Hasta"><input type="date" value={to} min={from} max={today} onChange={event => setTo(event.target.value)} /></Field><p>Incluye devoluciones registradas en el período. Excluye ventas anuladas.</p></section>
    {!validRange ? <ErrorNotice message="Selecciona un rango completo: la fecha inicial debe ser anterior o igual a la final, y la fecha final no puede ser posterior a hoy." /> : <>
      <div className="stats-grid"><StatCard label="Ingresos netos sin ITBIS" value={money(report.netRevenue)} hint={`${report.sales.length} ventas / ${report.refunds.length} devoluciones`} /><StatCard label="ITBIS neto registrado" value={money(report.tax)} hint="Según la configuración de cada operación" /><StatCard label="Cobros netos registrados" value={money(report.total)} hint="Incluye ITBIS; descuenta reembolsos" />{data.permissions.view_costs && <StatCard label="Beneficio bruto" value={money(report.profit)} hint="Ingresos sin impuesto menos costo vendido" />}</div>
      <div className="dashboard-grid"><section className="panel"><div className="section-heading"><h2>Ingresos por categoría</h2></div>{report.categories.length ? <div className="bar-chart">{report.categories.map(([category, amount]) => <div className="bar-row" key={category}><div><span>{categoryName(category)}</span><strong>{money(amount)}</strong></div><div className="bar-track"><span style={{ width: `${Math.abs(amount) / maxCategory * 100}%` }} /></div></div>)}</div> : <EmptyState title="Sin ventas en este período" description="Selecciona otro rango para consultar el historial." />}</section><section className="panel"><div className="section-heading"><h2>Medios de pago</h2></div><div className="payment-list">{report.payments.map(([method, amount]) => <div key={method}><span>{paymentLabels[method] ?? method}</span><strong>{money(amount)}</strong></div>)}{!report.payments.length && <EmptyState title="Sin cobros registrados" description="Los medios de pago aparecerán al registrar ventas." />}</div></section></div>
    </>}
    <section className="panel"><div className="section-heading"><div><h2>Reposición recomendada</h2><p>El cálculo considera las existencias y las compras pendientes de recibir. Refleja el inventario actual, independientemente del rango de ventas.</p></div></div>{inventory.some(row => row.suggested > 0) ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Producto</th><th>Disponible</th><th>En camino</th><th>Objetivo</th><th>Sugerido</th></tr></thead><tbody>{inventory.filter(row => row.suggested > 0).map(row => <tr key={row.variant.id}><td>{row.product.brand} {row.product.model}<small>{row.variant.name} · {row.variant.sku}</small></td><td>{row.available}</td><td>{row.incoming}</td><td>{row.variant.reorder_target}</td><td><strong>{row.suggested}</strong></td></tr>)}</tbody></table></div> : <EmptyState title="Sin reposición pendiente" description="Las existencias y las compras en camino cubren el objetivo de los productos con stock bajo." />}</section>
  </>;
}
