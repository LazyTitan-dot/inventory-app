import { useEffect, useId, useRef, useState } from 'react';
import { Archive, Eye, MoreHorizontal, Pencil, SlidersHorizontal, ScanLine } from 'lucide-react';

interface Props {
  sku: string;
  productName: string;
  active: boolean;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onAdjust: () => void;
  onIdentifiers?: () => void;
  onArchive: () => void;
}

/** Native top-layer popover avoids clipping inside the horizontally scrolling table.
 * Buttons retain normal Tab navigation; Escape and outside click dismiss the panel.
 */
export function InventoryRowActions({ sku, productName, active, canManage, onView, onEdit, onAdjust, onIdentifiers, onArchive }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function close(restoreFocus = false) {
    const node = panel.current;
    if (node?.matches(':popover-open')) node.hidePopover();
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function toggle() {
    const node = panel.current;
    const button = trigger.current;
    if (!node || !button) return;
    if (node.matches(':popover-open')) { close(true); return; }
    node.showPopover();
    const anchor = button.getBoundingClientRect();
    const { width, height } = node.getBoundingClientRect();
    const gap = 8;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const left = Math.max(gap, Math.min(anchor.right - width, viewportWidth - width - gap));
    const below = anchor.bottom + gap;
    const above = anchor.top - height - gap;
    const top = Math.max(gap, Math.min(below + height <= viewportHeight - gap ? below : above, viewportHeight - height - gap));
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.querySelector('button')?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      if (event.type === 'scroll' && event.target instanceof Node && panel.current?.contains(event.target)) return;
      const node = panel.current;
      if (node?.matches(':popover-open')) node.hidePopover();
    }
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  function choose(action: () => void) { close(true); action(); }

  return (
    <div className="inventory-row-actions">
      <button ref={trigger} type="button" className="icon-button inventory-action-trigger" aria-label={`Acciones de ${sku}`} aria-controls={id} aria-expanded={open} popoverTarget={id} title="Acciones" onClick={(event) => { event.preventDefault(); toggle(); }}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      <div id={id} ref={panel} popover="auto" className="inventory-actions-popover" role="group" aria-label={`Acciones de ${sku}`}
        onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close(true); } }}>
        <button type="button" onClick={() => choose(onView)}><Eye size={17} aria-hidden="true" />Ver ficha</button>
        {canManage && <>
          <button type="button" onClick={() => choose(onEdit)}><Pencil size={17} aria-hidden="true" />Editar</button>
          <button type="button" aria-label={`Ajustar ${sku}`} onClick={() => choose(onAdjust)}><SlidersHorizontal size={17} aria-hidden="true" />Ajustar stock</button>
          {onIdentifiers && <button type="button" onClick={() => choose(onIdentifiers)}><ScanLine size={17} aria-hidden="true" />Series y códigos</button>}
          <button type="button" className="inventory-action-archive" aria-label={`${active ? 'Archivar' : 'Reactivar'} ${productName}`} onClick={() => choose(onArchive)}><Archive size={17} aria-hidden="true" />{active ? 'Archivar' : 'Reactivar'}</button>
        </>}
      </div>
    </div>
  );
}
