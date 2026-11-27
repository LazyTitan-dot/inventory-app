import * as React from 'react';
import { ShopControlsShell } from '../components/ShopControlsShell';
import type { ShopApi } from './use-shop-actions';
import type { SessionBridge } from './session';
import { createCatalogFlowStore } from './catalog-flow-model';
import type { Product } from '../data/contracts';
import type { Route } from './controller';
import type { HomePayload } from './shadow-home';
export type { ShopApi } from './use-shop-actions';
export type ShopHost = Window;
export type ShopPorts = {
  session: SessionBridge;
  route: (kind: Route, value?: string) => void;
  mount: (node: HTMLElement, element: React.ReactNode) => void;
};
/** Container only: styles, viewport, local stores and a fixed React portal. */
export function mountShadowShop(
  el: HTMLElement,
  payload: HomePayload,
  host: ShopHost,
  ports: ShopPorts,
) {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = payload.css;
  const viewport = document.createElement('div');
  viewport.className = 'shop-viewport';
  const body = document.createElement('div');
  body.className = 'shop-body';
  viewport.append(body);
  root.replaceChildren(style, viewport);
  const products = payload.products as Product[];
  const store = createCatalogFlowStore(products);
  let api: ShopApi | undefined;
  ports.mount(
    body,
    React.createElement(ShopControlsShell, {
      tree: payload.tree,
      root,
      viewport,
      store,
      products,
      session: ports.session,
      route: ports.route,
      onApi: (a: ShopApi) => {
        api = a;
      },
    }),
  );
  const resize = () => {
    const height = el.parentElement?.clientHeight || host.innerHeight;
    el.style.setProperty('--shop-height', `${height}px`);
    el.style.setProperty('--shop-top', `${el.parentElement?.getBoundingClientRect().top || 0}px`);
  };
  resize();
  const ro = new ResizeObserver(resize);
  if (el.parentElement) ro.observe(el.parentElement);
  if (!api) {
    ro.disconnect();
    throw Error('Shop initialization failed');
  }
  return { api, dispose: () => ro.disconnect() };
}
