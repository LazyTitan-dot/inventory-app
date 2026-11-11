# Contrato de datos retail v1

Moneda DOP; importes decimales RD$ (sin conversión de datos existentes). Todos los IDs UUID. Fechas ISO8601 del servidor. Campos de filas `snake_case`; colecciones bootstrap en `snake_case`. Cantidades enteras, dinero con dos decimales, tasas porcentuales con dos decimales. Negativos, NaN, infinito y cantidades fraccionarias se rechazan. Tablas nuevas `public.retail_*`; no alteran tablas originales.

## API

`retail_bootstrap()` devuelve `{ profile, permissions, settings, products, variants, stocks, contacts, documents, document_items, movements, deliveries, promotions, audit, team }`. `profile={id,email,display_name,role}`; roles `owner|admin|sales|inventory|viewer`. Arrays vacíos cuando no autorizado. `permissions={manage_catalog,view_costs,sell,purchase,refund,manage_business,manage_team,view_audit}`. `settings` objeto singleton. `retail_command(p_operation uuid,p_action text,p_payload jsonb)` devuelve `{operation_id,action,entity_id,result}`. `result` incluye IDs/documentos relevantes y no sustituye refresh de bootstrap. Repetir UUID con payload idéntico devuelve exactamente el mismo resultado; UUID con otro payload se rechaza. La UI genera un UUID por intención y lo conserva para reintentos de red. Toda escritura transaccional y permisos en servidor.

## Filas

- `products`: `id,category,brand,model,description,warranty_months,images` (string[] URLs), `active,created_at,updated_at`.
- `variants`: `id,product_id,name,sku,barcode,cost,price,min_stock,reorder_target,active,created_at,updated_at`. `cost` no se envía a sales/viewer.
- `stocks`: `variant_id,available,quarantine,updated_at`.
- `contacts`: `id,kind` (`customer|supplier`), `name,email,phone,tax_id,address,notes,active,created_at,updated_at`.
- `documents`: `id,number,type` (`sale|purchase|quote|return`), `status,status_reason,contact_id,contact_snapshot,subtotal,discount,tax_rate,tax,total,currency,payment_method,tendered,change_amount,notes,parent_id,promotion_id,expires_at,created_by,created_at,updated_at`. `sale`: completed/partially_returned/returned/voided/legacy_pending; `purchase`: draft/pending/partial/received/cancelled; `quote`: open/converted/cancelled; `return`: completed. `payment_method`: cash/card/transfer/other; vacío para compra/cotización. `status_reason` conserva el motivo administrativo separado de las condiciones comerciales en `notes`; `number` correlativo por tipo.
- `document_items`: `id,document_id,variant_id,product_snapshot,quantity,received_quantity,returned_quantity,unit_price,unit_cost,discount,tax,line_total,parent_item_id`. `product_snapshot={category,brand,model,name,sku,barcode,warranty_months}`. `unit_cost` omitido para sales/viewer. `discount,tax,line_total` son importes por renglón. Devoluciones cantidades positivas y documento tipo return; reportes restan devoluciones y excluyen ventas voided. `parent_item_id` identifica renglón original en devolución.
- `movements`: `id,variant_id,type,quantity,bucket,before_quantity,after_quantity,reason,document_id,operation_id,created_by,created_at`. bucket available/quarantine. quantity con signo. type opening/adjustment/sale/purchase/return/void.
- `deliveries`: `id,sale_id,status,address,phone,contact_name,scheduled_at,assignee,notes,received_by,delivered_at,history,created_at,updated_at`; status scheduled/in_transit/delivered/failed/cancelled. `history` array `{at,actor,status,note}`.
- `promotions`: `id,name,code,kind,value,starts_at,ends_at,category,product_ids,active,created_at,updated_at`; kind percent/fixed; category nullable; product_ids UUID[]. Un solo cupón por documento; descuentos no se apilan.
- `audit`: `id,action,entity_id,operation_id,actor_id,actor_email,details,created_at`. Solo administración.
- `team`: `user_id,email,display_name,role,active,created_at,updated_at`. Solo owner/admin; únicamente owner cambia privilegios owner/admin.
- `settings`: `id:'global',business_name,tax_id,phone,email,address,currency,timezone,tax_rate,max_sale_discount_percent,receipt_footer,updated_at`; currency DOP/timezone America/Santo_Domingo fijos esta versión. No genera NCF ni afirma emitir comprobantes fiscales. ID almacenado singleton boolean true, serializado 'global' para UI.

