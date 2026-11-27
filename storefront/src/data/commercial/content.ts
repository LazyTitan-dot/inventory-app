export interface Campaign {
  id: string;
  title: string;
  target: string | null;
  subtitle?: string;
  asset?: string | null;
  slot?: string;
  code?: string;
}
export interface Campaigns {
  banners: Campaign[];
  promos: Campaign[];
}
const pattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function projectCampaigns(value: unknown): Campaigns {
  if (!value || typeof value !== 'object' || !('banners' in value) || !('promos' in value))
    throw Error('Contenido inválido');
  const data = value;
  function valid(items: unknown, banner: boolean): boolean {
    return (
      Array.isArray(items) &&
      items.length <= 10000 &&
      items.every(
        (item) =>
          item &&
          typeof item.title === 'string' &&
          typeof item.id === 'string' &&
          /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(item.id) &&
          (item.target === null ||
            (typeof item.target === 'string' && pattern.test(item.target))) &&
          (banner
            ? typeof item.subtitle === 'string' &&
              ['Principal', 'Franja superior'].includes(item.slot) &&
              (item.asset === null || item.asset === '/api/catalog/v1/banner-media/' + item.id)
            : typeof item.code === 'string'),
      )
    );
  }
  if (!data || !valid(data.banners, true) || !valid(data.promos, false))
    throw Error('Contenido comercial inválido');
  const clean = (x: Campaign) => ({ id: x.id, title: x.title, target: x.target });
  return {
    banners: (data.banners as Campaign[]).map((b) => ({
      ...clean(b),
      slot: b.slot,
      subtitle: b.subtitle,
      asset: b.asset,
    })),
    promos: (data.promos as Campaign[]).map((p) => ({ ...clean(p), code: p.code })),
  };
}
