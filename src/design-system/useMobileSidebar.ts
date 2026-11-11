import { useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';

/** Keep the mobile navigation modal without changing route or permission logic. */
export function useMobileSidebar(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const sidebar = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  function openSidebar(opener: HTMLElement) {
    // Capture before React makes the background inert and the browser blurs it.
    trigger.current = opener;
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !sidebar.current) return;
    const node = sidebar.current;
    const opener = trigger.current ?? document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const desktop = window.matchMedia('(min-width: 851px)');
    const controls = () => Array.from(node.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0);
    const focusFirst = () => (node.querySelector<HTMLElement>('.mobile-sidebar-close') ?? controls()[0])?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !node.contains(event.target)) focusFirst();
    };
    const onResize = () => { if (desktop.matches) setOpen(false); };

    document.body.style.overflow = 'hidden';
    focusFirst();
    // Retry once after the opening styles/inert state have reached the browser.
    const frame = requestAnimationFrame(() => {
      if (!node.contains(document.activeElement)) focusFirst();
    });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    desktop.addEventListener('change', onResize);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
      desktop.removeEventListener('change', onResize);
      if (opener instanceof HTMLElement && opener.isConnected && opener.getClientRects().length) opener.focus();
    };
  }, [open, setOpen]);

  return { sidebar, openSidebar };
}