`documents.number` es string prefijado (`VEN-0000001`, `COM-0000001`, `COT-0000001`, `DEV-0000001`). `audit.id` es bigint SQL, número JSON. Todos los importes se serializan como números JSON; cálculo autoritativo decimal ocurre en PostgreSQL. Constraints diferidos exigen documento con al menos un renglón y sumas exactas de subtotal, descuento, impuesto y total al commit.

`retail_revision` solo contiene `{id:true,version,updated_at}`, publicada por Supabase Realtime y legible únicamente por miembros activos. Cada comando nuevo incrementa versión; reintento idéntico no incrementa. Ninguna tabla operativa con costos o datos personales se publica.

## Payloads

### Extensión de direcciones, recepciones y seguimiento

La migración `20261111080543_customer_addresses_receipts_tracking.sql` amplía el
contrato sin importar ni sustituir registros existentes. Bootstrap anuncia
`features: ['customer_addresses_v1','purchase_receipts_v1']`. Los clientes previos
pueden ignorar los campos adicionales; la UI nueva activa las escrituras ampliadas
solo cuando el servidor anuncia su capacidad.

- `customer_addresses`: `id,contact_id,label,street,sector,city,province,phone,reference,is_default,active,created_at,updated_at`. Solo owner/admin/sales reciben esta colección. El primer destino queda preferido; como máximo uno activo por cliente. Cambios y preferencia se serializan bloqueando primero el cliente. Crear/reactivar conserva el límite de 100 direcciones activas.
- `save_customer_address`: `{contact_id,label,street,sector?,city,province,phone,reference?,is_default?,id?,expected_updated_at?}`. Editar exige la versión y conserva el cliente original. `set_default_address`: `{id,expected_updated_at}`. `archive_customer_address`: `{id,active,expected_updated_at}`; admite reactivar y selecciona otra preferida cuando corresponde.
- Las entregas añaden `customer_address_id?,address_snapshot?,proof`. `address_snapshot={street,sector,city,province,phone,reference}` guarda una copia; cambiar/archivar la dirección del perfil no la reescribe. `save_delivery` acepta esa copia, una dirección guardada del cliente de la venta, y `save_to_customer/address_label` optativos. Editar manualmente la copia elimina la selección de dirección guardada. Guardar también en perfil es una operación explícita, atómica y solo de owner/admin/sales. Las direcciones históricas de texto se conservan.
- `status_delivery` acepta `proof` con `received_by`. Las entregas estructuradas exigen destino válido y responsable antes de despachar, y receptor más constancia para entregar. El historial conserva las instantáneas de receptor/constancia y los intentos fallidos. Entregar no descuenta inventario nuevamente.
- Los documentos de compra añaden `expected_at` (fecha, opcional) y `closed_short`. `create_purchase` acepta `expected_at`. `receive_purchase` ampliado exige `expected_updated_at` y partidas `{item_id,quantity,damaged_quantity?}`: `quantity` son unidades conformes; conformes más dañadas no pueden superar el saldo. `received_quantity` acumula ambas; `damaged_quantity` conserva las dañadas acumuladas. Conformes entran en `available` y su costo ponderado; dañadas entran en `quarantine` sin aumentar existencias vendibles ni su costo ponderado.
- `purchase_receipts`: solo owner/admin/inventory; `{id,purchase_id,operation_id,received_by,notes,items:[{item_id,variant_id,quantity,damaged_quantity,unit_cost}],created_at}`. Una recepción por operación, con instantáneas y auditada en la misma transacción.
- `close_purchase_short`: `{id,expected_updated_at,reason}`. Solo compras pending/partial con saldo; queda `status: closed_short,closed_short:true`, conserva unidades/stock recibidos y no admite nuevas recepciones.

Las tablas nuevas tienen RLS y privilegios directos revocados. Los comandos
mantienen autorización viva, guardas de versión, reintentos idempotentes y
auditoría/revisión. Para revertir una publicación se restaura la aplicación
anterior; se conservan tablas y registros nuevos, sin borrado destructivo.

Campos `id` opcionales en altas, obligatorios en edición; UUID nuevo generado por servidor si se omite.

