import type { ShellNode } from '../components/ApprovedShell';
export interface HomePayload {
  tree: ShellNode[];
  css: string;
  products: unknown[];
}
/** Scope approved CSS; the Homepage is rendered declaratively by its owner portal. */
export function mountShadowHome(el: HTMLElement, payload: HomePayload) {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = payload.css;
  const viewport = document.createElement('div');
  viewport.className = 'home-viewport';
  const body = document.createElement('div');
  body.className = 'home-body';
  viewport.append(body);
  root.replaceChildren(style, viewport);
  const resize = () => {
    if (el.clientHeight) {
      el.style.setProperty('--home-height', `${el.clientHeight}px`);
      el.style.setProperty('--home-top', `${el.getBoundingClientRect().top}px`);
    }
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  return { root, body, dispose: () => ro.disconnect() };
}
