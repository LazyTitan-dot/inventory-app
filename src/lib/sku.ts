export const MAX_SKU_LENGTH = 80;

export interface SkuVariant {
  id?: string;
  sku: string;
}

export const normalizeSku = (sku: string) => sku.trim().toUpperCase();

function segment(value: string, fallback: string, limit: number): string {
  return (
    value
      .normalize('NFKD')
      .replace(/\p{Mark}/gu, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, limit)
      .replace(/-+$/, '') || fallback
  );
}

/** The caller creates and retains one UUID per draft; retries never generate entropy here. */
export function generateSku({
  brand,
  model,
  variant,
  seed,
  occupied = [],
}: {
  brand: string;
  model: string;
  variant: string;
  seed: string;
  occupied?: Iterable<string>;
}): string {
  const token = seed.replaceAll('-', '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(token)) throw new Error('No se pudo identificar la variante.');
  const prefix = [
    segment(brand, 'MARCA', 16),
    segment(model, 'MODELO', 24),
    segment(variant, 'VARIANTE', 16),
  ].join('-');
  const used = new Set(Array.from(occupied, normalizeSku));
  for (let attempt = 1; attempt <= used.size + 1; attempt++) {
    const suffix = `-${token.slice(0, 12)}${attempt === 1 ? '' : `-${attempt}`}`;
    const candidate = `${prefix.slice(0, MAX_SKU_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('No pudimos generar un SKU disponible. Revisa el catálogo.');
}

/** Includes archived catalog rows because the database's unique index also reserves their SKUs. */
export function validateSkus(
  drafts: readonly SkuVariant[],
  catalog: readonly SkuVariant[],
): string | null {
  const used = new Set<string>();
  for (const draft of drafts) {
    const sku = normalizeSku(draft.sku);
    if (!sku) return 'Cada variante necesita un SKU. Puedes generar uno automáticamente.';
    if (sku.length > MAX_SKU_LENGTH) return 'El SKU no puede tener más de 80 caracteres.';
    if (used.has(sku))
      return `El SKU ${sku} se repite en este producto. Usa uno diferente para cada variante.`;
    if (catalog.some((row) => normalizeSku(row.sku) === sku && (!draft.id || row.id !== draft.id)))
      return `El SKU ${sku} ya está registrado en el catálogo. Usa otro o genera uno nuevo.`;
    used.add(sku);
  }
  return null;
}
