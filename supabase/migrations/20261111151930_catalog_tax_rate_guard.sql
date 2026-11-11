-- Preserve the existing net-price contract; optionally pin a tax-inclusive edit
-- to the settings rate that the editor used. No products/prices are rewritten.
-- CREATE OR REPLACE retains the current dispatcher, live authorization,
-- optimistic versions and exact cached replays; no callable legacy alias is made.
create or replace function retail_private.save_product(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare pid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); vid uuid; v jsonb; ids uuid[]:='{}'; existing boolean; n integer; expected_rate numeric; current_rate numeric; begin
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
    insert into public.retail_variants(id,product_id,name,sku,barcode,cost,price,min_stock,reorder_target,active)
      values(vid,pid,retail_private.txt(v,'name',160,true),upper(retail_private.txt(v,'sku',80,true)),nullif(retail_private.txt(v,'barcode',80),''),
        retail_private.num(v,'cost',0,999999999.99,0),retail_private.num(v,'price',0,999999999.99,0),
        retail_private.num(v,'min_stock',0,999999,0,true),retail_private.num(v,'reorder_target',0,999999,0,true),coalesce((v->>'active')::boolean,true))
      on conflict(id) do update set name=excluded.name,sku=excluded.sku,barcode=excluded.barcode,cost=excluded.cost,price=excluded.price,
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
