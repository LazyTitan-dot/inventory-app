import { validateSnapshot } from '../../../../../src/data/commercial/repository';
import { projectCampaigns } from '../../../../../src/data/commercial/content';

import { catalogOrigin } from '../../../../../src/server/catalog-origin';
const prefix = '/api/catalog/v1/';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers });
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
async function read(request: Request) {
  const url = new URL(request.url);
  if (url.href.length > 4096) return error('Solicitud inválida', 400);
  const path = url.pathname.slice(prefix.length);
  if (
    !url.pathname.startsWith(prefix) ||
    !/^(?:products(?:\/[a-zA-Z0-9_-]{1,120})?|content|featured|brands|categories|(?:media|banner-media)\/[a-z0-9-]+)$/.test(
      path,
    )
  )
    return error('No encontrado', 404);
  const [kind, id] = path.split('/');
  const media = kind === 'media' || kind === 'banner-media';
  if (media && !uuid.test(id ?? '')) return error('No encontrado', 404);
  try {
    const upstream = await fetch(catalogOrigin + path + url.search, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    if (upstream.status === 404) return error('No encontrado', 404);
    if (upstream.status === 400) return error('Filtro inválido', 400);
    if (upstream.status !== 200) throw Error('Servicio no disponible');
    const mime = upstream.headers.get('Content-Type')?.split(';')[0];
    if (media) {
      if (!mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !upstream.body)
        throw Error('Medio inválido');
      return new Response(upstream.body, { headers: { ...headers, 'Content-Type': mime } });
    }
    if (mime !== 'application/json') throw Error('Respuesta inválida');
    const data = await upstream.json();
    if (kind === 'content') return Response.json(projectCampaigns(data), { headers });
    // Edge v2 uses this historical discriminator for its live database projection.
    if (data?.mode !== 'commercial-fixture') throw Error('Contrato desconocido');
    if (kind === 'categories' || kind === 'brands') {
      const list = data[kind];
      if (!Array.isArray(list) || !list.every((v) => typeof v === 'string'))
        throw Error('Lista inválida');
      return Response.json({ mode: 'commercial', [kind]: list }, { headers });
    }
    if (!Array.isArray(data.products)) throw Error('Productos inválidos');
    const products = data.products.map((p: Record<string, unknown>) => {
      if (p?.source !== 'commercial-fixture') throw Error('Origen inválido');
      return { ...p, source: 'commercial' };
    });
    return Response.json(validateSnapshot({ mode: 'commercial', products }), { headers });
  } catch {
    return error('Catálogo comercial no disponible', 503);
  }
}
const denied = () =>
  Response.json({ error: 'Solo lectura' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
export const GET = read;
export const POST = denied,
  PUT = denied,
  PATCH = denied,
  DELETE = denied,
  HEAD = denied,
  OPTIONS = denied;
