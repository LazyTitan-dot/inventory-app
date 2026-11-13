export const MAX_BARCODE_LENGTH = 80;
export const MAX_BARCODE_ALIASES = 10;

const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const;

export const normalizeBarcode = (value: string) => value.trim();
// Barcode identity uses ASCII folding, matching the database without locale rules.
const barcodeKey = (value: string) => normalizeBarcode(value).replace(/[a-z]/g, (char) => char.toUpperCase());
export interface BarcodeVariant {
  id?: string;
  barcode?: string | null;
  barcode_aliases?: readonly string[];
}

/** Product codes only: unit serials and batch identifiers are not scanner aliases. */
export function getVariantBarcodes(variant: BarcodeVariant): string[] {
  return [variant.barcode ?? '', ...(variant.barcode_aliases ?? [])]
    .map(normalizeBarcode)
    .filter(Boolean);
}

export function barcodeMatches(variant: BarcodeVariant, input: string): boolean {
  const key = barcodeKey(input);
  return Boolean(key) && getVariantBarcodes(variant).some((code) => barcodeKey(code) === key);
}

/** Archived variants reserve their barcodes too; mirror that constraint before submitting. */
export function validateBarcodes(
  drafts: readonly BarcodeVariant[],
  catalog: readonly BarcodeVariant[],
): string | null {
  const seen = new Set<string>();
  for (const draft of drafts) {
    if ((draft.barcode_aliases?.length ?? 0) > MAX_BARCODE_ALIASES)
      return 'Cada variante admite hasta 10 códigos adicionales del fabricante.';
    if (draft.barcode_aliases?.some((code) => !normalizeBarcode(code)))
      return 'Los códigos adicionales del fabricante no pueden estar vacíos.';
    for (const barcode of getVariantBarcodes(draft)) {
      if (
        barcode.length > MAX_BARCODE_LENGTH ||
        Array.from(barcode).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      )
        return 'El código de barras admite hasta 80 caracteres y no puede contener saltos de línea ni caracteres de control.';
      const key = barcodeKey(barcode);
      if (seen.has(key))
        return `El código ${barcode} se repite entre las variantes. Usa un código diferente para cada una.`;
      if (catalog.some((row) => (!draft.id || row.id !== draft.id) && barcodeMatches(row, barcode)))
        return `El código ${barcode} ya pertenece a otra variante, incluso si está archivada.`;
      seen.add(key);
    }
  }
  return null;
}

/** UUID-based internal IDs are not official EAN/UPC codes; uniqueness is also enforced by PostgreSQL. */
export function generateInternalBarcode(seed: string, occupied: Iterable<string> = []): string {
  const token = seed.replaceAll('-', '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(token))
    throw new Error('No se pudo identificar la variante para generar su código.');
  const used = new Set(Array.from(occupied, barcodeKey));
  for (let attempt = 0; attempt <= used.size; attempt++) {
    const candidate = `SL${token}${attempt ? `-${attempt + 1}` : ''}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('No se pudo generar un código disponible.');
}

export function code128Symbols(value: string): number[] | null {
  const barcode = normalizeBarcode(value);
  if (!barcode || barcode.length > MAX_BARCODE_LENGTH || !/^[ -~]+$/.test(barcode)) return null;
  const symbols = [104, ...Array.from(barcode, (char) => char.charCodeAt(0) - 32)];
  const checksum = symbols.reduce((sum, code, index) => sum + code * (index || 1), 0) % 103;
  return [...symbols, checksum, 106];
}

/** Quiet zones are included; markup consists only of checked numeric SVG attributes. */
export function barcodeSvg(value: string): string | null {
  const symbols = code128Symbols(value);
  if (!symbols) return null;
  let x = 10;
  const rectangles: string[] = [];
  for (const symbol of symbols) {
    const pattern = CODE128_PATTERNS[symbol]!;
    for (let i = 0; i < pattern.length; i++) {
      const width = Number(pattern[i]);
      if (i % 2 === 0) rectangles.push(`<rect x="${x}" y="0" width="${width}" height="56"/>`);
      x += width;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 56" role="img" aria-label="Código de barras Code 128"><rect width="${x + 10}" height="56" fill="white"/><g fill="black">${rectangles.join('')}</g></svg>`;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

export function printBarcodeLabel({
  barcode,
  sku,
  title,
}: {
  barcode: string;
  sku: string;
  title: string;
}): string | null {
  const svg = barcodeSvg(barcode);
  if (!svg)
    return 'Este código no se puede imprimir en Code 128B. Usa caracteres ASCII visibles, hasta 80 caracteres.';
  const popup = window.open('', '_blank', 'width=650,height=500');
  if (!popup)
    return 'El navegador bloqueó la impresión. Permite las ventanas emergentes e inténtalo de nuevo.';
  popup.opener = null;
  popup.document.write(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiqueta ${escapeHtml(sku)}</title><style>body{font:13px system-ui;color:#000;background:#fff;margin:20px}.label{width:76mm;max-width:100%;padding:5mm;text-align:center;box-sizing:border-box}h1{font-size:13px;margin:0 0 10px;overflow-wrap:anywhere}svg{display:block;width:100%;height:20mm}.code{font:11px monospace;overflow-wrap:anywhere;margin:6px 0}.sku{font-size:11px;overflow-wrap:anywhere}@media print{body{margin:0}@page{margin:3mm}}</style></head><body><article class="label"><h1>${escapeHtml(title)}</h1>${svg}<div class="code">${escapeHtml(barcode)}</div><div class="sku">SKU ${escapeHtml(sku)}</div></article></body></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
  return null;
}

export function downloadBarcodeSvg(barcode: string, sku: string): string | null {
  const svg = barcodeSvg(barcode);
  if (!svg) return 'Este código no puede representarse en Code 128B.';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `etiqueta-${sku.replace(/[^a-zA-Z0-9_-]/g, '-')}.svg`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}
