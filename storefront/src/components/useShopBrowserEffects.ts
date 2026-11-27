import * as React from 'react';
/** Browser-specific behavior: native dialog lifecycle, pointer capture and scroll affordances. */
export function useShopBrowserEffects({
  root,
  viewer,
  zoomed,
  mode,
  step,
  close,
}: {
  root: ShadowRoot;
  viewer: boolean;
  zoomed: boolean;
  mode: string;
  step: (delta: number) => void;
  close: () => void;
}) {
  const [rails, setRails] = React.useState({
    desktopHidden: false,
    desktopDisabled: false,
    mobileHidden: false,
    mobileDisabled: false,
  });
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(
      null,
    ),
    touch = React.useRef<[number, number] | null>(null);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s);
  const updateRails = React.useCallback(() => {
    const desk = root.querySelector<HTMLElement>('#desktopCategories'),
      mobile = root.querySelector<HTMLElement>('#mobileCatalogCategories'),
      wrap = root.querySelector<HTMLElement>('#mobileCategoryCarousel');
    setRails((old) => {
      const max = desk ? Math.max(0, desk.scrollWidth - desk.clientWidth - 2) : 0;
      const m =
        mobile && wrap && mobile.clientWidth
          ? {
              mobileHidden: mobile.scrollWidth <= wrap.clientWidth + 2,
              mobileDisabled: mobile.scrollLeft + mobile.clientWidth >= mobile.scrollWidth - 2,
            }
          : { mobileHidden: old.mobileHidden, mobileDisabled: old.mobileDisabled };
      const next = {
        desktopHidden: max <= 0,
        desktopDisabled: !!desk && desk.scrollLeft >= max,
        ...m,
      };
      return Object.keys(next).every(
        (k) => next[k as keyof typeof next] === old[k as keyof typeof old],
      )
        ? old
        : next;
    });
  }, [root]);
  React.useLayoutEffect(() => {
    const observer = new ResizeObserver(updateRails);
    for (const id of [
      '#stage',
      '#desktopCategories',
      '#mobileCatalogCategories',
      '#mobileCategoryCarousel',
    ]) {
      const node = root.querySelector(id);
      if (node) observer.observe(node);
    }
    updateRails();
    return () => observer.disconnect();
  }, [root, updateRails]);
  React.useLayoutEffect(() => {
    updateRails();
  }, [mode, updateRails]);
  const scrollRail = (mobile: boolean) => {
    const rail = q(mobile ? '#mobileCatalogCategories' : '#desktopCategories');
    if (!rail) return;
    const step = (rail.querySelector<HTMLElement>('.mobile-cat')?.offsetWidth || 88) + 8;
    rail.scrollBy({
      left: mobile ? step * Math.max(1, Math.floor(rail.clientWidth / step)) : 430,
      behavior:
        mobile && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };
  const stop = (canvas?: HTMLElement) => {
    const active = drag.current;
    drag.current = null;
    setDragging(false);
    if (active && canvas?.hasPointerCapture?.(active.id)) canvas.releasePointerCapture(active.id);
  };
  React.useLayoutEffect(() => {
    const dialog = q<HTMLDialogElement>('#imageViewer');
    if (!dialog) return;
    if (viewer && !dialog.open) {
      dialog.showModal();
      q('#viewerClose')?.focus();
    } else if (!viewer && dialog.open) dialog.close();
  }, [viewer]);
  React.useLayoutEffect(() => {
    const canvas = q('#viewerCanvas');
    if (!canvas) return;
    stop(canvas);
    canvas.scrollLeft = zoomed ? (canvas.scrollWidth - canvas.clientWidth) / 2 : 0;
    canvas.scrollTop = zoomed ? (canvas.scrollHeight - canvas.clientHeight) / 2 : 0;
  }, [viewer, zoomed]);
  React.useEffect(() => {
    if (!viewer) return;
    const abort = new AbortController();
    window.addEventListener('blur', () => stop(q('#viewerCanvas') ?? undefined), {
      signal: abort.signal,
    });
    return () => abort.abort();
  }, [viewer]);
  const viewerEvents = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      const c = e.currentTarget;
      if (
        !zoomed ||
        e.pointerType !== 'mouse' ||
        e.button !== 0 ||
        !viewer ||
        (c.scrollWidth <= c.clientWidth && c.scrollHeight <= c.clientHeight)
      )
        return;
      stop(c);
      drag.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: c.scrollLeft,
        top: c.scrollTop,
      };
      setDragging(true);
      c.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
      e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
      e.preventDefault();
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.id === e.pointerId) stop(e.currentTarget);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
      if (drag.current?.id === e.pointerId) stop(e.currentTarget);
    },
    onLostPointerCapture: () => {
      drag.current = null;
      setDragging(false);
    },
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
      touch.current =
        !zoomed && e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null;
    },
    onTouchEnd: (e: React.TouchEvent<HTMLElement>) => {
      const t = touch.current;
      touch.current = null;
      if (!t || zoomed) return;
      const dx = e.changedTouches[0].clientX - t[0],
        dy = e.changedTouches[0].clientY - t[1];
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    },
    onTouchCancel: () => {
      touch.current = null;
    },
  };
  const dialogEvents = {
    onCancel: (e: React.SyntheticEvent) => {
      e.preventDefault();
      close();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        step(e.key === 'ArrowLeft' ? -1 : 1);
      }
      if (e.key === 'Escape') e.stopPropagation();
    },
  };
  return { rails, updateRails, scrollRail, viewerEvents, dialogEvents, dragging };
}
