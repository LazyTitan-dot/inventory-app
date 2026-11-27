import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
const logos: Record<string, string> = {
  samsung: '/brand/samsung.png',
  lg: '/brand/lg.png',
  hisense: '/brand/hisense.png',
  whirlpool: '/brand/whirlpool.png',
  frigidaire: '/brand/frigidaire.png',
};
import { Icon } from './NativeCatalog';
/** React owns pause, visibility lifecycle, controls and repeated tiles. No cloned DOM nodes. */
export function BrandCarousel({
  names,
  onBrand,
}: {
  names: string[];
  onBrand: (name: string) => void;
}) {
  const [paused, setPaused] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const pausedRef = useRef(paused),
    railRef = useRef<HTMLDivElement>(null),
    sectionRef = useRef<HTMLElement>(null),
    interaction = useRef({ hover: false, touch: false, until: 0 });
  const setPause = (next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
  };
  const period = () => {
    const rail = railRef.current;
    if (!rail) return 0;
    const first = rail.children[0] as HTMLElement | undefined,
      repeat = rail.children[names.length] as HTMLElement | undefined;
    return first && repeat ? repeat.offsetLeft - first.offsetLeft : 0;
  };
  const step = (direction: number) => {
    const rail = railRef.current,
      p = period();
    if (!rail || !p) return;
    interaction.current.until = performance.now() + 2200;
    const width =
      (rail.children[1] as HTMLElement).offsetLeft - (rail.children[0] as HTMLElement).offsetLeft;
    if (direction < 0 && rail.scrollLeft < width) rail.scrollLeft += p;
    else if (direction > 0 && rail.scrollLeft >= p) rail.scrollLeft %= p;
    rail.scrollBy({
      left: direction * width,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };
  useEffect(() => {
    const rail = railRef.current!,
      section = sectionRef.current!,
      media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false,
      last = 0,
      carry = 0,
      raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
      },
      { threshold: 0.01 },
    );
    observer.observe(rail);
    const mediaChange = (e: MediaQueryListEvent) => setPause(e.matches);
    media.addEventListener('change', mediaChange);
    const release = () => {
      if (interaction.current.touch) {
        interaction.current.touch = false;
        interaction.current.until = performance.now() + 2200;
      }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    const tick = (now: number) => {
      const delta = last ? Math.min(now - last, 50) : 0;
      last = now;
      const p = period(),
        i = interaction.current,
        root = section.getRootNode() as Document | ShadowRoot;
      if (
        p &&
        visible &&
        !document.hidden &&
        !pausedRef.current &&
        !i.hover &&
        !i.touch &&
        !section.contains(root.activeElement) &&
        now > i.until
      ) {
        carry += delta * 0.034;
        const dx = Math.floor(carry);
        carry -= dx;
        if (dx) {
          const x = rail.scrollLeft + dx;
          rail.scrollLeft = x >= p ? x % p : x;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      media.removeEventListener('change', mediaChange);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);
  return (
    <section
      ref={sectionRef}
      className="featured-brands"
      onMouseEnter={() => (interaction.current.hover = true)}
      onMouseLeave={() => (interaction.current.hover = false)}
    >
      <div className="sectionheader">
        <h2>Marcas destacadas</h2>
        <div className="brand-arrows">
          <button
            aria-label={paused ? 'Reanudar carrusel' : 'Pausar carrusel'}
            aria-pressed={paused}
            className="brand-pause"
            type="button"
            onClick={() => setPause(!pausedRef.current)}
          >
            {paused ? '▶' : 'Ⅱ'}
          </button>
          <button aria-label="Marcas anteriores" data-brand-scroll="-1" onClick={() => step(-1)}>
            <Icon name="chevron-right" />
          </button>
          <button aria-label="Más marcas" data-brand-scroll="1" onClick={() => step(1)}>
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>
      <div
        ref={railRef}
        aria-label="Marcas destacadas"
        className="brand-rail"
        onPointerDown={() => {
          interaction.current.touch = true;
          interaction.current.until = performance.now() + 2200;
        }}
        onWheel={() => (interaction.current.until = performance.now() + 2200)}
      >
        {[0, 1, 2, 3].flatMap((i) =>
          names.map((name) => (
            <button
              key={`${i}-${name}`}
              aria-label={'Explorar marca ' + name}
              className="brand-tile"
              data-brand-route={name}
              onClick={onBrand ? () => onBrand(name) : undefined}
              type="button"
              tabIndex={i ? -1 : undefined}
              aria-hidden={i ? true : undefined}
            >
              {logos[name.toLowerCase()] ? (
                <img alt={name} draggable={false} src={logos[name.toLowerCase()]} />
              ) : (
                name
              )}
            </button>
          )),
        )}
      </div>
    </section>
  );
}
