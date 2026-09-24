-- Document lifecycle extensions. Existing migrations and historical values remain unchanged.
alter table public.retail_documents add column status_reason text not null default '' check(length(status_reason)<=1000);

-- An unknown catalog price must never create an accidental free sale. Authorized 100%
-- discounts still have a positive unit_price. Import preserves explicitly tagged history.
create function retail_private.require_commercial_price() returns trigger language plpgsql set search_path='' as $$
begin
  if new.unit_price<=0 and exists(select 1 from public.retail_documents d where d.id=new.document_id
    and d.type in ('sale','quote') and not(d.legacy ? 'source')) then
    raise exception 'Este artículo tiene el precio pendiente. Define un precio de venta mayor que cero antes de vender o cotizar.';
  end if;
  return new;
end; $$;
create trigger retail_document_items_commercial_price before insert or update of unit_price,document_id
  on public.retail_document_items for each row execute function retail_private.require_commercial_price();
revoke all on function retail_private.require_commercial_price() from public,anon,authenticated;

create function retail_private.check_document_version(actual timestamptz,p jsonb,required boolean default true)
returns void language plpgsql stable set search_path='' as $$
begin
  if nullif(p->>'expected_updated_at','') is null then
    if required then raise exception 'Actualiza el documento antes de confirmar esta acción.'; end if;
  elsif (p->>'expected_updated_at')::timestamptz<>actual then
    raise exception 'Otra persona modificó el documento. Actualiza los datos y vuelve a revisarlo.';
  end if;
end; $$;

create function retail_private.ensure_business_ready() returns void language plpgsql stable set search_path='' as $$
declare source_name text; has_rows boolean; begin
  if exists(select 1 from retail_private.legacy_batches where completed_at is not null) then return; end if;
  foreach source_name in array array['products','sales'] loop
    if to_regclass('public.'||source_name) is not null then
      execute format('select exists(select 1 from public.%I)',source_name) into has_rows;
      if has_rows then raise exception 'La actualización del negocio está en curso. Las operaciones estarán disponibles cuando finalice la migración de los datos.'; end if;
    end if;
  end loop;
end; $$;

create function retail_private.historical_variant_matches(snapshot jsonb,variant uuid) returns boolean language sql stable set search_path='' as $$
 select coalesce((select v.active and p.active
   and nullif(btrim(snapshot->>'brand'),'') is not null and lower(btrim(snapshot->>'brand'))=lower(btrim(p.brand))
   and nullif(btrim(snapshot->>'model'),'') is not null and lower(btrim(snapshot->>'model'))=lower(btrim(p.model))
   and nullif(btrim(snapshot->>'name'),'') is not null and lower(btrim(snapshot->>'name'))=lower(btrim(v.name))
   and (nullif(btrim(snapshot->>'sku'),'') is null or upper(btrim(snapshot->>'sku'))=upper(v.sku)
     or upper(btrim(snapshot->>'sku'))=upper(v.legacy->>'product_sku') or upper(btrim(snapshot->>'sku'))=upper(p.legacy->>'sku')
     or left(upper(v.sku),length(btrim(snapshot->>'sku'))+1)=upper(btrim(snapshot->>'sku'))||'-')
   from public.retail_variants v join public.retail_products p on p.id=v.product_id where v.id=variant),false);
$$;

