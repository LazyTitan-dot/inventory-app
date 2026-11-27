import type { Product } from '../data/contracts';
export const galleryImages = (product: Product) => [...new Set(product.images ?? [product.img])];
