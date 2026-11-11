-- Additive adaptation of customer address book, purchase receiving and delivery tracking.
-- No legacy import or hosted operation is run by this migration.
create table public.retail_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.retail_contacts(id),
  label text not null check(length(btrim(label)) between 1 and 45),
  street text not null check(length(btrim(street)) between 1 and 300),
  sector text not null default '' check(length(sector)<=120),
  city text not null check(length(btrim(city)) between 1 and 120),
  province text not null check(length(btrim(province)) between 1 and 120),
  phone text not null check(length(phone)<=60 and length(regexp_replace(phone,'[^0-9]','','g')) between 7 and 15),
  reference text not null default '' check(length(reference)<=1000),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(active or not is_default)
);
create index retail_address_contact_idx on public.retail_customer_addresses(contact_id,active);
create unique index retail_address_one_default on public.retail_customer_addresses(contact_id) where active and is_default;
alter table public.retail_customer_addresses enable row level security;
revoke all on public.retail_customer_addresses from public,anon,authenticated;
create trigger retail_address_version before update on public.retail_customer_addresses
  for each row execute function retail_private.advance_master_version();

alter table public.retail_deliveries
  add column customer_address_id uuid references public.retail_customer_addresses(id),
  add column address_snapshot jsonb check(address_snapshot is null or jsonb_typeof(address_snapshot)='object'),
  add column proof text not null default '' check(length(proof)<=1000);
create index retail_delivery_saved_address_idx on public.retail_deliveries(customer_address_id) where customer_address_id is not null;
alter table public.retail_documents
  add column expected_at date,
  add column closed_short boolean not null default false;
alter table public.retail_documents drop constraint retail_document_type_status;
alter table public.retail_documents add constraint retail_document_type_status check(
 (type='sale' and status in ('completed','partially_returned','returned','voided','legacy_pending')) or
 (type='purchase' and status in ('draft','pending','partial','received','cancelled','closed_short')) or
 (type='quote' and status in ('open','converted','cancelled')) or (type='return' and status='completed'));
alter table public.retail_documents add constraint retail_purchase_short_status check(closed_short=(type='purchase' and status='closed_short'));
alter table public.retail_documents add constraint retail_purchase_expected_date check(expected_at is null or type='purchase');
create index retail_purchase_expected_idx on public.retail_documents(expected_at) where type='purchase' and status in ('pending','partial');
alter table public.retail_document_items add column damaged_quantity integer not null default 0 check(damaged_quantity between 0 and received_quantity);

create table public.retail_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.retail_documents(id),
  operation_id uuid not null unique,
  received_by uuid not null,
  notes text not null default '' check(length(notes)<=1000),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 200),
  created_at timestamptz not null default now()
);
create index retail_receipt_purchase_idx on public.retail_purchase_receipts(purchase_id,created_at desc);
alter table public.retail_purchase_receipts enable row level security;
revoke all on public.retail_purchase_receipts from public,anon,authenticated;

