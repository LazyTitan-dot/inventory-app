# Contratos y riesgos de migración del legado JSON

Auditoría documental, 24 de septiembre de 2026. Fuentes: master `b6a7a99a9462216a8d3903f4bad552dbbb837eb2` y commit desplegado identificado por root `dbef40a8763a67427d78405bfa51f691786b5dfb` (`origin/claude/epic-volta-6gfjul`). Se comparó código con `git show/diff`; los contratos JSON y SQL no cambian. `7d4d28a` ya corrigió guardado anticipado, XSS de render, tipos de ID en diff y numeración basada en longitud; **no se presentan como fallos vigentes**. La migración debe contemplar datos históricos creados antes de esas correcciones y duplicados posibles bajo concurrencia actual. No se ejecutaron consultas contra backend ni se modificó esquema. Las consultas son diagnósticos de solo lectura pendientes de ejecutar/validar en el entorno autorizado.

## 1. Identificar la fuente antes de transformar

Hay dos contratos incompatibles en el repositorio:

| Perfil | Fuente y contrato | Interpretación |
| --- | --- | --- |
| Documento monolítico | `setup.sql:7–12`: `public.stores(id uuid, user_id uuid unique, data jsonb, updated_at)` | `data` contiene arrays con nombres de estado JS: `products`, `sales`, `customers`, `suppliers`, `purchaseOrders`, `quotes`, `returns`, `deliveries`, `promotions`, `activityLog`, más `currency`, `exchangeRate`, `ncfSeq`. La forma exacta real debe inspeccionarse. |
| Entidades JSON | `inventory-app.html:1318–1330,1363–1364`: diez tablas con `{id, user_id, data, updated_at}`; settings global | Tabla y payload tienen IDs. La migración 002 deja `id` como PK y `user_id` como último escritor; **no es dueño del negocio**. Antes de dicha migración la PK podría ser `(user_id,id)`. |

No unir los perfiles ni elegir automáticamente “el más nuevo” por `updated_at`: pueden representar copias antiguas, negocios distintos o datos complementarios. No ejecutar `migrations/002_shared_inventory.sql` como preparación: borra filas de un UUID fijo y recrea settings. Falta la migración que crea las diez tablas, por lo que el SQL versionado no demuestra el esquema desplegado.

Cada fila extraída debe tener un sobre de migración independiente del negocio:

```text
source_system / source_profile / source_table
source_partition       # store.id para stores; partición auditada para entidades
source_row_id          # texto exacto del contenedor, no UUID supuesto
source_payload_id      # texto del id del objeto, sin perder el JSON original
source_payload_id_type # string/number/null/otro
source_updated_at
payload_raw            # copia inmutable del JSON
payload_sha256         # hash de bytes/export canónico documentado
extraction_batch_id / extracted_at / source_commit
target_organization_id # asignación explícita, nunca inferida de user_id último escritor
```

La extracción debe ser consistente entre tablas, completa/paginada y con conteo por entidad. Un JSON exportado por la UI puede contener cambios no confirmados o una carga truncada; no considerarlo backup autoritativo sin conciliación. Evitar imprimir PII o imágenes completas en resultados de diagnóstico; normalmente bastan IDs, conteos y motivos.

## 2. Contratos de transformación propuestos

Nombres de destino ilustrativos; deben ajustarse al esquema normalizado definitivo.

