# S-mart Living — Inventory & Sales Glass Refinement V2
## Auditoría del código de producción
- `CatalogPage` y `CommercePage(kind="sale")` mantienen pantallas y permisos ya aprobados; existen estilos `inventory-visual-v1.css` y `sales-visual-v1.css` con superficies mayormente planas.
- Clientes V2.1 (`customer-visual-v2.css`) establece: tarjeta navy/cyan con radial/linear gradient, borde luminoso, sombra interior, header translúcido, botones pill y estado oscuro/claro.
- Inventario funciona en tabla comparativa desktop y tarjetas en mobile; usa módulos de detalle, editor, movimientos, escáner, códigos/series y resúmenes financieros.
- Ventas usa caja de dos columnas en Windows, catálogo y CTA móvil con modal de pedido/cobro en iPhone. Comparte carrito/cálculos/precios/descuentos/cupones/pagos, y vínculos de serie. La vista de recibo tiene reglas independientes de impresión y PDF.

## Propuesta visual
### iPhone
1. Header y tarjetas de resumen con hero Glass y jerarquía visible; filtros y tarjetas responsivos, scroll sin recorte.
2. Catálogo de venta con productos táctiles; navegación existente y barra de pedido flotante Glass con CTA prominente y total legible.
3. Carrito en pantalla completa conservando el flujo: tarjeta por producto, controles de cantidad de al menos 44 px, descuento/cupón, resumen de total destacado, medios de pago seleccionables, efectivo/cambio, series y CTA fijo.
4. Respetar safe areas, teclado móvil, modo oscuro/claro, foco, contraste y reducción de transparencia.

### Windows
1. Inventario con KPIs y filtros tipo Glass, tabla Carbon legible sin perder densidad ni comparación de costos/stock.
2. Ventas con catálogo a la izquierda y carrito a la derecha; superficies con profundidad sutil, total visualmente prioritario, pagos y controles claros.
3. Modal de detalle/producto y vista de recibo en pantalla en estilo Glass, **sin alterar la hoja imprimible**.

## Diseño / arquitectura
- Se añade una hoja `inventory-sales-glass-v2.css`, importada **después** de las hojas V1 únicamente en las rutas Inventario y Ventas.
- Todos los selectores quedan bajo las clases existentes de esos módulos y bajo `@media screen`: no afectan Compras, Clientes, Dashboard, Reportes, Posventa ni el CSS de impresión.
- No se modifican TypeScript de cálculos, handlers, RPC, esquema Supabase, stock, escáner ni números de serie; solo estilos visuales.
- Tokens aislados con variantes light/dark; degradaciones por `prefers-reduced-transparency`, `prefers-reduced-motion` y `prefers-contrast:more`.

## Gate de aceptación
- CI: lint, TypeScript, unitarias, PGlite, compilación.
- Playwright: 320/390/1280/1440 px, light/dark; comparar estilos computados, navegación y scroll horizontal; editar producto, filtros, catálogo, carrito, cantidades, cliente, descuento, pago, series, acciones, historial y recibo.
- Repetir regresiones de inventario, ventas, cálculo ITBIS/efectivo, escáner, seriales y PDF/impresión.
- Mantener cambios en rama/PR; fusionar solo con evidencia verde. Ninguna migración de datos necesaria.
