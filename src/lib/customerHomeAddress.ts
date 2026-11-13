import { emptyAddress, type AddressInput } from './addresses';
// Municipalities and provinces: ONE territorial reference; exact normalized matches only.
const groups: Record<string,string[]> = {
 'Distrito Nacional':['Distrito Nacional','Santo Domingo de Guzmán','Santo Domingo'],
 'Santo Domingo':['Santo Domingo Este','Santo Domingo Norte','Santo Domingo Oeste','Boca Chica','Los Alcarrizos','Pedro Brand','San Antonio de Guerra'],
 'Santiago':['Santiago','Santiago de los Caballeros','San José de las Matas','Tamboril','Licey al Medio','Villa González','Puñal','Jánico','Baitoa','Sabana Iglesia'],
 'Azua':['Azua','Azua de Compostela','Padre Las Casas','Guayabal','Peralta','Sabana Yegua','Las Yayas de Viajama','Tábara Arriba','Estebanía','Las Charcas','Pueblo Viejo'],
 'Baoruco':['Neiba','Neyba','Tamayo','Villa Jaragua','Los Ríos','Galván'],
 'Barahona':['Barahona','Santa Cruz de Barahona','Cabral','Enriquillo','Vicente Noble','Paraíso','Polo','El Peñón','Fundación','Las Salinas','La Ciénaga','Jaquimeyes'],
 'Dajabón':['Dajabón','Loma de Cabrera','Restauración','Partido','El Pino'],
 'Duarte':['San Francisco de Macorís','Arenoso','Castillo','Las Guáranas','Pimentel','Villa Riva','Eugenio María de Hostos'],
 'Elías Piña':['Comendador','Bánica','El Llano','Hondo Valle','Juan Santiago','Pedro Santana'],
 'El Seibo':['El Seibo','Santa Cruz del Seibo','Miches'],
 'Espaillat':['Moca','Cayetano Germosén','Gaspar Hernández','Jamao al Norte','San Víctor'],
 'Independencia':['Jimaní','Duvergé','La Descubierta','Postrer Río','Cristóbal','Mella'],
 'La Altagracia':['Higüey','Salvaleón de Higüey','San Rafael del Yuma'],
 'La Romana':['La Romana','Guaymate','Villa Hermosa'],
 'La Vega':['La Vega','Concepción de La Vega','Constanza','Jarabacoa','Jima Abajo'],
 'María Trinidad Sánchez':['Nagua','Cabrera','El Factor','Río San Juan'],
 'Montecristi':['Montecristi','Monte Cristi','San Fernando de Montecristi','Castañuelas','Guayubín','Las Matas de Santa Cruz','Pepillo Salcedo','Villa Vásquez'],
 'Pedernales':['Pedernales','Oviedo'],
 'Peravia':['Baní','Nizao','Matanzas'],
 'Puerto Plata':['Puerto Plata','San Felipe de Puerto Plata','Altamira','Guananico','Imbert','Los Hidalgos','Luperón','Sosúa','Villa Isabela','Villa Montellano'],
 'Hermanas Mirabal':['Salcedo','Tenares','Villa Tapia'],
 'Samaná':['Samaná','Santa Bárbara de Samaná','Las Terrenas','Sánchez'],
 'San Cristóbal':['San Cristóbal','Bajos de Haina','Cambita Garabitos','Los Cacaos','Sabana Grande de Palenque','San Gregorio de Nigua','Villa Altagracia','Yaguate'],
 'San Juan':['San Juan','San Juan de la Maguana','Bohechío','El Cercado','Juan de Herrera','Las Matas de Farfán','Vallejuelo'],
 'San Pedro de Macorís':['San Pedro de Macorís','Consuelo','Guayacanes','Quisqueya','Ramón Santana','San José de los Llanos'],
 'Sánchez Ramírez':['Cotuí','Cevicos','Fantino','La Mata'],
 'Santiago Rodríguez':['San Ignacio de Sabaneta','Sabaneta','Monción','Villa Los Almácigos'],
 'Valverde':['Mao','Esperanza','Laguna Salada'],
 'Monseñor Nouel':['Bonao','Maimón','Piedra Blanca'],
 'Monte Plata':['Monte Plata','Bayaguana','Sabana Grande de Boyá','Yamasá','Peralvillo'],
 'Hato Mayor':['Hato Mayor','Hato Mayor del Rey','El Valle','Sabana de la Mar'],
 'San José de Ocoa':['San José de Ocoa','Rancho Arriba','Sabana Larga'],
};
const key=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().replace(/\s+/g,' ').toUpperCase();
export function municipalityLocation(value:string):{city:string;province:string}|null {
 const normalized=key(value); if(!normalized)return null;
 // "Santo Domingo" alone can also mean the province: avoid assuming that ambiguous label.
 if(normalized==='SANTO DOMINGO')return null;
 for(const [province,cities] of Object.entries(groups)){
  const city=cities.find(c=>key(c)===normalized);
  if(city)return {city:province==='Distrito Nacional'?'Santo Domingo de Guzmán':city,province};
 }
 return null;
}
export function scannedHome(street:string,sector:string,municipio:string,phone:string):AddressInput{
 const place=municipalityLocation(municipio);
 return emptyAddress({street:street.trim(),sector:sector.trim(),city:place?.city??municipio.trim(),province:place?.province??'',phone});
}
export function legacyHome(address:string,phone:string):AddressInput{
 const parts=address.split(',').map(s=>s.trim()).filter(Boolean);
 const last=parts.at(-1)??'';
 const place=municipalityLocation(last);
 if(place&&parts.length>=3)return scannedHome(parts.slice(0,-2).join(', '),parts.at(-2)??'',last,phone);
 return emptyAddress({street:address,phone});
}
export const hasHomeAddress=(a:AddressInput)=>[a.street,a.sector,a.city,a.province,a.reference].some(v=>v.trim());
