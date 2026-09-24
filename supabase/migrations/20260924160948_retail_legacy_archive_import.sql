-- Controlled one-time cutover. Defining this migration does NOT import or freeze legacy data.
create table retail_private.legacy_batches (
  id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
  manifest_sha256 text not null unique check(length(manifest_sha256)=64), source_commit text not null,
  currency text not null check(currency='DOP'), timezone text not null check(timezone='America/Santo_Domingo'),
  actor_id uuid not null, started_at timestamptz not null default now(), completed_at timestamptz,
  summary jsonb not null default '{}'
);
create table retail_private.legacy_archive (
  batch_id uuid not null references retail_private.legacy_batches(id), source text not null, source_id text not null,
  data jsonb not null, envelope jsonb not null, sha256 text not null check(length(sha256)=64),
  source_updated_at timestamptz, archived_at timestamptz not null default now(),
  primary key(source,source_id), unique(batch_id,source,source_id)
);
create table retail_private.legacy_map (
  source text not null, source_id text not null, entity_key text not null default '', target_table text not null,
  target_id uuid not null, details jsonb not null default '{}',
  primary key(source,source_id,entity_key), unique(target_table,target_id),
  foreign key(source,source_id) references retail_private.legacy_archive(source,source_id)
);
create table retail_private.legacy_issues (
  id bigint generated always as identity primary key, batch_id uuid not null references retail_private.legacy_batches(id),
  source text not null, source_id text not null, code text not null, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table retail_private.legacy_acl (
  batch_id uuid not null references retail_private.legacy_batches(id), source text not null, relation_acl text,
  grants_snapshot jsonb not null, column_acl jsonb not null default '{}', primary key(batch_id,source)
);
create index retail_legacy_issue_source_idx on retail_private.legacy_issues(source,source_id);
alter table retail_private.legacy_batches enable row level security;
alter table retail_private.legacy_archive enable row level security;
alter table retail_private.legacy_map enable row level security;
alter table retail_private.legacy_issues enable row level security;
alter table retail_private.legacy_acl enable row level security;
revoke all on all tables in schema retail_private from public,anon,authenticated;
revoke all on all sequences in schema retail_private from public,anon,authenticated;

alter table public.retail_products add column legacy jsonb not null default '{}';
alter table public.retail_variants add column legacy jsonb not null default '{}';
alter table public.retail_contacts add column legacy jsonb not null default '{}';
alter table public.retail_documents add column legacy jsonb not null default '{}';
alter table public.retail_document_items add column legacy jsonb not null default '{}';
alter table public.retail_deliveries add column legacy jsonb not null default '{}';
alter table public.retail_documents alter column created_by drop not null;
alter table public.retail_documents add constraint retail_document_actor_known check(created_by is not null or legacy ? 'source');
do $$ declare constraint_name text; begin
  select conname into strict constraint_name from pg_constraint where conrelid='public.retail_documents'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%status%' and pg_get_constraintdef(oid) like '%type%';
  execute format('alter table public.retail_documents drop constraint %I',constraint_name);
end $$;
alter table public.retail_documents add constraint retail_document_type_status check(
 (type='sale' and status in ('completed','partially_returned','returned','voided','legacy_pending')) or
 (type='purchase' and status in ('draft','pending','partial','received','cancelled')) or
 (type='quote' and status in ('open','converted','cancelled')) or (type='return' and status='completed'));

create function retail_private.legacy_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'El archivo original de la migración es inmutable.'; end; $$;
create trigger retail_legacy_immutable before update or delete on retail_private.legacy_archive
  for each row execute function retail_private.legacy_immutable();

create function retail_private.legacy_source_rows() returns table(source text,source_id text,envelope jsonb,sha256 text)
language plpgsql stable set search_path='' set timezone='UTC' as $$
declare src text; begin
  foreach src in array array['products','sales','customers','suppliers','purchase_orders','quotes','returns','deliveries','promotions','activity_log','settings'] loop
    if to_regclass('public.'||src) is null then raise exception 'Falta la tabla original %; revisa el perfil de origen.',src; end if;
    return query execute format('select %L::text,t.id::text,to_jsonb(t),encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'') from public.%I t',src,src);
  end loop;
end; $$;
create function retail_private.legacy_manifest() returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
  with rows as (select * from retail_private.legacy_source_rows())
  select jsonb_build_object('sha256',encode(sha256(convert_to(coalesce((select jsonb_agg(jsonb_build_array(source,source_id,sha256) order by source,source_id)::text from rows),'[]'),'UTF8')),'hex'),
    'counts',(select jsonb_object_agg(source,n) from (select source,count(*) n from rows group by source)c),
    'row_count',(select count(*) from rows),'bytes',(select sum(octet_length(envelope::text)) from rows));
$$;
create function retail_private.legacy_timestamp(value text) returns timestamptz language plpgsql immutable set search_path='' as $$
begin
  if value is null or length(value)>80 then raise exception 'Fecha histórica ausente o inválida.'; end if;
  if value ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then return value::timestamptz;
  elsif value ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?)?$' then return value::timestamp at time zone 'America/Santo_Domingo';
  else raise exception 'Fecha histórica no reconocida: %.',value; end if;