La migración `20261111151930_catalog_tax_rate_guard.sql` añade una guarda opcional
al guardado de catálogo: `expected_tax_rate` debe ser un número entre 0 y 100,
con la precisión admitida para tasas, igual a la tasa vigente de
`retail_settings`. El servidor bloquea esa fila `FOR SHARE` hasta finalizar el
comando; un cambio de tasa rechazará la edición completa antes de escribir el
producto. El editor de precio final envía la tasa con la que el usuario revisó
el desglose y conserva el borrador cuando necesita recalcularlo. La omisión del
campo mantiene la compatibilidad anterior. Un reintento ya confirmado con UUID y
payload idénticos devuelve el resultado original sin volver a aplicar la
escritura. Se conserva `variants.price` como precio neto de dos decimales; no se
reescriben precios ni documentos históricos. La conversión del total con ITBIS
muestra cualquier ajuste de centavo en la UI antes de guardar.

- `save_product`: `{id?,category,brand,model,description?,warranty_months,images?:string[],expected_tax_rate?:number,variants:[{id?,name,sku,barcode?,cost,price,min_stock,reorder_target,active?,opening_quantity?}]}`. Variantes existentes omitidas se archivan, nunca eliminan; `opening_quantity` solo al crear. Producto activo por defecto. Validar mínimo una variante activa. Variantes con existencias o pedidos pendientes no se archivan.
- `archive_product`: `{id,active:boolean}`. Archivar con existencias/pedidos pendientes rechazado.
- `save_contact`: `{id?,kind,name,email?,phone?,tax_id?,address?,notes?}`; `archive_contact`: `{id,active:boolean}`.
- `adjust_stock`: `{variant_id,quantity:number,expected_quantity:number,bucket?:available|quarantine,reason}`; cantidad es diferencia con signo, no saldo final. Motivo obligatorio. expected_quantity es el saldo observado al abrir formulario; rechaza si cambió mientras tanto.
- `create_sale`: `{contact_id?,items:[{variant_id,quantity,expected_price?:number}],discount?:number,promotion_code?:string,tax_rate?:number,payment_method,tendered?:number,notes?}`. Precio del catálogo validado en servidor y mayor que cero; cero significa precio pendiente y bloquea nuevas ventas/cotizaciones. Un descuento autorizado de 100% sobre precio base positivo sigue siendo válido. `expected_price` previene confirmar precio cambiado. `discount` monto global; caja limitado por configuración. `tax_rate` si difiere del negocio solo admin/owner. Efectivo exige tendered≥total; otros registra total exacto.
- `create_purchase`: `{contact_id,items:[{variant_id,quantity,unit_cost}],notes?}`; costo unitario explícito, proveedor activo requerido.
- `receive_purchase`: `{id,items:[{item_id,quantity}],notes?}`. Cantidades de esta recepción, no acumuladas.
- `cancel_purchase`: `{id,reason,expected_updated_at?}`. Cancela borrador, pendiente o parcialmente recibida y conserva lo recibido. La UI envía versión; opcional en servidor por compatibilidad con el contrato original.
- `confirm_purchase_draft`: `{id,expected_updated_at}`. Solo owner/admin/inventory. Pasa de draft a pending sin mover stock ni cambiar costos, precios, descuentos, impuestos o fechas históricas. Requiere proveedor activo, cada partida enlazada al producto/variante activo con identidad coherente y ninguna recepción previa. Una partida sin vínculo se resuelve explícitamente antes de confirmar.
- `create_quote`: mismo `items,contact_id,discount,promotion_code,tax_rate,notes` de venta, más `expires_at` ISO; sin pago ni movimiento.
- `update_quote`: payload completo de `create_quote` más `{id,expected_updated_at}`. Solo owner/admin/sales y cotización open no convertida. Recalcula desde el catálogo actual y valida límites de descuento, promoción, vigencia y `expected_price`; conserva id, número, creador y fecha de creación. No mueve inventario. La UI debe presentar cambios de precio para aceptarlos antes de enviar. El estado anterior queda en auditoría administrativa.
- `cancel_quote`: `{id,reason,expected_updated_at}`. Solo owner/admin/sales, cotización open; conserva líneas y condiciones, estado cancelled, motivo en status_reason. No mueve inventario.
- `convert_quote`: `{id,payment_method,tendered?}`. Conserva precios/descuento/impuestos cotizados; verifica vigencia, catálogo y existencias; conversión única.
- `return_sale`: `{id,items:[{item_id,quantity,condition:available|quarantine}],reason,payment_method}`. `id` venta original; solo administración. Reembolso calculado histórico, acumulado limitado. Una entrega scheduled/in_transit/failed debe resolverse o cancelarse antes de devolver, para no dejar entregas vinculadas a venta devuelta.
- `void_sale`: `{id,reason}`. Solo administración; bloqueada con devoluciones o entregas no canceladas; repone disponible una vez.
- `save_delivery`: `{id?,sale_id,address,phone,contact_name,scheduled_at,assignee?,notes?}`. Una entrega activa por venta; editar/reprogramar solo scheduled/failed.
- `status_delivery`: `{id,status,note?,received_by?}`; scheduled→in_transit/cancelled, in_transit→delivered/failed, failed→scheduled/cancelled. Fallida exige motivo; entregada receptor.
- `save_promotion`: `{id?,name,code?,kind,value,starts_at,ends_at,category?,product_ids?:[],active?:boolean}`.
- `save_settings`: `{business_name,tax_id?,phone?,email?,address?,tax_rate,max_sale_discount_percent,receipt_footer?}`.
- `set_member_role`: `{email,role,active,display_name?}`. Usuario debe existir en Auth; no registra ni invita usuarios por sí solo. Último owner activo protegido.
- `link_historical_item`: `{item_id,variant_id,expected_updated_at,reason}`. Solo owner/admin; partida importada con variante nula. Bloquea documento y variante, exige catálogo activo y coincidencia de marca, modelo, nombre y SKU (SKU padre importado o su prefijo con sufijo de variante son válidos). Enlaza únicamente la clave foránea; conserva snapshot, costo, precio e importes históricos. Registra actor, fecha y motivo. `expected_updated_at` es la versión del documento que contiene la partida, no una versión de la partida. Devuelve también `result.item_id` y `result.variant_id`.
- `cancel_legacy_sale`: `{id,reason,expected_updated_at,stock_already_accounted:true,stock_effect:'none'}`. Solo owner/admin, venta legacy_pending y sin entrega no cancelada. Cierre administrativo a voided que exige declaración explícita de inventario conciliado. No registra movimiento ni reembolso; conserva la procedencia y agrega la declaración de conciliación. No permite confirmar automáticamente la venta antigua.