| Origen | Destino lógico | Contrato y prohibiciones |
| --- | --- | --- |
| products | products, product_variants, product_media | ID del producto y variante deben mapearse por `(origen, partición, productId, variantId)`. No asumir variantId global. SKU original pertenece al producto; no copiarlo como SKU único de cada variante. Conservar códigos como texto, incluidos ceros iniciales. `expanded` pasa a preferencia/no dominio. |
| variants.quantity | inventory_balances + movimiento de apertura de migración | Cantidad actual es saldo de corte. **No volver a descontar ventas históricas ni volver a recibir compras históricas.** El log antiguo no es kardex completo para reconstruir saldo. Distinguir historial comercial importado de movimientos efectivos posteriores al corte. |
| sales y items | sales, sale_lines, recorded_payments | Mantener snapshot de nombres, SKU, variante, costo/precio, cliente, cantidades e importes. No recalcular ventas antiguas con catálogo actual. Método `cash/card/transfer` solo acredita registro manual, no cobro validado por proveedor. Mantener número legible y clave interna separada. |
| customers/suppliers | customers, suppliers | No deduplicar por nombre/teléfono/email sin revisión. Archivar/crear referencia legada si un documento histórico apunta a entidad eliminada; no perder el snapshot. `rnc` es texto original, no garantía de validez. |
| purchase_orders/items | purchase_orders, purchase_order_lines, legacy_receipt_evidence | `received` prueba estado declarado, no fecha/actor/cantidades parciales. Se puede preservar como orden históricamente recibida, pero no generar un nuevo aumento de inventario. Guardar incertidumbre de recepción/costo; no inventar costo promedio. |
| quotes/items | quotes, quote_lines | Preservar expiración y conversión declarada; `convertedSaleId` puede estar huérfano. No convertir al importar. Mantener precios/descuentos prometidos; `accepted` puede existir por importación aunque no tenga flujo UI. |
| returns/items | returns, return_lines, compensation_records | OriginalSaleId + item.key + productId/variantId requieren conciliación. No asumir devolución previa válida ni emitir reembolso/crédito nuevo. Modalidades exchange/store_credit no tenían efectos completos: migrarlas como evidencia legada, no saldo realizable automáticamente. |
| deliveries | deliveries, delivery_events | Preservar saleId, cliente/dirección y timestamps. Franjas originales largas y AM/PM/Evening necesitan mapeo versionado; creación PM 12–5 y reprogramación PM 1–5 son ambiguas. No inventar prueba de entrega. |
| promotions | promotions, promotion_eligibility | Preservar código/tipo/valor/fechas/active; usageCount no es fiable (no se incrementaba). No tratar BOGO legado como regla ya ejecutada; marcar/validar antes de habilitar. |
| activity_log | legacy_audit_entries | Texto HTML debe mantenerse solo como evidencia restringida o transformarse a texto seguro; nunca renderizarlo sin escape. No inventar actor ni antes/después. Bitácora limitada a 200 no acredita historial completo. |
| settings | business_settings, currency_settings, fiscal_series (solo tras validación) | Moneda/tasa global no demuestra moneda de documentos. NCF generado por cliente y prefijo E31 no prueba autorización/emisión fiscal. Conservar literal original y estado `legacy_unverified` conceptual; no regenerar, reenviar ni certificar retrospectivamente. |
| warrantyMonths producto/partida | warranty_snapshot/legacy_warranty_evidence | Ventas habituales no capturaron plazo. No convertir el plazo actual del producto en hecho histórico; guardar duración explícita de partida si existe y derivación/ausencia como evidencia separada. |

### Reglas de identidad e importación

- Tabla de correspondencia con restricción única por fuente/partición/tipo/id compuesto y referencia al UUID nuevo. IDs cortos tipo `p1`, `v12`, `walk` y aleatorios de ocho caracteres son válidos legados, no UUID. Conservar aliases literales.
- Diferencia entre ID del contenedor y `data.id`, IDs vacíos, numéricos y repetidos son incidencias, no conversiones silenciosas. Master mezclaba snapshot `String(id)` con id original (`1344` vs `4294`) y podía generar upsert+delete. **Está corregido en vigente:1364**, pero un dato histórico ausente no demuestra eliminación intencional. Auditar incidencias históricas sin atribuir esa falla al runtime actual.
- Mismo número comercial en dos ventas no implica misma venta. Mantener ambos IDs y señalar duplicación; asignar nueva secuencia de servidor sin renumerar automáticamente antiguos. Vigente usa max+1 (`1639`) en vez de longitud+1: disminuye colisiones tras huecos, pero no resuelve carreras ni desaparición del documento de número máximo. Vigente crea UUIDs cuando el navegador puede; el dataset puede mezclar IDs antiguos y UUIDs legítimamente.
- Hash e ID de lote + correspondencia hacen reejecutable la importación: mismo registro/mismo hash → no-op; mismo origen/mismo ID/distinto hash → conflicto o nueva versión controlada, nunca duplicación ni sobrescritura ciega.
- Campo ausente, `null`, `""` y cero son estados distintos. No copiar el patrón `Number(x)||default`; especialmente garantía=0, mínimo=0, tasa=0, cantidad=0 y secuencia=0.
- Usar decimal/céntimos para cálculos nuevos; preservar importes legados exactos y registrar diferencias, sin “arreglar” silenciosamente redondeos. Si el número original no tiene moneda verificable, conservar base monetaria legada explícita hasta resolverla.
- Los documentos con fecha sin offset requieren una política aprobada (fuente/zona del negocio); no adjuntar UTC arbitrariamente. `date` de entrega es fecha de calendario; no debe desplazarse por conversión horaria.

