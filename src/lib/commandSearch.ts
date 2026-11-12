import type { RetailData } from './contracts';
import { categoryName, matches } from './format';
import { getVariantBarcodes } from './barcode';

export type CommandResult = { id: string; label: string; detail: string; to: string; kind: 'action' | 'page' | 'product' | 'contact' | 'document' };

/** Results come only from the current authorized bootstrap and granted navigation. */
export function commandResults(data: RetailData, query: string): CommandResult[] {
  const p = data.permissions;
  const commerce = p.sell || p.manage_business;
  const pages: CommandResult[] = [
    { id: 'summary', label: 'Resumen', detail: 'Abrir sección', to: '/', kind: 'page' },
    { id: 'inventory', label: 'Inventario', detail: 'Existencias y catálogo', to: '/inventario', kind: 'page' },
  ];
  const add = (allowed: boolean, id: string, label: string, to: string, detail = 'Abrir sección', kind: CommandResult['kind'] = 'page') => {
    if (allowed) pages.push({ id, label, detail, to, kind });
  };
  add(p.sell, 'new-sale', 'Nueva venta', '/ventas?nuevo=1', 'Cliente, productos y cobro', 'action');
  add(p.manage_catalog, 'new-product', 'Agregar producto', '/inventario?nuevo=1', 'Crear producto y variantes', 'action');
  add(p.purchase, 'new-purchase', 'Nueva compra', '/compras?nuevo=1', 'Ordenar y recibir mercancía', 'action');
  add(commerce, 'sales', 'Ventas', '/ventas');
  add(p.purchase, 'purchases', 'Compras', '/compras');
  add(commerce, 'customers', 'Clientes', '/clientes');
  add(p.purchase, 'suppliers', 'Proveedores', '/proveedores');
  add(commerce, 'quotes', 'Cotizaciones', '/cotizaciones');
  add(commerce, 'after-sales', 'Posventa', '/posventa');
  add(commerce || p.purchase, 'deliveries', 'Entregas', '/entregas');
  add(commerce, 'promotions', 'Promociones', '/promociones');
  add(p.manage_business, 'reports', 'Reportes', '/reportes');
  add(p.view_audit, 'audit', 'Auditoría', '/auditoria');
  add(p.manage_business, 'settings', 'Configuración', '/configuracion');
  if (!query.trim()) return pages.slice(0, 12);
  const results = pages.filter((item) => matches(query, item.label, item.detail));
  const products = new Map(data.products.filter((product) => product.active).map((product) => [product.id, product]));
  const variants = data.variants.filter((variant) => {
    const product = products.get(variant.product_id);
    return variant.active && product && matches(query, product.brand, product.model, product.category, variant.name, variant.sku, ...getVariantBarcodes(variant));
  }).slice(0, 8);
  for (const variant of variants) {
    const product = products.get(variant.product_id)!;
    results.push({ id: `product-${variant.id}`, label: `${product.brand} ${product.model} · ${variant.name}`, detail: `${variant.sku} · ${categoryName(product.category)}`, to: `/inventario?variante=${encodeURIComponent(variant.id)}`, kind: 'product' });
  }
  for (const contact of data.contacts.filter((contact) => contact.active && (contact.kind === 'customer' ? commerce : p.purchase) && matches(query, contact.name, contact.email, contact.phone, contact.tax_id)).slice(0, 5)) {
    results.push({ id: `contact-${contact.id}`, label: contact.name, detail: contact.kind === 'customer' ? 'Cliente' : 'Proveedor', to: `/${contact.kind === 'customer' ? 'clientes' : 'proveedores'}?contacto=${encodeURIComponent(contact.id)}`, kind: 'contact' });
  }
  for (const doc of [...data.documents].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((document) => (document.type === 'purchase' ? p.purchase : commerce) && matches(query, document.number, typeof document.contact_snapshot.name === 'string' ? document.contact_snapshot.name : '')).slice(0, 6)) {
    const routes = { sale: 'ventas', purchase: 'compras', quote: 'cotizaciones', return: 'posventa' };
    results.push({ id: `document-${doc.id}`, label: doc.number, detail: typeof doc.contact_snapshot.name === 'string' ? doc.contact_snapshot.name : 'Documento', to: `/${routes[doc.type]}?documento=${encodeURIComponent(doc.id)}`, kind: 'document' });
  }
  return results.slice(0, 24);
}
