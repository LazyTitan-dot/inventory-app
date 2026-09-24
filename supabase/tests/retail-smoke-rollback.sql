-- Execute only after reviewing the migration on a staging database.
-- No users, catalog records, counters, audit rows or stock changes survive ROLLBACK.
-- Uses an existing owner membership and authenticated SQL role; never creates Auth credentials.
begin;
select set_config('request.jwt.claim.sub',
  (select user_id::text from public.retail_memberships where role='owner' and active order by created_at limit 1),true);
set local role authenticated;
do $$
declare op uuid:=gen_random_uuid(); p jsonb; response jsonb; again jsonb; state jsonb; variant uuid; sale jsonb; item uuid; bad boolean:=false;
begin
  p:=jsonb_build_object('category','Prueba transaccional','brand','QA','model',op::text,'warranty_months',0,
    'variants',jsonb_build_array(jsonb_build_object('name','Unidad','sku','QA-'||op::text,'cost',100,'price',200,'min_stock',0,'reorder_target',5,'opening_quantity',3)));
  response:=public.retail_command(op,'save_product',p);
  again:=public.retail_command(op,'save_product',p);
  if response<>again then raise exception 'FAIL: idempotency response changed'; end if;
  state:=public.retail_bootstrap();
  select (x->>'id')::uuid into variant from jsonb_array_elements(state->'variants') x where x->>'product_id'=response->>'entity_id';
  if variant is null then raise exception 'FAIL: created variant missing'; end if;
  begin
    perform public.retail_command(gen_random_uuid(),'adjust_stock',jsonb_build_object('variant_id',variant,'quantity',-4,'expected_quantity',3,'reason','Validación negativa'));
  exception when raise_exception then bad:=true; end;
  if not bad then raise exception 'FAIL: negative stock accepted'; end if;
  sale:=public.retail_command(gen_random_uuid(),'create_sale',jsonb_build_object('items',jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',2)),'payment_method','card'));
  state:=public.retail_bootstrap();
  if not exists(select 1 from jsonb_array_elements(state->'stocks') x where x->>'variant_id'=variant::text and (x->>'available')::integer=1) then raise exception 'FAIL: sale did not deduct exactly two'; end if;
  select (x->>'id')::uuid into item from jsonb_array_elements(state->'document_items') x where x->>'document_id'=sale->>'entity_id';
  perform public.retail_command(gen_random_uuid(),'return_sale',jsonb_build_object('id',sale->>'entity_id','items',jsonb_build_array(jsonb_build_object('item_id',item,'quantity',1,'condition','quarantine')),'reason','QA devolución','payment_method','card'));
  state:=public.retail_bootstrap();
  if not exists(select 1 from jsonb_array_elements(state->'stocks') x where x->>'variant_id'=variant::text and (x->>'available')::integer=1 and (x->>'quarantine')::integer=1) then raise exception 'FAIL: quarantine mixed with sellable stock'; end if;
  raise notice 'PASS: authenticated create, idempotency, negative stock rejection, sale and quarantine return';
end $$;
set constraints all immediate;
rollback;
