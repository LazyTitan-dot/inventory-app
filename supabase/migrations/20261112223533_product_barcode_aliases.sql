-- Manufacturer product codes share one namespace with existing internal codes.
-- Existing prices, primary codes, stock and historical document snapshots stay intact.
alter table public.retail_variants add column barcode_aliases text[] not null default '{}';
comment on column public.retail_variants.barcode_aliases is 'Up to ten confirmed manufacturer product codes. Unit serial and batch numbers are not product aliases.';

create table retail_private.barcode_registry (
  code_key text primary key check(length(code_key) between 1 and 80),
  variant_id uuid not null references public.retail_variants(id) on delete cascade
);
create index barcode_registry_variant_idx on retail_private.barcode_registry(variant_id);
alter table retail_private.barcode_registry enable row level security;
revoke all on table retail_private.barcode_registry from public,anon,authenticated;

-- Match JavaScript String.trim and ASCII folding without database-locale rules.
-- Preserve original stored codes; use this normalized value only for identity.
create function retail_private.barcode_key(p text) returns text language sql immutable strict set search_path='' as $$
  select translate(btrim(p,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),'abcdefghijklmnopqrstuvwxyz','ABCDEFGHIJKLMNOPQRSTUVWXYZ');
$$;
revoke all on function retail_private.barcode_key(text) from public,anon,authenticated;

-- Abort rather than silently merge or change any legacy identity.
do $$ begin
  if exists(select 1 from public.retail_variants where barcode is not null and
    (retail_private.barcode_key(barcode)='' or barcode~'[[:cntrl:]]')) or
    exists(select 1 from public.retail_variants where barcode is not null group by retail_private.barcode_key(barcode) having count(*)>1) then
    raise exception 'Revisa los códigos existentes: hay códigos vacíos, inválidos o repetidos antes de habilitar los códigos del fabricante.';
  end if;
end; $$;
insert into retail_private.barcode_registry(code_key,variant_id)
  select retail_private.barcode_key(barcode),id from public.retail_variants where barcode is not null;

create function retail_private.sync_barcode_registry() returns trigger language plpgsql set search_path='' as $$
declare codes text[]; code text; begin
  if tg_op='UPDATE' and new.barcode is not distinct from old.barcode and new.barcode_aliases is not distinct from old.barcode_aliases then return new; end if;
  if new.barcode_aliases is null or cardinality(new.barcode_aliases)>10 or coalesce(array_ndims(new.barcode_aliases),1)<>1 or array_position(new.barcode_aliases,null) is not null then
    raise exception 'Cada variante admite hasta 10 códigos adicionales del fabricante, sin valores vacíos.';
  end if;
  codes:=array_remove(array_prepend(new.barcode,new.barcode_aliases),null);
  foreach code in array codes loop
    if retail_private.barcode_key(code)='' or length(code)>80 or code~'[[:cntrl:]]' then
      raise exception 'El código de barras admite hasta 80 caracteres y no puede contener saltos de línea ni caracteres de control.';
    end if;
  end loop;
  if (select count(distinct retail_private.barcode_key(value)) from unnest(codes) as t(value))<>cardinality(codes) then
    raise exception 'Un código de barras se repite entre el código principal y los códigos del fabricante.';
  end if;
  delete from retail_private.barcode_registry where variant_id=new.id;
  begin
    -- The unique key arbitrates concurrent transactions too. A prior SELECT
    -- collision check alone cannot protect two simultaneous product saves.
    insert into retail_private.barcode_registry(code_key,variant_id)
      select retail_private.barcode_key(value),new.id from unnest(codes) as t(value) order by retail_private.barcode_key(value);
  exception when unique_violation then
    raise exception 'El código de barras ya pertenece a otra variante, incluso si está archivada.';
  end;
  return new;
end; $$;
create trigger retail_variant_barcode_registry after insert or update of barcode,barcode_aliases on public.retail_variants
  for each row execute function retail_private.sync_barcode_registry();
revoke all on function retail_private.sync_barcode_registry() from public,anon,authenticated;

