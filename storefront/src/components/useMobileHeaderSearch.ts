import * as React from 'react';
import { flushSync } from 'react-dom';

export function useMobileHeaderSearch(root: ShadowRoot, mobile: boolean) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => { if (!mobile) setOpen(false); }, [mobile]);
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) root.querySelector<HTMLButtonElement>('[data-mobile-search-toggle]')?.focus({ preventScroll: true });
  };
  const toggle = () => {
    if (open) { close(true); return; }
    // iOS needs focus in the original user gesture to open its keyboard.
    flushSync(() => setOpen(true));
    root.querySelector<HTMLInputElement>('[data-search="iphone"]')?.focus({ preventScroll: true });
  };
  return { open, close, toggle };
}
