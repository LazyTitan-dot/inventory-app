-- Serial Number Sales Integration V2 — additive, transactional and optional.
-- Serial assignment must share the transaction used by retail_command to move stock.
-- Historical receipts and quantities remain untouched.
alter table public.retail_unit_serials
 add column lifecycle text not null default 'available'
 check(lifecycle in ('available','sold','quarantine'));
create index retail_unit_serial_available_v2_idx
 on public.retail_unit_serials(variant_id,serial_key)
 where active and lifecycle='available';

alter table public.retail_serial_events drop constraint retail_serial_events_operation_id_key;
alter table public.retail_serial_events drop constraint retail_serial_events_event_check;
alter table public.retail_serial_events add constraint retail_serial_events_event_check
 check(event in ('created','corrected','removed','sold','returned_available','returned_quarantine','sale_voided'));
create unique index retail_serial_event_per_unit_action_v2
 on public.retail_serial_events(operation_id,serial_id,event);

create table public.retail_serial_sale_links(
 id uuid primary key default gen_random_uuid(),
 sale_id uuid not null references public.retail_documents(id),
 sale_item_id uuid not null references public.retail_document_items(id),
 variant_id uuid not null references public.retail_variants(id),
 serial_id uuid not null references public.retail_unit_serials(id),
 sold_at timestamptz not null default now(),
 returned_at timestamptz,
 return_id uuid references public.retail_documents(id),
 return_item_id uuid references public.retail_document_items(id),
 returned_condition text check(returned_condition in ('available','quarantine','void')),
 operation_id uuid not null,
 check((returned_at is null and return_id is null and return_item_id is null and returned_condition is null) or
       (returned_at is not null and returned_condition is not null))
);
create unique index retail_serial_sale_one_open_link
 on public.retail_serial_sale_links(serial_id) where returned_at is null;
create index retail_serial_sale_by_document on public.retail_serial_sale_links(sale_id,sale_item_id,sold_at);
create index retail_serial_sale_by_serial on public.retail_serial_sale_links(serial_id,sold_at desc);
alter table public.retail_serial_sale_links enable row level security;
revoke all on public.retail_serial_sale_links from public,anon,authenticated;

create function retail_private.available_sale_serials(vid uuid,search_text text,offset_rows integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total integer; rows_json jsonb;
begin
 perform retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
 if not exists(select 1 from public.retail_variants where id=vid) then raise exception 'Variante no encontrada.'; end if;
 if length(coalesce(search_text,''))>100 or coalesce(offset_rows,0)<0 or coalesce(offset_rows,0)>1000000 then
  raise exception 'Filtro o página inválidos.'; end if;
 select count(*) into total from public.retail_unit_serials
  where variant_id=vid and active and lifecycle='available'
  and (coalesce(search_text,'')='' or serial ilike '%'||search_text||'%');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.serial,x.id),'[]'::jsonb) into rows_json from (
  select id,serial from public.retail_unit_serials
   where variant_id=vid and active and lifecycle='available'
   and (coalesce(search_text,'')='' or serial ilike '%'||search_text||'%')
   order by serial,id limit 200 offset coalesce(offset_rows,0)
 ) x;
 return jsonb_build_object('variant_id',vid,'total',total,'serials',rows_json);
end; $$;
revoke all on function retail_private.available_sale_serials(uuid,text,integer) from public,anon,authenticated;
grant execute on function retail_private.available_sale_serials(uuid,text,integer) to authenticated;
create function public.retail_available_sale_serials(p_variant_id uuid,p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select retail_private.available_sale_serials(p_variant_id,p_search,p_offset);
$$;
revoke all on function public.retail_available_sale_serials(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.retail_available_sale_serials(uuid,text,integer) to authenticated;

create function retail_private.sale_serial_snapshot(sale uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
 if not exists(select 1 from public.retail_documents where id=sale and type='sale')
  then raise exception 'Venta no encontrada.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',l.id,'sale_id',l.sale_id,'item_id',l.sale_item_id,'variant_id',l.variant_id,
  'serial_id',l.serial_id,'serial',s.serial,'sold_at',l.sold_at,
  'returned_at',l.returned_at,'return_id',l.return_id,'return_condition',l.returned_condition
 ) order by l.sold_at,l.id),'[]'::jsonb) into result
 from public.retail_serial_sale_links l
 join public.retail_unit_serials s on s.id=l.serial_id where l.sale_id=sale;
 return result;