create function retail_private.address_snapshot(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; phone text; begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Completa la dirección de entrega.'; end if;
  phone:=retail_private.txt(p,'phone',60,true);
  if length(regexp_replace(phone,'[^0-9]','','g')) not between 7 and 15 then raise exception 'El teléfono de entrega debe contener entre 7 y 15 dígitos.'; end if;
  result:=jsonb_build_object('street',retail_private.txt(p,'street',300,true),'sector',retail_private.txt(p,'sector',120),
    'city',retail_private.txt(p,'city',120,true),'province',retail_private.txt(p,'province',120,true),'phone',phone,'reference',retail_private.txt(p,'reference',1000));
  return result;
end; $$;

create function retail_private.save_customer_address(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare aid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); cid uuid; a public.retail_customer_addresses;
  snap jsonb; preferred boolean; begin
  perform retail_private.require_role(array['owner','admin','sales']);
  if p ? 'id' then
    select * into a from public.retail_customer_addresses where id=aid;
    if not found then raise exception 'La dirección ya no está disponible.'; end if;
    cid:=a.contact_id;
    if nullif(p->>'contact_id','')::uuid is distinct from cid then raise exception 'La dirección debe conservar su cliente original.'; end if;
  else cid:=nullif(p->>'contact_id','')::uuid; end if;
  perform 1 from public.retail_contacts where id=cid and kind='customer' and active for update;
  if not found then raise exception 'Selecciona un cliente activo.'; end if;
  if p ? 'id' then
    select * into a from public.retail_customer_addresses where id=aid for update;
    perform retail_private.check_master_version(a.updated_at,p,'la dirección');
    if not a.active then raise exception 'Reactiva la dirección antes de editarla.'; end if;
  elsif (select count(*) from public.retail_customer_addresses where contact_id=cid and active)>=100 then
    raise exception 'Este cliente ya tiene 100 direcciones activas. Archiva una antes de agregar otra.';
  end if;
  snap:=retail_private.address_snapshot(p);
  preferred:=coalesce((p->>'is_default')::boolean,false) or not exists(select 1 from public.retail_customer_addresses where contact_id=cid and active and id<>aid);
  -- A default is kept until another address is explicitly preferred.
  preferred:=preferred or coalesce(a.is_default,false);
  if preferred then update public.retail_customer_addresses set is_default=false where contact_id=cid and active and is_default and id<>aid; end if;
  insert into public.retail_customer_addresses(id,contact_id,label,street,sector,city,province,phone,reference,is_default)
    values(aid,cid,retail_private.txt(p,'label',45,true),snap->>'street',snap->>'sector',snap->>'city',snap->>'province',snap->>'phone',snap->>'reference',preferred)
  on conflict(id) do update set label=excluded.label,street=excluded.street,sector=excluded.sector,city=excluded.city,
    province=excluded.province,phone=excluded.phone,reference=excluded.reference,is_default=excluded.is_default;
  return aid;
end; $$;

-- This helper remains inside the existing command/version boundary.
create or replace function retail_private.save_delivery(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare eid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); sid uuid:=(p->>'sale_id')::uuid;
  old public.retail_deliveries; sale public.retail_documents; a public.retail_customer_addresses; scheduled timestamptz;
  aid uuid:=nullif(p->>'customer_address_id','')::uuid; snap jsonb; address_text text; phone_text text; save_address boolean;
begin
  perform retail_private.require_role(array['owner','admin','sales','inventory']);
  select * into sale from public.retail_documents where id=sid and type='sale' and status in ('completed','partially_returned') for update;
  if not found then raise exception 'Solo puedes programar una entrega para una venta vigente.'; end if;
  if p ? 'id' then
    select * into old from public.retail_deliveries where id=eid and sale_id=sid for update;
    if not found or old.status not in ('scheduled','failed') then raise exception 'Esta entrega no se puede editar ni reprogramar.'; end if;
  end if;
  save_address:=coalesce((p->>'save_to_customer')::boolean,false);
  if save_address then
    perform retail_private.require_role(array['owner','admin','sales']);
    if sale.contact_id is null then raise exception 'Selecciona un cliente registrado y una dirección completa para guardarla en su perfil.'; end if;
    -- Address mutations always lock contact -> address, even when a saved selection
    -- is redundantly submitted with save_to_customer. Never upgrade in reverse order.
    perform 1 from public.retail_contacts where id=sale.contact_id and kind='customer' and active for update;
    if not found then raise exception 'El cliente ya no está activo.'; end if;
  end if;
  if aid is not null then
    select * into a from public.retail_customer_addresses where id=aid and active and contact_id=sale.contact_id for share;
    if not found then raise exception 'La dirección guardada no pertenece al cliente de esta venta o está archivada.'; end if;
    snap:=retail_private.address_snapshot(to_jsonb(a));
    if p->'address_snapshot' is not null and p->'address_snapshot'<>'null'::jsonb and retail_private.address_snapshot(p->'address_snapshot')<>snap then
      raise exception 'La dirección guardada cambió. Selecciónala nuevamente o usa una dirección manual.';
    end if;
  elsif p->'address_snapshot' is not null and p->'address_snapshot'<>'null'::jsonb then snap:=retail_private.address_snapshot(p->'address_snapshot');
  elsif old.address_snapshot is not null then
    -- Editing the legacy text must not silently discard an existing structured snapshot.
    snap:=old.address_snapshot; aid:=old.customer_address_id;
  end if;
  if snap is not null then
    address_text:=concat_ws(' · ',snap->>'street',nullif(snap->>'sector',''),concat_ws(', ',snap->>'city',snap->>'province'));
    phone_text:=snap->>'phone';
  else
    address_text:=retail_private.txt(p,'address',1000,true); phone_text:=retail_private.txt(p,'phone',60,true);
  end if;
  if save_address then
    if snap is null then raise exception 'Selecciona un cliente registrado y una dirección completa para guardarla en su perfil.'; end if;
    if aid is null then
      select id into aid from public.retail_customer_addresses where contact_id=sale.contact_id and active and retail_private.address_snapshot(to_jsonb(retail_customer_addresses))=snap order by created_at,id limit 1;
      if aid is null then aid:=retail_private.save_customer_address(snap||jsonb_build_object('contact_id',sale.contact_id,'label',coalesce(nullif(retail_private.txt(p,'address_label',45),''),'Entrega'),'is_default',false)); end if;
    end if;
  end if;
  scheduled:=(p->>'scheduled_at')::timestamptz;
  if scheduled is null or scheduled<now()-interval '1 day' or scheduled>now()+interval '366 days' then raise exception 'Selecciona una fecha de entrega válida.'; end if;
  insert into public.retail_deliveries(id,sale_id,address,phone,contact_name,scheduled_at,assignee,notes,customer_address_id,address_snapshot,history)
    values(eid,sid,address_text,phone_text,retail_private.txt(p,'contact_name',200,true),scheduled,
      retail_private.txt(p,'assignee',160),retail_private.txt(p,'notes',4000),aid,snap,
      jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor',auth.uid(),'status','scheduled','note','Entrega programada')))
  on conflict(id) do update set address=excluded.address,phone=excluded.phone,contact_name=excluded.contact_name,scheduled_at=excluded.scheduled_at,
    assignee=excluded.assignee,notes=excluded.notes,customer_address_id=excluded.customer_address_id,address_snapshot=excluded.address_snapshot,
    status='scheduled',history=public.retail_deliveries.history||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor',auth.uid(),'status','scheduled','note','Entrega reprogramada'));
  return eid;
end; $$;

create or replace function retail_private.status_delivery(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_deliveries; st text:=p->>'status'; note text:=retail_private.txt(p,'note',1000);
  receiver text:=retail_private.txt(p,'received_by',200); proof_text text; sid uuid; begin
  perform retail_private.require_role(array['owner','admin','sales','inventory']);
  select sale_id into sid from public.retail_deliveries where id=(p->>'id')::uuid;
  perform 1 from public.retail_documents where id=sid and status in ('completed','partially_returned') for update;
  if not found then raise exception 'La venta vinculada ya no admite cambios de entrega.'; end if;
  select * into d from public.retail_deliveries where id=(p->>'id')::uuid for update;
  if not found then raise exception 'Entrega no encontrada.'; end if;
  if st=d.status then return d.id; end if;
  if not((d.status='scheduled' and st in ('in_transit','cancelled')) or (d.status='in_transit' and st in ('delivered','failed')) or (d.status='failed' and st in ('scheduled','cancelled'))) then raise exception 'El cambio de estado de la entrega no está permitido.'; end if;
  if st in ('failed','cancelled') and note='' then raise exception 'Explica el motivo del cambio.'; end if;
  if st='delivered' and receiver='' then raise exception 'Indica quién recibió la mercancía.'; end if;
  proof_text:=coalesce(nullif(retail_private.txt(p,'proof',1000),''),d.proof,'');
  if d.address_snapshot is not null then
    perform retail_private.address_snapshot(d.address_snapshot);
    if st='in_transit' and (btrim(d.assignee)='' or lower(btrim(d.assignee))='sin asignar') then raise exception 'Asigna un responsable antes de iniciar la entrega.'; end if;
    if st='delivered' and proof_text='' then raise exception 'Registra una constancia de la entrega.'; end if;
  end if;
  update public.retail_deliveries set status=st,received_by=case when st='delivered' then receiver else received_by end,
    proof=case when st='delivered' then proof_text else proof end,delivered_at=case when st='delivered' then clock_timestamp() else delivered_at end,
    history=history||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor',auth.uid(),'status',st,'note',note)
      ||case when st='delivered' then jsonb_build_object('received_by',receiver,'proof',proof_text) else '{}'::jsonb end) where id=d.id;
  return d.id;
end; $$;

create or replace function retail_private.receive_purchase(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_documents; i public.retail_document_items; x jsonb; ids uuid[]:='{}'; good integer; damaged integer;
  receipt_items jsonb:='[]'; receipt_notes text:=retail_private.txt(p,'notes',1000); begin
  perform retail_private.require_role(array['owner','admin','inventory']);
  select * into d from public.retail_documents where id=(p->>'id')::uuid and type='purchase' for update;
  if not found or d.status not in ('pending','partial') then raise exception 'Esta compra ya fue recibida, cerrada o cancelada.'; end if;
  perform retail_private.check_document_version(d.updated_at,p,false);
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 200 then raise exception 'Indica al menos un artículo recibido.'; end if;
  for x in select value from jsonb_array_elements(p->'items') loop
    if nullif(x->>'item_id','') is null or (x->>'item_id')::uuid=any(ids) then raise exception 'Hay artículos duplicados en la recepción.'; end if;
    ids:=array_append(ids,(x->>'item_id')::uuid);
    good:=retail_private.num(x,'quantity',0,999999,0,true); damaged:=retail_private.num(x,'damaged_quantity',0,999999,0,true);
    if good+damaged=0 then raise exception 'Registra al menos una unidad conforme o dañada por partida.'; end if;
  end loop;
  if (select count(*) from public.retail_document_items where id=any(ids) and document_id=d.id)<>cardinality(ids) then raise exception 'Un artículo no pertenece a esta compra.'; end if;
  perform v.id from public.retail_variants v where v.id in(select variant_id from public.retail_document_items where id=any(ids)) order by v.id for update;
  perform s.variant_id from public.retail_stocks s where s.variant_id in(select variant_id from public.retail_document_items where id=any(ids)) order by s.variant_id for update;
  for x in select value from jsonb_array_elements(p->'items') loop
    select * into strict i from public.retail_document_items where id=(x->>'item_id')::uuid;
    good:=retail_private.num(x,'quantity',0,999999,0,true); damaged:=retail_private.num(x,'damaged_quantity',0,999999,0,true);
    if good+damaged>i.quantity-i.received_quantity then raise exception 'La cantidad recibida supera el saldo pendiente.'; end if;
    if i.variant_id is null then raise exception 'El artículo histórico requiere vincular una variante antes de recibirlo.'; end if;
    if good>0 then
      perform retail_private.revalue_available(i.variant_id,good,i.unit_cost);
      perform retail_private.move(i.variant_id,good,'available','purchase',coalesce(nullif(receipt_notes,''),'Recepción de compra'),d.id,op);
    end if;
    if damaged>0 then perform retail_private.move(i.variant_id,damaged,'quarantine','purchase',coalesce(nullif(receipt_notes,''),'Mercancía dañada en recepción'),d.id,op); end if;
    update public.retail_document_items set received_quantity=received_quantity+good+damaged,damaged_quantity=damaged_quantity+damaged where id=i.id;
    receipt_items:=receipt_items||jsonb_build_array(jsonb_build_object('item_id',i.id,'variant_id',i.variant_id,'quantity',good,'damaged_quantity',damaged,'unit_cost',i.unit_cost));
  end loop;
  insert into public.retail_purchase_receipts(purchase_id,operation_id,received_by,notes,items) values(d.id,op,auth.uid(),receipt_notes,receipt_items);
  update public.retail_documents set status=case when exists(select 1 from public.retail_document_items where document_id=d.id and received_quantity<quantity) then 'partial' else 'received' end,updated_at=clock_timestamp() where id=d.id;
  return d.id;
end; $$;

-- New actions reuse the same live authorization/idempotency/audit boundary.
alter function retail_private.command(uuid,text,jsonb) rename to command_master_versions;
revoke all on function retail_private.command_master_versions(uuid,text,jsonb) from public,anon,authenticated;
create function retail_private.command(op uuid,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare cached retail_private.operations; eid uuid; cid uuid; a public.retail_customer_addresses; d public.retail_documents;
  response jsonb; final_response jsonb; result jsonb; enabled boolean; expected_date date; actual timestamptz; before_state jsonb; begin
  if act is null or act not in ('save_customer_address','archive_customer_address','set_default_address','close_purchase_short','create_purchase','receive_purchase') then
    return retail_private.command_master_versions(op,act,p);
  end if;
  perform retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
  perform retail_private.ensure_business_ready();
  if op is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000 then raise exception 'La operación tiene un formato inválido.'; end if;
  if act in ('create_purchase','receive_purchase','close_purchase_short') then perform retail_private.require_role(array['owner','admin','inventory']);
  else perform retail_private.require_role(array['owner','admin','sales']); end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select * into cached from retail_private.operations where id=op;
  if found then
    if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then raise exception 'Este identificador de operación ya se usó con otros datos.'; end if;
    return cached.response;
  end if;
  if act in ('create_purchase','receive_purchase') then
    if act='create_purchase' and nullif(p->>'expected_at','') is not null then
      if jsonb_typeof(p->'expected_at')<>'string' or p->>'expected_at' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Selecciona una fecha prevista válida.'; end if;
      expected_date:=(p->>'expected_at')::date;
      if expected_date not between (now() at time zone 'America/Santo_Domingo')::date-366 and (now() at time zone 'America/Santo_Domingo')::date+730 then raise exception 'La fecha prevista está fuera del rango permitido.'; end if;
    end if;
    final_response:=retail_private.command_master_versions(op,act,p); eid:=(final_response->>'entity_id')::uuid;
    if act='create_purchase' and expected_date is not null then update public.retail_documents set expected_at=expected_date,updated_at=clock_timestamp() where id=eid; end if;
    select updated_at into actual from public.retail_documents where id=eid;
    final_response:=jsonb_set(final_response,'{result}',coalesce(final_response->'result','{}')||jsonb_build_object('updated_at',actual));
    update retail_private.operations set response=final_response where id=op;
    return final_response;
  end if;
  if act='save_customer_address' then eid:=retail_private.save_customer_address(p);
  elsif act in ('archive_customer_address','set_default_address') then
    eid:=(p->>'id')::uuid; select * into a from public.retail_customer_addresses where id=eid;
    if not found then raise exception 'La dirección ya no está disponible.'; end if;
    cid:=a.contact_id;
    if p ? 'contact_id' and (p->>'contact_id')::uuid is distinct from cid then raise exception 'La dirección debe conservar su cliente original.'; end if;
    perform 1 from public.retail_contacts where id=cid and kind='customer' and active for update;
    if not found then raise exception 'Selecciona un cliente activo.'; end if;
    select * into a from public.retail_customer_addresses where id=eid for update;
    perform retail_private.check_master_version(a.updated_at,p,'la dirección');
    if act='set_default_address' then
      if not a.active then raise exception 'Reactiva la dirección antes de marcarla preferida.'; end if;
      update public.retail_customer_addresses set is_default=false where contact_id=cid and active and is_default and id<>eid;
      update public.retail_customer_addresses set is_default=true where id=eid;
    else
      enabled:=(p->>'active')::boolean;
      if enabled is null then raise exception 'Indica si la dirección está activa.'; end if;
      if enabled and not a.active and (select count(*) from public.retail_customer_addresses where contact_id=cid and active)>=100 then
        raise exception 'Este cliente ya tiene 100 direcciones activas. Archiva una antes de reactivar otra.';
      end if;
      update public.retail_customer_addresses set active=enabled,is_default=case when enabled then is_default else false end where id=eid;
      if not exists(select 1 from public.retail_customer_addresses where contact_id=cid and active and is_default) then
        update public.retail_customer_addresses set is_default=true where id=(select id from public.retail_customer_addresses where contact_id=cid and active order by created_at,id limit 1);
      end if;
    end if;
  else
    eid:=(p->>'id')::uuid;
    select * into d from public.retail_documents where id=eid and type='purchase' for update;
    if not found or d.status not in ('pending','partial') then raise exception 'Solo puedes cerrar una compra pendiente o parcial.'; end if;
    perform retail_private.check_document_version(d.updated_at,p);
    if not exists(select 1 from public.retail_document_items where document_id=eid and received_quantity<quantity) then raise exception 'La compra no tiene cantidades pendientes.'; end if;
    before_state:=to_jsonb(d);
    update public.retail_documents set status='closed_short',closed_short=true,status_reason=retail_private.txt(p,'reason',1000,true),updated_at=clock_timestamp() where id=eid;
  end if;
  if act='close_purchase_short' then select jsonb_build_object('id',id,'updated_at',updated_at,'status',status,'closed_short',closed_short) into result from public.retail_documents where id=eid;
  else select jsonb_build_object('id',id,'updated_at',updated_at) into result from public.retail_customer_addresses where id=eid; end if;
  response:=jsonb_build_object('operation_id',op,'action',act,'entity_id',eid,'result',result);
  insert into retail_private.operations(id,actor_id,action,payload,response) values(op,auth.uid(),act,p,response);
  insert into public.retail_audit(action,entity_id,operation_id,actor_id,actor_email,details)
    values(act,eid,op,auth.uid(),(select email from public.retail_memberships where user_id=auth.uid()),jsonb_build_object('payload',p,'result',result,'before',before_state));
  update public.retail_revision set version=version+1,updated_at=clock_timestamp() where id=true;
  return response;
end; $$;

alter function retail_private.bootstrap() rename to bootstrap_without_fulfilment;
revoke all on function retail_private.bootstrap_without_fulfilment() from public,anon,authenticated;
create function retail_private.bootstrap() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']); result jsonb; begin
  result:=retail_private.bootstrap_without_fulfilment();
  return result||jsonb_build_object('features',jsonb_build_array('customer_addresses_v1','purchase_receipts_v1'),
    'customer_addresses',(select coalesce(jsonb_agg(to_jsonb(a) order by a.contact_id,a.is_default desc,a.label,a.id),'[]') from public.retail_customer_addresses a where r in ('owner','admin','sales')),
    'purchase_receipts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from public.retail_purchase_receipts x where r in ('owner','admin','inventory')));
end; $$;
create or replace function public.retail_bootstrap() returns jsonb language sql stable security invoker set search_path='' as $$select retail_private.bootstrap();$$;
create or replace function public.retail_command(p_operation uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select retail_private.command(p_operation,p_action,p_payload);$$;
revoke all on function retail_private.address_snapshot(jsonb) from public,anon,authenticated;
revoke all on function retail_private.save_customer_address(jsonb) from public,anon,authenticated;
revoke all on function retail_private.save_delivery(jsonb) from public,anon,authenticated;
revoke all on function retail_private.status_delivery(jsonb) from public,anon,authenticated;
revoke all on function retail_private.receive_purchase(jsonb,uuid) from public,anon,authenticated;
revoke all on function retail_private.command(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function retail_private.bootstrap() from public,anon,authenticated;
revoke all on function public.retail_bootstrap() from public,anon,authenticated;
revoke all on function public.retail_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
grant execute on function retail_private.bootstrap() to authenticated;
grant execute on function public.retail_command(uuid,text,jsonb) to authenticated;
grant execute on function public.retail_bootstrap() to authenticated;