end; $$;
create function retail_private.legacy_amount(p jsonb,k text,default_value numeric default null,whole boolean default false) returns numeric language plpgsql immutable set search_path='' as $$
declare v numeric; rounded numeric; begin
  if not(p ? k) or p->k='null'::jsonb then v:=default_value;
  elsif jsonb_typeof(p->k) in ('number','string') and p->>k ~ '^\d+(\.\d+)?$' and length(p->>k)<80 then v:=(p->>k)::numeric;
  else raise exception 'Importe o cantidad histórica inválida en %.',k; end if;
  if v is null or v<0 or v>999999999999.99 then raise exception 'Importe histórico fuera de rango en %.',k; end if;
  rounded:=round(v,case when whole then 0 else 2 end);
  if abs(v-rounded)>0.000001 or (whole and v<>rounded) then raise exception 'La precisión histórica de % requiere revisión antes de importar.',k; end if;
  return rounded;
end; $$;
create function retail_private.legacy_category(v text) returns text language sql immutable set search_path='' as $$
 -- Category values are stable identifiers used by catalog filters and promotion scopes.
 -- Human-facing Spanish labels belong to the UI, never to a data migration.
 select btrim(v);
$$;
create function retail_private.legacy_contact_snapshot(p jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('name',coalesce(nullif(p->>'name',''),'Cliente de mostrador'),'email',coalesce(p->>'email',''),'phone',coalesce(p->>'phone',''),
 'tax_id',coalesce(p->>'rnc',''),'address',coalesce(nullif(p->>'address',''),concat_ws(', ',nullif(p->>'line1',''),nullif(p->>'line2',''),nullif(p->>'sector',''),nullif(p->>'city',''))),
 'legacy_id',p->>'id');
$$;
create function retail_private.legacy_issue(batch uuid,src text,sid text,code text,details jsonb default '{}') returns void language sql set search_path='' as $$
 insert into retail_private.legacy_issues(batch_id,source,source_id,code,details) values(batch,src,sid,code,details);
$$;
create function retail_private.legacy_variant_link(item jsonb) returns uuid language sql stable set search_path='' as $$
 select m.target_id from retail_private.legacy_map m join retail_private.legacy_archive a on a.source=m.source and a.source_id=m.source_id
 cross join lateral jsonb_array_elements(a.data->'variants') v
 where m.source='products' and m.source_id=item->>'productId' and m.entity_key='variant:'||(item->>'variantId')
 and v->>'id'=item->>'variantId' and lower(btrim(a.data->>'brand'))=lower(btrim(item->>'productBrand'))
 and lower(btrim(a.data->>'model'))=lower(btrim(item->>'productModel')) and lower(btrim(v->>'name'))=lower(btrim(item->>'variantName'));
$$;

-- Supabase-managed Storage objects remain protected by role-based policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('retail-product-media','retail-product-media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='retail-product-media' and public=false and file_size_limit between 1 and 10485760
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
    raise exception 'El bucket existente requiere revisión: debe ser privado, limitar tamaño y aceptar solamente JPEG, PNG y WebP.';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then raise exception 'Storage debe tener Row Level Security activa.'; end if;
end $$;
create policy retail_media_member_read on storage.objects for select to authenticated
 using(bucket_id='retail-product-media' and (select retail_private.role()) is not null);
create policy retail_media_catalog_insert on storage.objects for insert to authenticated
 with check(bucket_id='retail-product-media' and (select retail_private.role()) in ('owner','admin','inventory'));
create policy retail_media_catalog_update on storage.objects for update to authenticated
 using(bucket_id='retail-product-media' and (select retail_private.role()) in ('owner','admin','inventory'))
 with check(bucket_id='retail-product-media' and (select retail_private.role()) in ('owner','admin','inventory'));
-- Restrictive boundaries prevent any pre-existing permissive policy from widening this bucket.
create policy retail_media_read_boundary on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'retail-product-media' or (select retail_private.role()) is not null);
create policy retail_media_insert_boundary on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'retail-product-media' or coalesce((select retail_private.role()) in ('owner','admin','inventory'),false));
create policy retail_media_update_boundary on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'retail-product-media' or coalesce((select retail_private.role()) in ('owner','admin','inventory'),false))
 with check(bucket_id<>'retail-product-media' or coalesce((select retail_private.role()) in ('owner','admin','inventory'),false));
create policy retail_media_delete_boundary on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'retail-product-media');
create policy retail_media_anon_boundary on storage.objects as restrictive for all to anon
 using(bucket_id<>'retail-product-media') with check(bucket_id<>'retail-product-media');

