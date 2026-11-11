import type { RetailDocument } from './contracts';

export const BUSINESS_TIMEZONE = 'America/Santo_Domingo';
const moneyFormatter = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
});
export const money = (value: number) => moneyFormatter.format(value).replace(/^\$/, 'RD$');
export const integer = (value: number) =>
  new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(value);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('es-DO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: BUSINESS_TIMEZONE,
  }).format(new Date(value));
export const shortDate = (value: string) =>
  new Intl.DateTimeFormat('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIMEZONE,
  }).format(new Date(value));
export function businessDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  }).formatToParts(value);
  return `${parts.find((x) => x.type === 'year')?.value}-${parts.find((x) => x.type === 'month')?.value}-${parts.find((x) => x.type === 'day')?.value}`;
}
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();
export const matches = (query: string, ...fields: (string | null | undefined)[]) =>
  normalize(fields.filter(Boolean).join(' ')).includes(normalize(query));
export const documentNumber = (document: Pick<RetailDocument, 'type' | 'number'>) =>
  document.number;
export const statusLabels: Record<string, string> = {
  legacy_pending: 'Pendiente de confirmar (legado)',
  draft: 'Borrador',
  completed: 'Completada',
  partially_returned: 'Devolución parcial',
  returned: 'Devuelta',
  voided: 'Anulada',
  pending: 'Pendiente',
  partial: 'Recibida parcialmente',
  received: 'Recibida',
  closed_short: 'Cerrada con faltantes',
  cancelled: 'Cancelada',
  open: 'Vigente',
  converted: 'Convertida',
  scheduled: 'Programada',
  in_transit: 'En camino',
  delivered: 'Entregada',
  failed: 'No entregada',
};
export const roleLabels = {
  owner: 'Propietario',
  admin: 'Administrador',
  sales: 'Ventas y caja',
  inventory: 'Inventario y compras',
  viewer: 'Consulta',
};
export const paymentLabels: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};
export const categoryLabels: Record<string, string> = {
  tv: 'Televisores',
  refrigerator: 'Neveras',
  washing_machine: 'Lavadoras',
  blender: 'Licuadoras',
  microwave: 'Microondas',
  stove: 'Estufas',
  air_conditioner: 'Aires acondicionados',
  freezer: 'Congeladores',
  dryer: 'Secadoras',
  dishwasher: 'Lavavajillas',
  small_appliance: 'Pequeños electrodomésticos',
  other: 'Otros',
};
export const categoryName = (value: string) => categoryLabels[value] ?? value;

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const escape = (value: string | number | null) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(['\uFEFF', rows.map((row) => row.map(escape).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
