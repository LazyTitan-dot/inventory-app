-- Read-only, sanitized source profiling: no customer/supplier PII, notes or media payloads.
with source_rows as (
 select 'products' source,id,data,updated_at from public.products union all
 select 'sales',id,data,updated_at from public.sales union all
 select 'customers',id,data,updated_at from public.customers union all
 select 'suppliers',id,data,updated_at from public.suppliers union all
 select 'purchase_orders',id,data,updated_at from public.purchase_orders union all
 select 'quotes',id,data,updated_at from public.quotes union all
 select 'returns',id,data,updated_at from public.returns union all
 select 'deliveries',id,data,updated_at from public.deliveries union all
 select 'promotions',id,data,updated_at from public.promotions union all
 select 'activity_log',id,data,updated_at from public.activity_log
), top_shapes as (
 select source,jsonb_object_agg(key,types) shape from (
   select source,key,jsonb_agg(distinct jsonb_typeof(value)) types
   from source_rows cross join lateral jsonb_each(case when jsonb_typeof(data)='object' then data else '{}' end)
   group by source,key
 ) x group by source
), children as (
 select source,id,'variants' child_key,v.value data from source_rows cross join lateral jsonb_array_elements(case when jsonb_typeof(data->'variants')='array' then data->'variants' else '[]' end) v where source='products'
 union all
 select source,id,'items',v.value from source_rows cross join lateral jsonb_array_elements(case when jsonb_typeof(data->'items')='array' then data->'items' else '[]' end) v where source in ('sales','purchase_orders','quotes','returns')
), child_shapes as (
 select source,child_key,jsonb_object_agg(key,types) shape from (
   select source,child_key,key,jsonb_agg(distinct jsonb_typeof(value)) types
   from children cross join lateral jsonb_each(case when jsonb_typeof(data)='object' then data else '{}' end)
   group by source,child_key,key
 ) x group by source,child_key
)
select jsonb_build_object(
 'counts',(select jsonb_object_agg(source,n) from(select source,count(*) n from source_rows group by source)x),
 'shapes',(select jsonb_agg(to_jsonb(top_shapes)) from top_shapes),
 'child_shapes',(select jsonb_agg(to_jsonb(child_shapes)) from child_shapes),
 'identity_issues',(select coalesce(jsonb_agg(jsonb_build_object('source',source,'id',id,'payload_id',data->'id','type',jsonb_typeof(data->'id'))),'[]') from source_rows where data->>'id' is distinct from id),
 'products',(select jsonb_agg(jsonb_build_object('id',id,'updated_at',updated_at,'fields',
   (select jsonb_object_agg(key,value) from jsonb_each(data) where key in ('id','sku','barcode','category','brand','model','warrantyMonths','variants')),
   'images_type',jsonb_typeof(data->'images'),'images_count',case when jsonb_typeof(data->'images')='array' then jsonb_array_length(data->'images') end,
   'images_bytes',octet_length(coalesce((data->'images')::text,'')))) from source_rows where source='products'),
 'documents',(select jsonb_agg(jsonb_build_object('source',source,'id',id,'updated_at',updated_at,'fields',
   (select jsonb_object_agg(key,value) from jsonb_each(data) where key in ('id','saleNumber','poNumber','quoteNumber','returnNumber','date','status','subtotal','discountType','discountValue','discountAmount','taxRate','taxAmount','total','grandTotal','paymentMethod','expectedDelivery','expiresAt')),
   'items',(select jsonb_agg((select jsonb_object_agg(key,value) from jsonb_each(x.value) where key in ('id','key','productId','variantId','productBrand','productModel','productSku','variantName','category','quantity','qty','cost','unitCost','price','total','warrantyMonths','returnQty'))) from jsonb_array_elements(data->'items')x))) from source_rows where source in ('sales','purchase_orders','quotes','returns')),
 'contacts',(select jsonb_agg(jsonb_build_object('source',source,'id',id,'payload_id',data->'id','updated_at',updated_at,'has_name',nullif(btrim(data->>'name'),'') is not null,
   'has_email',nullif(btrim(data->>'email'),'') is not null,'has_phone',nullif(btrim(data->>'phone'),'') is not null,'has_tax_id',nullif(btrim(data->>'rnc'),'') is not null)) from source_rows where source in ('customers','suppliers')),
 'contact_duplicate_counts',(select coalesce(jsonb_agg(jsonb_build_object('source',source,'field',field,'duplicates',n)),'[]') from (
   select source,field,count(*) n from source_rows cross join lateral(values('email',lower(btrim(data->>'email'))),('rnc',btrim(data->>'rnc')))f(field,val)
   where source in ('customers','suppliers') and nullif(val,'') is not null group by source,field,val having count(*)>1)x),
 'deliveries',(select jsonb_agg(jsonb_build_object('id',id,'fields',(select jsonb_object_agg(key,value) from jsonb_each(data) where key in ('id','saleId','saleNumber','date','timeSlot','status','deliveredAt')))) from source_rows where source='deliveries'),
 'settings',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'currency',currency,'exchange_rate',exchange_rate,'ncf_seq',ncf_seq)),'[]') from public.settings)
) as profile;