create function retail_private.is_legacy_product_image(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare image_bytes bytea; mime text; begin
  if value is null or octet_length(value)>15000000 or value !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' then return false; end if;
  image_bytes:=decode(split_part(value,',',2),'base64'); mime:=split_part(split_part(value,';',1),':',2);
  if octet_length(image_bytes)>10485760 then return false; end if;
  return case mime when 'image/png' then substring(image_bytes from 1 for 8)=decode('89504e470d0a1a0a','hex')
    when 'image/jpeg' then substring(image_bytes from 1 for 3)=decode('ffd8ff','hex')
    when 'image/webp' then substring(image_bytes from 1 for 4)=decode('52494646','hex') and substring(image_bytes from 9 for 4)=decode('57454250','hex')
    else false end;
exception when invalid_parameter_value or invalid_text_representation then return false;
end; $$;

create function retail_private.product_image(pid uuid,idx integer) returns text language plpgsql stable security definer set search_path='' as $$
declare image_data text; begin
  perform retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
  if idx is null or idx<0 or idx>7 then raise exception 'Imagen no encontrada.'; end if;
  select a.data->'images'->>idx into image_data from retail_private.legacy_map m join retail_private.legacy_archive a on a.source=m.source and a.source_id=m.source_id
    where m.target_table='retail_products' and m.target_id=pid and m.entity_key='';
  if not retail_private.is_legacy_product_image(image_data) then raise exception 'La imagen histórica no tiene un formato permitido.'; end if;
  return image_data;
end; $$;
create function public.retail_product_image(p_product_id uuid,p_index integer) returns text language sql stable security invoker set search_path='' as $$
  select retail_private.product_image(p_product_id,p_index);
$$;

create function retail_private.migration_report() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform retail_private.require_role(array['owner','admin']);
  return jsonb_build_object('batches',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from retail_private.legacy_batches b),
    'issues',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from retail_private.legacy_issues i),
    'activity',(select coalesce(jsonb_agg(jsonb_build_object('id',source_id,'time',data->>'time','type',data->>'type',
      'text',regexp_replace(coalesce(data->>'text',''),'<[^>]*>','','g'),'detail',regexp_replace(coalesce(data->>'detail',''),'<[^>]*>','','g'))),'[]')
      from retail_private.legacy_archive where source='activity_log'));
end; $$;
create function public.retail_migration_report() returns jsonb language sql stable security invoker set search_path='' as $$
  select retail_private.migration_report();
$$;

revoke all on function public.retail_product_image(uuid,integer) from public,anon,authenticated;
revoke all on function public.retail_migration_report() from public,anon,authenticated;
revoke all on all functions in schema retail_private from public,anon,authenticated;
grant execute on function retail_private.role() to authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
grant execute on function retail_private.bootstrap() to authenticated;
grant execute on function retail_private.product_image(uuid,integer) to authenticated;
grant execute on function retail_private.migration_report() to authenticated;
grant execute on function public.retail_product_image(uuid,integer) to authenticated;
grant execute on function public.retail_migration_report() to authenticated;

create function retail_private.import_legacy(p_expected_sha256 text,p_source_commit text,p_actor_id uuid,p_freeze_legacy boolean default false)
returns jsonb language plpgsql set search_path='' set timezone='UTC' as $$
#variable_conflict use_column
declare batch uuid:=gen_random_uuid(); manifest jsonb; existing retail_private.legacy_batches; src text;
  row record; line record; payload jsonb; variant jsonb; images jsonb; image_value jsonb; contact_snapshot jsonb;
  pid uuid; vid uuid; cid uuid; did uuid; iid uuid; delivery_id uuid; stock_count integer; variant_count integer;
  position integer; money_cost numeric; money_price numeric; minimum integer; target integer; sku_value text; barcode_value text;
  quantity_value integer; subtotal_value numeric; discount_value numeric; tax_value numeric; tax_rate_value numeric; total_value numeric;
  line_subtotal numeric; line_discount numeric; line_tax numeric; cumulative_subtotal numeric; previous_discount numeric; cumulative_base numeric; previous_tax numeric;
  doc_type text; doc_status text; doc_number text; date_value timestamptz; original_number bigint; warranty_value integer;
  notes_value text; result jsonb; media_count integer; archive_count bigint; snapshot jsonb; contact_source text; column_names text;