Las acciones nuevas del ciclo documental devuelven `result={id,number,status,total,updated_at}` y `entity_id` del documento. `expected_updated_at` se envía exactamente como llega en bootstrap (sin recortar precisión). El servidor compara la versión bajo bloqueo antes de modificar. Una versión vieja produce error y exige recargar; el reintento con el mismo UUID y payload recibe su resultado previo aun si la versión ya cambió. Reintentos no duplican auditoría ni revisión.

Errores esperados SQLSTATE `P0001`, `42501`, `23505`, `23514`, `22P02`: UI debe presentar mensaje español útil y conservar formulario. No presentar detalles SQL desconocidos al usuario. Direct CRUD autenticado denegado; toda lectura autorizada vía bootstrap, todas las escrituras vía command.

## Corte del sistema anterior

La cuarta migración solo define infraestructura y funciones. **Aplicar el archivo no importa datos ni congela el sistema anterior.** La función privada `retail_private.import_legacy(expected_sha256,source_commit,actor_id,true)` es una operación administrativa separada; no se expone ni se concede a clientes autenticados. Requiere un manifiesto revisado (`retail_private.legacy_manifest()`), propietario activo y destino operativo vacío. Se ensaya dentro de `BEGIN` / `ROLLBACK` antes del corte real.

La migración adicional de ciclo documental bloquea todas las escrituras vía `retail_command` mientras existan productos/ventas originales y no haya una importación completada. Evita poblar accidentalmente el destino durante la ventana de despliegue anterior al corte. Devuelve un mensaje de actualización del negocio en curso; no bloquea instalaciones nuevas sin datos antiguos ni operaciones después del commit de importación. La guardia no congela por sí sola la aplicación anterior: la congelación sigue perteneciendo a la transacción de corte revisada.

La importación bloquea temporalmente escrituras en las once tablas originales, revalida el manifiesto, archiva cada sobre original íntegro en `retail_private.legacy_archive`, importa una vez y revoca accesos API antiguos (incluidas concesiones por columna) al finalizar la misma transacción. La copia tiene SHA256 sobre `to_jsonb(fila)::text`, UTF-8, PostgreSQL, zona UTC. Es una forma canónica de la fila JSONB existente, no una afirmación de conservar una serialización anterior a PostgreSQL. Las ACL originales se conservan en `retail_private.legacy_acl`. El archivo raw es inmutable por trigger; no se eliminan ni actualizan filas originales. Una repetición del mismo manifiesto devuelve el resultado inicial sin alterar documentos ni saldo; otro manifiesto se rechaza.

