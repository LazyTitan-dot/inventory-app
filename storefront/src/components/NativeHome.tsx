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
      if(section.matches(':hover')||section.contains(root.activeElement))return;
      setIndex(v=>(v+1)%count);
    },6500);
    return ()=>window.clearInterval(timer);
  },[paused,reduced,index,count]);
  const slide=index>0?editorialSlides[index-1]:undefined;
  const art=slide&&<img src={slide.asset} alt="" className={mobile?'hero-image editorial-slide-image':'editorial-slide-image'}/>;
  const current=slide?<><div className={mobile?'mobile-hero-copy':'desktop-hero-copy'}><h2>{slide.title}</h2><p>{slide.subtitle}</p><div className="hero-actions"><button type="button" className="actionprimary" onClick={()=>route('category',slide.category)}>Explorar productos <Icon name="chevron-right"/></button></div></div>{mobile?art:<div className="desktop-hero-art editorial-slide-art">{art}</div>}</>:main?<><ManagedHero campaign={main} mobile={mobile} open={()=>open(main)}/>{!main.asset&&(mobile?<img className="hero-image" src="/editorial/hero.png" alt=""/>:<div className="desktop-hero-art"><img src="/editorial/hero.png" alt=""/></div>)}</>:<EditorialHero mobile={mobile} route={route}/>;
  return <>{current}<div ref={controls} className="commercial-hero-controls" role="group" aria-label="Banners comerciales">
    <button type="button" aria-label="Banner anterior" onClick={()=>setIndex(v=>(v+count-1)%count)}><span aria-hidden="true" className="commercial-prev"><Icon name="chevron-right"/></span></button>
    {Array.from({length:count},(_,i)=><button key={i} type="button" aria-label={'Banner '+(i+1)+' de '+count} aria-current={i===index?'true':undefined} onClick={()=>setIndex(i)}><span className={'commercial-dot'+(i===index?' active':'')}/></button>)}
    <button type="button" aria-label="Siguiente banner" onClick={()=>setIndex(v=>(v+1)%count)}><Icon name="chevron-right"/></button>
    <button type="button" aria-label={paused||reduced?'Carrusel detenido':'Pausar banners'} aria-pressed={paused||reduced} disabled={reduced} onClick={()=>setPaused(v=>!v)}>{paused||reduced?'▶':'Ⅱ'}</button>
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
  const [expanded, setExpanded] = React.useState(false);
  const campaigns = React.useContext(CampaignContext);
  const cards = categoryCards(catalog);
  const categories = cards.map(c => c.name);
  const brands = featuredBrands(catalog);
  const route = (r: Route, value?: string) => {
    setExpanded(false);
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
    if ('data-search' in p) {
      props.value = term;
      props.onChange = (e: React.ChangeEvent<HTMLInputElement>) => setTerm(e.currentTarget.value);
      props.onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') route('search', term);
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
