import type { Product } from './contracts';
const editorial = [
  {name:'Celulares',image:'/editorial/cat-phone.png'},
  {name:'Televisores',image:'/editorial/cat-tv.png'},
  {name:'Aires',image:'/editorial/cat-air.png'},
  {name:'Neveras',image:'/editorial/cat-fridge.png'},
  {name:'Estufa',image:'/editorial/cat-stove.png'},
];
export function categoryCards(products: readonly Product[]) {
  const cards=editorial.map(c=>({...c,label:c.name}));
  for(const p of products) {
    if(!cards.some(c=>c.name===p.cat))cards.push({name:p.cat,label:p.cat,image:p.img});
  }
  return cards;
}
export function featuredBrands(products:readonly Product[]) {
  const names=['Samsung','LG','Hisense','Whirlpool','Frigidaire'];
  for(const p of products)if(p.brand&&!names.some(b=>b.toLowerCase()===p.brand.toLowerCase()))names.push(p.brand);
  return names;
}
