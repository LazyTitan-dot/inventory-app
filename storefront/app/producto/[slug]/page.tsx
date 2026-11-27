import { notFound } from 'next/navigation';
import { Storefront } from '../../../src/components/Storefront';
import { catalogOrigin } from '../../../src/server/catalog-origin';
export const dynamic = 'force-dynamic';
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) notFound();
  const response = await fetch(catalogOrigin + 'products/' + slug, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw Error('Catálogo comercial no disponible');
  return <Storefront productSlug={slug} />;
}
