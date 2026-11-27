'use client';
import * as React from 'react';
import { flushSync, createPortal } from 'react-dom';
import { NativeHome } from './NativeHome';
import type { HomeProduct } from './NativeCatalog';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Session } from '../integration/session-model';
import { useStoreSession, type SessionBridge } from '../integration/session';
import { mountShadowHome, type HomePayload } from '../integration/shadow-home';
import { mountShadowShop, type ShopHost, type ShopApi } from '../integration/shadow-shop';

import type { Mode, Route } from '../integration/controller';
import type { Product } from '../data/contracts';
interface ShellOptions {
  initialSession?: Session;
  onSession: (bridge: SessionBridge) => void;
  homePayload: HomePayload;
  shopPayload: HomePayload;
}
export function SessionShell(options: ShellOptions) {
  const [shopView, setShopView] = useState<{ node: HTMLElement; element: React.ReactNode } | null>(
    null,
  );
  const { state, bridge } = useStoreSession(options.initialSession);
  const homeEl = useRef<HTMLDivElement>(null),
    shopEl = useRef<HTMLDivElement>(null),
    shop = useRef<ShopApi | null>(null),
    home = useRef<boolean>(false),
    [homeView, setHomeView] = useState<{
      root: ShadowRoot;
      body: HTMLElement;
      payload: HomePayload;
    } | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const getShop = () => shop.current;
  const routeRef = useRef<(kind: Route, value?: string) => void>(() => {});
  const lastApplied = useRef({ mode: '' as Mode | '', revision: -1 });
  useEffect(() => {
    const host = window as ShopHost;
    let alive = true,
      disposeHome: (() => void) | undefined,
      disposeShop: (() => void) | undefined;
    const frame = shopEl.current!;
    const media = window.matchMedia('(max-width: 830px)');
    const resize = () =>
      bridge.dispatch({ type: 'mode', mode: media.matches ? 'iphone' : 'desktop' });
    resize();
    media.addEventListener('change', resize);
    const route = (kind: Route, value?: string) => {
      if (!alive || !getShop() || !home.current) return;
      if (kind === 'favorite') {
        if (value) getShop()!.go(kind, value);
        return;
      }
      flushSync(() => bridge.dispatch({ type: 'route', route: kind, value }));
    };
    routeRef.current = route;
    const onReady = () => {
      if (alive && getShop() && home.current) {
        options.onSession?.(bridge);
        setReady(true);
      }
    };
    (async () => {
      try {
        await Promise.resolve();
        const payload = options.homePayload;
        if (!alive) return;
        if (!payload) throw Error('Missing Homepage payload');
        const mounted = mountShadowHome(homeEl.current!, payload);
        home.current = true;
        disposeHome = mounted.dispose;
        setHomeView({ root: mounted.root, body: mounted.body, payload });
        const shopPayload = options.shopPayload;
        if (!alive) return;
        if (!shopPayload) throw Error('Missing shop payload');
        const mountedShop = mountShadowShop(frame, shopPayload, host, {
          session: bridge,
          route,
          mount: (node, element) => flushSync(() => setShopView({ node, element })),
        });
        shop.current = mountedShop.api;
        disposeShop = mountedShop.dispose;
        onReady();
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
      media.removeEventListener('change', resize);
      disposeHome?.();
      home.current = false;
      disposeShop?.();
      shop.current = null;
      setShopView(null);
    };
  }, []);
  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !ready || !home.current || !getShop()) return;
      const api = getShop()!;
      const last = lastApplied.current;
      if (last.mode !== state.mode) {
        api.mode(state.mode);
        last.mode = state.mode;
      }
      if (last.revision !== state.revision) {
        last.revision = state.revision;
        if (state.route !== 'home') {
          api.mode(state.mode);
          api.go(state.route, state.value);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, state.mode, state.revision]);

  return (
    <>
      {error ? <p role="alert">{error}</p> : null}
      <main
        id="frames"
        data-react-portals={(shopView ? 1 : 0) + (homeView ? 1 : 0)}
        data-catalog-mode="commercial"
        data-ready={ready ? 'true' : 'false'}
      >
        <div
          id="home"
          ref={homeEl}
          hidden={state.route !== 'home'}
          aria-label="Homepage S-mart Living"
        />
        <div
          id="shop"
          ref={shopEl}
          aria-label="Tienda S-mart Living"
          hidden={state.route === 'home'}
        />
      </main>
      {homeView &&
        createPortal(
          <NativeHome
            tree={homeView.payload.tree}
            products={homeView.payload.products as HomeProduct[]}
            root={homeView.root}
            catalog={options.shopPayload.products as Product[]}
            mode={state.mode}
            session={bridge.snapshot()}
            onRoute={(kind, value) => routeRef.current(kind, value)}
          />,
          homeView.body,
          'homepage',
        )}
      {shopView && createPortal(shopView.element, shopView.node, 'shop')}
    </>
  );
}