create function retail_private.update_quote(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
declare d public.retail_documents; replacement public.retail_documents; temporary_id uuid; begin
  perform retail_private.require_role(array['owner','admin','sales']);
  select * into d from public.retail_documents where id=(p->>'id')::uuid and type='quote' for update;
  if not found or d.status<>'open' or exists(select 1 from public.retail_documents where parent_id=d.id) then raise exception 'Solo puedes editar una cotización abierta que no se haya convertido.'; end if;
  perform retail_private.check_document_version(d.updated_at,p);
  -- Reuse the authoritative catalog, permission, promotion and decimal pricing engine.
  -- The replacement is never visible outside this transaction; ID/number/creation are retained.
  temporary_id:=retail_private.create_document(p-array['id','expected_updated_at'],'quote',op);
  select * into strict replacement from public.retail_documents where id=temporary_id;
  delete from public.retail_document_items where document_id=d.id;
  update public.retail_document_items set document_id=d.id where document_id=temporary_id;
  update public.retail_documents set contact_id=replacement.contact_id,contact_snapshot=replacement.contact_snapshot,
    subtotal=replacement.subtotal,discount=replacement.discount,tax_rate=replacement.tax_rate,tax=replacement.tax,total=replacement.total,
    promotion_id=replacement.promotion_id,notes=replacement.notes,expires_at=replacement.expires_at,updated_at=clock_timestamp() where id=d.id;
  delete from public.retail_documents where id=temporary_id;
  -- create_document holds this counter row lock. No concurrent increment can be rolled back here.
  update retail_private.counters set value=value-1 where type='quote';
  return d.id;
end; $$;

-- Keep the original dispatcher available only internally; the public RPC is rebound below.
alter function retail_private.command(uuid,text,jsonb) rename to command_core;
revoke all on function retail_private.command_core(uuid,text,jsonb) from public,anon,authenticated;
create function retail_private.command(op uuid,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare cached retail_private.operations; d public.retail_documents; i public.retail_document_items; eid uuid; target_variant uuid;
  response jsonb; result jsonb; before_state jsonb; reason text; begin
  perform retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
  perform retail_private.ensure_business_ready();
  if act is null or act not in ('update_quote','cancel_quote','confirm_purchase_draft','cancel_purchase','link_historical_item','cancel_legacy_sale') then
    return retail_private.command_core(op,act,p);
  end if;
  if op is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000 then raise exception 'La operación tiene un formato inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select * into cached from retail_private.operations where id=op;
  if found then
    if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then raise exception 'Este identificador de operación ya se usó con otros datos.'; end if;
    return cached.response;
  end if;
  if act in ('update_quote','cancel_quote') then perform retail_private.require_role(array['owner','admin','sales']);
  elsif act in ('confirm_purchase_draft','cancel_purchase') then perform retail_private.require_role(array['owner','admin','inventory']);
  else perform retail_private.require_role(array['owner','admin']); end if;

  if act='link_historical_item' then
    select document_id into eid from public.retail_document_items where id=(p->>'item_id')::uuid;
  else eid:=(p->>'id')::uuid; end if;
  select * into d from public.retail_documents where id=eid for update;
  if not found then raise exception 'Documento no encontrado.'; end if;
  perform retail_private.check_document_version(d.updated_at,p,act<>'cancel_purchase');
  before_state:=jsonb_build_object('document',to_jsonb(d),'items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.retail_document_items x where document_id=d.id));

  case act
  when 'update_quote' then eid:=retail_private.update_quote(p,op);
  when 'cancel_quote' then
    if d.type<>'quote' or d.status<>'open' then raise exception 'Solo puedes cancelar una cotización abierta.'; end if;
    reason:=retail_private.txt(p,'reason',1000,true);
    update public.retail_documents set status='cancelled',status_reason=reason,updated_at=clock_timestamp() where id=d.id;
  when 'confirm_purchase_draft' then
    if d.type<>'purchase' or d.status<>'draft' then raise exception 'Solo puedes confirmar un borrador de compra.'; end if;
    if not exists(select 1 from public.retail_contacts where id=d.contact_id and kind='supplier' and active) then raise exception 'El borrador necesita un proveedor activo antes de confirmarse.'; end if;
    perform v.id from public.retail_variants v where v.id in(select x.variant_id from public.retail_document_items x where x.document_id=d.id) order by v.id for update;
    if not exists(select 1 from public.retail_document_items where document_id=d.id) or exists(select 1 from public.retail_document_items x where x.document_id=d.id and
      (x.variant_id is null or not retail_private.historical_variant_matches(x.product_snapshot,x.variant_id))) then
      raise exception 'Vincula cada artículo al producto y variante correctos antes de confirmar el borrador.';
    end if;
    if exists(select 1 from public.retail_document_items where document_id=d.id and received_quantity<>0) then raise exception 'El borrador tiene recepciones inconsistentes que requieren revisión.'; end if;
    update public.retail_documents set status='pending',updated_at=clock_timestamp() where id=d.id;
  when 'cancel_purchase' then
    if d.type<>'purchase' or d.status not in ('draft','pending','partial') then raise exception 'Esta compra ya fue recibida o cancelada.'; end if;
    reason:=retail_private.txt(p,'reason',1000,true);
    update public.retail_documents set status='cancelled',status_reason=reason,updated_at=clock_timestamp() where id=d.id;
  when 'link_historical_item' then
    reason:=retail_private.txt(p,'reason',1000,true); target_variant:=(p->>'variant_id')::uuid;
    select * into i from public.retail_document_items where id=(p->>'item_id')::uuid and document_id=d.id for update;
    if not found or i.variant_id is not null or not(i.legacy ? 'source') then raise exception 'Solo puedes vincular una partida histórica que todavía no tenga variante.'; end if;
    perform 1 from public.retail_variants where id=target_variant for update;
    if not found or not retail_private.historical_variant_matches(i.product_snapshot,target_variant) then raise exception 'La marca, el modelo, la variante y el SKU deben coincidir con el artículo histórico.'; end if;
    update public.retail_document_items set variant_id=target_variant,
      legacy=legacy||jsonb_build_object('variant_match','admin_verified','linked_at',clock_timestamp(),'linked_by',auth.uid()) where id=i.id;
    update public.retail_documents set updated_at=clock_timestamp() where id=d.id;
  when 'cancel_legacy_sale' then
    if d.type<>'sale' or d.status<>'legacy_pending' then raise exception 'Esta acción solo aplica a una venta pendiente del sistema anterior.'; end if;
    reason:=retail_private.txt(p,'reason',1000,true);
    if p->'stock_already_accounted' is distinct from 'true'::jsonb or p->>'stock_effect' is distinct from 'none' then
      raise exception 'Confirma expresamente que el inventario actual está conciliado: esta cancelación no ajusta existencias ni registra un reembolso.';
    end if;
    if exists(select 1 from public.retail_deliveries where sale_id=d.id and status<>'cancelled') then raise exception 'Resuelve la entrega vinculada antes de cancelar la venta histórica.'; end if;
    update public.retail_documents set status='voided',status_reason=reason,updated_at=clock_timestamp(),
      legacy=legacy||jsonb_build_object('cancelled_without_stock_movement',true,'stock_reconciliation_declared_by',auth.uid(),'stock_reconciliation_declared_at',clock_timestamp()) where id=d.id;
  end case;

  select jsonb_build_object('id',id,'number',number,'status',status,'total',total,'updated_at',updated_at) into result from public.retail_documents where id=eid;
  if act='link_historical_item' then result:=result||jsonb_build_object('item_id',i.id,'variant_id',target_variant); end if;
  response:=jsonb_build_object('operation_id',op,'action',act,'entity_id',eid,'result',result);
  insert into retail_private.operations(id,actor_id,action,payload,response) values(op,auth.uid(),act,p,response);
  insert into public.retail_audit(action,entity_id,operation_id,actor_id,actor_email,details)
    values(act,eid,op,auth.uid(),(select email from public.retail_memberships where user_id=auth.uid()),jsonb_build_object('payload',p,'before',before_state,'result',result));
  update public.retail_revision set version=version+1,updated_at=now() where id=true;
  return response;
end; $$;
create or replace function public.retail_command(p_operation uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
  select retail_private.command(p_operation,p_action,p_payload);
$$;
revoke all on function retail_private.check_document_version(timestamptz,jsonb,boolean) from public,anon,authenticated;
revoke all on function retail_private.ensure_business_ready() from public,anon,authenticated;
revoke all on function retail_private.historical_variant_matches(jsonb,uuid) from public,anon,authenticated;
revoke all on function retail_private.update_quote(jsonb,uuid) from public,anon,authenticated;
revoke all on function retail_private.command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
revoke all on function public.retail_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.retail_command(uuid,text,jsonb) to authenticated;

-- Existing legacy timestamp triggers only use NEW.updated_at and pg_catalog.now().
do $$ begin
  if to_regprocedure('public.update_updated_at_column()') is not null then execute 'alter function public.update_updated_at_column() set search_path='''''; end if;
  if to_regprocedure('public.set_updated_at()') is not null then execute 'alter function public.set_updated_at() set search_path='''''; end if;
end $$;
