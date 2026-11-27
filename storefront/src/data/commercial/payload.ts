import type { HomePayload } from '../../integration/shadow-home';
import type { CommercialSnapshot } from './contract';
import { commercialMoney } from './contract';
export function commercialPayloads(home: HomePayload, shop: HomePayload, data: CommercialSnapshot) {
  const products = data.products;
  // Only featured, available variants on Homepage. Product keys remain variant IDs everywhere.
  const seen = new Set<string>();
  const featured = products.filter((p) => {
    if (!p.featured || !p.available || seen.has(p.productId)) return false;
    seen.add(p.productId);
    return true;
  });
  return {
    homePayload: {
      ...home,
      products: featured.map((p) => ({
        id: p.id,
        name: p.name,
        cat: p.cat,
        price: commercialMoney(p.priceMinor),
        img: p.img,
        available: p.available,
        commercial: true,
      })),
    },
    shopPayload: { ...shop, products },
  };
}
