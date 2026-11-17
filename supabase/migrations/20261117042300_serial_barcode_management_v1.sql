-- Serial Number & Barcode Management V1 — additive and backwards compatible.
-- Existing stock, movements, documents, scanner paths and historical snapshots remain unchanged.
create table public.retail_unit_serials(
 id uuid primary key default gen_random_uuid(),
 variant_id uuid not null references public.retail_variants(id),
 serial text not null check(length(btrim(serial)) between 1 and 160 and serial !~ '[[:cntrl:]]'),
 serial_key text generated always as (retail_private.barcode_key(serial)) stored,
 active boolean not null default true,
 source text not null default 'manual' check(source in ('manual','barcode','qr','ocr','usb')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index retail_active_serial_unique on public.retail_unit_serials(serial_key) where active;
create index retail_unit_serial_variant_idx on public.retail_unit_serials(variant_id,active,created_at desc);
alter table public.retail_unit_serials enable row level security;
revoke all on public.retail_unit_serials from public,anon,authenticated;
comment on table public.retail_unit_serials is 'Optional individual physical identifiers. Never changes or duplicates stock balances.';

create table public.retail_serial_events(
 id bigint generated always as identity primary key,
 serial_id uuid not null references public.retail_unit_serials(id),
 event text not null check(event in ('created','corrected','removed')),
 previous_serial text,
 current_serial text,
 reason text not null default '',
 actor_id uuid not null references auth.users(id),
 operation_id uuid not null unique,
 created_at timestamptz not null default now()
);
create index retail_serial_events_serial_idx on public.retail_serial_events(serial_id,created_at desc);
alter table public.retail_serial_events enable row level security;
revoke all on public.retail_serial_events from public,anon,authenticated;

-- Metadata complements, but does not replace, the current barcode/alias scanner contract.
-- The private barcode_registry is deleted/recreated by its existing trigger, so
-- metadata is keyed independently and maintained AFTER that existing trigger.
create table retail_private.variant_barcode_metadata(
 code_key text primary key,
 variant_id uuid not null references public.retail_variants(id),
 kind text not null default 'unclassified' check(kind in ('internal','manufacturer','unclassified')),
 created_at timestamptz not null default now()
);
create index retail_variant_barcode_meta_variant_idx on retail_private.variant_barcode_metadata(variant_id);
alter table retail_private.variant_barcode_metadata enable row level security;
revoke all on retail_private.variant_barcode_metadata from public,anon,authenticated;

create table public.retail_barcode_history(
 id bigint generated always as identity primary key,
 variant_id uuid not null references public.retail_variants(id),
 previous_codes jsonb not null default '{}'::jsonb,
 current_codes jsonb not null default '{}'::jsonb,
 actor_id uuid,
 changed_at timestamptz not null default now()
);
create index retail_barcode_history_variant_idx on public.retail_barcode_history(variant_id,changed_at desc);
alter table public.retail_barcode_history enable row level security;
revoke all on public.retail_barcode_history from public,anon,authenticated;

create function retail_private.sync_variant_barcode_metadata() returns trigger language plpgsql security invoker set search_path='' as $$
declare codes text[]; current_code text; previous jsonb; next_codes jsonb;
begin
 if tg_op='UPDATE' and new.barcode is not distinct from old.barcode
      and new.barcode_aliases is not distinct from old.barcode_aliases then return new; end if;
 codes:=array_remove(array_prepend(new.barcode,new.barcode_aliases),null);
 delete from retail_private.variant_barcode_metadata m
   where m.variant_id=new.id and not exists(select 1 from unnest(codes) as u(x) where m.code_key=retail_private.barcode_key(u.x));
 foreach current_code in array codes loop
  insert into retail_private.variant_barcode_metadata(code_key,variant_id,kind)
   values(retail_private.barcode_key(current_code),new.id,
      case when new.barcode is not distinct from current_code then 'unclassified' else 'manufacturer' end)
   on conflict(code_key) do nothing;
 end loop;
 previous:=case when tg_op='INSERT' then '{}'::jsonb else jsonb_build_object('primary',old.barcode,'additional',old.barcode_aliases) end;
 next_codes:=jsonb_build_object('primary',new.barcode,'additional',new.barcode_aliases);
 insert into public.retail_barcode_history(variant_id,previous_codes,current_codes,actor_id)
 values(new.id,previous,next_codes,auth.uid());
 return new;
end; $$;
revoke all on function retail_private.sync_variant_barcode_metadata() from public,anon,authenticated;
create trigger zz_retail_variant_barcode_metadata after insert or update of barcode,barcode_aliases
 on public.retail_variants for each row execute function retail_private.sync_variant_barcode_metadata();
-- Backfill metadata without modifying any existing variant timestamp or barcode.
insert into retail_private.variant_barcode_metadata(code_key,variant_id,kind)
select retail_private.barcode_key(c.code),v.id,c.kind
from public.retail_variants v
cross join lateral (
 select v.barcode as code,'unclassified'::text as kind where v.barcode is not null
 union all select unnest(v.barcode_aliases),'manufacturer'
) c on conflict(code_key) do nothing;

create function retail_private.identifier_snapshot(vid uuid,search_text text,offset_rows integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.retail_variants; available_units integer; identified integer; matching integer; items jsonb; codes jsonb; history jsonb;
begin
 perform retail_private.require_role(array['owner','admin','inventory','sales','viewer']);
 select * into v from public.retail_variants where id=vid;
 if not found then raise exception 'Variante no encontrada.'; end if;
 if length(coalesce(search_text,''))>100 or coalesce(offset_rows,0)<0 or coalesce(offset_rows,0)>1000000 then raise exception 'Filtro o página inválidos.'; end if;
 select available into available_units from public.retail_stocks where variant_id=vid;
 select count(*) into identified from public.retail_unit_serials where variant_id=vid and active;
 select count(*) into matching from public.retail_unit_serials where variant_id=vid and active
  and (coalesce(search_text,'')='' or serial ilike '%'||search_text||'%');
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id),'[]'::jsonb) into items from (
  select id,variant_id,serial,source,created_at,updated_at
  from public.retail_unit_serials
  where variant_id=vid and active and (coalesce(search_text,'')='' or serial ilike '%'||search_text||'%')
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
end; $$;
revoke all on function retail_private.identifier_snapshot(uuid,text,integer) from public,anon,authenticated;
grant execute on function retail_private.identifier_snapshot(uuid,text,integer) to authenticated;
create function public.retail_identifiers(p_variant_id uuid,p_search text default '',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select retail_private.identifier_snapshot(p_variant_id,p_search,p_offset);
$$;
revoke all on function public.retail_identifiers(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.retail_identifiers(uuid,text,integer) to authenticated;

create function retail_private.serial_events_for(p_serial_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare res jsonb;
begin
 perform retail_private.require_role(array['owner','admin','inventory','sales','viewer']);
 if not exists(select 1 from public.retail_unit_serials where id=p_serial_id) then raise exception 'Serie no encontrada.'; end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]'::jsonb) into res from (
  select event,previous_serial,current_serial,reason,created_at from public.retail_serial_events where serial_id=p_serial_id order by created_at,id
 ) e;
 return res;
end; $$;
revoke all on function retail_private.serial_events_for(uuid) from public,anon,authenticated;
grant execute on function retail_private.serial_events_for(uuid) to authenticated;
create function public.retail_serial_history(p_serial_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select retail_private.serial_events_for(p_serial_id);
$$;
revoke all on function public.retail_serial_history(uuid) from public,anon,authenticated;
grant execute on function public.retail_serial_history(uuid) to authenticated;

create function retail_private.serial_barcode_command(op uuid,act text,p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
     select count(*) into identified from public.retail_unit_serials where variant_id=vid and active;
     if identified>=coalesce(cap,0) then raise exception 'No quedan unidades disponibles sin identificar. Revisa la conciliación.'; end if;
     insert into public.retail_unit_serials(variant_id,serial,source,created_by)
       values(vid,code,source_kind,auth.uid()) returning id into sid;
     insert into public.retail_serial_events(serial_id,event,current_serial,actor_id,operation_id)
       values(sid,'created',code,auth.uid(),op);
   else
     if sid is null then raise exception 'Selecciona la serie que deseas administrar.'; end if;
     select * into s from public.retail_unit_serials where id=sid and variant_id=vid for update;
     if not found or not s.active then raise exception 'La serie ya no está activa.'; end if;
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
end; $$;
revoke all on function retail_private.serial_barcode_command(uuid,text,jsonb) from public,anon,authenticated;

-- Preserve all preexisting command handlers and bootstrap data; only route new actions/feature flag.
CREATE OR REPLACE FUNCTION retail_private.command(op uuid, act text, p jsonb)
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
end; $function$

CREATE OR REPLACE FUNCTION retail_private.bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']); result jsonb; begin
  result:=retail_private.bootstrap_without_fulfilment();
  return result||jsonb_build_object('features',jsonb_build_array('customer_addresses_v1','purchase_receipts_v1','barcode_aliases_v1','serial_barcode_management_v1'),
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
end; $function$

