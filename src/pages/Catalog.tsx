import { useMemo, useState } from 'react';
import { Archive, ArrowDownToLine, ArrowUpRight, Plus, ScanLine, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useRetail } from '../state/useRetail';
import { useOperation } from '../state/useOperation';
import type { Product, Variant } from '../lib/contracts';
import { categoryName, downloadCsv, integer, matches, money } from '../lib/format';
import { EmptyState, ErrorNotice, Modal, PageHeader, SearchInput, StatCard } from '../components/ui';
import { ProductImage } from '../components/ProductImage';
import { calculateUnitPrice, potentialUnitProfit } from '../lib/pricing';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { barcodeMatches, getVariantBarcodes } from '../lib/barcode';
import { stockHealth, stockHealthLabels } from '../lib/catalog';
import { ProductEditor } from './CatalogProductEditor';
import { InventoryDetails, StockEditor, StockMeter } from './CatalogDetails';
import { taxRateLabel } from '../lib/format';
import './catalog.css';
export function CatalogPage() {
  const { data, notify } = useRetail();
  const { run, busy, error } = useOperation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('name');
  const [scanner, setScanner] = useState(false);
  const [initialBarcode, setInitialBarcode] = useState('');
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const status = params.get('estado') ?? 'active';
  const [editor, setEditor] = useState<Product | 'new' | null>(null);
  const [adjustment, setAdjustment] = useState<Variant | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const productMap = useMemo(
    () => new Map(data.products.map((product) => [product.id, product])),
    [data.products],
  );
  const stockMap = useMemo(
    () => new Map(data.stocks.map((stock) => [stock.variant_id, stock])),
    [data.stocks],
  );
  const rows = useMemo(
    () =>
      data.variants
        .map((variant) => ({
          variant,
          product: productMap.get(variant.product_id),
          stock: stockMap.get(variant.id),
        }))
        .filter((row): row is typeof row & { product: Product } => Boolean(row.product)),
    [data.variants, productMap, stockMap],
  );
  const activeRows = rows.filter((row) => row.product.active && row.variant.active);
  const lowRows = activeRows.filter((row) => (row.stock?.available ?? 0) <= row.variant.min_stock);
  const outRows = activeRows.filter((row) => (row.stock?.available ?? 0) === 0);
  const positiveLowRows = activeRows.filter(
    (row) => stockHealth(row.stock?.available ?? 0, row.variant.min_stock) === 'low',
  );
  const availableRows = activeRows.filter(
    (row) => stockHealth(row.stock?.available ?? 0, row.variant.min_stock) === 'available',
  );
  const detail = data.variants.find(
    (variant) =>
      variant.id === params.get('variante') ||
      Boolean(params.get('etiqueta') && barcodeMatches(variant, params.get('etiqueta')!)),
  );
  const activeEditor =
    editor || (params.get('nuevo') === '1' && data.permissions.manage_catalog ? 'new' : null);
  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  }
  function openDetail(variant: Variant) {
    updateParams({ variante: variant.id, etiqueta: null });
  }
  function closeDetail() {
    updateParams({ variante: null, etiqueta: null });
  }
  function closeEditor() {
    setEditor(null);
    setInitialBarcode('');
    updateParams({ nuevo: null });
  }
  function selectStatus(value: string) {
    updateParams({ estado: value === 'active' ? null : value });
  }
  const visible = rows
    .filter(({ product, variant, stock }) => {
      const available = stock?.available ?? 0;
      return (
        (status === 'archived'
          ? !product.active || !variant.active
          : product.active && variant.active) &&
        (status !== 'low' || available <= variant.min_stock) &&
        (status !== 'low_stock' || stockHealth(available, variant.min_stock) === 'low') &&
        (status !== 'out' || available === 0) &&
        (status !== 'available' || stockHealth(available, variant.min_stock) === 'available') &&
        (status !== 'unpriced' || variant.price === 0) &&
        (!category || product.category === category) &&
        matches(query, product.brand, product.model, variant.sku, variant.name, ...getVariantBarcodes(variant))
      );
    })
    .sort((a, b) =>
      sort === 'stock'
        ? (a.stock?.available ?? 0) - (b.stock?.available ?? 0) ||
          a.variant.sku.localeCompare(b.variant.sku)
        : sort === 'price'
          ? b.variant.price - a.variant.price || a.variant.sku.localeCompare(b.variant.sku)
          : `${a.product.brand} ${a.product.model} ${a.variant.name}`.localeCompare(
              `${b.product.brand} ${b.product.model} ${b.variant.name}`,
              'es',
            ),
    );
  const units = activeRows.reduce((sum, row) => sum + (row.stock?.available ?? 0), 0);
  const value = activeRows.reduce(
    (sum, row) => sum + (row.stock?.available ?? 0) * (row.variant.cost ?? 0),
    0,
  );
  const revenue = activeRows.reduce(
    (sum, row) => sum + (row.stock?.available ?? 0) * (potentialUnitProfit(row.variant.price, row.variant.cost ?? 0, data.settings.tax_rate)?.finalPrice ?? 0),
    0,
  );
  const potentialProfit = activeRows.reduce(
    (sum, row) => sum + (row.stock?.available ?? 0) * (potentialUnitProfit(row.variant.price, row.variant.cost ?? 0, data.settings.tax_rate)?.profit ?? 0),
    0,
  );
  function exportRows() {
    downloadCsv('inventario-s-mart-living.csv', [
      [
        'SKU',
        'Código de barras',
        'Producto',
        'Variante',
        'Categoría',
        'Disponibles',
        'En revisión',
        'Mínimo',
        'Objetivo',
        'Precio sin ITBIS RD$',
        'ITBIS configurado %',
        'ITBIS por unidad RD$',
        'Precio con ITBIS RD$',
        'Estado de precio',
        ...(data.permissions.view_costs ? ['Costo RD$'] : []),
      ],
      ...visible.map(({ product, variant, stock }) => {
        const amounts = calculateUnitPrice(variant.price, data.settings.tax_rate);
        return [
          variant.sku,
          variant.barcode ?? '',
          `${product.brand} ${product.model}`,
          variant.name,
          categoryName(product.category),
          stock?.available ?? 0,
          stock?.quarantine ?? 0,
          variant.min_stock,
          variant.reorder_target,
          amounts?.base ?? '',
          data.settings.tax_rate,
          amounts?.tax ?? '',
          amounts?.total ?? '',
          amounts ? 'Definido' : 'Precio pendiente',
          ...(data.permissions.view_costs ? [variant.cost ?? 0] : []),
        ];
      }),
    ]);
  }
  function lookupBarcode(code: string) {
    const found = data.variants.filter((variant) =>
      barcodeMatches(variant, code) || variant.sku.trim().toLocaleUpperCase('en-US') === code.trim().toLocaleUpperCase('en-US'),
    );
    if (found.length === 1) openDetail(found[0]!);
    else if (!found.length && data.permissions.manage_catalog) setUnknownBarcode(code.trim());
    else notify(found.length
      ? 'Ese código coincide con varias referencias. Busca el SKU exacto y revisa sus códigos.'
      : 'No encontramos ese código. Revisa el valor con el equipo de inventario.');
  }
  async function archive() {
    if (!archiving) return;
    try {
      await run('archive_product', {
        id: archiving.id,
        active: !archiving.active,
        expected_updated_at: archiving.updated_at,
      });
      notify(
        archiving.active ? 'Producto archivado. Su historial se conserva.' : 'Producto reactivado.',
      );
      setArchiving(null);
    } catch {
      /* El error se presenta en el diálogo. */
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="CATÁLOGO Y EXISTENCIAS"
        title="Inventario"
        description="Todo tu catálogo, existencias y precios. Trabaja con cada referencia sin perder el contexto."
        actions={
          <div className="catalog-header-actions">
            <button className="button secondary" onClick={() => setScanner(true)}>
              <ScanLine size={17} /> Escanear código
            </button>
            <button className="button secondary" onClick={exportRows}>
              <ArrowDownToLine size={17} /> Exportar
            </button>
            {data.permissions.manage_catalog && (
              <button className="button primary" onClick={() => setEditor('new')}>
                <Plus size={18} /> Agregar producto
              </button>
            )}
          </div>
        }
      />
      <div className="stats-grid catalog-stats">
        <StatCard
          label="Productos activos"
          value={integer(data.products.filter((product) => product.active).length)}
          hint={`${activeRows.length} ${activeRows.length === 1 ? 'variante' : 'variantes'} en el catálogo`}
        />
        <StatCard label="Unidades disponibles" value={integer(units)} hint="Listas para vender" />
        <StatCard
          label="Necesitan reposición"
          value={integer(lowRows.length)}
          hint="En el mínimo o por debajo"
          tone="warning"
        />

      </div>
      {data.permissions.view_costs && (
        <details className="catalog-financial-disclosure">
          <summary>Resumen financiero del inventario</summary>
        <div className="catalog-financials">
          <StatCard
            label="Valor del inventario"
            value={money(value)}
            hint="Existencias disponibles a costo"
          />
          <StatCard
            label="Ingreso potencial"
            value={money(revenue)}
            hint="Precio final con ITBIS × unidades disponibles"
          />
          <StatCard
            label="Ganancia potencial"
            value={money(potentialProfit)}
            hint="(Precio final con ITBIS − costo) × unidades con precio"
          />
          <div className="catalog-financial-note">
            <strong>{integer(units)} unidades</strong>
            <span>
              Estimaciones sobre existencias y precios actuales; no representan ventas realizadas.
            </span>
          </div>
        </div>
        </details>
      )}
      <section className="panel catalog-panel" aria-label="Catálogo de productos">
        <div className="toolbar table-toolbar catalog-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Buscar por marca, modelo, SKU o código…"
          />
          <select
            aria-label="Filtrar por categoría"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Todas las categorías</option>
            {Array.from(new Set(rows.map((row) => row.product.category)))
              .sort()
              .map((value) => (
                <option key={value} value={value}>
                  {categoryName(value)}
                </option>
              ))}
          </select>
          <select
            aria-label="Filtrar por estado del catálogo"
            value={status}
            onChange={(event) => selectStatus(event.target.value)}
          >
            <option value="active">Productos activos</option>
            <option value="low">Necesitan reposición</option>
            <option value="low_stock">Stock bajo</option>
            <option value="available">Disponibles</option>
            <option value="out">Agotados</option>
            <option value="unpriced">Precio pendiente</option>
            <option value="archived">Archivados</option>
          </select>
          <select
            aria-label="Ordenar inventario"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="name">Nombre A–Z</option>
            <option value="stock">Menor stock</option>
            <option value="price">Mayor precio</option>
          </select>
        </div>
        <div className="catalog-filter-tabs" role="group" aria-label="Filtrar inventario">
          {[
            ['active', 'Todos', activeRows.length],
            ['available', 'Disponibles', availableRows.length],
            ['low_stock', 'Bajo stock', positiveLowRows.length],
            ['out', 'Agotados', outRows.length],
          ].map(([key, label, count]) => (
            <button
              type="button"
              key={key}
              aria-pressed={status === key}
              onClick={() => selectStatus(String(key))}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <div className="table-meta">
          <span>
            {visible.length} de {rows.length} {rows.length === 1 ? 'variante' : 'variantes'}
          </span>
          {query || category || status !== 'active' || sort !== 'name' ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery('');
                setCategory('');
                setSort('name');
                selectStatus('active');
              }}
            >
              Limpiar filtros
            </button>
          ) : (
            <span>Precios con ITBIS: {taxRateLabel(data.settings.tax_rate)}</span>
          )}
        </div>
        {visible.length ? (
          <>
            <div className="table-wrap catalog-desktop">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto / variante</th>
                    <th>Stock actual</th>
                    <th>Precio con ITBIS</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ product, variant, stock }) => {
                    const amounts = calculateUnitPrice(variant.price, data.settings.tax_rate);
                    const available = stock?.available ?? 0;
                    const health = stockHealth(available, variant.min_stock);
                    return (
                      <tr key={variant.id}>
                        <td>
                          <button className="product-cell" onClick={() => openDetail(variant)}>
                            <ProductImage
                              productId={product.id}
                              source={product.images[0]}
                              alt=""
                              className="product-thumbnail"
                            />
                            <span>
                              <strong>
                                {product.brand} {product.model}
                              </strong>
                              <small>
                                {variant.name} · {categoryName(product.category)}
                              </small>
                              <small className="catalog-row-sku">{variant.sku}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <div className="stock-cell">
                            <strong>
                              {integer(available)} <small>/ mín. {variant.min_stock}</small>
                            </strong>
                            <StockMeter
                              available={available}
                              minimum={variant.min_stock}
                              target={variant.reorder_target}
                            />
                            <span
                              className={`badge ${health === 'out' ? 'danger' : health === 'low' ? 'warning' : 'success'}`}
                            >
                              {stockHealthLabels[health]}
                            </span>
                          </div>
                        </td>
                        <td className="numeric">
                          {amounts ? (
                            <>
                              <strong>{money(amounts.total)}</strong>
                              <small>ITBIS incluido</small>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td>
                          <div className="row-actions">
                            <button className="button ghost" onClick={() => openDetail(variant)}>
                              Ver ficha
                            </button>
                            {data.permissions.manage_catalog && (
                              <>
                                <button
                                  className="icon-button"
                                  aria-label={`Ajustar ${variant.sku}`}
                                  onClick={() => setAdjustment(variant)}
                                >
                                  <SlidersHorizontal size={17} />
                                </button>
                                <button className="button ghost" onClick={() => setEditor(product)}>
                                  Editar
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`${product.active ? 'Archivar' : 'Reactivar'} ${product.model}`}
                                  onClick={() => setArchiving(product)}
                                >
                                  <Archive size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="catalog-mobile">
              {visible.map(({ product, variant, stock }) => {
                const available = stock?.available ?? 0;
                const health = stockHealth(available, variant.min_stock);
                const price = calculateUnitPrice(variant.price, data.settings.tax_rate);
                return (
                  <button
                    type="button"
                    className="catalog-mobile-product"
                    key={variant.id}
                    onClick={() => openDetail(variant)}
                  >
                    <span className="catalog-mobile-top">
                      <ProductImage
                        productId={product.id}
                        source={product.images[0]}
                        alt=""
                        className="product-thumbnail"
                      />
                      <span>
                        <strong>
                          {product.brand} {product.model}
                        </strong>
                        <small>
                          {variant.name} · {variant.sku}
                        </small>
                      </span>
                      <ArrowUpRight size={18} />
                    </span>
                    <span className="catalog-mobile-bottom">
                      <span>
                        <strong>{integer(available)} unidades</strong>
                        <StockMeter
                          available={available}
                          minimum={variant.min_stock}
                          target={variant.reorder_target}
                        />
                        <span
                          className={`badge ${health === 'out' ? 'danger' : health === 'low' ? 'warning' : 'success'}`}
                        >
                          {stockHealthLabels[health]}
                        </span>
                      </span>
                      <span>
                        <strong>{price ? money(price.total) : 'Precio pendiente'}</strong>
                        <small>Con ITBIS</small>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title={
              query || category || status !== 'active'
                ? 'No encontramos productos'
                : 'Tu inventario empieza aquí'
            }
            description={
              query || category || status !== 'active'
                ? 'Prueba otra búsqueda o cambia los filtros.'
                : 'Agrega tu primer producto y registra sus existencias iniciales.'
            }
          />
        )}
      </section>
      {scanner && (
        <BarcodeScanner
          title="Buscar una referencia"
          onDetected={lookupBarcode}
          onClose={() => setScanner(false)}
        />
      )}
      {activeEditor && (
        <ProductEditor
          product={activeEditor === 'new' ? undefined : activeEditor}
          onClose={closeEditor}
          initialBarcode={initialBarcode}
          onSaved={(barcode) => updateParams({ etiqueta: barcode, nuevo: null })}
          onOpenExisting={(variantId) => {
            setEditor(null);
            setInitialBarcode('');
            updateParams({ nuevo: null, variante: variantId, etiqueta: null });
          }}
        />
      )}
      {unknownBarcode && data.permissions.manage_catalog && <Modal title="Código nuevo" onClose={() => setUnknownBarcode('')}>
        <p>Este código todavía no está asociado a un producto.</p>
        <code className="catalog-scanned-code">{unknownBarcode}</code>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={() => setUnknownBarcode('')}>Volver</button>
          <button type="button" className="button primary" onClick={() => {
            setInitialBarcode(unknownBarcode);
            setUnknownBarcode('');
            setEditor('new');
          }}>Agregar con este código</button>
        </div>
      </Modal>}
      {adjustment && <StockEditor variant={adjustment} onClose={() => setAdjustment(null)} />}
      {detail && (
        <InventoryDetails
          key={detail.id}
          variant={detail}
          onClose={closeDetail}
          onEdit={(product) => {
            closeDetail();
            setEditor(product);
          }}
        />
      )}
      {(params.get('variante') || params.get('etiqueta')) && !detail && (
        <ErrorNotice message="No encontramos esa referencia en los datos actuales. Actualiza el catálogo y vuelve a intentar." />
      )}
      {archiving && (
        <Modal
          title={archiving.active ? 'Archivar producto' : 'Reactivar producto'}
          onClose={() => {
            if (!busy) setArchiving(null);
          }}
        >
          <p>
            {archiving.active
              ? 'El producto dejará de aparecer en nuevas ventas. Conservaremos todos sus documentos e historial. Debe estar sin existencias ni compras pendientes.'
              : 'El producto volverá a estar disponible en el catálogo.'}
          </p>
          <ErrorNotice message={error} />
          <div className="modal-footer">
            <button className="button secondary" disabled={busy} onClick={() => setArchiving(null)}>
              Volver
            </button>
            <button className="button primary" disabled={busy} onClick={() => void archive()}>
              {busy ? 'Guardando…' : archiving.active ? 'Archivar' : 'Reactivar'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
