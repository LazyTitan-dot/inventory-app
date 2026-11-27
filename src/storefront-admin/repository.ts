import { z } from 'zod';
import { visible, type AdminState } from './presentation';
import type { RetailData } from '../lib/contracts';
import { categoryName } from '../lib/format';
const id = z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = z.string();
const variant = z.object({
  id,
  name: text,
  base: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  stock: z.number().int().nonnegative(),
  active: z.boolean(),
  visible: z.boolean(),
});
const media = z.object({
  id,
  asset: text.regex(/^storage:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:jpg|jpeg|png|webp)$/),
  approved: z.boolean(),
});
const product = z.object({
  id,
  brand: text,
  model: text,
  category: text,
  slug: text,
  variants: z.array(variant),
  media: z.array(media),
  published: z.boolean(),
  featured: z.boolean(),
  showOut: z.boolean(),
  active: z.boolean(),
  order: z.number().int(),
});
const banner = z.object({
  id,
  title: text,
  subtitle: text,
  slot: z.enum(['Principal', 'Franja superior']),
  active: z.boolean(),
  start: day,
  end: day,
  target: z.string(),
  asset: z.string(),
});
const promo = z.object({
  id,
  title: text,
  code: z
    .string()
    .nullable()
    .transform((v) => v ?? ''),
  kind: text,
  value: z.number(),
  start: day,
  end: day,
  scope: text,
  scopeLabel: text.nullable().optional(),
  scopeAvailable: z.boolean().optional(),
  active: z.boolean(),
  web: z.boolean(),
});
const audit = z.object({
  revision: z.number().int().nonnegative(),
  actor: id,
  action: text,
  target: text,
  at: text,
});
const state = z.object({
  taxBasisPoints: z.number().int().min(0).max(10000),
  asOf: day,
  revision: z.number().int().nonnegative(),
  audit: z.array(audit),
  data: z.object({
    products: z.array(product),
    banners: z.array(banner),
    promos: z.array(promo),
    bannerAssets: z.array(z.object({ id, asset: text })).optional(),
  }),
});
export function decodeAdminState(
  value: unknown,
  retail: Pick<RetailData, 'products' | 'promotions'>,
): AdminState {
  const snapshot = state.parse(value);
  const categories = new Map(retail.products.map((p) => [p.id, p.category]));
  const rules = new Map(retail.promotions.map((p) => [p.id, p]));
  const published = snapshot.data.products.filter(visible);
  for (const promo of snapshot.data.promos) {
    const rule = rules.get(promo.id);
    if (promo.scope !== 'multiple' || !rule) continue;
    const categoriesMatch = (p: (typeof published)[number]) =>
      !rule.category || categories.get(p.id) === rule.category;
    const ids = new Set(rule.product_ids);
    promo.scopeAvailable = published.some(
      (p) => categoriesMatch(p) && (!ids.size || ids.has(p.id)),
    );
    promo.scopeLabel = [
      rule.category && categoryName(rule.category),
      ids.size ? ids.size + (ids.size === 1 ? ' producto' : ' productos') : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return snapshot;
}
