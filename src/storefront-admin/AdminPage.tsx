import * as React from 'react';
import {
  clone,
  visible,
  type AdminState,
  type Product,
  type Banner,
  type Promotion,
  type Command,
} from './presentation';
import { AdminView, tabs, type ViewState } from './view';
export interface AdminRepository {
  read(): AdminState | Promise<AdminState>;
  command(command: Command): AdminState | Promise<AdminState>;
  prepareMedia?(id: string, indices: number[]): Promise<{state: AdminState; prepared: number; failed: number}>;
}
const initialView = {
  tab: 'products',
  view: 'list',
  query: '',
  filter: 'all',
  category: 'all',
  ascending: true,
  draft: null,
  kind: '',
  error: '',
};
export function AdminPage({
  repository: repo,
  hostTheme,
}: {
  repository: AdminRepository;
  hostTheme: 'light' | 'dark';
}) {
  const [snapshot, setSnapshot] = React.useState<AdminState | null>(null);
  const [ui, setUI] = React.useState<Omit<ViewState, 'state'>>(initialView);
  const [message, setMessage] = React.useState(''),
    [busy, setBusy] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<{
    title: string;
    message: string;
    run: () => void;
  } | null>(null);
  const scope = React.useRef<HTMLElement>(null);
  const dialog = React.useRef<HTMLDialogElement>(null),
    timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const draftRevision = React.useRef(0);
  const focusBack = React.useRef('');
  React.useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => repo.read())
      .then((s) => {
        if (typeof s.taxBasisPoints !== 'number' || !s.asOf)
          throw Error('Respuesta administrativa incompleta.');
        if (active) {
          setSnapshot(s);
        }
      })
      .catch(() => {
        if (active) setMessage('Acceso no disponible.');
      });
    return () => {
      active = false;
      clearTimeout(timer.current);
    };
  }, [repo]);
  React.useEffect(() => {
    if (confirmation && !dialog.current?.open) dialog.current?.showModal();
    else if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);
  const patch = (p: Partial<Omit<ViewState, 'state'>>) => setUI((s) => ({ ...s, ...p }));
  const notify = (s: string) => {
    setMessage(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 3500);
  };
  const scroll = () => window.scrollTo(0, 0);
  const focus = (selector: string) =>
    requestAnimationFrame(() => scope.current?.querySelector<HTMLElement>(selector)?.focus());
  const switchTab = (tab: string) => {
    patch({ tab, view: 'list', draft: null, error: '' });
    scroll();
  };
  const close = () => {
    patch({ view: 'list', draft: null, error: '' });
    scroll();
    if (focusBack.current) focus(focusBack.current);
  };
  const ask = (title: string, message: string, run: () => void) =>
    setConfirmation({ title, message, run });
  const commit = async (command: Command, closeAfter = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await repo.command(command);
      setSnapshot(result);
      if (closeAfter) close();
      notify('Cambios comerciales guardados.');
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : 'No se pudo guardar.' });
      if (!closeAfter) notify(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };
  const action = (a: string, k: string, id: string) => {
    if (!snapshot || busy) return;
    const state = snapshot.data,
      d = ui.draft;
    if (a === 'refresh') {
      if (!busy) {
        setBusy(true);
        Promise.resolve()
          .then(() => repo.read())
          .then(setSnapshot)
          .catch(() => {
            setSnapshot(null);
            notify('Acceso no disponible.');
          })
          .finally(() => setBusy(false));
      }
      return;
    }
    if (a === 'tab' || a === 'preview') {
      switchTab(a === 'preview' ? 'preview' : k);
      return;
    }
    if (a === 'stat') {
      if (k === 'featured') switchTab('featured');
      else {
        patch({ filter: k });
        switchTab('products');
      }
      return;
    }
    if (a === 'sort') {
      patch({ ascending: !ui.ascending });
      return;
    }
    if (a === 'edit') {
      const p = state.products.find((p) => p.id === id);
      if (p) {
        draftRevision.current = snapshot.revision;
        focusBack.current = `[data-action=edit][data-id="${id}"]`;
        patch({ kind: 'product', view: 'detail', draft: clone(p), error: '' });
        scroll();
        focus('#detail-title');
      }
      return;
    }
    if (a === 'back') {
      ask('Descartar cambios', 'Regresar sin guardar los cambios de esta pantalla.', close);
      return;
    }
    if (a === 'prepare-media' && d && ui.kind === 'product' && repo.prepareMedia) {
      const product = d as Product;
      const indices = product.pendingMedia ?? [];
      if (busy || !indices.length) return;
      ask('Preparar fotografías existentes', 'Se guardará una copia privada de las imágenes del inventario. No se autorizará ni publicará ninguna fotografía automáticamente. El formulario se recargará antes de editar la publicación.', () => {
        setBusy(true);
        void (async () => {
          try {
            const result = await repo.prepareMedia!(product.id, indices);
            const fresh = result.state.data.products.find(p => p.id === product.id);
            setSnapshot(result.state);
            draftRevision.current = result.state.revision;
            if (fresh) patch({draft:clone(fresh),error:result.failed ? result.failed+' fotografía(s) no pudieron copiarse. Intenta de nuevo o sube una copia desde Inventario.' : ''});
            else close();
            notify(result.prepared+' fotografía(s) preparadas. Autorízalas manualmente.');
          } catch (e) {
            patch({error:e instanceof Error ? e.message : 'No se pudieron preparar las fotografías.'});
          } finally { setBusy(false); }
        })();
      });
      return;
    }
    if (a === 'save' && d) {
      const revision = draftRevision.current;
      if (ui.kind === 'product') {
        const p = d as Product;
        void commit(
          {
            type: 'publication',
            revision,
            id: p.id,
            slug: p.slug,
            published: p.published,
            featured: p.featured,
            showOut: p.showOut,
            variants: p.variants.map(({ id, visible }) => ({ id, visible })),
            media: p.media.map(({ id, approved }) => ({ id, approved })),
          },
          true,
        );
      } else if (ui.kind === 'banner')
        void commit({ type: 'banner', revision, banner: d as Banner }, true);
      else void commit({ type: 'promotion', revision, id: d.id, web: (d as Promotion).web }, true);
      return;
    }
    if (a === 'toggle' && d) {
      const next = clone(d);
      if (ui.kind === 'product') {
        const p = next as Product;
        if (k.startsWith('variant:')) {
          const v = p.variants.find((v) => v.id === k.slice(8));
          if (v && v.active && v.base > 0) v.visible = !v.visible;
        } else if (k.startsWith('media:')) {
          const m = p.media.find((m) => m.id === k.slice(6));
          if (m) m.approved = !m.approved;
        } else if (k === 'published') {
          p.published = !p.published;
          if (!p.published) p.featured = false;
        } else if (k === 'featured') p.featured = !p.featured;
        else if (k === 'showOut') p.showOut = !p.showOut;
      } else if (ui.kind === 'banner' && k === 'active')
        (next as Banner).active = !(next as Banner).active;
      else if (ui.kind === 'promo' && k === 'web')
        (next as Promotion).web = !(next as Promotion).web;
      patch({ draft: next, error: '' });
      return;
    }
    if (a.startsWith('media-') && d && ui.kind === 'product') {
      const p = clone(d as Product),
        i = p.media.findIndex((m) => m.id === id),
        j = i + (a === 'media-up' ? -1 : 1);
      if (i >= 0 && j >= 0 && j < p.media.length) {
        [p.media[i], p.media[j]] = [p.media[j]!, p.media[i]!];
        patch({ draft: p });
      }
      return;
    }
    if (a.startsWith('feature-')) {
      const ps = state.products
          .filter((p) => visible(p) && p.featured)
          .sort((x, y) => x.order - y.order),
        i = ps.findIndex((p) => p.id === id),
        j = i + (a === 'feature-up' ? -1 : 1);
      if (i >= 0 && j >= 0 && j < ps.length) {
        [ps[i], ps[j]] = [ps[j]!, ps[i]!];
        void commit({ type: 'featured', revision: snapshot.revision, ids: ps.map((p) => p.id) });
      }
      return;
    }
    if (a === 'edit-content' || a === 'new') {
      const kind = ui.tab === 'banners' ? 'banner' : 'promo';
      const p =
        a === 'new'
          ? {
              id: crypto.randomUUID(),
              title: '',
              subtitle: '',
              slot: 'Principal',
              active: false,
              start: snapshot.asOf,
              end: snapshot.asOf,
              target: 'catalogo',
              asset: '',
            }
          : (kind === 'banner' ? state.banners : state.promos).find((x) => x.id === id);
      if (p) {
        draftRevision.current = snapshot.revision;
        focusBack.current =
          a === 'new' ? '[data-action=new]' : `[data-action=${a}][data-id="${id}"]`;
        patch({ kind, draft: clone(p), view: 'detail', error: '' });
        scroll();
        focus('#detail-title');
      }
    }
  };
  const field = (id: string, k: string, v: string) => {
    if (id === 'search') patch({ query: v });
    else if (id === 'filter') patch({ filter: v });
    else if (id === 'category') patch({ category: v });
    else if (
      ui.draft &&
      ((ui.kind === 'product' && k === 'slug') ||
        (ui.kind === 'banner' &&
          ['title', 'subtitle', 'slot', 'target', 'asset', 'start', 'end'].includes(k)))
    )
      patch({ draft: { ...ui.draft, [k]: v }, error: '' });
  };
  const keydown = (e: React.KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const i = tabs.findIndex((x) => x[0] === ui.tab),
        j =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      switchTab(tabs[j]![0]!);
      focus(`[role=tab][data-key="${tabs[j]![0]!}"]`);
    }
  };
  const h = { action, field, keydown };
  const content = snapshot ? (
    <AdminView
      ctx={{ ...ui, state: snapshot.data, busy }}
      handlers={h}
      taxBasisPoints={snapshot.taxBasisPoints!}
      day={snapshot.asOf!}
    />
  ) : (
    <p role="status">{message || 'Cargando información comercial…'}</p>
  );
  const overlays = (
    <>
      <dialog
        className="dialog"
        id="confirm"
        aria-labelledby="confirm-title"
        ref={dialog}
        onCancel={() => setConfirmation(null)}
      >
        <h2 id="confirm-title">{confirmation?.title}</h2>
        <p id="confirm-message">{confirmation?.message}</p>
        <div className="actions">
          <button id="confirm-no" onClick={() => setConfirmation(null)}>
            Cancelar
          </button>
          <button
            className="primary"
            id="confirm-yes"
            onClick={() => {
              const f = confirmation?.run;
              setConfirmation(null);
              f?.();
            }}
          >
            Confirmar
          </button>
        </div>
      </dialog>
      <div
        className={'toast' + (message ? ' show' : '')}
        id="toast"
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
    </>
  );
  return (
    <section ref={scope} className="storefront-admin" data-theme={hostTheme}>
      <div className="page" id="page" aria-busy={busy}>
        {content}
      </div>
      {overlays}
    </section>
  );
}
