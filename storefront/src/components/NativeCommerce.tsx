import type { Product } from '../data/contracts';
import { ActionButton } from './NativeEvents';
import { Icon } from './NativeCatalog';
import { commercialMoney } from '../data/commercial/contract';
const arrow = <Icon name="chevron-right" />;
function CartItem({ p, n }: { p: Product; n: number }) {
  return (
    <article className="commerce-item">
      <div className="commerce-photo">
        <img src={p.img} alt={p.name} />
      </div>
      <div className="commerce-item-info">
        <span className="commerce-item-brand">
          {p.brand} · {p.cat}
        </span>
        <div className="commerce-item-name">{p.name}</div>
        <strong className="commerce-item-price">
          {p.priceMinor !== undefined
            ? commercialMoney(p.priceMinor)
            : commercialMoney(Math.round(p.price * 100))}
        </strong>
      </div>
      <div className="commerce-item-actions">
        <div className="commerce-quantity">
          <ActionButton
            action={{ type: 'cart-quantity', id: p.id, delta: -1 }}
            type="button"
            data-commerce-qty="-1"
            data-item={p.id}
            aria-label={'Disminuir ' + p.name}
            disabled={n === 1}
          >
            −
          </ActionButton>
          <span aria-live="polite">{n}</span>
          <ActionButton
            action={{ type: 'cart-quantity', id: p.id, delta: 1 }}
            type="button"
            data-commerce-qty="1"
            data-item={p.id}
            aria-label={'Aumentar ' + p.name}
            disabled={n >= (p.maxQuantity ?? 9)}
          >
            +
          </ActionButton>
        </div>
        <ActionButton
          action={{ type: 'cart-remove', id: p.id }}
          type="button"
          data-commerce-remove={p.id}
          className="commerce-remove"
        >
          Eliminar
        </ActionButton>
      </div>
    </article>
  );
}
export function Commerce(props: { lines: { p: Product; n: number }[]; subtotal: number }) {
  return (
    <>
      <div className="commerce-top">
        <ActionButton action={{ type: 'checkout', action: 'catalog' }} className="commerce-back">
          {arrow} Volver al catálogo
        </ActionButton>
      </div>
      <h2>Tu carrito</h2>
      <div className="commerce-layout">
        <div className="commerce-card">
          {props.lines.length ? (
            props.lines.map((l) => <CartItem key={l.p.id} {...l} />)
          ) : (
            <p>Tu carrito está vacío.</p>
          )}
        </div>
        <aside className="commerce-card commerce-summary-card">
          <div className="commerce-summary">
            <h3>Total de artículos</h3>
            <strong>{commercialMoney(Math.round(props.subtotal * 100))}</strong>
            <p>ITBIS incluido. Los pedidos online aún no están habilitados.</p>
            <ActionButton
              action={{ type: 'checkout', action: 'catalog' }}
              className="commerce-secondary"
            >
              Seguir explorando
            </ActionButton>
          </div>
        </aside>
      </div>
    </>
  );
}
