import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { dateTime, downloadCsv } from '../lib/format';
import { EmptyState, ErrorNotice } from './ui';

const schema = z.object({
  batches: z.array(
    z.object({
      id: z.string(),
      completed_at: z.string().nullable(),
      currency: z.string(),
      summary: z.record(z.string(), z.unknown()),
    }),
  ),
  issues: z.array(
    z.object({ id: z.number(), source: z.string(), source_id: z.string(), code: z.string() }),
  ),
  activity: z.array(
    z.object({ id: z.string(), time: z.string().nullable(), text: z.string(), detail: z.string() }),
  ),
});
const labels: Record<string, string> = {
  zero_cost: 'Costo sin registrar',
  zero_price: 'Precio sin registrar',
  historical_variant_not_linked: 'Artículo histórico sin vínculo seguro',
  historical_warranty_unknown: 'Garantía histórica no registrada',
  date_assumed_santo_domingo: 'Fecha original interpretada con la hora de RD',
  pending_document_preserved: 'Documento pendiente conservado',
  legacy_delivery_time_window: 'Entrega con franja horaria, sin hora exacta',
  tax_rate_amount_disagreement: 'Impuesto histórico distinto al cálculo de la tasa',
  image_requires_review: 'Imagen que requiere revisión',
  duplicate_document_number: 'Número de documento duplicado en el origen',
  contact_not_linked: 'Contacto histórico sin vínculo',
  catalog_warranty_default: 'Garantía del catálogo heredada de la regla anterior',
};
const sources: Record<string, string> = {
  products: 'Producto',
  sales: 'Venta',
  purchase_orders: 'Compra',
  customers: 'Cliente',
  suppliers: 'Proveedor',
  deliveries: 'Entrega',
};

export function LegacyReport() {
  const [report, setReport] = useState<z.infer<typeof schema> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<'issues' | 'activity'>('issues');
  const [code, setCode] = useState('');
  useEffect(() => {
    let live = true;
    async function read() {
      try {
        if (!supabase) throw new Error('La conexión no está configurada.');
        const result = await supabase.rpc('retail_migration_report');
        if (result.error) throw result.error;
        const data = schema.parse(result.data);
        if (live) {
          setReport(data);
          setError('');
        }
      } catch (cause) {
        if (live) setError(errorMessage(cause));
      }
    }
    void read();
    return () => {
      live = false;
    };
  }, [attempt]);
  if (error)
    return (
      <section className="panel">
        <ErrorNotice message={error} />
        <button
          className="button secondary"
          onClick={() => {
            setError('');
            setAttempt(attempt + 1);
          }}
        >
          Reintentar
        </button>
      </section>
    );
  if (!report)
    return (
      <section className="panel" role="status">
        <p>Cargando el historial anterior…</p>
      </section>
    );
  if (!report.batches.length)
    return (
      <section className="panel">
        <EmptyState
          title="El historial anterior aún no se ha importado"
          description="Aparecerá aquí después de completar y verificar el cambio de sistema."
        />
      </section>
    );
  const rows = report.issues.filter((issue) => !code || issue.code === code);
  return (
    <section className="panel stack">
      <div className="section-heading">
        <div>
          <h2>Datos conservados del sistema anterior</h2>
          <p>
            Importes en RD$. Estas observaciones reflejan el estado del origen al importarlo; no
            modifican los documentos históricos.
          </p>
        </div>
      </div>
      {report.batches.map((batch) => (
        <p key={batch.id}>
          Importación verificada:{' '}
          <strong>{batch.completed_at ? dateTime(batch.completed_at) : 'En proceso'}</strong> ·{' '}
          {String(batch.summary.products ?? 0)} productos · {String(batch.summary.stock_units ?? 0)}{' '}
          unidades · {String(batch.summary.sales ?? 0)} ventas.
        </p>
      ))}
      <div className="tabs" role="tablist" aria-label="Historial anterior">
        <button role="tab" aria-selected={tab === 'issues'} onClick={() => setTab('issues')}>
          Observaciones ({report.issues.length})
        </button>
        <button role="tab" aria-selected={tab === 'activity'} onClick={() => setTab('activity')}>
          Actividad anterior ({report.activity.length})
        </button>
      </div>
      {tab === 'issues' ? (
        <>
          <div className="toolbar">
            <select
              aria-label="Filtrar observaciones de importación"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            >
              <option value="">Todas las observaciones</option>
              {[...new Set(report.issues.map((i) => i.code))].map((value) => (
                <option key={value} value={value}>
                  {labels[value] ?? 'Revisión de datos históricos'}
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              onClick={() =>
                downloadCsv('observaciones-importacion.csv', [
                  ['Registro', 'Referencia original', 'Observación'],
                  ...rows.map((i) => [
                    sources[i.source] ?? 'Registro',
                    i.source_id,
                    labels[i.code] ?? 'Revisión de datos históricos',
                  ]),
                ])
              }
            >
              Exportar observaciones
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Registro</th>
                  <th>Referencia original</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((issue) => (
                  <tr key={issue.id}>
                    <td>{sources[issue.source] ?? 'Registro'}</td>
                    <td>{issue.source_id}</td>
                    <td>{labels[issue.code] ?? 'Revisión de datos históricos'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha registrada</th>
                <th>Actividad</th>
                <th>Detalle original</th>
              </tr>
            </thead>
            <tbody>
              {report.activity.map((item) => (
                <tr key={item.id}>
                  <td>{item.time || 'Sin fecha'}</td>
                  <td>{item.text}</td>
                  <td>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
