'use client';
import * as React from 'react';
import type { HomePayload } from '../integration/shadow-home';
import type { Session } from '../integration/session-model';
import type { SessionBridge } from '../integration/session';
import type { CommercialSnapshot } from '../data/commercial/contract';
import { validateSnapshot } from '../data/commercial/repository';
import { commercialPayloads } from '../data/commercial/payload';
import { sameCatalog, reconcileSession, REVALIDATE_MS } from '../data/commercial/revalidation';
import { SessionShell } from './SessionShell';
import { CampaignContext, readCampaigns, type Campaigns } from '../data/commercial/campaigns';
interface Props {
  catalog?: boolean;
  productSlug?: string;
  home: HomePayload;
  shop: HomePayload;
  read: () => Promise<CommercialSnapshot>;
}
interface Current {
  data: CommercialSnapshot;
  revision: number;
  seed?: Session;
}
export function CommercialSession({ home, shop, read, catalog = false, productSlug }: Props) {
  const [current, setCurrent] = React.useState<Current | null>(null),
    [failed, setFailed] = React.useState(false),
    [notice, setNotice] = React.useState('');
  const [campaigns, setCampaigns] = React.useState<Campaigns | null>(null);
  const latest = React.useRef<Current | null>(null),
    session = React.useRef<SessionBridge | null>(null),
    saved = React.useRef<Session | undefined>(undefined),
    refresh = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    let active = true,
      busy = false,
      failedLast = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      if (!active || busy) return;
      busy = true;
      try {
        const [snapshot, content] = await Promise.all([read(), readCampaigns()]);
        const data = validateSnapshot(snapshot);
        if (!active) return;
        setCampaigns(content);
        if (!latest.current || failedLast || !sameCatalog(latest.current.data, data)) {
          const previous = session.current?.read() ?? saved.current;
          const initial = latest.current === null && !failedLast;
          const next = {
            data,
            revision: (latest.current?.revision ?? 0) + 1,
            seed: reconcileSession(previous, data),
          };
          if (initial && !previous) {
            next.seed.mode = window.innerWidth <= 830 ? 'iphone' : 'desktop';
            const variant = productSlug && data.products.find((p) => p.slug === productSlug);
            if (variant) {
              next.seed.route = 'detail';
              next.seed.value = variant.id;
            } else if (catalog || productSlug) {
              next.seed.route = 'category';
              next.seed.value = 'Todos';
            }
          }
          session.current = null;
          latest.current = next;
          setCurrent(next);
          if (!initial) setNotice('El catálogo se actualizó. Revisa los precios y las cantidades.');
        }
        failedLast = false;
        setFailed(false);
      } catch {
        if (!active) return;
        saved.current = session.current?.read() ?? saved.current;
        session.current = null;
        failedLast = true;
        setFailed(true);
        setCurrent(null);
        setNotice('');
      } finally {
        busy = false;
        if (active) {
          clearTimeout(timer);
          timer = setTimeout(update, REVALIDATE_MS);
        }
      }
    };
    refresh.current = () => void update();
    const focus = () => {
      if (document.visibilityState === 'visible') void update();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    void update();
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      refresh.current = () => {};
    };
  }, [read, catalog, productSlug]);
  return (
    <>
      {failed ? (
        <main role="alert" style={{ padding: 24 }}>
          <h1>Catálogo comercial no disponible</h1>
          <p>Vuelve a intentarlo para consultar el catálogo actualizado.</p>
          <button onClick={() => refresh.current()}>Reintentar</button>
        </main>
      ) : !current ? (
        <p role="status">Cargando catálogo…</p>
      ) : (
        <>
          {notice && (
            <aside
              role="status"
              style={{ padding: '6px 10px', fontSize: 12, background: '#e7f3f8' }}
            >
              {notice} <button onClick={() => setNotice('')}>Cerrar</button>
            </aside>
          )}
          <CampaignContext.Provider
            value={
              campaigns
                ? {
                    ...campaigns,
                    variant: (slug) => current.data.products.find((p) => p.slug === slug)?.id,
                  }
                : null
            }
          >
            <SessionShell
              key={current.revision}
              {...commercialPayloads(home, shop, current.data)}
              initialSession={current.seed}
              onSession={(bridge) => {
                session.current = bridge;
                saved.current = bridge.read();
              }}
            />
          </CampaignContext.Provider>
        </>
      )}
    </>
  );
}
