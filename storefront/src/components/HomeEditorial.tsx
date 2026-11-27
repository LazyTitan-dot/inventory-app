import * as React from 'react';
import { Icon } from './NativeCatalog';
import type { Route } from '../integration/controller';
type Navigate=(r:Route,v?:string)=>void;
const promos=[
 {title:'Celulares para tu ritmo',subtitle:'Rendimiento, cámara y conectividad.',cta:'Ver celulares',cat:'Celulares',asset:'/editorial/promo-phone.png',style:''},
 {title:'Electrodomésticos para tu hogar',subtitle:'Funcionalidad, diseño y eficiencia.',cta:'Ver más',cat:'Neveras',asset:'/editorial/promo-fridge.png',style:'pale'},
 {title:'Ambientes más frescos',subtitle:'Aires acondicionados para tu comodidad.',cta:'Ver aires',cat:'Aires',asset:'/editorial/promo-air.png',style:'sky'},
];
export function UtilityBar(){return <div className="utility"><div className="utility-features"><span><Icon name="pin"/> Santo Domingo, RD</span><span><Icon name="truck"/> Entrega a domicilio</span><span><Icon name="card"/> Diversos métodos de pago</span></div></div>}
export function EditorialHero({mobile,route}:{mobile:boolean;route:Navigate}){
 return <><div className={mobile?'mobile-hero-copy':'desktop-hero-copy'}><h2>Tecnología y hogar, a tu alcance.</h2><p>Encuentra lo que necesitas para tu día a día. Explora tecnología y electrodomésticos con información clara y atención cercana.</p><div className="hero-actions"><button type="button" className="actionprimary" onClick={()=>route('category','Todos')}>Explorar productos <Icon name="chevron-right"/></button></div></div>{mobile?<img className="hero-image" src="/editorial/hero.png" alt="Tecnología y electrodomésticos, imagen editorial"/>:<div className="desktop-hero-art"><img src="/editorial/hero.png" alt="Tecnología y electrodomésticos, imagen editorial"/></div>}</>
}
export function EditorialPromos({route}:{route:Navigate}){return <div className="promo-grid editorial-promos" aria-label="Explora nuestras categorías">{promos.map(p=><button type="button" key={p.cat} className={'promo '+p.style} onClick={()=>route('category',p.cat)}><span className="copy"><h3>{p.title}</h3><p>{p.subtitle}</p><span className="link">{p.cta}<Icon name="chevron-right"/></span></span><img src={p.asset} alt="" loading="lazy"/></button>)}</div>}
export function EditorialDelivery({route}:{route:Navigate}){return <div className="shipping-banner"><div className="shipping-copy"><span>ENTREGAS S-MART LIVING</span><h2>Entrega a domicilio</h2><p>De nuestra tienda a tu puerta.</p><small>Consulta cobertura y condiciones al confirmar tu pedido.</small><button className="actionsecondary editorial-delivery-cta" type="button" onClick={()=>route('category','Todos')}>Explorar productos <Icon name="chevron-right"/></button></div><img className="shipping-fleet" src="/editorial/fleet.jpg" alt="Vehículo de entregas S-mart Living, imagen conceptual" loading="lazy"/></div>}
const groups=[
 {title:'Nuestra empresa',items:['Sobre nosotros','Contáctanos','Nuestra tienda']},
 {title:'Servicios',items:['Envíos y entregas','Retiro en tienda','Garantías']},
 {title:'Centro de ayuda',items:['Servicio al cliente','Preguntas frecuentes','Seguimiento de pedidos']},
 {title:'Información legal',items:['Términos y condiciones','Política de privacidad','Cambios y devoluciones']},
];
const information:Record<string,string>={
 'Sobre nosotros':'S-mart Living — tecnología y hogar en Santo Domingo, República Dominicana.',
 'Contáctanos':'Envía tu solicitud desde el carrito; coordinaremos los detalles mediante el contacto que indiques.',
 'Envíos y entregas':'La cobertura, el costo y las condiciones de entrega se coordinan antes de confirmar el pedido.',
 'Retiro en tienda':'Consulta disponibilidad y condiciones de retiro al confirmar tu pedido.',
 'Garantías':'Consulta la garantía indicada en la ficha del producto y las condiciones al confirmar.',
 'Servicio al cliente':'Usa la referencia de tu pedido al comunicarte con nuestro equipo.',
 'Preguntas frecuentes':'Solicitar un pedido no genera un cobro. El equipo confirma disponibilidad, entrega y forma de pago.',
 'Seguimiento de pedidos':'Conserva la referencia que recibes al enviar tu pedido. El seguimiento mediante cuenta de cliente aún no está disponible.',
 'Términos y condiciones':'La solicitud queda pendiente de confirmación. Consulta las condiciones comerciales antes de realizar el pago.',
 'Política de privacidad':'Los datos de contacto y entrega solicitados en el checkout se utilizan para gestionar el pedido. La política completa está pendiente de publicación.',
 'Cambios y devoluciones':'Consulta las condiciones aplicables al producto antes de confirmar la compra.',
};
export function EditorialFooter({route,mobile}:{route:Navigate;mobile:boolean}){
 return <><div className="foot-news"><h2>Recibe nuestras novedades y ofertas</h2><p>Suscripción por correo y redes sociales próximamente.</p><div className="demo-subscribe"><input type="email" aria-label="Correo electrónico" placeholder="Correo electrónico" disabled/><button type="button" disabled>Suscribirme</button></div><div className="footer-social">{['Instagram','Facebook','WhatsApp'].map(s=><button disabled key={s} type="button">{s}</button>)}</div></div><div className="foot-groups">{groups.map(g=><details key={g.title} open={!mobile||undefined}><summary>{g.title}<Icon name="chevron-right"/></summary>{g.items.map(item=>item==='Nuestra tienda'?<button key={item} type="button" onClick={()=>route('category','Todos')}>{item}</button>:<details className="foot-info" key={item}><summary>{item}<Icon name="chevron-right"/></summary><p>{information[item]}</p></details>)}</details>)}</div><p className="foot-copy">© {new Date().getFullYear()} S-mart Living. Todos los derechos reservados.</p></>
}