create function retail_private.parse_barcode_aliases(p jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare value jsonb; codes text[]:='{}'; code text; begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>10 then
    raise exception 'Cada variante admite hasta 10 códigos adicionales del fabricante.';
  end if;
  for value in select x from jsonb_array_elements(p) as a(x) loop
    if jsonb_typeof(value)<>'string' then raise exception 'Los códigos del fabricante deben ser textos.'; end if;
    code:=btrim(value#>>'{}');
    if retail_private.barcode_key(code)='' or length(code)>80 or code~'[[:cntrl:]]' then raise exception 'El código del fabricante debe tener entre 1 y 80 caracteres, sin caracteres de control.'; end if;
    codes:=array_append(codes,code);
  end loop;
  return codes;
end; $$;
revoke all on function retail_private.parse_barcode_aliases(jsonb) from public,anon,authenticated;

create or replace function retail_private.save_product(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare pid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); vid uuid; v jsonb; ids uuid[]:='{}'; existing boolean; n integer; expected_rate numeric; current_rate numeric; aliases text[]; begin
  perform retail_private.require_role(array['owner','admin','inventory']);
  if p ? 'expected_tax_rate' then
    expected_rate:=retail_private.num(p,'expected_tax_rate',0,100,null);
    -- Hold this row until the enclosing command commits. Concurrent settings
    -- changes cannot invalidate the tax-inclusive price intent during the save.
    select tax_rate into current_rate from public.retail_settings where id=true for share;
    if not found then raise exception 'La configuración del negocio ya no está disponible.'; end if;
    if current_rate<>expected_rate then
      raise exception 'La tasa de ITBIS cambió. Actualiza el producto y vuelve a revisar el precio final antes de guardar.';
    end if;
  end if;
  if jsonb_typeof(p->'variants') is distinct from 'array' or jsonb_array_length(p->'variants') not between 1 and 100 then raise exception 'Agrega entre 1 y 100 variantes.'; end if;
  if p ? 'id' then perform 1 from public.retail_products where id=pid for update; if not found then raise exception 'Producto no encontrado.'; end if; end if;
  perform retail_private.validate_product_images(pid,coalesce(p->'images','[]'));
  insert into public.retail_products(id,category,brand,model,description,warranty_months,images)
  values(pid,retail_private.txt(p,'category',100,true),retail_private.txt(p,'brand',100,true),retail_private.txt(p,'model',200,true),
    retail_private.txt(p,'description',4000),retail_private.num(p,'warranty_months',0,120,12,true),coalesce(p->'images','[]'))
  on conflict(id) do update set category=excluded.category,brand=excluded.brand,model=excluded.model,description=excluded.description,
    warranty_months=excluded.warranty_months,images=excluded.images,updated_at=now();
  perform id from public.retail_variants where product_id=pid order by id for update;
  for v in select value from jsonb_array_elements(p->'variants') loop
    vid:=coalesce(nullif(v->>'id','')::uuid,gen_random_uuid());
    if vid=any(ids) then raise exception 'Una variante aparece más de una vez.'; end if; ids:=array_append(ids,vid);
    select exists(select 1 from public.retail_variants where id=vid and product_id=pid) into existing;
    if v ? 'id' and not existing then raise exception 'La variante no pertenece a este producto.'; end if;
    if existing and coalesce((v->>'opening_quantity')::numeric,0)<>0 then raise exception 'Usa un ajuste para cambiar las existencias de una variante existente.'; end if;
    if v ? 'barcode_aliases' then aliases:=retail_private.parse_barcode_aliases(v->'barcode_aliases');
    elsif existing then select barcode_aliases into aliases from public.retail_variants where id=vid;
    else aliases:='{}'; end if;
    insert into public.retail_variants(id,product_id,name,sku,barcode,barcode_aliases,cost,price,min_stock,reorder_target,active)
      values(vid,pid,retail_private.txt(v,'name',160,true),upper(retail_private.txt(v,'sku',80,true)),nullif(retail_private.txt(v,'barcode',80),''),aliases,
        retail_private.num(v,'cost',0,999999999.99,0),retail_private.num(v,'price',0,999999999.99,0),
        retail_private.num(v,'min_stock',0,999999,0,true),retail_private.num(v,'reorder_target',0,999999,0,true),coalesce((v->>'active')::boolean,true))
      on conflict(id) do update set name=excluded.name,sku=excluded.sku,barcode=excluded.barcode,barcode_aliases=excluded.barcode_aliases,cost=excluded.cost,price=excluded.price,
        min_stock=excluded.min_stock,reorder_target=excluded.reorder_target,active=excluded.active,updated_at=now();
    if not existing then
      insert into public.retail_stocks(variant_id) values(vid);
      n:=retail_private.num(v,'opening_quantity',0,999999,0,true);
      if n>0 then perform retail_private.move(vid,n,'available','opening','Existencias iniciales',null,op); end if;
    end if;
  end loop;
  update public.retail_variants set active=false,updated_at=now() where product_id=pid and not(id=any(ids));
  if not exists(select 1 from public.retail_variants where product_id=pid and active) then raise exception 'El producto necesita al menos una variante activa.'; end if;
  if exists(select 1 from public.retail_variants v join public.retail_stocks s on s.variant_id=v.id where v.product_id=pid and not v.active and (s.available>0 or s.quarantine>0)) or
    exists(select 1 from public.retail_variants v join public.retail_document_items i on i.variant_id=v.id join public.retail_documents d on d.id=i.document_id
      where v.product_id=pid and not v.active and d.type='purchase' and d.status in ('pending','partial') and i.quantity>i.received_quantity) then
    raise exception 'No se puede archivar una variante con existencias o compras pendientes.';
  end if;
  return pid;
end; $$;

revoke all on function retail_private.save_product(jsonb,uuid) from public,anon,authenticated;

create or replace function retail_private.bootstrap() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']); result jsonb; begin
  result:=retail_private.bootstrap_without_fulfilment();
  return result||jsonb_build_object('features',jsonb_build_array('customer_addresses_v1','purchase_receipts_v1','barcode_aliases_v1'),
    'customer_addresses',(select coalesce(jsonb_agg(to_jsonb(a) order by a.contact_id,a.is_default desc,a.label,a.id),'[]') from public.retail_customer_addresses a where r in ('owner','admin','sales')),
    'purchase_receipts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from public.retail_purchase_receipts x where r in ('owner','admin','inventory')));
end; $$;
