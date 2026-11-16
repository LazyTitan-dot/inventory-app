import { useEffect,useMemo,useState } from 'react';
import { ArrowDownToLine, CalendarDays, ChartNoAxesCombined, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRetail } from '../state/useRetail';
import { EmptyState,ErrorNotice,Field,PageHeader } from '../components/ui';
import { businessDate,categoryName,dateTime,documentNumber,downloadCsv,money,paymentLabels,statusLabels } from '../lib/format';
import { grossMargin,reportAnalytics,reportPeriod,stockOverview } from '../lib/reports';
import './reports-visual-v1.css';

type Preset = Parameters<typeof reportPeriod>[1];
const presets: {id:Preset;label:string}[]=[{id:'today',label:'Hoy'},{id:'7',label:'7 días'},{id:'30',label:'30 días'},{id:'month',label:'Este mes'},{id:'previous',label:'Mes anterior'}];
const pct=(v:number|null)=>v===null?'No aplica':new Intl.NumberFormat('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' %';
const round=(v:number)=>Math.round(v*100)/100;
const dateLabel=(day:string)=>new Intl.DateTimeFormat('es-DO',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
type Report = ReturnType<typeof reportAnalytics>;
function Kpi({label,value,hint,main=false,negative=false}:{label:string;value:string;hint:string;main?:boolean;negative?:boolean}){
 return <article className={`report-kpi ${main?'report-kpi-main':''} ${negative?'report-negative':''}`}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}
function Trend({analytics}:{analytics:Report}){
 const {trend,granularity,report}=analytics;
 const min=Math.min(0,...trend.map(p=>p.amount)),max=Math.max(1,...trend.map(p=>p.amount));
 const y=(v:number)=>160-(v-min)/(max-min)*132;
 const step=540/Math.max(1,trend.length),zero=y(0);
 const label=granularity==='day'?'día':granularity==='week'?'semana':'mes';
 return <section className="panel report-trend" aria-label="Evolución de ingresos">
  <div className="section-heading"><div><h2>Evolución de ingresos</h2><p>RD$ sin ITBIS · por {label}</p></div><ChartNoAxesCombined size={21} aria-hidden="true"/></div>
  {!report.included.length?<EmptyState title="Sin operaciones en este período" description="Selecciona otro rango para consultar ingresos."/>:<>
  <div className="report-plot"><svg viewBox="0 0 620 190" role="img" aria-label={`Evolución de ingresos por ${label}. Total: ${money(report.netRevenue)}`}>
  <title>Ingresos netos sin ITBIS</title><desc>Las devoluciones pueden producir barras negativas. Consulta los importes exactos debajo.</desc>
  {[min,(min+max)/2,max].map((n,i)=><g key={i}><line x1="69" x2="610" y1={y(n)} y2={y(n)} className="report-grid-line"/><text x="64" y={y(n)+4} textAnchor="end" fontSize="10" fill="currentColor">{new Intl.NumberFormat('es-DO',{notation:'compact',maximumFractionDigits:1}).format(n)}</text></g>)}
  <line x1="69" x2="610" y1={zero} y2={zero} className="report-zero-line"/>
  {trend.map((p,i)=><rect key={p.day} x={70+i*step+step*.15} y={Math.min(y(p.amount),zero)} width={Math.max(0.8,step*.7)} height={Math.max(0,Math.abs(y(p.amount)-zero))} rx="2" className={p.amount<0?'report-bar-negative':'report-bar-positive'}><title>{p.day} – {p.end}: {money(p.amount)}</title></rect>)}
  </svg><div className="report-plot-labels"><span>{trend[0]&&dateLabel(trend[0].day)}</span><span>{trend.at(-1)&&dateLabel(trend.at(-1)!.end)}</span></div></div>
  <details><summary>Consultar datos de la gráfica</summary><div className="table-wrap"><table className="data-table"><thead><tr><th>Período</th><th>Ingresos netos RD$</th></tr></thead><tbody>{trend.map(p=><tr key={p.day}><td>{p.day}{p.end!==p.day?' — '+p.end:''}</td><td className="report-number">{money(p.amount)}</td></tr>)}</tbody></table></div></details>
  </>}
 </section>;
}
export function ReportsPage(){
 const {data}=useRetail();
 const [today,setToday]=useState(()=>businessDate(new Date()));
 useEffect(()=>{const timer=setInterval(()=>setToday(businessDate(new Date())),60000);return()=>clearInterval(timer)},[]);
 const [from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(today);
 const [preset,setPreset]=useState<Preset|'custom'>('month');
 const [sort,setSort]=useState<'revenue'|'sold'|'profit'>('revenue');
 const allowed=data.permissions.manage_business && ['owner','admin'].includes(data.profile.role);
 const costs=allowed&&data.permissions.view_costs;
 const valid=Boolean(from&&to&&from<=to&&to<=today);
 const analytics=useMemo(()=>valid&&allowed?reportAnalytics(data,from,to):null,[data,from,to,valid,allowed]);
 const inventory=useMemo(()=>allowed?stockOverview(data):[],[data,allowed]);
 const stock=useMemo(()=>new Map(data.stocks.map(s=>[s.variant_id,s])),[data.stocks]);
 const current=inventory.reduce((sum,row)=>({available:sum.available+row.available,quarantine:sum.quarantine+(stock.get(row.variant.id)?.quarantine??0),incoming:sum.incoming+row.incoming,cost:sum.cost+row.available*(row.variant.cost??0),missing:sum.missing+(row.available>0&&(!row.variant.cost)?1:0)}),{available:0,quarantine:0,incoming:0,cost:0,missing:0});
 function choose(p:Preset){const range=reportPeriod(today,p);setPreset(p);setFrom(range.from);setTo(range.to);}
 function exportDetail(){
  if(!allowed||!valid||!analytics)return;
  downloadCsv(`ventas-${from}-${to}.csv`,[['Documento','Fecha','Tipo','Estado','Base sin impuesto RD$','ITBIS RD$','Total RD$','Medio de pago'],...analytics.report.included.map(doc=>{const sign=doc.type==='return'?-1:1;return [documentNumber(doc),dateTime(doc.created_at),doc.type==='return'?'Devolución':'Venta',statusLabels[doc.status]??doc.status,round((doc.total-doc.tax)*sign),round(doc.tax*sign),round(doc.total*sign),paymentLabels[doc.payment_method??'other']??'Otro'];})]);
 }
 function exportSummary(){
  if(!allowed||!valid||!analytics)return;
  const {report:r,rows}=analytics;
  const financialComplete=analytics.incompleteCost===0&&analytics.missingLines===0&&analytics.residual===0;
  const output:(string|number|null)[][]=[['Sección','Concepto','Variante / SKU','Unidades vendidas','Unidades devueltas','Ingresos sin ITBIS RD$','Costo vendido RD$','Beneficio bruto RD$','Margen bruto %','ITBIS RD$','Cobros RD$','Observación'],
   ['Resumen',from+' — '+to,'',null,null,round(r.netRevenue),costs?round(r.cost):null,costs?round(r.profit):null,costs&&financialComplete?grossMargin(r.netRevenue,r.profit):null,round(r.tax),round(r.total),costs&&!financialComplete?'Datos incompletos; resultado provisional':'Importes registrados'],
   ...rows.map(row=>['Producto',[row.snapshot.brand,row.snapshot.model].join(' '),row.snapshot.name+' / '+row.snapshot.sku,row.sold,row.returned,row.revenue,costs?row.cost:null,costs?row.profit:null,costs&&!row.incomplete?grossMargin(row.revenue,row.profit):null,null,null,row.incomplete&&costs?'Costo incompleto':'']),
   ['Conciliación','Diferencia documentos vs líneas','',null,null,analytics.residual,null,null,null,null,null,analytics.missingLines+' documentos sin líneas']];
  downloadCsv(`resumen-${from}-${to}.csv`,output);
 }
 if(!allowed)return <><PageHeader title="Reportes" description="Información de gestión del negocio."/><section className="panel"><EmptyState title="Tu rol no tiene acceso a los reportes financieros" description="Consulta las funciones habilitadas para tu cuenta." action={<Link className="button secondary" to="/inventario">Ir al inventario</Link>}/></section></>;
 const reorder=inventory.filter(r=>r.suggested>0).sort((a,b)=>b.suggested-a.suggested||a.variant.sku.localeCompare(b.variant.sku));
 const complete=analytics&&analytics.incompleteCost===0&&analytics.missingLines===0&&analytics.residual===0;
 return <div className="reports-visual-v1 sl-refined-theme">
 <PageHeader eyebrow="DATOS PARA DECIDIR" title="Reportes" description="Consulta los resultados financieros y comerciales de tu negocio." actions={<button className="button secondary" disabled={!valid} onClick={exportDetail}><ArrowDownToLine size={17}/> Exportar CSV</button>}/>
 <section className="panel report-filter-panel" aria-label="Período de análisis">
 <div className="section-heading"><h2>Período de análisis</h2><span className="report-muted">Hora de RD</span></div>
 <div className="report-presets" role="group" aria-label="Períodos rápidos">{presets.map(p=><button key={p.id} className="button secondary" type="button" aria-pressed={preset===p.id} onClick={()=>choose(p.id)}><CalendarDays size={15} aria-hidden="true"/>{p.label}</button>)}</div>
 <div className="report-date-fields"><Field label="Desde"><input type="date" value={from} max={to||today} onChange={e=>{setFrom(e.target.value);setPreset('custom')}}/></Field><Field label="Hasta"><input type="date" value={to} min={from} max={today} onChange={e=>{setTo(e.target.value);setPreset('custom')}}/></Field><p>Incluye devoluciones registradas en el período. Excluye ventas anuladas.</p></div>
 </section>
 {!valid||!analytics?<ErrorNotice message="Selecciona un rango completo: la fecha inicial debe ser anterior o igual a la final, y la fecha final no puede ser posterior a hoy."/>:<>
 <section className="report-kpis" aria-label="Indicadores financieros">
 <Kpi label="Ingresos netos sin ITBIS" value={money(analytics.report.netRevenue)} hint={`${analytics.report.sales.length} ventas · ${analytics.report.refunds.length} devoluciones`} main/>
 <Kpi label="Cobros netos registrados" value={money(analytics.report.total)} hint="Incluye ITBIS; descuenta reembolsos"/>
 <Kpi label="ITBIS neto registrado" value={money(analytics.report.tax)} hint="Impuesto de las operaciones"/>
 {costs&&<Kpi label="Beneficio bruto" value={money(analytics.report.profit)} hint={complete?'Margen bruto '+pct(grossMargin(analytics.report.netRevenue,analytics.report.profit)):'Resultado provisional · datos incompletos'} negative={analytics.report.profit<0}/>}
 </section>
 {costs&&<section className="panel report-cost-strip" aria-label="Rentabilidad"><div><span>Costo vendido</span><strong>{money(analytics.report.cost)}</strong></div><div><span>Margen bruto</span><strong className={analytics.report.profit<0?'report-negative':''}>{complete?pct(grossMargin(analytics.report.netRevenue,analytics.report.profit)):'No disponible'}</strong></div><details><summary>Ver cálculo financiero</summary><p>Cobros netos menos ITBIS = ingresos netos. Ingresos netos menos costo histórico vendido = beneficio bruto. No incluye gastos operativos.</p></details></section>}
 {(analytics.missingLines>0||analytics.residual!==0||costs&&analytics.incompleteCost>0)&&<p className="report-warning" role="status">Datos incompletos: {analytics.missingLines} documentos sin líneas; diferencia de conciliación {money(analytics.residual)}.{costs?' '+analytics.incompleteCost+' líneas con costo cero o ausente. La rentabilidad es provisional.':''}</p>}
 <div className="report-chart-grid"><Trend analytics={analytics}/><section className="panel report-breakdown"><div className="section-heading"><h2>Ingresos por categoría</h2></div>
 {analytics.report.categories.length?analytics.report.categories.map(([category,amount])=>{const max=Math.max(1,...analytics.report.categories.map(([,a])=>Math.abs(a)));return <div className="report-category" key={category}><div><span>{categoryName(category)}</span><strong>{money(amount)}</strong></div><div className="report-signed-track"><span className={amount<0?'negative':'positive'} style={{width:`${Math.abs(amount)/max*50}%`}}/></div></div>}):<EmptyState title="Sin ingresos por categoría" description="No hay líneas elegibles en el período."/>}
 <div className="report-payment"><h2>Medios de pago</h2><p>Cobros netos registrados con ITBIS</p>{analytics.report.payments.length?analytics.report.payments.map(([method,amount])=><div key={method}><span>{paymentLabels[method]??method}</span><strong>{money(amount)}</strong></div>):<EmptyState title="Sin cobros registrados" description="Los medios de pago aparecerán al registrar ventas."/>}</div>
 </section></div>
 <section className="panel report-products" aria-label="Rendimiento por producto"><div className="section-heading"><div><h2>Rendimiento por producto</h2><p>Ventas y devoluciones del período · datos históricos</p></div><Field label="Ordenar por"><select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="revenue">Ingresos</option><option value="sold">Unidades vendidas</option>{costs&&<option value="profit">Beneficio bruto</option>}</select></Field></div>
 {analytics.rows.length?<div className="table-wrap report-product-table"><table className="data-table"><thead><tr><th>Producto / SKU</th><th>Vendidas</th><th>Devueltas</th><th>Ingresos sin ITBIS</th>{costs&&<><th>Costo vendido</th><th>Beneficio bruto</th><th>Margen</th></>}</tr></thead><tbody>{[...analytics.rows].sort((a,b)=>b[sort]-a[sort]||a.key.localeCompare(b.key)).map(r=><tr key={r.key}><td><strong>{r.snapshot.brand} {r.snapshot.model}</strong><small>{r.snapshot.name} · {r.snapshot.sku}</small>{costs&&r.incomplete&&<small className="report-negative">Costo incompleto</small>}</td><td data-label="Vendidas">{r.sold}</td><td data-label="Devueltas">{r.returned}</td><td data-label="Ingresos sin ITBIS">{money(r.revenue)}</td>{costs&&<><td data-label="Costo vendido">{money(r.cost)}</td><td data-label="Beneficio bruto" className={r.profit<0?'report-negative':''}>{money(r.profit)}</td><td data-label="Margen">{r.incomplete?'No disponible':pct(grossMargin(r.revenue,r.profit))}</td></>}</tr>)}</tbody></table></div>:<EmptyState title="Sin artículos registrados" description="Las líneas de ventas y devoluciones aparecerán aquí."/>}
 <button className="button secondary" onClick={exportSummary}><ArrowDownToLine size={17}/> Exportar resumen CSV</button>
 </section>
 </>}
 <section className="panel report-inventory" aria-label="Inventario actual"><div className="section-heading"><div><h2>Inventario actual</h2><p>Independiente del período de ventas · catálogo activo</p></div><Package size={21} aria-hidden="true"/></div>
 <div className="report-stock-grid"><Kpi label="Disponibles" value={String(current.available)} hint="Unidades"/><Kpi label="En cuarentena" value={String(current.quarantine)} hint="Unidades no vendibles"/><Kpi label="En camino" value={String(current.incoming)} hint="Pendientes de recibir"/>{costs&&<Kpi label="Costo disponible" value={money(current.cost)} hint={current.missing?'Valor parcial · costo faltante':'Costo registrado de existencias'}/>}</div>
 <h3>Reposición recomendada</h3><p className="report-muted">Stock mínimo, objetivo y compras pendientes de recibir.</p>
 {reorder.length?<div className="table-wrap report-product-table"><table className="data-table"><thead><tr><th>Producto</th><th>Disponible</th><th>En camino</th><th>Objetivo</th><th>Sugerido</th></tr></thead><tbody>{reorder.map(r=><tr key={r.variant.id}><td><Link className="text-link" to={'/inventario?variante='+encodeURIComponent(r.variant.id)}>{r.product.brand} {r.product.model}</Link><small>{r.variant.name} · {r.variant.sku}</small></td><td data-label="Disponible">{r.available}</td><td data-label="En camino">{r.incoming}</td><td data-label="Objetivo">{r.variant.reorder_target}</td><td data-label="Sugerido"><strong>{r.suggested}</strong></td></tr>)}</tbody></table></div>:<EmptyState title="Sin reposición pendiente" description="Las existencias y compras en camino cubren el objetivo de los productos con stock bajo."/>}
 </section>
 </div>;
}
