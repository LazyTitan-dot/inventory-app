import { money, taxRateLabel } from '../lib/format';
import { calculateUnitPrice } from '../lib/pricing';
export function PriceDetails({ price, taxRate }: { price: number; taxRate: number }) {
  const amounts = calculateUnitPrice(price, taxRate);
  if (!amounts)
    return (
      <p className="catalog-price-notice">
        {price === 0
          ? 'Precio pendiente: define el precio final para habilitar la venta.'
          : 'Ingresa un precio válido con un máximo de dos decimales.'}
      </p>
    );
  return (
    <div className="catalog-price-preview">
      <dl>
        <div>
          <dt>Precio sin ITBIS</dt>
          <dd>{money(amounts.base)}</dd>
        </div>
        <div>
          <dt>ITBIS ({taxRateLabel(taxRate)})</dt>
          <dd>{money(amounts.tax)}</dd>
        </div>
        <div>
          <dt>Precio con ITBIS</dt>
          <dd>{money(amounts.total)}</dd>
        </div>
      </dl>
      <small>
        Por unidad, antes de descuentos. Se aplica la tasa configurada de {taxRateLabel(taxRate)}.
      </small>
    </div>
  );
}

