'use client';
import * as React from 'react';
import { HttpCommercialRepository } from '../data/commercial/repository';
import { CommercialSession } from './CommercialSession';
import type { HomePayload } from '../integration/shadow-home';
async function loadVisual(kind: 'home' | 'shop'): Promise<HomePayload> {
  const r = await fetch('/catalog-visuals/' + kind + '.json');
  if (!r.ok) throw Error('Recurso visual no disponible');
  return r.json();
}
const readCommercial = () => new HttpCommercialRepository().snapshot();
export function Storefront({
  catalog = false,
  productSlug,
}: { catalog?: boolean; productSlug?: string } = {}) {
  const [visuals, setVisuals] = React.useState<{ home: HomePayload; shop: HomePayload } | null>(
      null,
    ),
    [error, setError] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    Promise.all([loadVisual('home'), loadVisual('shop')])
      .then(([home, shop]) => {
        if (alive) setVisuals({ home, shop });
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (error)
    return (
      <main role="alert" style={{ padding: 24 }}>
        <h1>Catálogo comercial no disponible</h1>
        <button onClick={() => window.location.reload()}>Reintentar</button>
      </main>
    );
  if (!visuals) return <p role="status">Cargando catálogo comercial…</p>;
  return (
    <CommercialSession
      {...visuals}
      read={readCommercial}
      catalog={catalog}
      productSlug={productSlug}
    />
  );
}
