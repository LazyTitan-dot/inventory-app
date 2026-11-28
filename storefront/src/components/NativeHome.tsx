import { useMobileHeaderSearch } from './useMobileHeaderSearch';
import * as React from 'react';
import { HomeCards, Icon, type HomeProduct } from './NativeCatalog';
import { NativeEvents } from './NativeEvents';
import { BrandCarousel } from './BrandCarousel';
import { categoryCards, featuredBrands } from '../data/editorial';
import { UtilityBar, EditorialHero, EditorialPromos, EditorialDelivery, EditorialFooter } from './HomeEditorial';
import { ManagedHero, ManagedStrip } from './ManagedCampaign';
import { CampaignContext, type Campaign } from '../data/commercial/campaigns';
import type { Product } from '../data/contracts';
import type { ShellNode } from './ApprovedShell';
import type { Mode, Route, SessionSnapshot } from '../integration/controller';
import { homeItems, homeRoute } from '../integration/home-model';
import type { NativeDispatch } from '../integration/shop-actions';


const editorialSlides = [
  {title:'Celulares para tu ritmo',subtitle:'Rendimiento, cámara y conectividad.',category:'Celulares',asset:'/editorial/promo-phone.png'},
  {title:'Electrodomésticos para tu hogar',subtitle:'Funcionalidad, diseño y eficiencia.',category:'Neveras',asset:'/editorial/promo-fridge.png'},
  {title:'Ambientes más frescos',subtitle:'Aires acondicionados para tu comodidad.',category:'Aires',asset:'/editorial/promo-air.png'},
] as const;

