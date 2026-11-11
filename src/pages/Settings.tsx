import { useState, type FormEvent } from 'react';
import { Plus, Save, ShieldCheck } from 'lucide-react';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import type { Action, RetailData, Role } from '../lib/contracts';
import { dateTime, matches, roleLabels } from '../lib/format';
import { EmptyState, ErrorNotice, Field, Modal, PageHeader, SearchInput } from '../components/ui';
import { LegacyReport } from '../components/LegacyReport';

function MemberEditor({
  member,
  onClose,
}: {
  member?: RetailData['team'][number];
  onClose: () => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [email, setEmail] = useState(member?.email ?? '');
  const [name, setName] = useState(member?.display_name ?? '');
  const [role, setRole] = useState<Role>(member?.role ?? 'sales');
  const [active, setActive] = useState(member?.active ?? true);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await run('set_member_role', {
        email: email.trim(),
        role,
        active,
        display_name: name.trim(),
        ...(member ? { expected_updated_at: member.updated_at } : {}),
      });
      notify('Permisos actualizados. Se aplican en la siguiente operación del usuario.');
      onClose();
    } catch {
      /* Mostrar error sin cerrar. */
    }
  }
  return (
    <Modal
      title={member ? 'Editar permisos' : 'Autorizar una cuenta'}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack" onSubmit={save}>
        <p>
          Asigna acceso a una cuenta registrada y confirmada. Cada operación verifica estos permisos
          en el servidor.
        </p>
        <Field label="Correo de la cuenta">
          <input
            type="email"
            required
            maxLength={254}
            disabled={!!member}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Nombre para mostrar">
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.entries(roleLabels)
              .filter(([r]) => data.profile.role === 'owner' || !['admin', 'owner'].includes(r))
              .map(([r, label]) => (
                <option value={r} key={r}>
                  {label}
                </option>
              ))}
          </select>
        </Field>
        <label className="check-field">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
          Acceso activo al negocio
        </label>
        <ErrorNotice message={error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar permisos'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SettingsPage() {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const [tab, setTab] = useState<'business' | 'team'>('business');
  const [editor, setEditor] = useState<RetailData['team'][number] | 'new' | null>(null);
  const [form, setForm] = useState({
    business_name: data.settings.business_name,
    tax_id: data.settings.tax_id ?? '',
    phone: data.settings.phone ?? '',
    email: data.settings.email ?? '',
    address: data.settings.address ?? '',
    tax_rate: data.settings.tax_rate,
    max_sale_discount_percent: data.settings.max_sale_discount_percent,
    receipt_footer: data.settings.receipt_footer ?? '',
  });
  const [expectedVersion, setExpectedVersion] = useState(data.settings.updated_at);
  function discardChanges() {
    const current = data.settings;
    setForm({
      business_name: current.business_name,
      tax_id: current.tax_id ?? '',
      phone: current.phone ?? '',
      email: current.email ?? '',
      address: current.address ?? '',
      tax_rate: current.tax_rate,
      max_sale_discount_percent: current.max_sale_discount_percent,
      receipt_footer: current.receipt_footer ?? '',
    });
    setExpectedVersion(current.updated_at);
    clearError();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await run('save_settings', { ...form, expected_updated_at: expectedVersion });
      if (typeof result.result.updated_at === 'string')
        setExpectedVersion(result.result.updated_at);
      notify(
        'Configuración del negocio guardada. Los documentos anteriores conservan sus importes.',
      );
    } catch {
      /* Conserva cambios y la versión original para impedir sobrescrituras. */
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="TU NEGOCIO"
        title="Configuración"
        description="Datos comerciales, reglas de venta y acceso del equipo."
      />
      <div className="tabs" role="tablist" aria-label="Configuración">
        <button role="tab" aria-selected={tab === 'business'} onClick={() => setTab('business')}>
          Negocio y ventas
        </button>
        <button role="tab" aria-selected={tab === 'team'} onClick={() => setTab('team')}>
          Equipo y permisos
        </button>
      </div>
      {tab === 'business' ? (
        <form className="panel settings-form stack" onSubmit={save}>
          <div className="section-heading">
            <div>
              <h2>Información comercial</h2>
              <p>Estos datos aparecen en los documentos internos.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Nombre del negocio">
              <input
                required
                maxLength={160}
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              />
            </Field>
            <Field label="RNC">
              <input
                inputMode="numeric"
                maxLength={11}
                value={form.tax_id}
                onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="tel"
                maxLength={30}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Correo">
              <input
                type="email"
                maxLength={254}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Dirección">
            <textarea
              maxLength={600}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="section-heading">
            <div>
              <h2>Reglas comerciales</h2>
              <p>Importes en RD$ · Zona horaria de República Dominicana.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="ITBIS predeterminado (%)"
              hint="Se agrega al precio de catálogo al registrar la operación."
            >
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                required
                value={Number.isFinite(form.tax_rate) ? form.tax_rate : ''}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.valueAsNumber })}
              />
            </Field>
            <Field
              label="Descuento máximo de caja (%)"
              hint="Solo administración puede autorizar descuentos superiores."
            >
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                required
                value={
                  Number.isFinite(form.max_sale_discount_percent)
                    ? form.max_sale_discount_percent
                    : ''
                }
                onChange={(e) =>
                  setForm({ ...form, max_sale_discount_percent: e.target.valueAsNumber })
                }
              />
            </Field>
          </div>
          <Field label="Mensaje al pie del recibo">
            <textarea
              maxLength={500}
              value={form.receipt_footer}
              onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
            />
          </Field>
          <div className="note-box">
            <ShieldCheck size={20} />
            <p>
              Los documentos de esta aplicación son comprobantes internos. La emisión de
              comprobantes fiscales requiere una integración y una configuración fiscal autorizadas.
            </p>
          </div>
          <ErrorNotice message={error} />
          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={discardChanges}
            >
              Descartar cambios y cargar vista actual
            </button>
            <button className="button primary" disabled={busy}>
              <Save size={17} />
              {busy ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </form>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Equipo de trabajo</h2>
              <p>Acceso por función; los cambios se aplican desde el servidor.</p>
            </div>
            <button className="button primary" onClick={() => setEditor('new')}>
              <Plus size={17} /> Autorizar cuenta
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Acceso</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.team.map((member) => (
                  <tr key={member.user_id}>
                    <td>
                      <strong>{member.display_name || member.email}</strong>
                      <small>{member.email}</small>
                    </td>
                    <td>{roleLabels[member.role]}</td>
                    <td>
                      <span className={`badge ${member.active ? 'success' : ''}`}>
                        {member.active ? 'Activo' : 'Suspendido'}
                      </span>
                    </td>
                    <td>
                      {(data.profile.role === 'owner' ||
                        !['owner', 'admin'].includes(member.role)) && (
                        <button className="button ghost" onClick={() => setEditor(member)}>
                          Editar permisos
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="role-guide">
            <h3>Permisos por función</h3>
            <p>
              <strong>Ventas y caja:</strong> clientes, ventas, cotizaciones y entregas.{' '}
              <strong>Inventario y compras:</strong> catálogo, ajustes, proveedores, compras y
              entregas. <strong>Consulta:</strong> catálogo y existencias.{' '}
              <strong>Administración:</strong> operación completa, devoluciones y configuración.
              Solo el propietario administra otros propietarios y administradores.
            </p>
          </div>
        </section>
      )}
      {editor && (
        <MemberEditor
          member={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

const actionLabels: Record<Action | 'legacy_import' | 'qa_cleanup', string> = {
  save_product: 'Producto guardado',
  archive_product: 'Estado del producto',
  save_contact: 'Contacto guardado',
  archive_contact: 'Estado del contacto',
  save_customer_address: 'Dirección del cliente guardada',
  archive_customer_address: 'Dirección del cliente archivada',
  set_default_address: 'Dirección preferida actualizada',
  adjust_stock: 'Ajuste de inventario',
  create_sale: 'Venta registrada',
  create_purchase: 'Compra registrada',
  receive_purchase: 'Mercancía recibida',
  close_purchase_short: 'Compra cerrada con faltantes',
  confirm_purchase_draft: 'Borrador de compra confirmado',
  cancel_purchase: 'Compra cancelada',
  create_quote: 'Cotización creada',
  update_quote: 'Cotización actualizada',
  cancel_quote: 'Cotización cancelada',
  convert_quote: 'Cotización convertida',
  return_sale: 'Devolución registrada',
  void_sale: 'Venta anulada',
  save_delivery: 'Entrega guardada',
  status_delivery: 'Estado de entrega',
  save_promotion: 'Promoción guardada',
  save_settings: 'Configuración actualizada',
  set_member_role: 'Permisos actualizados',
  link_historical_item: 'Artículo del sistema anterior vinculado',
  cancel_legacy_sale: 'Venta anterior cancelada sin mover inventario',
  legacy_import: 'Datos del sistema anterior importados',
  qa_cleanup: 'Limpieza de pruebas',
};
const auditActionLabel = (action: string) =>
  Object.hasOwn(actionLabels, action)
    ? actionLabels[action as keyof typeof actionLabels]
    : 'Operación registrada';
export function AuditPage() {
  const { data } = useRetail();
  const [query, setQuery] = useState('');
  const [showLegacy, setShowLegacy] = useState(false);
  const rows = data.audit.filter((a) => matches(query, auditActionLabel(a.action), a.actor_email));
  return (
    <>
      <PageHeader
        eyebrow="TRAZABILIDAD"
        title="Auditoría"
        description="Un registro de quién hizo cada cambio, cuándo y con qué operación."
        actions={
          <button className="button secondary" onClick={() => setShowLegacy(!showLegacy)}>
            {showLegacy ? 'Ver actividad actual' : 'Ver historial anterior'}
          </button>
        }
      />
      {showLegacy ? (
        <LegacyReport />
      ) : (
        <section className="panel">
          <div className="table-toolbar">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por acción o correo…"
            />
          </div>
          {rows.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Acción</th>
                    <th>Usuario</th>
                    <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{dateTime(row.created_at)}</td>
                      <td>{auditActionLabel(row.action)}</td>
                      <td>{row.actor_email}</td>
                      <td>
                        <code title={row.entity_id ?? ''}>{row.entity_id?.slice(0, 8) ?? '—'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Sin resultados"
              description="Las operaciones autorizadas quedarán registradas aquí."
            />
          )}
        </section>
      )}
    </>
  );
}
