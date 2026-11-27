export type Mode = 'desktop' | 'iphone';
export type Route =
  | 'favorite'
  | 'home'
  | 'category'
  | 'search'
  | 'detail'
  | 'carrito'
  | 'favoritos'
  | 'ofertas';
export interface SessionSnapshot {
  count: number;
  favorites: string[];
}
