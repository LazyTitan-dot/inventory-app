export interface Product {
  id: string;
  brand: string;
  cat: string;
  name: string;
  spec: string;
  price: number;
  available: boolean;
  offer: boolean;
  tag: string;
  img: string;
  images?: readonly string[];
  source?: 'commercial';
  productId?: string;
  slug?: string;
  variantId?: string;
  variantName?: string;
  model?: string;
  warrantyMonths?: number;
  currency?: 'DOP';
  priceMinor?: number;
  maxQuantity?: number;
  featured?: boolean;
}
export interface CatalogQuery {
  category?: string;
  brands?: readonly string[];
  maxPrice?: number;
  availableOnly?: boolean;
  offersOnly?: boolean;
  search?: string;
}
export interface CatalogRepository {
  list(query?: CatalogQuery): Promise<readonly Product[]>;
  get(id: string): Promise<Product | null>;
}