begin
  if not p_freeze_legacy then raise exception 'El corte requiere congelar las escrituras antiguas; ensaya esta función dentro de BEGIN/ROLLBACK.'; end if;
  if p_expected_sha256 is null or p_expected_sha256 !~ '^[a-f0-9]{64}$' or nullif(p_source_commit,'') is null then raise exception 'Proporciona el manifiesto revisado y el commit de origen.'; end if;
  if not exists(select 1 from public.retail_memberships where user_id=p_actor_id and role='owner' and active) then raise exception 'El responsable del corte debe ser un propietario activo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('retail-legacy-cutover',0));
  foreach src in array array['products','sales','customers','suppliers','purchase_orders','quotes','returns','deliveries','promotions','activity_log','settings'] loop
    execute format('lock table public.%I in share mode',src);
  end loop;
  lock table public.retail_products,public.retail_variants,public.retail_stocks,public.retail_contacts,public.retail_documents,public.retail_document_items,public.retail_deliveries in share row exclusive mode;
  manifest:=retail_private.legacy_manifest();
  if manifest->>'sha256'<>p_expected_sha256 then raise exception 'El origen cambió desde la revisión. Genera un manifiesto nuevo y vuelve a revisar los cambios.'; end if;
  select * into existing from retail_private.legacy_batches where singleton;
  if found then
    if existing.manifest_sha256=p_expected_sha256 and existing.completed_at is not null then return existing.summary; end if;
    raise exception 'Ya existe una importación de otro estado original. No se sobrescribirán datos normalizados.';
  end if;
  if exists(select 1 from public.retail_products) or exists(select 1 from public.retail_contacts) or exists(select 1 from public.retail_documents) or exists(select 1 from public.retail_movements) then
    raise exception 'El destino ya tiene operaciones. La importación inicial requiere un destino vacío y nunca reemplaza datos.';
  end if;
  if coalesce((manifest->'counts'->>'quotes')::integer,0)>0 or coalesce((manifest->'counts'->>'returns')::integer,0)>0 or coalesce((manifest->'counts'->>'promotions')::integer,0)>0 then
    raise exception 'Aparecieron cotizaciones, devoluciones o promociones históricas que no estaban en el perfil revisado. Amplía el adaptador antes del corte.';
  end if;
  insert into retail_private.legacy_batches(id,manifest_sha256,source_commit,currency,timezone,actor_id)
    values(batch,p_expected_sha256,p_source_commit,'DOP','America/Santo_Domingo',p_actor_id);
  insert into retail_private.legacy_acl(batch_id,source,relation_acl,grants_snapshot,column_acl)
    select batch,c.relname,c.relacl::text,coalesce((select jsonb_agg(jsonb_build_object('grantee',case a.grantee when 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'privilege',a.privilege_type,'grantable',a.is_grantable)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a),'[]'),
      coalesce((select jsonb_object_agg(a.attname,a.attacl::text) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attacl is not null),'{}')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname=any(array['products','sales','customers','suppliers','purchase_orders','quotes','returns','deliveries','promotions','activity_log','settings']);
  insert into retail_private.legacy_archive(batch_id,source,source_id,data,envelope,sha256,source_updated_at)
    select batch,source,source_id,case when source='settings' then envelope else envelope->'data' end,envelope,sha256,(envelope->>'updated_at')::timestamptz from retail_private.legacy_source_rows();
  get diagnostics archive_count=row_count;
  if exists(select 1 from retail_private.legacy_archive where source<>'settings' and (jsonb_typeof(data) is distinct from 'object' or data->>'id' is distinct from source_id)) then raise exception 'Hay identidades de fila y payload inconsistentes. Revisión manual requerida.'; end if;

  -- Catalog and stock-at-cutover: historical sales and receipts are NEVER replayed.
  for row in select * from retail_private.legacy_archive where source='products' order by source_id loop
    payload:=row.data; pid:=gen_random_uuid(); images:='[]'; media_count:=0;
    if jsonb_typeof(payload->'variants') is distinct from 'array' or jsonb_array_length(payload->'variants') not between 1 and 100 then raise exception 'Producto % sin variantes válidas.',row.source_id; end if;
    if (select count(distinct v->>'id') from jsonb_array_elements(payload->'variants')v)<>jsonb_array_length(payload->'variants') then raise exception 'Producto % con IDs de variantes ausentes o repetidos.',row.source_id; end if;
    if payload ? 'images' and jsonb_typeof(payload->'images') is distinct from 'array' then raise exception 'Imágenes inválidas en producto %.',row.source_id; end if;
    if jsonb_array_length(coalesce(payload->'images','[]'))>8 then raise exception 'El producto % supera el máximo de imágenes; conserva y revisa los medios.',row.source_id; end if;
    for image_value in select value from jsonb_array_elements(coalesce(payload->'images','[]')) loop
      if jsonb_typeof(image_value)='string' and retail_private.is_legacy_product_image(image_value#>>'{}') then
        images:=images||jsonb_build_array('legacy:'||pid::text||':'||media_count::text);
      else perform retail_private.legacy_issue(batch,'products',row.source_id,'image_requires_review',jsonb_build_object('index',media_count)); end if;
      media_count:=media_count+1;
    end loop;
    warranty_value:=retail_private.legacy_amount(payload,'warrantyMonths',12,true);
    if not(payload ? 'warrantyMonths') then perform retail_private.legacy_issue(batch,'products',row.source_id,'catalog_warranty_default',jsonb_build_object('months',12)); end if;
    insert into public.retail_products(id,category,brand,model,warranty_months,images,legacy)
      values(pid,retail_private.legacy_category(retail_private.txt(payload,'category',100,true)),retail_private.txt(payload,'brand',100,true),retail_private.txt(payload,'model',200,true),
        warranty_value,images,jsonb_build_object('source','products','id',row.source_id,'sku',payload->>'sku','category',payload->>'category','imported_at',now()));
    insert into retail_private.legacy_map(source,source_id,entity_key,target_table,target_id) values('products',row.source_id,'','retail_products',pid);
    position:=0; variant_count:=jsonb_array_length(payload->'variants');
    for variant in select value from jsonb_array_elements(payload->'variants') loop
      position:=position+1; vid:=gen_random_uuid();
      money_cost:=retail_private.legacy_amount(variant,'cost'); money_price:=retail_private.legacy_amount(variant,'price');
      stock_count:=retail_private.legacy_amount(variant,'quantity',null,true); minimum:=retail_private.legacy_amount(variant,'minStock',5,true);
      target:=minimum+retail_private.legacy_amount(variant,'reorderQty',10,true);
      sku_value:=upper(retail_private.txt(payload,'sku',70,true))||case when variant_count=1 then '' else '-'||position::text end;
      barcode_value:=nullif(retail_private.txt(variant,'barcode',80),'');
      if barcode_value is null and variant_count=1 then barcode_value:=nullif(retail_private.txt(payload,'barcode',80),''); end if;
      insert into public.retail_variants(id,product_id,name,sku,barcode,cost,price,min_stock,reorder_target,legacy)
        values(vid,pid,retail_private.txt(variant,'name',160,true),sku_value,barcode_value,money_cost,money_price,minimum,target,
          jsonb_build_object('source','products','product_id',row.source_id,'variant_id',variant->>'id','product_sku',payload->>'sku','reorder_quantity',variant->'reorderQty','reorder_rule','minimum_plus_original_batch'));
      insert into public.retail_stocks(variant_id,available) values(vid,stock_count);
      insert into retail_private.legacy_map(source,source_id,entity_key,target_table,target_id) values('products',row.source_id,'variant:'||(variant->>'id'),'retail_variants',vid);
      if stock_count>0 then
        insert into public.retail_movements(variant_id,type,quantity,bucket,before_quantity,after_quantity,reason,operation_id,created_by)
          values(vid,'opening',stock_count,'available',0,stock_count,'Saldo de corte importado del sistema anterior; no reconstruye movimientos históricos.',batch,p_actor_id);
      end if;
      if money_price=0 then perform retail_private.legacy_issue(batch,'products',row.source_id,'zero_price',jsonb_build_object('variant_id',variant->>'id')); end if;
      if money_cost=0 then perform retail_private.legacy_issue(batch,'products',row.source_id,'zero_cost',jsonb_build_object('variant_id',variant->>'id')); end if;
    end loop;
  end loop;

  for row in select * from retail_private.legacy_archive where source in ('customers','suppliers') order by source,source_id loop
    payload:=row.data; cid:=gen_random_uuid(); contact_snapshot:=retail_private.legacy_contact_snapshot(payload);
    notes_value:=coalesce(payload->>'notes',payload->>'note','');
    if row.source='suppliers' then
      notes_value:=concat_ws(E'\n',nullif(notes_value,''),case when nullif(payload->>'contact','') is not null then 'Contacto: '||(payload->>'contact') end,
        case when nullif(payload->>'paymentTerms','') is not null then 'Condiciones de pago: '||(payload->>'paymentTerms') end,
        case when nullif(payload->>'website','') is not null then 'Sitio web: '||(payload->>'website') end);
    elsif nullif(payload->>'reference','') is not null then notes_value:=concat_ws(E'\n',nullif(notes_value,''),'Referencia de dirección: '||(payload->>'reference')); end if;
    insert into public.retail_contacts(id,kind,name,email,phone,tax_id,address,notes,legacy)
      values(cid,case row.source when 'customers' then 'customer' else 'supplier' end,retail_private.txt(payload,'name',200,true),lower(coalesce(payload->>'email','')),
        coalesce(payload->>'phone',''),coalesce(payload->>'rnc',''),coalesce(contact_snapshot->>'address',''),notes_value,
        jsonb_build_object('source',row.source,'id',row.source_id,'tags',payload->'tags','segment',payload->'segment','categories',payload->'categories'));
    insert into retail_private.legacy_map(source,source_id,entity_key,target_table,target_id) values(row.source,row.source_id,'','retail_contacts',cid);
  end loop;

  for row in select * from retail_private.legacy_archive where source in ('sales','purchase_orders') order by source,source_id loop
    payload:=row.data; did:=gen_random_uuid(); doc_type:=case row.source when 'sales' then 'sale' else 'purchase' end;
    if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'Documento %/% sin artículos válidos.',row.source,row.source_id; end if;
    date_value:=retail_private.legacy_timestamp(payload->>'date');
    if payload->>'date' !~ '(Z|[+-]\d{2}:\d{2})$' then perform retail_private.legacy_issue(batch,row.source,row.source_id,'date_assumed_santo_domingo',jsonb_build_object('original',payload->>'date')); end if;
    subtotal_value:=retail_private.legacy_amount(payload,'subtotal'); discount_value:=case when doc_type='sale' then retail_private.legacy_amount(payload,'discountAmount',0) else 0 end;
    tax_value:=retail_private.legacy_amount(payload,'taxAmount',0); tax_rate_value:=retail_private.legacy_amount(payload,'taxRate',0);
    total_value:=retail_private.legacy_amount(payload,case when doc_type='sale' then 'total' else 'grandTotal' end);
    if subtotal_value-discount_value+tax_value<>total_value then raise exception 'El documento %/% tiene importes discordantes; no se recalculará ni alterará.',row.source,row.source_id; end if;
    if round((subtotal_value-discount_value)*tax_rate_value/100,2)<>tax_value then perform retail_private.legacy_issue(batch,row.source,row.source_id,'tax_rate_amount_disagreement',jsonb_build_object('recorded_tax',tax_value,'rate',tax_rate_value,'calculated_tax',round((subtotal_value-discount_value)*tax_rate_value/100,2))); end if;
    if doc_type='sale' then
      doc_status:=case payload->>'status' when 'completed' then 'completed' when 'pending' then 'legacy_pending' when 'cancelled' then 'voided' end;
      contact_snapshot:=retail_private.legacy_contact_snapshot(payload->'customer'); contact_source:='customers';
      select target_id into cid from retail_private.legacy_map where source='customers' and source_id=payload->'customer'->>'id' and entity_key='';
    else
      doc_status:=case payload->>'status' when 'received' then 'received' when 'sent' then 'pending' when 'draft' then 'draft' when 'cancelled' then 'cancelled' end;
      contact_source:='suppliers'; select target_id into cid from retail_private.legacy_map where source='suppliers' and source_id=payload->>'supplierId' and entity_key='';
      select retail_private.legacy_contact_snapshot(data) into contact_snapshot from retail_private.legacy_archive where source='suppliers' and source_id=payload->>'supplierId';
      if contact_snapshot is null then contact_snapshot:=jsonb_build_object('name',coalesce(payload->>'supplierName','Proveedor histórico'),'legacy_id',payload->>'supplierId'); end if;
    end if;
    if doc_status is null then raise exception 'Estado histórico no reconocido en %/%.',row.source,row.source_id; end if;
    if cid is null and doc_type='purchase' then perform retail_private.legacy_issue(batch,row.source,row.source_id,'contact_not_linked'); end if;
    original_number:=retail_private.legacy_amount(payload,case when doc_type='sale' then 'saleNumber' else 'poNumber' end,null,true);
    doc_number:=case when doc_type='sale' then 'VEN-' else 'COM-' end||lpad(original_number::text,greatest(7,length(original_number::text)),'0');
    if exists(select 1 from public.retail_documents where number=doc_number) then
      perform retail_private.legacy_issue(batch,row.source,row.source_id,'duplicate_document_number',jsonb_build_object('original',original_number));
      doc_number:=doc_number||'-L-'||substr(did::text,1,8);
    end if;
    insert into public.retail_documents(id,number,type,status,contact_id,contact_snapshot,subtotal,discount,tax_rate,tax,total,payment_method,notes,created_by,created_at,updated_at,legacy)
      values(did,doc_number,doc_type,doc_status,cid,coalesce(contact_snapshot,'{}'),subtotal_value,discount_value,tax_rate_value,tax_value,total_value,
        case when doc_type='sale' then payload->>'paymentMethod' end,coalesce(payload->>'notes',''),null,date_value,coalesce(row.source_updated_at,date_value),
        jsonb_build_object('source',row.source,'id',row.source_id,'original_number',original_number,'original_status',payload->>'status','original_date',payload->>'date',
          'ncf_number',payload->>'ncfNumber','ncf_type',payload->>'ncfType','fiscal_status','legacy_unverified','payment_evidence','method_only',
          'expected_delivery',payload->>'expectedDelivery','original_author','unknown','batch_id',batch));
    insert into retail_private.legacy_map(source,source_id,entity_key,target_table,target_id) values(row.source,row.source_id,'','retail_documents',did);
    cumulative_subtotal:=0; previous_discount:=0; cumulative_base:=0; previous_tax:=0;
    for line in select value,ordinality from jsonb_array_elements(payload->'items') with ordinality loop
      iid:=gen_random_uuid(); quantity_value:=retail_private.legacy_amount(line.value,case when doc_type='sale' then 'quantity' else 'qty' end,null,true);
      if quantity_value=0 then raise exception 'Artículo histórico con cantidad cero en %/%.',row.source,row.source_id; end if;
      money_price:=retail_private.legacy_amount(line.value,case when doc_type='sale' then 'price' else 'unitCost' end);
      money_cost:=retail_private.legacy_amount(line.value,case when doc_type='sale' then 'cost' else 'unitCost' end);
      line_subtotal:=quantity_value*money_price; cumulative_subtotal:=cumulative_subtotal+line_subtotal;
      line_discount:=case when subtotal_value=0 then 0 else round(discount_value*cumulative_subtotal/subtotal_value,2)-previous_discount end;
      previous_discount:=previous_discount+line_discount; cumulative_base:=cumulative_base+line_subtotal-line_discount;
      line_tax:=case when subtotal_value-discount_value=0 then 0 else round(tax_value*cumulative_base/(subtotal_value-discount_value),2)-previous_tax end;
      previous_tax:=previous_tax+line_tax;
      vid:=retail_private.legacy_variant_link(line.value);
      if vid is null then perform retail_private.legacy_issue(batch,row.source,row.source_id,'historical_variant_not_linked',jsonb_build_object('line',line.ordinality,'product_id',line.value->>'productId','variant_id',line.value->>'variantId')); end if;
      warranty_value:=case when line.value ? 'warrantyMonths' and line.value->'warrantyMonths'<>'null'::jsonb then retail_private.legacy_amount(line.value,'warrantyMonths',null,true) else null end;
      if warranty_value is null and doc_type='sale' then perform retail_private.legacy_issue(batch,row.source,row.source_id,'historical_warranty_unknown',jsonb_build_object('line',line.ordinality)); end if;
      snapshot:=jsonb_build_object('category',coalesce(retail_private.legacy_category(line.value->>'category'),''),'brand',coalesce(line.value->>'productBrand',''),
        'model',coalesce(line.value->>'productModel',''),'name',coalesce(line.value->>'variantName',''),'sku',coalesce(line.value->>'productSku',''),'barcode',null,
        'warranty_months',warranty_value,'warranty_unknown',warranty_value is null);
      insert into public.retail_document_items(id,document_id,variant_id,product_snapshot,quantity,received_quantity,unit_price,unit_cost,discount,tax,line_total,legacy)
        values(iid,did,vid,snapshot,quantity_value,case when doc_type='purchase' and doc_status='received' then quantity_value else 0 end,money_price,money_cost,line_discount,line_tax,line_subtotal-line_discount+line_tax,
          jsonb_build_object('source',row.source,'id',row.source_id,'line_index',line.ordinality,'original_item_id',line.value->>'id','original_key',line.value->>'key',
            'product_id',line.value->>'productId','variant_id',line.value->>'variantId','variant_match',case when vid is null then 'unlinked' else 'snapshot_verified' end));
      insert into retail_private.legacy_map(source,source_id,entity_key,target_table,target_id) values(row.source,row.source_id,'item:'||line.ordinality::text,'retail_document_items',iid);
    end loop;
    if cumulative_subtotal<>subtotal_value or previous_discount<>discount_value or previous_tax<>tax_value then raise exception 'Los renglones históricos no concilian en %/%; no se alterarán los importes.',row.source,row.source_id; end if;
    update retail_private.counters set value=greatest(value,original_number) where type=doc_type;
    if doc_status in ('legacy_pending','draft') then perform retail_private.legacy_issue(batch,row.source,row.source_id,'pending_document_preserved',jsonb_build_object('status',doc_status)); end if;
  end loop;

  for row in select * from retail_private.legacy_archive where source='deliveries' order by source_id loop
    payload:=row.data; delivery_id:=gen_random_uuid();
    select target_id into did from retail_private.legacy_map where source='sales' and source_id=payload->>'saleId' and entity_key='';
    if did is null then raise exception 'Entrega % sin venta original.',row.source_id; end if;
    doc_status:=case payload->>'status' when 'scheduled' then 'scheduled' when 'in_transit' then 'in_transit' when 'delivered' then 'delivered' when 'failed' then 'failed' when 'cancelled' then 'cancelled' end;
    if doc_status is null then raise exception 'Estado de entrega histórico desconocido.'; end if;
    date_value:=retail_private.legacy_timestamp(payload->>'date');
    if payload->>'timeSlot' ~ '^PM' then date_value:=date_value+interval '12 hours';
    elsif payload->>'timeSlot' ~ '^AM' then date_value:=date_value+interval '8 hours';
    elsif payload->>'timeSlot' ~ '^Evening' then date_value:=date_value+interval '17 hours'; end if;
    perform retail_private.legacy_issue(batch,'deliveries',row.source_id,'legacy_delivery_time_window',jsonb_build_object('date',payload->>'date','time_slot',payload->>'timeSlot','exact_time_known',false));
    insert into public.retail_deliveries(id,sale_id,status,address,phone,contact_name,scheduled_at,assignee,notes,received_by,delivered_at,history,legacy)
      values(delivery_id,did,doc_status,retail_private.txt(payload,'address',1000,true),coalesce(nullif(payload->'customer'->>'phone',''),'Sin teléfono registrado'),
        coalesce(nullif(payload->'customer'->>'name',''),'Cliente histórico'),date_value,coalesce(payload->>'driver',''),coalesce(payload->>'notes',''),null,
        case when nullif(payload->>'deliveredAt','') is not null then retail_private.legacy_timestamp(payload->>'deliveredAt') end,
        jsonb_build_array(jsonb_build_object('at',now(),'actor',null,'status',doc_status,'note','Estado declarado en el sistema anterior; receptor y autor no registrados.')),
        jsonb_build_object('source','deliveries','id',row.source_id,'original_date',payload->>'date','time_slot',payload->>'timeSlot','exact_time_known',false));
    insert into retail_private.legacy_map(source,source_id,entity_key,target_table,target_id) values('deliveries',row.source_id,'','retail_deliveries',delivery_id);
  end loop;

  -- Legacy permissive RLS must not remain an alternate API for costs or personal data.
  -- Preserve original ACLs above. These revocations are transactional and rollbackable.
  foreach src in array array['products','sales','customers','suppliers','purchase_orders','quotes','returns','deliveries','promotions','activity_log','settings'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',src);
    select string_agg(format('%I',attname),',') into column_names from pg_attribute where attrelid=to_regclass('public.'||src) and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on public.%I from public,anon,authenticated',column_names,src);
  end loop;
  result:=jsonb_build_object('batch_id',batch,'manifest',manifest,'archived_rows',archive_count,
    'products',(select count(*) from public.retail_products),'variants',(select count(*) from public.retail_variants),
    'stock_units',(select sum(available) from public.retail_stocks),'contacts',(select count(*) from public.retail_contacts),
    'sales',(select count(*) from public.retail_documents where type='sale'),'purchases',(select count(*) from public.retail_documents where type='purchase'),
    'document_items',(select count(*) from public.retail_document_items),'deliveries',(select count(*) from public.retail_deliveries),
    'issues',(select count(*) from retail_private.legacy_issues where batch_id=batch),'legacy_writes_frozen',true,'legacy_api_access_revoked',true);
  update retail_private.legacy_batches set completed_at=now(),summary=result where id=batch;
  insert into public.retail_audit(action,entity_id,operation_id,actor_id,actor_email,details)
    values('legacy_import',batch,batch,p_actor_id,(select email from public.retail_memberships where user_id=p_actor_id),result);
  update public.retail_revision set version=version+1,updated_at=now() where id=true;
  set constraints all immediate;
  return result;
end; $$;
revoke all on function retail_private.import_legacy(text,text,uuid,boolean) from public,anon,authenticated;

create or replace function retail_private.validate_product_images(pid uuid,images jsonb) returns void language plpgsql set search_path='' as $$
declare image_value jsonb; ref text; idx integer; begin
  if jsonb_typeof(images) is distinct from 'array' or jsonb_array_length(images)>8 then raise exception 'Puedes agregar hasta ocho imágenes.'; end if;
  for image_value in select value from jsonb_array_elements(images) loop
    if jsonb_typeof(image_value)<>'string' then raise exception 'La referencia de imagen no es válida.'; end if;
    ref:=image_value#>>'{}';
    if ref ~ '^https://' and length(ref)<=2048 then continue;
    elsif ref ~ '^storage:[A-Za-z0-9/_\.\-]+$' and length(ref)<=1024 and ref !~ '\.\.' then
      if not exists(select 1 from storage.objects where bucket_id='retail-product-media' and name=substr(ref,9)) then raise exception 'La imagen no terminó de subirse. Inténtalo de nuevo.'; end if;
    elsif ref ~ '^legacy:[a-f0-9-]{36}:[0-7]$' and split_part(ref,':',2)=pid::text then
      idx:=split_part(ref,':',3)::integer;
      if not exists(select 1 from retail_private.legacy_map m join retail_private.legacy_archive a on a.source=m.source and a.source_id=m.source_id
        where m.target_table='retail_products' and m.target_id=pid and m.entity_key='' and retail_private.is_legacy_product_image(a.data->'images'->>idx)) then raise exception 'La imagen histórica no pertenece a este producto.'; end if;
    else raise exception 'La imagen debe ser HTTPS, un archivo subido o una referencia histórica de este producto.';
    end if;
  end loop;
end; $$;
revoke all on function retail_private.validate_product_images(uuid,jsonb) from public,anon,authenticated;