## 3. Consultas de diagnóstico de solo lectura

Ejecutar primero descubrimiento. Consultas posteriores suponen el perfil de entidades (`id,user_id,data`); si solo existe stores, usar el adaptador de la sección 3.2. No ejecutar consultas sobre tablas inexistentes. No se utilizan funciones que modifiquen datos, DDL ni DML.

### 3.1. Descubrimiento de tablas, columnas, claves y políticas

```sql
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('stores','products','sales','customers','suppliers',
    'purchase_orders','quotes','returns','deliveries','promotions','activity_log','settings')
order by table_name, ordinal_position;

select c.relname as table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('stores','products','sales','customers','suppliers',
    'purchase_orders','quotes','returns','deliveries','promotions','activity_log','settings')
order by c.relname, con.conname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Comparar PK compuesta versus simple. Inspeccionar roles no equivale a demostrar membresías efectivas. La cuenta de diagnóstico debe tener lectura completa autorizada; una consulta bajo RLS puede devolver un subconjunto sin error.

### 3.2. Adaptador stores sin escribir tablas

Este SELECT produce objetos normalizados para análisis offline. No devuelve el payload completo deliberadamente; el exportador autorizado puede incluirlo en un backup protegido. No combinar automáticamente distintos store_id.

```sql
select s.id as store_id, s.user_id,
       m.entity, a.ordinality as position,
       a.payload->>'id' as payload_id,
       jsonb_typeof(a.payload->'id') as payload_id_type,
       jsonb_typeof(a.payload) as payload_type,
       s.updated_at
from public.stores s
cross join (values
  ('products','products'), ('sales','sales'), ('customers','customers'),
  ('suppliers','suppliers'), ('purchase_orders','purchaseOrders'),
  ('quotes','quotes'), ('returns','returns'), ('deliveries','deliveries'),
  ('promotions','promotions'), ('activity_log','activityLog')
) m(entity, array_key)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.data->m.array_key)='array'
       then s.data->m.array_key else '[]'::jsonb end
) with ordinality a(payload, ordinality)
order by s.id, m.entity, a.ordinality;

-- Arrays ausentes o con tipo incorrecto: no tratarlos como colecciones vacías válidas.
select s.id as store_id, m.array_key, jsonb_typeof(s.data->m.array_key) as actual_type
from public.stores s
cross join (values ('products'),('sales'),('customers'),('suppliers'),
  ('purchaseOrders'),('quotes'),('returns'),('deliveries'),('promotions'),('activityLog')) m(array_key)
