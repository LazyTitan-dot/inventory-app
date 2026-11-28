import * as React from 'react';

type Position = { x: number; y: number };
type View = Position & { scale: number };
const initial = (): View => ({ scale: 1, x: 0, y: 0 });
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const point = (t: Touch): Position => ({ x: t.clientX, y: t.clientY });
const midpoint = (a: Position, b: Position): Position => ({ x: (a.x+b.x)/2, y: (a.y+b.y)/2 });
const distance = (a: Position, b: Position) => Math.hypot(a.x-b.x, a.y-b.y);

/** Touch zoom is local to the mobile image viewer; desktop mouse zoom is unchanged. */
export function useMobileViewerZoom(root: ShadowRoot, active: boolean, imageKey: string, step: (delta: number) => void) {
  const view = React.useRef<View>(initial());
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const [zoomed, setZoomed] = React.useState(false);
  const applyRef = React.useRef<(next: View) => void>(() => {});
  React.useLayoutEffect(() => {
    const canvas = root.querySelector<HTMLElement>('#viewerCanvas');
    if (!canvas || !active) { view.current = initial(); setZoomed(false); return; }
    let gesture: { kind: 'pinch'; mid: Position; distance: number; start: View } |
      { kind: 'one'; point: Position; start: View } | null = null;
    let consumed = false;
    const apply = (next: View) => {
      const scale = clamp(next.scale, 1, 4);
      const maxX = canvas.clientWidth * (scale-1)/2;
      const maxY = canvas.clientHeight * (scale-1)/2;
      const current = { scale, x: clamp(next.x,-maxX,maxX), y: clamp(next.y,-maxY,maxY) };
      view.current = current;
      canvas.style.setProperty('--touch-zoom', String(scale));
      canvas.style.setProperty('--touch-x', current.x+'px');
      canvas.style.setProperty('--touch-y', current.y+'px');
      setZoomed(scale > 1.001);
    };
    applyRef.current = apply;
    apply(initial());
    const begin = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
        const a = point(e.touches[0]), b = point(e.touches[1]);
        gesture = {kind:'pinch', mid:midpoint(a,b), distance:Math.max(1,distance(a,b)), start:{...view.current}};
        consumed = true;
      } else if (e.touches.length === 1) {
        gesture = {kind:'one', point:point(e.touches[0]), start:{...view.current}};
        consumed = view.current.scale > 1.001;
      }
    };
    const move = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length >= 2) {
        if (gesture?.kind !== 'pinch') begin(e);
        if (gesture?.kind !== 'pinch') return;
        const a = point(e.touches[0]), b = point(e.touches[1]), mid = midpoint(a,b);
        const box = canvas.getBoundingClientRect(), cx=box.left+box.width/2, cy=box.top+box.height/2;
        const scale = clamp(gesture.start.scale*distance(a,b)/gesture.distance,1,4);
        const ratio = scale/gesture.start.scale;
        apply({scale, x: mid.x-cx-(gesture.mid.x-cx-gesture.start.x)*ratio,
          y: mid.y-cy-(gesture.mid.y-cy-gesture.start.y)*ratio});
        consumed = true;
      } else if (e.touches.length === 1 && gesture?.kind === 'one' && view.current.scale > 1.001) {
        const p=point(e.touches[0]);
        apply({...gesture.start,x:gesture.start.x+p.x-gesture.point.x,y:gesture.start.y+p.y-gesture.point.y});
        consumed = true;
      }
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length >= 2) { begin(e); return; }
      if (e.touches.length === 1) {
        gesture={kind:'one',point:point(e.touches[0]),start:{...view.current}};
        consumed=true; return;
      }
      if (!consumed && gesture?.kind==='one' && e.changedTouches.length && view.current.scale <= 1.001) {
        const p=point(e.changedTouches[0]), dx=p.x-gesture.point.x, dy=p.y-gesture.point.y;
        if (Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.5) stepRef.current(dx<0?1:-1);
      }
      gesture=null; consumed=false;
    };
    const cancel = () => { gesture=null; consumed=false; };
    const resize = () => { cancel(); apply(view.current); };
    canvas.addEventListener('touchstart',begin,{passive:false});
    canvas.addEventListener('touchmove',move,{passive:false});
    canvas.addEventListener('touchend',end);
    canvas.addEventListener('touchcancel',cancel);
    const observer=new ResizeObserver(resize); observer.observe(canvas);
    return () => {
      observer.disconnect();
      canvas.removeEventListener('touchstart',begin);
      canvas.removeEventListener('touchmove',move);
      canvas.removeEventListener('touchend',end);
      canvas.removeEventListener('touchcancel',cancel);
      canvas.style.removeProperty('--touch-zoom');
      canvas.style.removeProperty('--touch-x');
      canvas.style.removeProperty('--touch-y');
      applyRef.current=()=>{};
      view.current=initial();
    };
  }, [root,active,imageKey]);
  return {zoomed,toggle:()=>applyRef.current(view.current.scale>1.001?initial():{scale:2,x:0,y:0})};
}