`legacy_map` mapea origen/fila/clave de entidad a UUID. Variantes pertenecen a su producto: no basta el ID corto de variante. La vinculación de una partida histórica exige coincidencia de producto, variante, marca, modelo y nombre del snapshot original. Una identidad reutilizada o eliminada produce `variant_id:null` e incidencia; jamás se vincula a otro modelo por semejanza. Operaciones posteriores que requieren una variante conservan su validación y rechazan enlaces ausentes.

El saldo de corte crea movimientos `opening` y no reproduce ventas ni recepciones históricas. SKU padre se conserva en `legacy.product_sku` y se usa prefijo con sufijo ordinal por variante. `reorder_target = minStock + reorderQty` conserva explícitamente la intención de lote original; la regla aparece en metadata. Importes conservan DOP, fechas sin offset se interpretan en `America/Santo_Domingo`, y fechas con offset lo respetan. Diferencias aritméticas de documentos bloquean la importación completa. Diferencias entre impuesto declarado y cálculo por tasa se preservan como estaban y se reportan; no se corrige retroactivamente una venta.

Las categorías conservan sus códigos canónicos (`tv`, `refrigerator`, `washing_machine`, etc.) tanto en catálogo como en snapshots históricos. La interfaz traduce esos códigos a español. Filtros, edición y alcance de promociones comparan el mismo identificador; la migración no convierte códigos en etiquetas visibles.

Las filas importadas incorporan un objeto `legacy` con identidad/procedencia segura, sin raw privado. Los documentos aceptan `created_by:null` únicamente con procedencia legada, y no atribuyen al migrador la autoría comercial. Estado de venta antiguo `pending` se conserva como `legacy_pending`, excluido de ventas confirmadas. Compra antigua `draft` permanece `draft`, excluida de mercancía confirmada pendiente; `sent` pasa a `pending`. Las partidas sin garantía explícita conservan `product_snapshot.warranty_months:null` y `warranty_unknown:true`. El recibo debe mostrar **Garantía no registrada en el sistema anterior**. NCF original se conserva en `legacy.ncf_number`, con `fiscal_status:'legacy_unverified'`; no se genera ni certifica NCF nuevo.

`retail_migration_report()` devuelve `{batches,issues,activity}` solo para owner/admin. Incluye incidencias y la bitácora anterior con markup quitado (renderizar siempre como texto). No devuelve raw de contactos, documentos ni imágenes. `legacy_pending`, `draft`, costos/precios cero, garantía desconocida y partidas sin variante necesitan estados visuales claros, nunca una falsa confirmación de negocio.

## Imágenes

El bucket privado `retail-product-media` permite a miembros activos leer, y a owner/admin/inventory subir/actualizar. No concede borrado. Límite 10 MiB; MIME JPEG/PNG/WebP. El cliente sube con `upsert:false` y guarda `storage:<objectPath>`; el servidor comprueba existencia. Para presentar una imagen nueva, el cliente solicita URL firmada mediante Storage, sin hacer público el bucket.

Políticas restrictivas delimitan este bucket aunque existan otras políticas permisivas de Storage: un usuario ajeno, anónimo o sin rol de catálogo no obtiene permisos adicionales por ellas. Un bucket preexistente público, sin límite o con MIME extra bloquea la migración para revisión. No se transforma silenciosamente su configuración ni se usa como almacenamiento público.

Imágenes del sistema anterior permanecen íntegras en el archivo privado. Catálogo/`bootstrap` solo transportan `legacy:<productUUID>:<índice original>`. `retail_product_image(p_product_id uuid,p_index integer)` devuelve texto data URL a miembros activos; valida base64, firma binaria JPEG/PNG/WebP y tamaño decodificado. Una cabecera `image/png` con contenido SVG se rechaza. Se carga bajo demanda por producto; no transfiere las imágenes de todo el catálogo. `save_product` permite reordenar referencias históricas del mismo producto y referencias de archivos ya subidos. No permite reutilizar una referencia histórica de otro producto.

El perfil sanitizado real se ensayó localmente sin PII ni contenido de imágenes: 13 productos, 25 variantes, 216 unidades actuales, 30 ventas, 3 compras, 47 partidas y 2 entregas. El ensayo conserva todas las sumas originales. Detecta 16 partidas sin enlace seguro, 41 garantías sin evidencia, 2 discrepancias de tasa/impuesto y 14 variantes con costo/precio cero. Este ensayo no sustituye el corte remoto con manifiesto completo ni valida los campos PII omitidos del perfil.