function RotatingHero({mobile,main,open,route}:{mobile:boolean;main?:Campaign;open:(item:Campaign)=>void;route:(r:Route,v?:string)=>void}) {
  const [index,setIndex]=React.useState(0);
  const [paused,setPaused]=React.useState(false);
  const [reduced,setReduced]=React.useState(false);
  const controls=React.useRef<HTMLDivElement>(null);
  const count=editorialSlides.length+1;
  React.useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>setReduced(media.matches);
    sync();
    media.addEventListener('change',sync);
    return ()=>media.removeEventListener('change',sync);
  },[]);
  React.useEffect(()=>{
    if(paused||reduced)return;
    const timer=window.setInterval(()=>{
      const section=controls.current?.parentElement;
      if(!section||document.hidden||section.getClientRects().length===0)return;
      const root=section.getRootNode() as ShadowRoot;
      if(mobile ? section.matches(':focus-within') && Boolean(section.querySelector(':focus-visible')) : section.matches(':hover')||section.contains(root.activeElement))return;
      setIndex(v=>(v+1)%count);
    },6500);
    return ()=>window.clearInterval(timer);
  },[paused,reduced,index,count,mobile]);
  React.useEffect(()=>{
    const section=controls.current?.parentElement;
    if(!mobile||!section)return;
    let start:{x:number;y:number}|null=null;
    const begin=(e:TouchEvent)=>{
      const target=e.target;
      start=e.touches.length===1 && !(target instanceof Element && target.closest('button,a,input'))
        ? {x:e.touches[0].clientX,y:e.touches[0].clientY}:null;
    };
    const move=(e:TouchEvent)=>{if(e.touches.length!==1)start=null;};
    const end=(e:TouchEvent)=>{
      const origin=start;start=null;
      if(!origin||e.touches.length||!e.changedTouches.length)return;
      const dx=e.changedTouches[0].clientX-origin.x,dy=e.changedTouches[0].clientY-origin.y;
      if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)setIndex(v=>(v+(dx<0?1:count-1))%count);
    };
    const cancel=()=>{start=null;};
    section.addEventListener('touchstart',begin,{passive:true});
    section.addEventListener('touchmove',move,{passive:true});
    section.addEventListener('touchend',end,{passive:true});
    section.addEventListener('touchcancel',cancel,{passive:true});
    return ()=>{
      section.removeEventListener('touchstart',begin);
      section.removeEventListener('touchmove',move);
      section.removeEventListener('touchend',end);
      section.removeEventListener('touchcancel',cancel);
    };
  },[mobile,count]);
  const slide=index>0?editorialSlides[index-1]:undefined;
  const art=slide&&<img src={slide.asset} alt="" className={mobile?'hero-image editorial-slide-image':'editorial-slide-image'}/>;
  const current=slide?<><div className={mobile?'mobile-hero-copy':'desktop-hero-copy'}><h2>{slide.title}</h2><p>{slide.subtitle}</p><div className="hero-actions"><button type="button" className="actionprimary" onClick={()=>route('category',slide.category)}>Explorar productos <Icon name="chevron-right"/></button></div></div>{mobile?art:<div className="desktop-hero-art editorial-slide-art">{art}</div>}</>:main?<><ManagedHero campaign={main} mobile={mobile} open={()=>open(main)}/>{!main.asset&&(mobile?<img className="hero-image" src="/editorial/hero.png" alt=""/>:<div className="desktop-hero-art"><img src="/editorial/hero.png" alt=""/></div>)}</>:<EditorialHero mobile={mobile} route={route}/>;
  return <>{current}<div ref={controls} className="commercial-hero-controls" role="group" aria-label="Banners comerciales">
    {!mobile&&<button type="button" aria-label="Banner anterior" onClick={()=>setIndex(v=>(v+count-1)%count)}><span aria-hidden="true" className="commercial-prev"><Icon name="chevron-right"/></span></button>}
    {Array.from({length:count},(_,i)=><button key={i} type="button" aria-label={'Banner '+(i+1)+' de '+count} aria-current={i===index?'true':undefined} onClick={()=>setIndex(i)}><span className={'commercial-dot'+(i===index?' active':'')}/></button>)}
    {!mobile&&<button type="button" aria-label="Siguiente banner" onClick={()=>setIndex(v=>(v+1)%count)}><Icon name="chevron-right"/></button>}
    <button type="button" className="commercial-play" aria-label={reduced?'Carrusel detenido por preferencia de movimiento':paused?'Reproducir banners':'Pausar banners'} aria-pressed={paused||reduced} disabled={reduced} onClick={()=>setPaused(v=>!v)}>{mobile?<svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">{paused||reduced?<path d="M6 3.5 16 10 6 16.5Z"/>:<><rect x="5" y="4" width="3.5" height="12" rx="1"/><rect x="11.5" y="4" width="3.5" height="12" rx="1"/></>}</svg>:paused||reduced?'▶':'Ⅱ'}</button>
  </div></>;
}
const commercialHeroStyles=`
.commercial-hero-controls{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:1px;background:rgba(5,23,52,.9);border:1px solid #ffffff30;border-radius:999px;padding:2px 5px;color:#fff;box-shadow:0 4px 16px #06173430}
.commercial-hero-controls button{border:0;background:transparent;color:#fff;display:grid;place-items:center;width:36px;height:36px;padding:0;border-radius:50%;font-weight:750}
.commercial-hero-controls button:hover{background:#ffffff20}.commercial-hero-controls button:disabled{opacity:.55}.commercial-hero-controls button:focus-visible{outline:2px solid #65d8f4;outline-offset:1px}
.commercial-dot{width:8px;height:8px;border-radius:50%;background:#a3b8d0}.commercial-dot.active{background:#65d8f4;box-shadow:0 0 0 2px #65d8f444}.commercial-prev{display:flex;transform:rotate(180deg)}
.desktop-hero .editorial-slide-art{background:linear-gradient(125deg,#e8f3ff,#a6cdea)}.desktop-hero .editorial-slide-art .editorial-slide-image{object-fit:contain;padding:18px 36px 48px;mix-blend-mode:multiply}
.phone .mobile-hero .editorial-slide-image{object-fit:contain;background:#dcebf9;padding:8px 16px 38px}
.phone .commercial-hero-controls{bottom:8px;gap:0}.phone .commercial-hero-controls button{width:40px;height:44px}
@media(max-width:370px){.phone .commercial-hero-controls button{width:34px}}
.phone .mobile-hero{touch-action:pan-y pinch-zoom}
.phone .commercial-hero-controls{background:none;border:0;box-shadow:none;padding:0;bottom:5px;gap:0;color:#fff}
.phone .commercial-hero-controls button{width:44px;height:44px;background:none}
.phone .commercial-hero-controls button:hover{background:none}
.phone .commercial-hero-controls button:focus-visible{outline:2px solid #65d8f4;outline-offset:-3px;background:#06173477}
.phone .commercial-dot{width:8px;height:8px;background:#f4fbff;border:1px solid #0b2749;box-shadow:0 0 4px 1px #06173499}
.phone .commercial-dot.active{background:#65e5ff;border-color:#087d9c;box-shadow:0 0 0 2px #06274677,0 0 8px 2px #65d8f4aa}
.phone .commercial-play svg{filter:drop-shadow(0 0 2px #061734) drop-shadow(0 1px 2px #061734)}

.shipping-banner .shipping-fleet{object-fit:contain;align-self:center;height:auto;width:100%;max-width:none}
`;