end; $$;
revoke all on function retail_private.sale_serial_snapshot(uuid) from public,anon,authenticated;
grant execute on function retail_private.sale_serial_snapshot(uuid) to authenticated;
create function public.retail_sale_serials(p_sale_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select retail_private.sale_serial_snapshot(p_sale_id);
$$;
revoke all on function public.retail_sale_serials(uuid) from public,anon,authenticated;
grant execute on function public.retail_sale_serials(uuid) to authenticated;

-- Keep the complete prior dispatcher available for fallback and for unchanged actions.
CREATE OR REPLACE FUNCTION retail_private.command_before_serial_sales_v2(op uuid, act text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare cached retail_private.operations; d public.retail_deliveries; sid uuid; eid uuid; responsible text; response jsonb; result jsonb; actual timestamptz;
begin
  if act in ('add_unit_serial','correct_unit_serial','remove_unit_serial','manage_variant_barcode') then return retail_private.serial_barcode_command(op,act,p); end if;
  if act is distinct from 'assign_delivery' then return retail_private.command_before_delivery_assignment(op,act,p); end if;
  perform retail_private.require_role(array['owner','admin','sales','inventory']);
  perform retail_private.ensure_business_ready();
  if op is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000 then raise exception 'La operación tiene un formato inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select * into cached from retail_private.operations where id=op;
  if found then
    if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then raise exception 'Este identificador de operación ya se usó con otros datos.'; end if;
    return cached.response;
  end if;
  eid:=(p->>'id')::uuid;
  responsible:=retail_private.txt(p,'assignee',160,true);
  if lower(btrim(responsible))='sin asignar' then raise exception 'Escribe el nombre del responsable.'; end if;
  select sale_id into sid from public.retail_deliveries where id=eid;
  perform 1 from public.retail_documents where id=sid and type='sale' and status in ('completed','partially_returned') for update;
  if not found then raise exception 'La venta vinculada ya no admite cambios de entrega.'; end if;
  select * into d from public.retail_deliveries where id=eid for update;
  if not found or d.status not in ('scheduled','failed') then raise exception 'Solo puedes asignar responsable a una entrega programada o no entregada.'; end if;
  perform retail_private.check_master_version(d.updated_at,p,'la entrega');
  if d.assignee is distinct from responsible then
    update public.retail_deliveries set assignee=responsible,
      history=history||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor',auth.uid(),'status','assignment','note','Responsable: '||responsible))
      where id=eid;
  end if;
  select updated_at into actual from public.retail_deliveries where id=eid;
  result:=jsonb_build_object('id',eid,'updated_at',actual,'assignee',responsible);
  response:=jsonb_build_object('operation_id',op,'action',act,'entity_id',eid,'result',result);
  insert into retail_private.operations(id,actor_id,action,payload,response) values(op,auth.uid(),act,p,response);
  insert into public.retail_audit(action,entity_id,operation_id,actor_id,actor_email,details)
    values(act,eid,op,auth.uid(),(select email from public.retail_memberships where user_id=auth.uid()),jsonb_build_object('payload',p,'result',result,'before',jsonb_build_object('assignee',d.assignee)));
  update public.retail_revision set version=version+1,updated_at=clock_timestamp() where id=true;
  return response;
end; $function$;
revoke all on function retail_private.command_before_serial_sales_v2(uuid,text,jsonb) from public,anon,authenticated;

-- Complete all serial transitions atomically with original stock/document operations.
create or replace function retail_private.command(op uuid,act text,p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare cached retail_private.operations; response jsonb;
  sale uuid; returned_document uuid; original_item public.retail_document_items;
  sale_item public.retail_document_items; unit public.retail_unit_serials;
  link public.retail_serial_sale_links;
  assignment jsonb; item jsonb; serial_value jsonb; sid uuid; vid uuid; item_id uuid;
  ids uuid[]:='{}'::uuid[]; vids uuid[]:='{}'::uuid[];
  quantity integer; selected_count integer; tracked_count integer; remaining integer;
  state text; sales_number text;
begin
 if act not in ('create_sale','convert_quote','return_sale','void_sale') then
  return retail_private.command_before_serial_sales_v2(op,act,p);
 end if;
 perform retail_private.require_role(
    case when act in ('create_sale','convert_quote') then array['owner','admin','sales']
      else array['owner','admin'] end);
 perform retail_private.ensure_business_ready();
 if op is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000 then
  raise exception 'La operación tiene un formato inválido.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(op::text,0));
 select * into cached from retail_private.operations where id=op;
 if found then
   if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then
    raise exception 'Este identificador de operación ya se usó con otros datos.'; end if;
   return cached.response;
 end if;
 if act in ('create_sale','convert_quote') then
   if p ? 'serial_assignments' and (jsonb_typeof(p->'serial_assignments')<>'array'
     or jsonb_array_length(p->'serial_assignments')>200) then
     raise exception 'Las identificaciones de venta tienen un formato inválido.';
   end if;
   -- The existing dispatcher creates the sale and moves stock exactly once.
   response:=retail_private.command_before_serial_sales_v2(op,act,p);
   sale:=coalesce(nullif(response#>>'{result,sale_id}','')::uuid,(response->>'entity_id')::uuid);
   select number into sales_number from public.retail_documents where id=sale and type='sale';
   if sales_number is null then raise exception 'La operación no produjo una venta válida.'; end if;
   for assignment in select value from jsonb_array_elements(coalesce(p->'serial_assignments','[]'::jsonb)) loop
     if jsonb_typeof(assignment)<>'object' or jsonb_typeof(assignment->'serial_ids')<>'array'
       or jsonb_array_length(assignment->'serial_ids')>200 then
       raise exception 'Selecciona números de serie válidos para la venta.'; end if;
     vid:=(assignment->>'variant_id')::uuid;
     if vid is null or vid=any(vids) then raise exception 'La variante está duplicada en la identificación.'; end if;
     vids:=array_append(vids,vid);
     select * into sale_item from public.retail_document_items where document_id=sale and variant_id=vid;
     if not found then raise exception 'La serie no corresponde a un producto de esta venta.'; end if;
     selected_count:=jsonb_array_length(assignment->'serial_ids');
     if selected_count>sale_item.quantity then raise exception 'Hay más series que unidades vendidas.'; end if;
     for serial_value in select value from jsonb_array_elements(assignment->'serial_ids') loop
       if jsonb_typeof(serial_value)<>'string' then raise exception 'Identificador de serie inválido.'; end if;
       sid:=(serial_value #>> '{}')::uuid;
       if sid is null or sid=any(ids) then raise exception 'Número de serie duplicado en la venta.'; end if;
       ids:=array_append(ids,sid);
       select * into unit from public.retail_unit_serials where id=sid for update;
       if not found or not unit.active or unit.lifecycle<>'available' or unit.variant_id<>vid then
         raise exception 'La serie seleccionada ya no está disponible para vender. Actualiza las identificaciones.'; end if;
       insert into public.retail_serial_sale_links(sale_id,sale_item_id,variant_id,serial_id,operation_id)
         values(sale,sale_item.id,vid,sid,op);
       update public.retail_unit_serials set lifecycle='sold',updated_at=clock_timestamp() where id=sid;
       insert into public.retail_serial_events(serial_id,event,current_serial,reason,actor_id,operation_id)
         values(sid,'sold',unit.serial,'Venta '||sales_number,auth.uid(),op);
     end loop;
   end loop;
 elsif act='return_sale' then
   sale:=(p->>'id')::uuid;
   -- The pre-existing return handler validates return quantities and posts stock.
   -- If a linked unit is selected, it must return to the original sale item.
   response:=retail_private.command_before_serial_sales_v2(op,act,p);
   returned_document:=(response->>'entity_id')::uuid;
   for item in select value from jsonb_array_elements(p->'items') loop
     item_id:=(item->>'item_id')::uuid;
     quantity:=(item->>'quantity')::integer;
     state:=item->>'condition';
     select * into original_item from public.retail_document_items where id=item_id and document_id=sale;
     if not found then raise exception 'La partida no corresponde a la venta.'; end if;
     if item ? 'serial_ids' and (jsonb_typeof(item->'serial_ids')<>'array' or jsonb_array_length(item->'serial_ids')>200)
       then raise exception 'Formato de series a devolver inválido.'; end if;
     selected_count:=jsonb_array_length(coalesce(item->'serial_ids','[]'::jsonb));
     if selected_count>quantity then raise exception 'No puedes devolver más series que unidades.'; end if;
     select count(*) into tracked_count from public.retail_serial_sale_links
      where sale_item_id=item_id and returned_at is null;
     -- Preserve the right to return goods sold without a serial, but require
     -- picking the tracked unit if the untracked remainder is insufficient.
     remaining:=original_item.quantity-original_item.returned_quantity+quantity;
     if quantity-selected_count>remaining-tracked_count then
       raise exception 'Selecciona las series identificadas de las unidades que estás devolviendo.'; end if;
     select * into sale_item from public.retail_document_items where document_id=returned_document and parent_item_id=item_id;
     if not found then raise exception 'La devolución no contiene la partida de origen.'; end if;
     for serial_value in select value from jsonb_array_elements(coalesce(item->'serial_ids','[]'::jsonb)) loop
       if jsonb_typeof(serial_value)<>'string' then raise exception 'Identificador de serie inválido.'; end if;
       sid:=(serial_value #>> '{}')::uuid;
       if sid is null or sid=any(ids) then raise exception 'Serie duplicada en la devolución.'; end if;
       ids:=array_append(ids,sid);
       select * into link from public.retail_serial_sale_links where serial_id=sid and returned_at is null for update;
       if not found or link.sale_id<>sale or link.sale_item_id<>item_id then
         raise exception 'La serie no pertenece a una unidad pendiente de esta venta.'; end if;
       select * into unit from public.retail_unit_serials where id=sid for update;
       if unit.lifecycle<>'sold' then raise exception 'La serie no se encuentra vendida.'; end if;
       update public.retail_serial_sale_links set returned_at=clock_timestamp(),return_id=returned_document,
         return_item_id=sale_item.id,returned_condition=state where id=link.id;
       update public.retail_unit_serials set lifecycle=state,updated_at=clock_timestamp() where id=sid;
       insert into public.retail_serial_events(serial_id,event,current_serial,reason,actor_id,operation_id)
         values(sid,case when state='available' then 'returned_available' else 'returned_quarantine' end,
          unit.serial,'Devolución '||(select number from public.retail_documents where id=returned_document),auth.uid(),op);
     end loop;
   end loop;
 else
   sale:=(p->>'id')::uuid;
   response:=retail_private.command_before_serial_sales_v2(op,act,p);
   for link in select * from public.retail_serial_sale_links
     where sale_id=sale and returned_at is null order by serial_id for update loop
     select * into unit from public.retail_unit_serials where id=link.serial_id for update;
     if unit.lifecycle<>'sold' then raise exception 'La serie no se encuentra vendida.'; end if;
     update public.retail_serial_sale_links set returned_at=clock_timestamp(),
       returned_condition='void' where id=link.id;
     update public.retail_unit_serials set lifecycle='available',updated_at=clock_timestamp() where id=link.serial_id;
     insert into public.retail_serial_events(serial_id,event,current_serial,reason,actor_id,operation_id)
       values(link.serial_id,'sale_voided',unit.serial,'Anulación de venta '||
        (select number from public.retail_documents where id=sale),auth.uid(),op);
   end loop;
 end if;
 return response;
end; $$;
revoke all on function retail_private.command(uuid,text,jsonb) from public,anon,authenticated;

-- V1 must count physical units still available, never previously sold serials.
CREATE OR REPLACE FUNCTION retail_private.serial_barcode_command(op uuid, act text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare cached retail_private.operations; vid uuid; sid uuid; s public.retail_unit_serials;
 result jsonb; response jsonb; cap integer; identified integer; code text; previous_code text;
 current_code text; code_kind text; mode text; main_code text; aliases text[];
 before_codes jsonb; changed boolean:=false; source_kind text; why text; previous_serial text;
begin
 perform retail_private.require_role(array['owner','admin','inventory']);
 perform retail_private.ensure_business_ready();
 if op is null or act not in ('add_unit_serial','correct_unit_serial','remove_unit_serial','manage_variant_barcode')
   or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 then
  raise exception 'La operación tiene un formato inválido.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(op::text,0));
 select * into cached from retail_private.operations where id=op;
 if found then
   if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then
     raise exception 'Este identificador de operación ya se usó con otros datos.';
   end if;
   return cached.response;
 end if;
 vid:=(p->>'variant_id')::uuid;
 perform 1 from public.retail_variants where id=vid for update;
 if not found then raise exception 'Variante no encontrada.'; end if;
 if act='manage_variant_barcode' then
   mode:=coalesce(p->>'mode','');
   code_kind:=coalesce(p->>'kind','unclassified');
   if code_kind not in ('internal','manufacturer','unclassified') then raise exception 'Tipo de código inválido.'; end if;
   select barcode,barcode_aliases into main_code,aliases from public.retail_variants where id=vid;
   before_codes:=jsonb_build_object('primary',main_code,'additional',aliases);
   code:=btrim(coalesce(p->>'code',''));
   previous_code:=btrim(coalesce(p->>'previous_code',''));
   if mode not in ('add','remove','replace','set_primary','set_kind') then raise exception 'Acción de código inválida.'; end if;
   if mode in ('add','replace','set_primary','set_kind') and
      (length(code) not between 1 and 80 or code~'[[:cntrl:]]') then
       raise exception 'El código debe tener entre 1 y 80 caracteres válidos.'; end if;
   if mode='remove' then
     if length(code)=0 then raise exception 'Selecciona el código que deseas desvincular.'; end if;
     if main_code is not null and retail_private.barcode_key(main_code)=retail_private.barcode_key(code) then
       main_code:=aliases[1]; aliases:=coalesce(aliases[2:cardinality(aliases)],'{}'::text[]);
     elsif exists(select 1 from unnest(aliases) x where retail_private.barcode_key(x)=retail_private.barcode_key(code)) then
       aliases:=array(select x from unnest(aliases) x where retail_private.barcode_key(x)<>retail_private.barcode_key(code));
     else raise exception 'El código ya no pertenece a esta variante.'; end if;
     changed:=true;
   elsif mode='replace' then
     if previous_code='' then raise exception 'Selecciona el código anterior.'; end if;
     if main_code is not null and retail_private.barcode_key(main_code)=retail_private.barcode_key(previous_code) then
       main_code:=code;
     elsif exists(select 1 from unnest(aliases) x where retail_private.barcode_key(x)=retail_private.barcode_key(previous_code)) then
       aliases:=array(select case when retail_private.barcode_key(x)=retail_private.barcode_key(previous_code) then code else x end from unnest(aliases) x);
     else raise exception 'El código anterior ya no está registrado.'; end if;
     changed:=true;
   elsif mode='add' then
     if (main_code is not null and retail_private.barcode_key(main_code)=retail_private.barcode_key(code))
       or exists(select 1 from unnest(aliases) x where retail_private.barcode_key(x)=retail_private.barcode_key(code)) then
       raise exception 'Este código ya está asociado a la variante.'; end if;
     if main_code is null or coalesce((p->>'make_primary')::boolean,false) then
       if main_code is not null then aliases:=array_append(aliases,main_code); end if;
       main_code:=code;
     else aliases:=array_append(aliases,code); end if;
     changed:=true;
   elsif mode='set_primary' then
     if main_code is not null and retail_private.barcode_key(main_code)=retail_private.barcode_key(code) then null;
     elsif exists(select 1 from unnest(aliases) x where retail_private.barcode_key(x)=retail_private.barcode_key(code)) then
       aliases:=array(select x from unnest(aliases) x where retail_private.barcode_key(x)<>retail_private.barcode_key(code));
       if main_code is not null then aliases:=array_append(aliases,main_code); end if;
       main_code:=code; changed:=true;
     else raise exception 'El código no pertenece a esta variante.'; end if;
   else
     if not ((main_code is not null and retail_private.barcode_key(main_code)=retail_private.barcode_key(code))
       or exists(select 1 from unnest(aliases) x where retail_private.barcode_key(x)=retail_private.barcode_key(code))) then
       raise exception 'El código no pertenece a esta variante.'; end if;
   end if;
   if cardinality(aliases)>10 then raise exception 'Esta variante ya alcanzó el máximo de 10 códigos adicionales.'; end if;
   if changed then
     update public.retail_variants set barcode=main_code,barcode_aliases=aliases,updated_at=clock_timestamp() where id=vid;
   end if;
   if mode<>'remove' then
     update retail_private.variant_barcode_metadata set kind=code_kind
     where code_key=retail_private.barcode_key(code) and variant_id=vid;
     if not found then raise exception 'No fue posible identificar el código actualizado.'; end if;
   end if;
   result:=jsonb_build_object('variant_id',vid,'primary',main_code,'additional',aliases,'mode',mode);
 else
   sid:=nullif(p->>'serial_id','')::uuid;
   if act='add_unit_serial' then
     code:=btrim(coalesce(p->>'serial',''));
     if length(code) not between 1 and 160 or code~'[[:cntrl:]]' then raise exception 'La serie debe tener entre 1 y 160 caracteres válidos.'; end if;
     source_kind:=coalesce(p->>'source','manual');
     if source_kind not in ('manual','barcode','qr','ocr','usb') then raise exception 'Fuente de lectura inválida.'; end if;
     perform 1 from public.retail_products p2 join public.retail_variants v on v.product_id=p2.id
       where v.id=vid and v.active and p2.active;
     if not found then raise exception 'Reactiva el producto para registrar unidades nuevas.'; end if;
     select available into cap from public.retail_stocks where variant_id=vid for update;
     select count(*) into identified from public.retail_unit_serials where variant_id=vid and active and lifecycle='available';
     if identified>=coalesce(cap,0) then raise exception 'No quedan unidades disponibles sin identificar. Revisa la conciliación.'; end if;
     insert into public.retail_unit_serials(variant_id,serial,source,created_by)
       values(vid,code,source_kind,auth.uid()) returning id into sid;
     insert into public.retail_serial_events(serial_id,event,current_serial,actor_id,operation_id)
       values(sid,'created',code,auth.uid(),op);
   else
     if sid is null then raise exception 'Selecciona la serie que deseas administrar.'; end if;
     select * into s from public.retail_unit_serials where id=sid and variant_id=vid for update;
     if not found or not s.active then raise exception 'La serie ya no está activa.'; end if;
     if s.lifecycle<>'available' then raise exception 'Una serie vendida o en cuarentena debe administrarse mediante la devolución o conciliación correspondiente.'; end if;
     perform retail_private.check_master_version(s.updated_at,p,'el número de serie');
     previous_serial:=s.serial;
     if act='correct_unit_serial' then
       code:=btrim(coalesce(p->>'serial',''));
       why:=btrim(coalesce(p->>'reason',''));
       if length(code) not between 1 and 160 or code~'[[:cntrl:]]' then raise exception 'La serie debe tener entre 1 y 160 caracteres válidos.'; end if;
       if code=s.serial then raise exception 'La serie no tiene cambios.'; end if;
       if length(why)<5 or length(why)>500 then raise exception 'Explica el motivo de la corrección (5 a 500 caracteres).'; end if;
       update public.retail_unit_serials set serial=code,updated_at=clock_timestamp() where id=sid;
       insert into public.retail_serial_events(serial_id,event,previous_serial,current_serial,reason,actor_id,operation_id)
         values(sid,'corrected',previous_serial,code,why,auth.uid(),op);
     else
       why:=btrim(coalesce(p->>'reason',''));
       if length(why)<5 or length(why)>500 then raise exception 'Explica el motivo de desvinculación (5 a 500 caracteres).'; end if;
       update public.retail_unit_serials set active=false,updated_at=clock_timestamp() where id=sid;
       insert into public.retail_serial_events(serial_id,event,previous_serial,reason,actor_id,operation_id)
         values(sid,'removed',previous_serial,why,auth.uid(),op);
     end if;
   end if;
   result:=jsonb_build_object('id',sid,'variant_id',vid,'action',act);
 end if;
 response:=jsonb_build_object('operation_id',op,'action',act,'entity_id',vid,'result',result);
 insert into retail_private.operations(id,actor_id,action,payload,response) values(op,auth.uid(),act,p,response);
 insert into public.retail_audit(action,entity_id,operation_id,actor_id,actor_email,details)
   values(act,vid,op,auth.uid(),(select email from public.retail_memberships where user_id=auth.uid()),
     jsonb_build_object('payload',p,'result',result,'prior_serial',previous_serial,'prior_barcodes',before_codes));
 update public.retail_revision set version=version+1,updated_at=clock_timestamp() where id=true;
 return response;
exception when unique_violation then
 raise exception 'El número de serie o código ya está registrado en otra unidad o variante.';
end; $function$;
CREATE OR REPLACE FUNCTION retail_private.identifier_snapshot(vid uuid, search_text text, offset_rows integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.retail_variants; available_units integer; identified integer; matching integer; items jsonb; codes jsonb; history jsonb;
begin
 perform retail_private.require_role(array['owner','admin','inventory','sales','viewer']);
 select * into v from public.retail_variants where id=vid;
 if not found then raise exception 'Variante no encontrada.'; end if;
 if length(coalesce(search_text,''))>100 or coalesce(offset_rows,0)<0 or coalesce(offset_rows,0)>1000000 then raise exception 'Filtro o página inválidos.'; end if;
 select available into available_units from public.retail_stocks where variant_id=vid;
 select count(*) into identified from public.retail_unit_serials where variant_id=vid and active and lifecycle='available';
 select count(*) into matching from public.retail_unit_serials where variant_id=vid and active and lifecycle='available'
  and (coalesce(search_text,'')='' or serial ilike '%'||search_text||'%');
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into items from (
  select id,variant_id,serial,source,created_at,updated_at
  from public.retail_unit_serials
  where variant_id=vid and active and lifecycle='available' and (coalesce(search_text,'')='' or serial ilike '%'||search_text||'%')
  order by created_at desc,id limit 50 offset coalesce(offset_rows,0)
 ) t;
 select coalesce(jsonb_agg(jsonb_build_object('code',raw.code,'kind',coalesce(m.kind,'unclassified'),'primary',raw.primary_flag)
   order by raw.ordinal),'[]'::jsonb) into codes from (
   select x.code,x.ordinal,x.ordinal=1 as primary_flag from
   unnest(array_remove(array_prepend(v.barcode,v.barcode_aliases),null)) with ordinality as x(code,ordinal)
 ) raw left join retail_private.variant_barcode_metadata m
   on m.code_key=retail_private.barcode_key(raw.code) and m.variant_id=vid;
 select coalesce(jsonb_agg(to_jsonb(h) order by h.changed_at desc,h.id desc),'[]'::jsonb) into history from (
  select id,previous_codes,current_codes,changed_at from public.retail_barcode_history
  where variant_id=vid order by changed_at desc,id desc limit 12
 ) h;
 return jsonb_build_object('variant_id',vid,'available',coalesce(available_units,0),
 'identified',identified,'pending',greatest(coalesce(available_units,0)-identified,0),
 'reconciliation',greatest(identified-coalesce(available_units,0),0),
 'total_matching',matching,'serials',items,'codes',codes,'barcode_history',history);
end; $function$;
CREATE OR REPLACE FUNCTION retail_private.bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']); result jsonb; begin
  result:=retail_private.bootstrap_without_fulfilment();
  return result||jsonb_build_object('features',jsonb_build_array('customer_addresses_v1','purchase_receipts_v1','barcode_aliases_v1','serial_barcode_management_v1','serial_sales_v2'),
    'customer_addresses',(select coalesce(jsonb_agg(to_jsonb(a) order by a.contact_id,a.is_default desc,a.label,a.id),'[]') from public.retail_customer_addresses a where r in ('owner','admin','sales')),
    'purchase_receipts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from public.retail_purchase_receipts x where r in ('owner','admin','inventory')),
    'delivery_items',(select coalesce(jsonb_agg(jsonb_build_object(
      'delivery_id',d.id,'item_id',i.id,'variant_id',i.variant_id,
      'category',coalesce(i.product_snapshot->>'category',''),
      'brand',coalesce(i.product_snapshot->>'brand',''),
      'model',coalesce(i.product_snapshot->>'model',''),
      'name',coalesce(i.product_snapshot->>'name',''),
      'sku',coalesce(i.product_snapshot->>'sku',''),
      'quantity',i.quantity,'returned_quantity',i.returned_quantity,
      'current_quantity',case when s.status in ('completed','partially_returned') then greatest(i.quantity-i.returned_quantity,0) else 0 end
    ) order by d.id,i.id),'[]')
    from public.retail_deliveries d join public.retail_documents s on s.id=d.sale_id and s.type='sale'
    join public.retail_document_items i on i.document_id=s.id
    where r in ('owner','admin','sales','inventory')));
end; $function$;
