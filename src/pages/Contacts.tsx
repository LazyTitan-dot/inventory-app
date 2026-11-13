import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownToLine, Archive, Building2, Check, ChevronRight, MapPin, MessageCircle, Pencil, Plus, Star, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Contact, CustomerAddress } from '../lib/contracts';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import { dateTime, documentNumber, downloadCsv, matches, money } from '../lib/format';
import { WhatsAppComposer } from '../components/WhatsAppComposer';
import { buildContactWhatsAppMessage } from '../lib/whatsapp';
import { CustomerIdScan } from '../components/CustomerIdScan';
import { scannedHome, legacyHome, hasHomeAddress } from '../lib/customerHomeAddress';
import { AddressFields } from '../components/AddressFields';
import { addressComparisonKey, addressMapsUrl, addressText, addressValidation, emptyAddress } from '../lib/addresses';
import './contacts.css';
import {
  EmptyState,
  ErrorNotice,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  StatusBadge,
} from '../components/ui';

function ContactEditor({
  kind,
  contact,
  onClose,
}: {
  kind: Contact['kind'];
  contact?: Contact;
  onClose: () => void;
}) {
  const { notify, data } = useRetail();
  const { run, busy, error } = useOperation();
  const newCustomer = kind === 'customer' && !contact && (data.features ?? []).includes('customer_addresses_v1');
  const [home,setHome] = useState(emptyAddress());
  const [validation,setValidation] = useState('');
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    tax_id: contact?.tax_id ?? '',
    address: contact?.address ?? '',
    notes: contact?.notes ?? '',
  });
  const duplicate = data.contacts.find(
    (c) =>
      c.id !== contact?.id &&
      c.kind === kind &&
      c.active &&
      ((form.email && c.email?.toLowerCase() === form.email.toLowerCase().trim()) ||
        (form.tax_id && c.tax_id === form.tax_id.trim())),
  );
  function field(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const hasHome = newCustomer && hasHomeAddress(home);
    const invalid = hasHome ? addressValidation(home) : '';
    if(invalid){setValidation(invalid);return;}
    setValidation('');
    try {
      await run('save_contact', {
        ...form,
        ...(hasHome ? {address:addressText(home), initial_home_address:Object.fromEntries(Object.entries(home).map(([k,v])=>[k,v.trim()]))} : {}),
        id: contact?.id,
        ...(contact ? { expected_updated_at: contact.updated_at } : {}),
        kind,
        name: form.name.trim(),
        email: form.email.trim(),
        tax_id: form.tax_id.trim(),
      });
      notify(
        `${kind === 'customer' ? 'Cliente' : 'Proveedor'} ${contact ? 'actualizado' : 'creado'}.`,
      );
      onClose();
    } catch {
      /* Conservar formulario. */
    }
  }
  return (
    <Modal
      className={kind === "customer" ? "customer-editor-view" : undefined}
      title={`${contact ? 'Editar' : 'Agregar'} ${kind === 'customer' ? 'cliente' : 'proveedor'}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="stack" onSubmit={save}>
        <div className={kind === "customer" ? "customer-form-section" : "stack"}>
        {kind === "customer" && <h3>Identificación y contacto</h3>}
        {kind === "customer" && !contact && <CustomerIdScan disabled={busy} onApply={(scan) => {
          const id = scan.ced.replace(/\D/g, "");
          const address = [scan.address, scan.sector, scan.municipio].filter(Boolean).join(", ");
          if(newCustomer) setHome(previous => {const next=scannedHome(scan.address,scan.sector,scan.municipio,previous.phone||form.phone);return {...previous,...next,reference:previous.reference};});
          setForm(previous => ({ ...previous, ...(id.length === 11 ? {tax_id:id} : {}), ...(scan.full.trim() ? {name:scan.full.trim()} : {}), ...(address ? {address} : {}) }));
        }} />}
        <Field
          label={kind === 'customer' ? 'Nombre completo o razón social' : 'Nombre del proveedor'}
        >
          <input
            required
            minLength={2}
            maxLength={160}
            value={form.name}
            onChange={(e) => field('name', e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Teléfono">
            <input
              type="tel"
              maxLength={30}
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => {field('phone', e.target.value);if(newCustomer)setHome(previous=>({...previous,phone:!previous.phone||previous.phone===form.phone?e.target.value:previous.phone}));}}
            />
          </Field>
          <Field label="Correo electrónico">
            <input
              type="email"
              maxLength={254}
              value={form.email}
              onChange={(e) => field('email', e.target.value)}
            />
          </Field>
        </div>
        <Field label="RNC o cédula" hint="Opcional. Escribe la identificación sin guiones.">
          <input
            inputMode="numeric"
            pattern="[0-9]{9}|[0-9]{11}"
            maxLength={11}
            value={form.tax_id}
            onChange={(e) => field('tax_id', e.target.value.replace(/[-\s]/g, ''))}
          />
        </Field>
        </div>
        {newCustomer ? <section className="customer-address-form stack" aria-label="Dirección de entrega inicial">
          <h3>Dirección de entrega · Casa</h3>
          <p className="muted">Se guardará como primera dirección preferida. Confirma que corresponde al destino de entrega; puedes dejarla vacía para una compra sin entrega.</p>
          <AddressFields value={home} onChange={setHome} disabled={busy} required={hasHomeAddress(home)} autoMunicipality />
        </section> : <Field label="Dirección">
          <textarea
            maxLength={600}
            value={form.address}
            onChange={(e) => field('address', e.target.value)}
            placeholder="Calle, número, sector, ciudad y referencia"
          />
        </Field>}
        <div className={kind === "customer" ? "customer-form-section" : "stack"}>
        {kind === "customer" && <h3>Información adicional</h3>}
        <Field label="Notas internas">
          <textarea
            maxLength={2000}
            value={form.notes}
            onChange={(e) => field('notes', e.target.value)}
            placeholder={
              kind === 'supplier'
                ? 'Contacto, condiciones de pago o instrucciones de compra'
                : 'Preferencias o información útil para atenderle'
            }
          />
        </Field>
        </div>
        {duplicate && (
          <div className="warning-notice">
            Ya existe un registro con estos datos: <strong>{duplicate.name}</strong>. Comprueba que
            no sea la misma persona o empresa.
          </div>
        )}
        <ErrorNotice message={validation || error} />
        <div className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddressBook({
  contact,
  permitted,
  onBusyChange,
}: {
  contact: Contact;
  permitted: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { data, notify } = useRetail();
  const { run, busy, error, clearError } = useOperation();
  const [editing, setEditing] = useState<CustomerAddress | 'new' | null>(null);
  const [form, setForm] = useState(emptyAddress());
  const [label, setLabel] = useState('');
  const [preferred, setPreferred] = useState(false);
  const [validation, setValidation] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<CustomerAddress | null>(null);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const addresses = (data.customer_addresses ?? [])
    .filter((address) => address.contact_id === contact.id)
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.label.localeCompare(b.label, 'es'));
  const active = addresses.filter((address) => address.active);
  const canEdit = permitted && contact.active;
  const latest = editing && editing !== 'new'
    ? addresses.find((address) => address.id === editing.id)
    : undefined;
  const stale = editing && editing !== 'new' && (!latest || latest.updated_at !== editing.updated_at);
  const duplicate = active.find((address) => address.id !== (editing !== 'new' ? editing?.id : undefined)
    && addressComparisonKey(address) === addressComparisonKey(form));

  function begin(address?: CustomerAddress) {
    clearError();
    setValidation('');
    setArchiveTarget(null);
    setEditing(address ?? 'new');
    const first = !address && addresses.length===0;
    setForm(address ? emptyAddress(address) : first && contact.address ? legacyHome(contact.address,contact.phone??'') : emptyAddress({phone:contact.phone??''}));
    setLabel(address?.label ?? (first ? 'Casa' : ''));
    setPreferred(address?.is_default ?? active.length === 0);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !editing || busy) return;
    clearError();
    const invalid = addressValidation(form);
    if (invalid || !label.trim()) {
      setValidation(invalid || 'Escribe una etiqueta para reconocer la dirección.');
      return;
    }
    if (stale) {
      setValidation('Esta dirección cambió mientras la editabas. Cierra el formulario y vuelve a abrirla para revisar los datos actuales.');
      return;
    }
    if (duplicate) {
      setValidation(`Esta dirección ya está guardada como «${duplicate.label}». Usa la dirección existente o modifica los datos.`);
      return;
    }
    try {
      await run('save_customer_address', {
        contact_id: contact.id,
        ...(editing !== 'new' ? { id: editing.id, expected_updated_at: editing.updated_at } : {}),
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
        label: label.trim(),
        is_default: preferred,
      });
      setEditing(null);
      setValidation('');
      notify(editing === 'new' ? 'Dirección guardada en el perfil del cliente.' : 'Dirección actualizada. Las entregas anteriores conservan su destino.');
    } catch { /* Keep the draft and server conflict message visible. */ }
  }
  async function makePreferred(address: CustomerAddress) {
    if (!canEdit || busy) return;
    setValidation('');
    try {
      await run('set_default_address', { id: address.id, expected_updated_at: address.updated_at });
      notify('Dirección preferida actualizada para las próximas entregas.');
    } catch { /* Preserve the current list on conflict. */ }
  }
  async function archive() {
    if (!archiveTarget || !canEdit || busy) return;
    try {
      await run('archive_customer_address', {
        id: archiveTarget.id,
        expected_updated_at: archiveTarget.updated_at,
        active: !archiveTarget.active,
      });
      notify(archiveTarget.active ? 'Dirección archivada. Las entregas anteriores se conservan.' : 'Dirección reactivada.');
      setArchiveTarget(null);
    } catch { /* Preserve confirmation to show the server message. */ }
  }
  return (
    <section className="customer-address-book" aria-labelledby="customer-addresses-title">
      <div className="contacts-section-heading">
        <div>
          <h3 id="customer-addresses-title">Direcciones de entrega</h3>
          <p>La preferida se propone al programar. Cada entrega conserva su propia copia.</p>
        </div>
        {canEdit && !editing && <button type="button" className="button secondary" disabled={busy} onClick={() => begin()}>
          <Plus size={16} /> Agregar dirección
        </button>}
      </div>
      {addresses.some((address) => !address.active) && <label className="contacts-checkbox">
        <input type="checkbox" checked={showArchived} disabled={busy} onChange={(event) => setShowArchived(event.target.checked)} />
        Mostrar direcciones archivadas
      </label>}
      <div className="customer-address-list">
        {addresses.filter((address) => showArchived || address.active).map((address) => {
          const mapUrl = addressMapsUrl(address);
          return <article className={`customer-address-card ${!address.active ? 'archived' : ''}`} key={address.id}>
            <div className="customer-address-heading">
              <span className="customer-address-icon"><MapPin size={19} /></span>
              <div><strong>{address.label}</strong>
                <div className="customer-address-badges">
                  {address.is_default && address.active && <span className="badge success"><Star size={12} /> Preferida</span>}
                  {!address.active && <span className="badge">Archivada</span>}
                </div>
              </div>
            </div>
            <p>{addressText(address)}</p>
            <p className="muted">{address.phone}</p>
            {address.reference && <p className="customer-address-reference">{address.reference}</p>}
            <div className="toolbar">
              {mapUrl && <a className="button ghost" href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin size={15} /> Ver en Maps</a>}
              {canEdit && address.active && <>
                <button type="button" className="button ghost" disabled={busy || editing !== null} onClick={() => begin(address)}><Pencil size={15} /> Editar</button>
                {!address.is_default && <button type="button" className="button ghost" disabled={busy || editing !== null} onClick={() => void makePreferred(address)}><Star size={15} /> Preferir</button>}
              </>}
              {canEdit && <button type="button" className="button ghost" disabled={busy || editing !== null} onClick={() => { clearError(); setArchiveTarget(address); }}>
                <Archive size={15} /> {address.active ? 'Archivar' : 'Reactivar'}
              </button>}
            </div>
          </article>;
        })}
      </div>
      {!addresses.length && !editing && <div className="contacts-empty-address">
        <MapPin size={25} /><strong>Sin direcciones guardadas</strong>
        <p>Agrega casa, trabajo u otro destino para seleccionarlo en futuras entregas.</p>
      </div>}
      {archiveTarget && <div className="contacts-inline-confirm" role="group" aria-label="Confirmar cambio de dirección">
        <p>{archiveTarget.active ? `¿Archivar «${archiveTarget.label}»? Dejará de ofrecerse en nuevas entregas. El historial se conserva.` : `¿Reactivar «${archiveTarget.label}» para próximas entregas?`}</p>
        <div className="toolbar"><button type="button" className="button secondary" disabled={busy} onClick={() => setArchiveTarget(null)}>Volver</button>
          <button type="button" className="button primary" disabled={busy} onClick={() => void archive()}>{busy ? 'Guardando…' : 'Confirmar'}</button></div>
      </div>}
      {editing && <form className="customer-address-form stack" onSubmit={save}>
        <h3>{editing === 'new' ? 'Nueva dirección' : `Editar ${editing.label}`}</h3>
        <fieldset className="contacts-fieldset stack" disabled={busy}>
          <Field label="Etiqueta de la dirección" hint="Por ejemplo: Casa, trabajo u oficina.">
            <input required maxLength={45} value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
          </Field>
          <AddressFields value={form} onChange={setForm} disabled={busy} />
          <label className="contacts-checkbox"><input type="checkbox" checked={preferred} onChange={(event) => setPreferred(event.target.checked)} /> Usar como dirección preferida</label>
        </fieldset>
        {stale && <div className="warning-notice">La dirección fue actualizada por otra sesión. Revisa la versión actual antes de guardar.</div>}
        {duplicate && <p className="muted">Coincide con la dirección guardada «{duplicate.label}».</p>}
        <ErrorNotice message={validation} />
        <div className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={() => { setEditing(null); clearError(); setValidation(''); }}>Cancelar</button>
          <button className="button primary" disabled={busy || Boolean(stale)}><Check size={16} /> {busy ? 'Guardando…' : 'Guardar dirección'}</button></div>
      </form>}
      <ErrorNotice message={error} />
    </section>
  );
}

export function ContactsPage({ kind }: { kind: Contact['kind'] }) {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState<Contact | 'new' | null>(null);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Contact | null>(null);
  const [whatsAppContactId, setWhatsAppContactId] = useState<string | null>(null);
  const permitted = kind === 'customer' ? data.permissions.sell : data.permissions.purchase;
  const addressFeature = kind === 'customer' && (data.features ?? []).includes('customer_addresses_v1');
  const detailId = params.get('contacto') || localDetailId;
  const detail = data.contacts.find((contact) => contact.id === detailId && contact.kind === kind);
  const savedAddresses = kind === 'customer' ? (data.customer_addresses ?? []) : [];
  const addressesFor = (id: string) => savedAddresses.filter((address) => address.contact_id === id && address.active);
  const preferredFor = (id: string) => {
    const addresses = addressesFor(id);
    return addresses.find((address) => address.is_default) ?? addresses[0];
  };
  const whatsAppContact = kind === 'customer' && permitted
    ? data.contacts.find((contact) => contact.id === whatsAppContactId && contact.kind === 'customer')
    : undefined;
  const rows = data.contacts.filter((contact) => contact.kind === kind && contact.active !== archived &&
    (matches(query, contact.name, contact.email, contact.phone, contact.tax_id, contact.address)
      || addressesFor(contact.id).some((address) => matches(query, address.label, addressText(address), address.phone))))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const documents = detail ? data.documents.filter((document) => document.contact_id === detail.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  function openDetail(id: string) {
    setLocalDetailId(id);
    const next = new URLSearchParams(params); next.set('contacto', id); setParams(next, { replace: true });
  }
  function closeDetail() {
    if (addressBusy) return;
    setLocalDetailId(null);
    const next = new URLSearchParams(params); next.delete('contacto'); setParams(next, { replace: true });
  }
  async function archive() {
    if (!archiveTarget) return;
    try {
      await run('archive_contact', { id: archiveTarget.id, active: !archiveTarget.active, expected_updated_at: archiveTarget.updated_at });
      notify(archiveTarget.active ? 'Registro archivado. El historial se conserva.' : 'Registro reactivado.');
      setArchiveTarget(null); closeDetail();
    } catch { /* Display the server error in the confirmation. */ }
  }
  return <div className={kind === "customer" ? "customer-workspace" : undefined}>
    <PageHeader eyebrow="RELACIONES DEL NEGOCIO" title={kind === 'customer' ? 'Clientes y direcciones' : 'Proveedores'}
      description={kind === 'customer' ? 'Conoce a tus clientes y guarda sus destinos habituales para la próxima entrega.' : 'Contactos, condiciones e historial de tus aliados comerciales.'}
      actions={<>
        <button className="button secondary" onClick={() => downloadCsv(`${kind === 'customer' ? 'clientes' : 'proveedores'}.csv`, [
          ['Nombre', 'Teléfono', 'Correo', 'RNC / Cédula', 'Dirección preferida', 'Direcciones guardadas'],
          ...rows.map((contact) => [contact.name, contact.phone, contact.email, contact.tax_id, preferredFor(contact.id) ? addressText(preferredFor(contact.id)!) : contact.address, addressesFor(contact.id).length]),
        ])}><ArrowDownToLine size={17} /> Exportar</button>
        {permitted && <button className="button primary" onClick={() => setEditor('new')}><Plus size={18} /> {kind === 'customer' ? 'Agregar cliente' : 'Agregar proveedor'}</button>}
      </>} />
    <section className="panel contacts-directory">
      <div className="toolbar table-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder={kind === 'customer' ? 'Buscar cliente, teléfono, dirección o identificación…' : 'Buscar por nombre, contacto o identificación…'} />
        <select aria-label="Estado de los contactos" value={archived ? 'archived' : 'active'} onChange={(event) => setArchived(event.target.value === 'archived')}>
          <option value="active">Activos</option><option value="archived">Archivados</option>
        </select>
      </div>
      <div className="table-meta">{rows.length} {kind === 'customer' ? 'clientes' : 'proveedores'}</div>
      {!rows.length ? <EmptyState
        title={query ? 'No encontramos coincidencias' : `Aún no hay ${kind === 'customer' ? 'clientes' : 'proveedores'} ${archived ? 'archivados' : 'registrados'}`}
        description={query ? 'Busca por otro nombre, teléfono o dirección.' : 'Agrega tus contactos para vincularlos con sus operaciones.'} />
        : kind === 'customer' ? <div className="customer-directory-list">{rows.map((contact) => {
          const preferred = preferredFor(contact.id); const count = addressesFor(contact.id).length;
          return <article className="customer-directory-card" key={contact.id}>
            <button className="customer-profile-trigger" onClick={() => openDetail(contact.id)}>
              <span className="contact-avatar"><UserRound size={21} /></span>
              <span className="customer-list-copy"><strong>{contact.name}</strong><small>{contact.phone || contact.email || 'Sin contacto registrado'}</small>
                <small>{count ? `${count} ${count === 1 ? 'dirección guardada' : 'direcciones guardadas'}` : 'Sin direcciones guardadas'}{preferred ? ` · ${preferred.label}` : ''}</small>
                {(preferred || contact.address) && <span className="customer-preferred-address"><MapPin size={13} /> {preferred ? addressText(preferred) : contact.address}</span>}
              </span>
              <ChevronRight className="customer-list-chevron" size={19} aria-hidden="true" />
            </button>
            <div className="customer-directory-actions"><button className="button secondary customer-open-profile" onClick={() => openDetail(contact.id)}>Ver perfil</button>
              {permitted && <button className="button ghost" aria-label={`Escribir a ${contact.name} por WhatsApp`} onClick={() => setWhatsAppContactId(contact.id)}><MessageCircle size={17} /> WhatsApp</button>}
            </div>
          </article>;
        })}</div>
          : <div className="table-wrap"><table className="data-table"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Identificación</th><th>Dirección</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
            {rows.map((contact) => <tr key={contact.id}>
              <td><button className="product-cell" onClick={() => openDetail(contact.id)}><span className="contact-avatar"><Building2 size={20} /></span><strong>{contact.name}</strong></button></td>
              <td>{contact.phone || 'Sin teléfono'}<small>{contact.email || 'Sin correo'}</small></td><td>{contact.tax_id || '—'}</td>
              <td className="truncate-cell">{contact.address || '—'}</td><td>{permitted && <button className="button ghost" onClick={() => setEditor(contact)}>Editar</button>}</td>
            </tr>)}
          </tbody></table></div>}
    </section>
    {editor && <ContactEditor key={editor === 'new' ? 'new' : editor.id} kind={kind} contact={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    {detail && !whatsAppContact && !editor && !archiveTarget && <Modal title={detail.name} onClose={closeDetail} wide variant={kind === 'customer' ? 'drawer' : undefined} className={kind === 'customer' ? 'customer-profile-view' : undefined} backLabel={kind === 'customer' ? 'Clientes' : undefined}>
      <div className="contact-profile-content">
        <div className="customer-profile-summary"><span className="contact-avatar"><UserRound size={25} /></span><div>
          <span className="eyebrow">{kind === 'customer' ? 'PERFIL DEL CLIENTE' : 'PROVEEDOR'}</span>
          <p>{detail.phone || 'Sin teléfono'} · {detail.email || 'Sin correo'}</p>
          {detail.tax_id && <small>RNC / Cédula: {detail.tax_id}</small>}
        </div></div>
        {detail.address && <p className="muted"><MapPin size={15} /> {detail.address}</p>}
        {detail.notes && <p className="note-box">{detail.notes}</p>}
        {!detail.active && <div className="warning-notice">Este contacto está archivado. Reactívalo para nuevas operaciones.</div>}
        <div className="toolbar contact-profile-actions">
          {kind === 'customer' && permitted && <button className="button secondary" disabled={addressBusy} onClick={() => setWhatsAppContactId(detail.id)}><MessageCircle size={17} /> WhatsApp</button>}
          {permitted && detail.active && <Link className={`button primary ${addressBusy ? 'contacts-disabled-link' : ''}`} aria-disabled={addressBusy} onClick={(event) => { if (addressBusy) event.preventDefault(); }} to={`/${kind === 'customer' ? 'ventas' : 'compras'}?contacto=${detail.id}&nuevo=1`}>{kind === 'customer' ? 'Nueva venta' : 'Nueva compra'}</Link>}
          {permitted && <button className="button secondary" disabled={addressBusy} onClick={() => setEditor(detail)}><Pencil size={15} /> Editar datos</button>}
          {permitted && <button className="button ghost" disabled={addressBusy} onClick={() => setArchiveTarget(detail)}><Archive size={15} /> {detail.active ? 'Archivar' : 'Reactivar'}</button>}
        </div>
        {kind === 'customer' && addressFeature && <AddressBook key={detail.id} contact={detail} permitted={permitted} onBusyChange={setAddressBusy} />}
        <section className="contact-history"><div className="contacts-section-heading"><div><h3>Historial de operaciones</h3><p>Documentos registrados para este contacto.</p></div><span className="badge">{documents.length}</span></div>
          {documents.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Documento</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}>
            <td data-label="Documento"><Link to={`/${document.type === 'purchase' ? 'compras' : document.type === 'quote' ? 'cotizaciones' : document.type === 'return' ? 'posventa' : 'ventas'}?documento=${document.id}`}>{documentNumber(document)}</Link></td>
            <td data-label="Fecha">{dateTime(document.created_at)}</td><td data-label="Estado"><StatusBadge status={document.status} /></td><td data-label="Total">{money(document.total)}</td>
          </tr>)}</tbody></table></div> : <EmptyState title="Sin operaciones todavía" description="Las compras y ventas de este contacto aparecerán aquí." />}
        </section>
      </div>
    </Modal>}
    {archiveTarget && <Modal title={`${archiveTarget.active ? 'Archivar' : 'Reactivar'} contacto`} onClose={() => { if (!busy) setArchiveTarget(null); }}>
      <p>{archiveTarget.active ? 'El contacto dejará de aparecer en nuevas operaciones. Sus direcciones y documentos históricos se conservarán.' : 'El contacto volverá a estar disponible para nuevas operaciones.'}</p>
      <ErrorNotice message={error} /><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setArchiveTarget(null)}>Volver</button>
        <button className="button primary" disabled={busy} onClick={() => void archive()}>{busy ? 'Guardando…' : 'Confirmar'}</button></div>
    </Modal>}
    {whatsAppContact?.kind === 'customer' && kind === 'customer' && permitted && <WhatsAppComposer title="Mensaje al cliente por WhatsApp" contactName={whatsAppContact.name} phone={whatsAppContact.phone ?? ''}
      message={buildContactWhatsAppMessage({ contact: whatsAppContact, businessName: data.settings.business_name })} onClose={() => setWhatsAppContactId(null)} />}
  </div>;
}