interface HomeProps {
  tree: ShellNode[];
  products: HomeProduct[];
  catalog: Product[];
  root: ShadowRoot;
  mode: Mode;
  session: SessionSnapshot;
  onRoute: (route: Route, value?: string) => void;
}
export function NativeHome({ tree, products, catalog, root, mode, session, onRoute }: HomeProps) {
  const [term, setTerm] = React.useState('');
  const mobileSearch = useMobileHeaderSearch(root, mode === 'iphone');
  const [expanded, setExpanded] = React.useState(false);
  const campaigns = React.useContext(CampaignContext);
  const cards = categoryCards(catalog);
  const categories = cards.map(c => c.name);
  const brands = featuredBrands(catalog);
  const route = (r: Route, value?: string) => {
    setExpanded(false);
    if (r !== 'favorite') mobileSearch.close();
    onRoute(r, value);
  };
  const dispatch: NativeDispatch = (a) => {
    if (a.type === 'favorite' || a.type === 'product')
      route(a.type === 'favorite' ? 'favorite' : 'detail', a.id);
  };
  const live = (item: Campaign) => !item.target || Boolean(campaigns?.variant(item.target));
  const open = (item: Campaign) => {
    const variant = item.target && campaigns?.variant(item.target);
    if (variant) route('detail', variant);
    else route('category', 'Todos');
  };
  function render(n: ShellNode, i: number): React.ReactNode {
    if (typeof n === 'string') return n;
    const p = n.props,
      id = p.id,
      cls = p.className;
    const props: Record<string, unknown> = { ...p, key: i };
    let children: React.ReactNode[] = n.children.map(render);
    if (id === 'stage')
      props.className = 'stage ' + (mode === 'desktop' ? 'only-desktop' : 'only-phone');
    if (cls === 'mob-searchwrap') props.hidden = !mobileSearch.open;
    if ('data-mobile-search-toggle' in p) {
      props['aria-expanded'] = mobileSearch.open;
      props['aria-label'] = mobileSearch.open ? 'Cerrar búsqueda' : 'Buscar productos';
      props.onClick = mobileSearch.toggle;
    }
    if ('data-mobile-search-submit' in p) props.onClick = () => route('search', term);
    if ('data-search' in p) {
      props.value = term;
      props.onChange = (e: React.ChangeEvent<HTMLInputElement>) => setTerm(e.currentTarget.value);
      props.onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); route('search', term); }
        if (e.key === 'Escape' && p['data-search'] === 'iphone') { e.preventDefault(); mobileSearch.close(true); }
      };
    }
    const dest = homeRoute(p);
    if (dest) props.onClick = () => route(dest.route, dest.value);
    if (p['data-scroll'] === 'top' || p['data-mobiletab'] === 'inicio')
      props.onClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        if (mode === 'iphone') window.scrollTo({ top: 0, behavior });
        else root.querySelector('.home-viewport')?.scrollTo({ top: 0, behavior });
      };
    if (id === 'categoryToggle') {
      props['aria-expanded'] = expanded;
      props.onClick = () => setExpanded((v) => !v);
    }
    if (id === 'submenu') {
      props.className = 'submenu' + (expanded ? ' visible' : '');
      children = ['Todos', ...categories].map((c) => (
        <button key={c} onClick={() => route('category', c)}>
          {c}
          <Icon name="chevron-right" />
        </button>
      ));
    }
    if (cls === 'editorial-utility') return <UtilityBar key={i} />;
    if (cls === 'editorial-promo-slot') return <EditorialPromos key={i} route={route} />;
    if (cls === 'mobile-category') return <div className="mobile-category" key={i}>{cards.map(c=><button type="button" key={c.name} onClick={()=>route('category',c.name)}><span className="cat-icon"><img src={c.image} alt="" /></span>{c.label}</button>)}</div>;
    if (cls === 'desktop-nav')
      children.push(
        ...categories.map((c) => (
          <button key={c} onClick={() => route('category', c)}>
            {c}
            <Icon name="chevron-right" />
          </button>
        )),
      );
    if ('data-count' in p) children = [String(session.count)];
    if (id === 'desktopHero' || id === 'mobileHero') {
      const main = campaigns?.banners.find((b) => b.slot === 'Principal' && live(b));
      children = [<RotatingHero key="hero" main={main} mobile={id === 'mobileHero'} open={open} route={route} />];
    }
    if (id === 'desktopGrid' || id === 'mobileGrid')
      children = [
        <NativeEvents.Provider key="cards" value={dispatch}>
          {products.length ? (
            <HomeCards
              items={homeItems(products, term)}
              favorites={session.favorites}
              mobile={id === 'mobileGrid'}
            />
          ) : (
            <p className="catalog-empty">
              {catalog.length
                ? 'Aún no hay productos destacados.'
                : 'Aún no hay productos publicados.'}
            </p>
          )}
        </NativeEvents.Provider>,
      ];
    if (cls === 'home-extra') {
      const strips = [
        ...(campaigns?.banners.filter((b) => b.slot === 'Franja superior') ?? []),
        ...(campaigns?.promos ?? []),
      ].filter(live);
      children = [<EditorialDelivery key="delivery" route={route} />, ...strips.map((item) => (
        <ManagedStrip key={item.id} campaign={item} open={() => open(item)} />
      ))];
      if (brands.length)
        children.push(
          <BrandCarousel
            key={brands.join('|')}
            names={brands}
            onBrand={(name) => route('search', name)}
          />,
        );
    }
    if (cls === 'store-footer') children = [<EditorialFooter key="footer" route={route} mobile={mode === 'iphone'} />];
    return React.createElement(n.tag, props, ...children);
  }
  return <><style>{commercialHeroStyles}</style>{tree.map(render)}</>;
}