where jsonb_typeof(s.data->m.array_key) is distinct from 'array';
```

### 3.3. Sobre, identidad y volumen de las tablas de entidades

El resultado de este SELECT genera SELECTs, no los ejecuta. Revisar/copiar únicamente las tablas descubiertas. Se usa catálogo en vez de asumir las diez relaciones.

```sql
select format(
  'select %L as entity, count(*) as rows, count(*) filter (where jsonb_typeof(data) is distinct from ''object'') as invalid_payloads, count(*) filter (where nullif(btrim(data->>''id''),'''') is null) as missing_payload_ids, count(*) filter (where id::text is distinct from data->>''id'') as wrapper_id_mismatches, count(*) filter (where jsonb_typeof(data->''id'') is distinct from ''string'') as non_string_ids, max(octet_length(data::text)) as largest_payload_bytes from %I.%I;',
  t.table_name, t.table_schema, t.table_name
) as diagnostic_sql
from information_schema.tables t
where t.table_schema='public' and t.table_type='BASE TABLE'
  and t.table_name in ('products','sales','customers','suppliers','purchase_orders',
    'quotes','returns','deliveries','promotions','activity_log')
  and exists (select 1 from information_schema.columns c
              where c.table_schema=t.table_schema and c.table_name=t.table_name and c.column_name='data')
order by t.table_name;
```

### 3.4. Variantes, números inválidos, SKU y códigos ambiguos

```sql
with variants as (
  select p.id::text as product_id, v.ordinality as position, v.payload
  from public.products p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.data->'variants')='array' then p.data->'variants' else '[]'::jsonb end
  ) with ordinality v(payload, ordinality)
), numeric_values as (
  select v.*, f.field, v.payload->>f.field as value
  from variants v
  cross join (values ('quantity'),('cost'),('price'),('minStock'),('reorderQty')) f(field)
)
select product_id, position, payload->>'id' as variant_id, field, value,
  case
    when value is null then 'ausente'
    when length(value)>100 then 'demasiado largo'
    when value !~ '^-?[0-9]+([.][0-9]+)?$' then 'formato no admitido'
    when value::numeric < 0 then 'negativo'
    when field in ('quantity','minStock','reorderQty') and value::numeric <> trunc(value::numeric)
      then 'cantidad fraccional'
  end as issue
from numeric_values
where case
  when value is null or length(value)>100 or value !~ '^-?[0-9]+([.][0-9]+)?$' then true
  else value::numeric < 0 or (field in ('quantity','minStock','reorderQty') and value::numeric <> trunc(value::numeric))
end;

-- SKU de producto duplicado; no representa aún SKU de variante.
select upper(btrim(data->>'sku')) as normalized_sku,
       count(*) as occurrences, array_agg(id::text order by id::text) as product_ids
from public.products
where nullif(btrim(data->>'sku'),'') is not null
group by upper(btrim(data->>'sku')) having count(*)>1;

with variants as (
  select p.id::text as product_id, v.payload->>'id' as variant_id,
         v.payload->>'barcode' as barcode
  from public.products p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.data->'variants')='array' then p.data->'variants' else '[]'::jsonb end
  ) v(payload)
)
select product_id, variant_id, count(*) as occurrences
from variants group by product_id, variant_id
having variant_id is null or btrim(variant_id)='' or count(*)>1;

with codes as (
  select p.id::text as product_id, null::text as variant_id, btrim(p.data->>'barcode') as barcode
  from public.products p
  union all
  select p.id::text, v.payload->>'id', btrim(v.payload->>'barcode')
  from public.products p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.data->'variants')='array' then p.data->'variants' else '[]'::jsonb end
  ) v(payload)
)
select barcode, count(*) as occurrences,
       jsonb_agg(jsonb_build_object('productId',product_id,'variantId',variant_id)) as references
from codes where nullif(barcode,'') is not null
group by barcode having count(*)>1;
```

Código padre igual a primera variante ocurre en las semillas: clasificarlo como alias potencial, no borrar el código automáticamente. Dos variantes diferentes con el mismo código sí necesitan resolución. Números en notación exponencial o cadenas con espacios se señalan para normalización controlada aunque JavaScript los acepte.

### 3.5. Referencias históricas huérfanas y números comerciales duplicados

```sql
with documents as (
  select 'sales'::text as entity, id::text as doc_id, data from public.sales
  union all select 'quotes', id::text, data from public.quotes
  union all select 'purchase_orders', id::text, data from public.purchase_orders
  union all select 'returns', id::text, data from public.returns
), lines as (
  select d.entity,d.doc_id,i.ordinality,i.payload
  from documents d
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(d.data->'items')='array' then d.data->'items' else '[]'::jsonb end
  ) with ordinality i(payload, ordinality)
)
select l.entity,l.doc_id,l.ordinality,l.payload->>'productId' as product_id,
       l.payload->>'variantId' as variant_id,
       case when p.id is null then 'producto ausente'
            else 'variante ausente' end as issue
from lines l
left join public.products p on p.id::text=l.payload->>'productId'
where p.id is null or not exists (
  select 1 from jsonb_array_elements(
    case when jsonb_typeof(p.data->'variants')='array' then p.data->'variants' else '[]'::jsonb end
  ) v(payload) where v.payload->>'id'=l.payload->>'variantId'
);

with numbers as (
  select 'sales'::text entity,id::text id,data->>'saleNumber' number from public.sales
  union all select 'quotes',id::text,data->>'quoteNumber' from public.quotes
  union all select 'purchase_orders',id::text,data->>'poNumber' from public.purchase_orders
  union all select 'returns',id::text,data->>'returnNumber' from public.returns
)
select entity,number,count(*) occurrences,array_agg(id) ids
from numbers group by entity,number
having number is null or btrim(number)='' or count(*)>1;

select q.id::text as quote_id,q.data->>'convertedSaleId' as sale_id
from public.quotes q
left join public.sales s on s.id::text=q.data->>'convertedSaleId'
where q.data->>'status'='converted' and s.id is null;

select r.id::text as return_id,r.data->>'originalSaleId' as sale_id
from public.returns r
left join public.sales s on s.id::text=r.data->>'originalSaleId'
where s.id is null;

select d.id::text as delivery_id,d.data->>'saleId' as sale_id,s.data->>'status' as sale_status
from public.deliveries d
left join public.sales s on s.id::text=d.data->>'saleId'
where s.id is null or s.data->>'status'='void';
```

Después de resolver identidad, repetir enlaces por cliente y proveedor. Si existe perfil multiusuario con PK compuesta, estos joins por ID solo son ambiguos: añadir la partición auditada. No relacionar documentos de negocios distintos por coincidencia de ID corto.

### 3.6. Cantidades devueltas acumuladas frente a lo vendido

Consulta por clave de renglón original. IDs/claves repetidos, ausentes o variantes duplicadas deben resolverse primero; no sustituir la clave por nombre del producto.

```sql
with sold as (
  select s.id::text as sale_id,i.payload->>'key' as item_key,
    case when length(i.payload->>'quantity')<=100 and i.payload->>'quantity' ~ '^[0-9]+([.][0-9]+)?$'
         then (i.payload->>'quantity')::numeric end as qty
  from public.sales s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.data->'items')='array' then s.data->'items' else '[]'::jsonb end
  ) i(payload)
), returned as (
  select r.data->>'originalSaleId' as sale_id,i.payload->>'key' as item_key,
    sum(case when length(i.payload->>'returnQty')<=100 and i.payload->>'returnQty' ~ '^[0-9]+([.][0-9]+)?$'
             then (i.payload->>'returnQty')::numeric end) as returned_qty,
    count(*) filter (where i.payload->>'returnQty' is null
      or length(i.payload->>'returnQty')>100 or i.payload->>'returnQty' !~ '^[0-9]+([.][0-9]+)?$') as invalid_qty,
    array_agg(distinct r.id::text) as return_ids
  from public.returns r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.data->'items')='array' then r.data->'items' else '[]'::jsonb end
  ) i(payload)
  where r.data->>'status'='completed'
  group by r.data->>'originalSaleId',i.payload->>'key'
)
select r.*,s.qty as sold_qty
from returned r left join sold s using(sale_id,item_key)
where s.sale_id is null or s.qty is null or r.invalid_qty>0 or r.returned_qty>s.qty;
```

También conciliar importes devueltos con total pagado y tipo de compensación. No producir compensaciones nuevas por diferencias; elaborar lista de incidencias para revisión.

### 3.7. Importes, fiscal y fechas sin asumir formatos válidos

```sql
-- Formato numérico de campos monetarios: sin casts inseguros.
select s.id::text as sale_id,f.field,s.data->>f.field as value
from public.sales s
cross join (values ('subtotal'),('discountAmount'),('taxRate'),('taxAmount'),('total')) f(field)
where s.data->>f.field is null or length(s.data->>f.field)>100
   or s.data->>f.field !~ '^-?[0-9]+([.][0-9]+)?$';

-- Conciliación aritmética solo para campos bien formados.
with amounts as (
  select id::text as sale_id,
    case when length(data->>'subtotal')<=100 and data->>'subtotal' ~ '^-?[0-9]+([.][0-9]+)?$' then (data->>'subtotal')::numeric end subtotal,
    case when length(data->>'discountAmount')<=100 and data->>'discountAmount' ~ '^-?[0-9]+([.][0-9]+)?$' then (data->>'discountAmount')::numeric end discount,
    case when length(data->>'taxAmount')<=100 and data->>'taxAmount' ~ '^-?[0-9]+([.][0-9]+)?$' then (data->>'taxAmount')::numeric end tax,
    case when length(data->>'total')<=100 and data->>'total' ~ '^-?[0-9]+([.][0-9]+)?$' then (data->>'total')::numeric end total
  from public.sales
)
select *,subtotal-discount+tax-total as delta
from amounts
where subtotal is null or discount is null or tax is null or total is null
   or subtotal<0 or discount<0 or discount>subtotal or tax<0 or total<0
   or abs(subtotal-discount+tax-total)>0.005;

select data->>'ncfNumber' as legacy_ncf,count(*) as occurrences,
       array_agg(id::text) as sale_ids,array_agg(distinct data->>'ncfType') as declared_types
from public.sales where nullif(data->>'ncfNumber','') is not null
group by data->>'ncfNumber' having count(*)>1;

select data->>'ncfType' as declared_type,left(data->>'ncfNumber',3) as prefix,count(*)
from public.sales where nullif(data->>'ncfNumber','') is not null
group by data->>'ncfType',left(data->>'ncfNumber',3);

select id::text as sale_id,data->>'date' as raw_date
from public.sales
where data->>'date' is null
   or data->>'date' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$';
```

El patrón de fecha detecta ausencia de offset, **no valida fecha/calendario**. El validador de extracción debe detectar meses/días imposibles, años fuera de rango y DST/zona cuando corresponda. Extender a quotes/returns, expiración y deliveredAt; fechas de entrega/startDate/endDate son fechas civiles. Completar conciliación Σ partidas, Σ impuestos por documento, costo snapshot y descuentos asignados en un validador decimal offline; no se implementó aquí.

### 3.8. Configuración, medios y exposición del historial

```sql
select id,currency,exchange_rate,ncf_seq,updated_at from public.settings;

select p.id::text as product_id,
       jsonb_typeof(p.data->'images') as images_type,
       case when jsonb_typeof(p.data->'images')='array' then jsonb_array_length(p.data->'images') end as images_count,
       octet_length(coalesce((p.data->'images')::text,'')) as images_json_bytes
from public.products p
where p.data ? 'images'
order by images_json_bytes desc;

select count(*) as audit_rows,
       count(*) filter (where data->>'text' ~ '<[^>]+>') as rows_with_markup,
       min(data->>'time') as earliest_raw_time,max(data->>'time') as latest_raw_time
from public.activity_log;
```

No exponer Data URLs en logs. Migrar imágenes con tipo real, tamaño, hash y política de acceso; copiar antes de sustituir referencia y verificar bytes/decodificación. No descargar automáticamente URLs externas encontradas en payloads sin validar origen y necesidad.

## 4. Casos límite obligatorios para el importador

| Caso | Resultado verificable esperado |
| --- | --- |
| Dos stores con `p1/v11` y contenido diferente | Dos particiones y correspondencias distintas; ninguna mezcla automática. |
| Wrapper id `12`, data.id número 12, data.id texto `12`, SKU `0012` | IDs auditados conservando tipo/raw; SKU no pierde ceros; conflicto explícito si se unifican. |
| Variantes con ID repetido dentro de producto o documento sin key | Cuarentena del enlace ambiguo; no vincular por primer match. |
| Producto/cliente/proveedor eliminado pero presente en snapshot | Documento conservado; vínculo legado/archivo explícito, sin recrear stock vendido. |
| Cantidad −2, 1.5, `" "`, `"NaN"`, exponencial, entero fuera de rango | Informe de incidencia; no coerción a cero ni pérdida del raw. |
| Mínimo/garantía/impuesto/secuencia 0 | 0 preservado, distinto de ausente. |
| Stock actual 3 y venta histórica 2 | Saldo inicial normalizado 3, no 1; importación comercial no muta saldo de corte. |
| Compra received por 8 antes del corte | Importar evidencia sin sumar otros 8 al saldo. |
| Dos devoluciones de 2 sobre venta de 3 | Conflicto acumulado; preservar evidencia, impedir nuevo reembolso automático. |
| exchange/store_credit antiguo marcado completed | No crear saldo/cobro/mercancía de reemplazo inventados; revisión de resultado real. |
| Dos ventas con mismo saleNumber o NCF | Mantener IDs separados y marcar duplicados; no regenerar fiscal. |
| Precio/costo del catálogo cambió | Venta antigua conserva snapshots e importes; no actualizar documentos retroactivamente. |
| Tasa global DOP con documentos `$` sin moneda | No multiplicar todo por tasa; bandera de moneda legada por resolver. |
| Fecha ISO sin Z/offset y fecha calendario de entrega | Fecha original preservada; conversión aplica política explícita sin desplazar día de entrega. |
| warrantyMonths ausente y producto actual 24 | Cobertura histórica no se afirma de 24; evidencia de derivación separada. |
| Promoción BOGO futura, código repetido, categoría inexistente | Se importa deshabilitada/revisable según política; no habilitar motor de descuentos inválido. |
| Activity text con etiquetas/event handlers | Se guarda evidencia sin ejecución y se presenta texto seguro. |
| Arrays ausentes o malformados, JSON de respaldo incompleto | Importación rechazada o parcial expresamente planificada; nunca borrar lo no incluido. |
| Imagen corrupta/enorme o URL externa | Falla/revisión de medio aislada, sin invalidar documentos; no fetch externo automático. |
| Mismo lote ejecutado dos veces | Sin duplicar documentos, existencias, secuencias, medios ni entradas de pago. |
| Falla después de importar encabezados pero antes de líneas | Transacción/lote no queda activo a medias; retry retoma de forma idempotente. |
| Origen cambia entre export de stock y ventas | Detectar y repetir extracción consistente/delta autorizado; no publicar conciliación falsa. |

## 5. Conciliación y condiciones de corte

Antes de habilitar escritura nueva, comparar origen y destino por partición: conteos de encabezados y líneas, cantidades actuales por variante, valor a costo/precio según raw, totales de ventas por estado/moneda conocida, devoluciones por venta, compras por estado, cotizaciones convertidas, entregas por estado, números comerciales y referencias fiscales. Cada diferencia debe tener una clasificación y resolución documentada.

La bitácora de migración debe incluir lote, hash de origen, versión de transformador, correspondencias, conteos, incidencias y responsable real de la migración. No atribuir al migrador la autoría comercial de ventas legadas. Congelar o coordinar el corte de escrituras, conservar backup íntegro de ambos perfiles encontrados y ensayar rollback antes del cambio de aplicación. No eliminar el JSON raw ni las correspondencias tras éxito inicial.

**Bloqueantes conocidos por código, pendientes de datos reales:** perfil de fuente autoritativa; organización/miembros aprobados; moneda de documentos; duplicados de IDs/series/SKU/barcodes; estados de devolución/crédito y pagos realmente realizados; cobertura histórica de garantía; interpretación de fechas sin zona; política fiscal y de costo de inventario. Ninguno puede resolverse correctamente inventando valores a partir del demo.
