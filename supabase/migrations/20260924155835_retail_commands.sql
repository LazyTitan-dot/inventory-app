create function retail_private.save_product(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare pid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); vid uuid; v jsonb; ids uuid[]:='{}'; existing boolean; n integer; begin
  perform retail_private.require_role(array['owner','admin','inventory']);
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

create function retail_private.save_delivery(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare eid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); sid uuid:=(p->>'sale_id')::uuid; old public.retail_deliveries; scheduled timestamptz; begin
  perform retail_private.require_role(array['owner','admin','sales','inventory']);
  perform 1 from public.retail_documents where id=sid and type='sale' and status in ('completed','partially_returned') for update;
  if not found then raise exception 'Solo puedes programar una entrega para una venta vigente.'; end if;
  if p ? 'id' then select * into old from public.retail_deliveries where id=eid and sale_id=sid for update;
    if not found or old.status not in ('scheduled','failed') then raise exception 'Esta entrega no se puede editar ni reprogramar.'; end if;
  end if;
  scheduled:=(p->>'scheduled_at')::timestamptz;
  if scheduled is null or scheduled<now()-interval '1 day' or scheduled>now()+interval '366 days' then raise exception 'Selecciona una fecha de entrega válida.'; end if;
  insert into public.retail_deliveries(id,sale_id,address,phone,contact_name,scheduled_at,assignee,notes,history)
    values(eid,sid,retail_private.txt(p,'address',1000,true),retail_private.txt(p,'phone',60,true),retail_private.txt(p,'contact_name',200,true),scheduled,
      retail_private.txt(p,'assignee',160),retail_private.txt(p,'notes',4000),jsonb_build_array(jsonb_build_object('at',now(),'actor',auth.uid(),'status','scheduled','note','Entrega programada')))
  on conflict(id) do update set address=excluded.address,phone=excluded.phone,contact_name=excluded.contact_name,scheduled_at=excluded.scheduled_at,
    assignee=excluded.assignee,notes=excluded.notes,status='scheduled',updated_at=now(),history=public.retail_deliveries.history||jsonb_build_array(jsonb_build_object('at',now(),'actor',auth.uid(),'status','scheduled','note','Entrega reprogramada'));
  return eid;
end; $$;

create function retail_private.status_delivery(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_deliveries; st text:=p->>'status'; note text:=retail_private.txt(p,'note',1000); receiver text:=retail_private.txt(p,'received_by',200); sid uuid; begin
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
  update public.retail_deliveries set status=st,received_by=case when st='delivered' then receiver else received_by end,
    delivered_at=case when st='delivered' then now() else delivered_at end,
    history=history||jsonb_build_array(jsonb_build_object('at',now(),'actor',auth.uid(),'status',st,'note',note)),updated_at=now() where id=d.id;
  return d.id;
end; $$;

create function retail_private.save_promotion(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare pid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); ids uuid[]; start_at timestamptz; end_at timestamptz; begin
  perform retail_private.require_role(array['owner','admin']);
  if p ? 'id' and not exists(select 1 from public.retail_promotions where id=pid) then raise exception 'Promoción no encontrada.'; end if;
  if jsonb_typeof(coalesce(p->'product_ids','[]')) is distinct from 'array' then raise exception 'Selecciona productos válidos.'; end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p->'product_ids','[]'));
  if cardinality(ids)>200 or (select count(distinct id) from public.retail_products where id=any(ids))<>cardinality(ids) then raise exception 'La promoción contiene productos duplicados o inexistentes.'; end if;
  start_at:=(p->>'starts_at')::timestamptz; end_at:=(p->>'ends_at')::timestamptz;
  if start_at is null or end_at is null or end_at<=start_at then raise exception 'El final de la promoción debe ser posterior al inicio.'; end if;
  insert into public.retail_promotions(id,name,code,kind,value,starts_at,ends_at,category,product_ids,active)
  values(pid,retail_private.txt(p,'name',160,true),nullif(upper(retail_private.txt(p,'code',60)),''),p->>'kind',
    retail_private.num(p,'value',0.01,case when p->>'kind'='percent' then 100 else 999999999.99 end,null),start_at,end_at,
    nullif(retail_private.txt(p,'category',100),''),ids,coalesce((p->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,code=excluded.code,kind=excluded.kind,value=excluded.value,starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,category=excluded.category,product_ids=excluded.product_ids,active=excluded.active,updated_at=now();
  return pid;
end; $$;

create function retail_private.command(op uuid,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare role_name text; cached retail_private.operations; eid uuid; result jsonb:='{}'; response jsonb;
  d public.retail_documents; item public.retail_document_items; contact public.retail_contacts; mem public.retail_memberships;
  target_id uuid; target_email text; target_role text; enabled boolean; reason text; x jsonb; begin
  role_name:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
  if op is null or act is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000 then raise exception 'La operación tiene un formato inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select * into cached from retail_private.operations where id=op;
  if found then
    if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then raise exception 'Este identificador de operación ya se usó con otros datos.'; end if;
    return cached.response;
  end if;
  case act
  when 'save_product' then eid:=retail_private.save_product(p,op);
  when 'archive_product' then
    perform retail_private.require_role(array['owner','admin','inventory']); eid:=(p->>'id')::uuid; enabled:=(p->>'active')::boolean;
    if enabled is null then raise exception 'Indica el estado del producto.'; end if;
    perform 1 from public.retail_products where id=eid for update; if not found then raise exception 'Producto no encontrado.'; end if;
    perform id from public.retail_variants where product_id=eid order by id for update;
    if not enabled and (exists(select 1 from public.retail_stocks s join public.retail_variants v on v.id=s.variant_id where v.product_id=eid and (s.available>0 or s.quarantine>0)) or
      exists(select 1 from public.retail_document_items i join public.retail_documents doc on doc.id=i.document_id join public.retail_variants v on v.id=i.variant_id where v.product_id=eid and doc.type='purchase' and doc.status in ('pending','partial') and i.received_quantity<i.quantity)) then raise exception 'No se puede archivar un producto con existencias o compras pendientes.'; end if;
    update public.retail_products set active=enabled,updated_at=now() where id=eid;
  when 'save_contact' then eid:=retail_private.save_contact(p);
  when 'archive_contact' then
    eid:=(p->>'id')::uuid; enabled:=(p->>'active')::boolean;
    select * into contact from public.retail_contacts where id=eid for update;
    if not found or enabled is null then raise exception 'Contacto o estado inválido.'; end if;
    perform retail_private.require_role(case when contact.kind='customer' then array['owner','admin','sales'] else array['owner','admin','inventory'] end);
    update public.retail_contacts set active=enabled,updated_at=now() where id=eid;
  when 'adjust_stock' then
    perform retail_private.require_role(array['owner','admin','inventory']); eid:=(p->>'variant_id')::uuid;
    perform 1 from public.retail_variants where id=eid for update; if not found then raise exception 'Variante no encontrada.'; end if;
    if not exists(select 1 from public.retail_variants v join public.retail_products pr on pr.id=v.product_id where v.id=eid and v.active and pr.active) then raise exception 'Reactiva el producto y su variante antes de ajustar sus existencias.'; end if;
    perform 1 from public.retail_stocks where variant_id=eid for update;
    if (select case when coalesce(p->>'bucket','available')='available' then available else quarantine end from public.retail_stocks where variant_id=eid)<>
      retail_private.num(p,'expected_quantity',0,999999,null,true) then raise exception 'Las existencias cambiaron desde que abriste el formulario. Actualiza el conteo antes de continuar.'; end if;
    perform retail_private.move(eid,retail_private.num(p,'quantity',-999999,999999,null,true)::integer,coalesce(p->>'bucket','available'),'adjustment',retail_private.txt(p,'reason',1000,true),null,op);
  when 'create_sale' then eid:=retail_private.create_document(p,'sale',op);
  when 'create_purchase' then eid:=retail_private.create_document(p,'purchase',op);
  when 'create_quote' then eid:=retail_private.create_document(p,'quote',op);
  when 'receive_purchase' then eid:=retail_private.receive_purchase(p,op);
  when 'cancel_purchase' then
    perform retail_private.require_role(array['owner','admin','inventory']); reason:=retail_private.txt(p,'reason',1000,true); eid:=(p->>'id')::uuid;
    select * into d from public.retail_documents where id=eid and type='purchase' for update;
    if not found or d.status not in ('pending','partial') then raise exception 'Esta compra ya fue recibida o cancelada.'; end if;
    update public.retail_documents set status='cancelled',notes=left(notes||E'\nCancelación: '||reason,4000),updated_at=now() where id=eid;
  when 'convert_quote' then eid:=retail_private.convert_quote(p,op);
  when 'return_sale' then eid:=retail_private.return_sale(p,op);
  when 'void_sale' then
    perform retail_private.require_role(array['owner','admin']); reason:=retail_private.txt(p,'reason',1000,true); eid:=(p->>'id')::uuid;
    select * into d from public.retail_documents where id=eid and type='sale' for update;
    if not found or d.status<>'completed' then raise exception 'Solo puedes anular una venta sin devoluciones previas.'; end if;
    if exists(select 1 from public.retail_deliveries where sale_id=eid and status<>'cancelled') then raise exception 'Resuelve o cancela la entrega antes de anular la venta.'; end if;
    perform v.id from public.retail_variants v where v.id in(select variant_id from public.retail_document_items where document_id=eid) order by v.id for update;
    perform s.variant_id from public.retail_stocks s where s.variant_id in(select variant_id from public.retail_document_items where document_id=eid) order by s.variant_id for update;
    for item in select * from public.retail_document_items where document_id=eid loop
      if item.variant_id is null then raise exception 'Un artículo histórico necesita vincularse antes de anular esta venta.'; end if;
      perform retail_private.revalue_available(item.variant_id,item.quantity,item.unit_cost);
      perform retail_private.move(item.variant_id,item.quantity,'available','void',reason,eid,op);
    end loop;
    update public.retail_documents set status='voided',notes=left(notes||E'\nAnulación: '||reason,4000),updated_at=now() where id=eid;
  when 'save_delivery' then eid:=retail_private.save_delivery(p);
  when 'status_delivery' then eid:=retail_private.status_delivery(p);
  when 'save_promotion' then eid:=retail_private.save_promotion(p);
  when 'save_settings' then
    perform retail_private.require_role(array['owner','admin']);
    if (p ? 'currency' and p->>'currency'<>'DOP') or (p ? 'timezone' and p->>'timezone'<>'America/Santo_Domingo') then raise exception 'La moneda y la zona horaria del negocio son DOP y America/Santo_Domingo.'; end if;
    update public.retail_settings set business_name=retail_private.txt(p,'business_name',160,true),tax_id=retail_private.txt(p,'tax_id',40),
      phone=retail_private.txt(p,'phone',60),email=retail_private.txt(p,'email',254),address=retail_private.txt(p,'address',1000),
      tax_rate=retail_private.num(p,'tax_rate',0,100,null),max_sale_discount_percent=retail_private.num(p,'max_sale_discount_percent',0,100,null),
      receipt_footer=retail_private.txt(p,'receipt_footer',1000),updated_at=now() where id=true;
  when 'set_member_role' then
    perform pg_advisory_xact_lock(hashtextextended('retail-memberships',0));
    -- Refresh authorization after waiting: another owner may have revoked this actor meanwhile.
    role_name:=retail_private.require_role(array['owner','admin']);
    target_email:=lower(retail_private.txt(p,'email',254,true)); target_role:=p->>'role'; enabled:=(p->>'active')::boolean;
    if target_role is null or target_role not in ('owner','admin','sales','inventory','viewer') or enabled is null then raise exception 'Selecciona un rol y estado válidos.'; end if;
    select id into target_id from auth.users where lower(email)=target_email and email_confirmed_at is not null;
    if target_id is null then raise exception 'No existe una cuenta confirmada con ese correo. Registra y confirma la cuenta primero.'; end if;
    select * into mem from public.retail_memberships where user_id=target_id for update;
    if role_name<>'owner' and (target_role in ('owner','admin') or mem.role in ('owner','admin')) then raise exception using errcode='42501',message='Solo el propietario puede cambiar permisos de administración.'; end if;
    if mem.role='owner' and mem.active and (target_role<>'owner' or not enabled) and not exists(select 1 from public.retail_memberships where role='owner' and active and user_id<>target_id) then raise exception 'Debe quedar al menos un propietario activo.'; end if;
    insert into public.retail_memberships(user_id,email,display_name,role,active) values(target_id,target_email,retail_private.txt(p,'display_name',160),target_role,enabled)
    on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,active=excluded.active,updated_at=now(); eid:=target_id;
  else raise exception 'Esta operación no está disponible.';
  end case;
  if eid is not null then result:=jsonb_build_object('id',eid); end if;
  if act in ('create_sale','create_purchase','create_quote','receive_purchase','cancel_purchase','convert_quote','return_sale','void_sale') then
    select result||jsonb_build_object('number',number,'status',status,'total',total) into result from public.retail_documents where id=eid;
  end if;
  response:=jsonb_build_object('operation_id',op,'action',act,'entity_id',eid,'result',result);
  insert into retail_private.operations(id,actor_id,action,payload,response) values(op,auth.uid(),act,p,response);
  insert into public.retail_audit(action,entity_id,operation_id,actor_id,actor_email,details)
  values(act,eid,op,auth.uid(),(select email from public.retail_memberships where user_id=auth.uid()),jsonb_build_object('payload',p,'result',result));
  update public.retail_revision set version=version+1,updated_at=now() where id=true;
  return response;
end; $$;

create function public.retail_command(p_operation uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
  select retail_private.command(p_operation,p_action,p_payload);
$$;
revoke all on all functions in schema retail_private from public,anon,authenticated;
revoke all on function public.retail_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
grant execute on function public.retail_command(uuid,text,jsonb) to authenticated;

create function retail_private.save_contact(p jsonb) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare cid uuid:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid()); k text:=p->>'kind'; em text; begin
  if k='customer' then perform retail_private.require_role(array['owner','admin','sales']);
  elsif k='supplier' then perform retail_private.require_role(array['owner','admin','inventory']); else raise exception 'Tipo de contacto inválido.'; end if;
  if p ? 'id' and not exists(select 1 from public.retail_contacts where id=cid and kind=k) then raise exception 'Contacto no encontrado.'; end if;
  em:=lower(retail_private.txt(p,'email',254));
  if em<>'' and em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Escribe un correo electrónico válido.'; end if;
  insert into public.retail_contacts(id,kind,name,email,phone,tax_id,address,notes)
    values(cid,k,retail_private.txt(p,'name',200,true),em,retail_private.txt(p,'phone',60),retail_private.txt(p,'tax_id',40),retail_private.txt(p,'address',1000),retail_private.txt(p,'notes',4000))
  on conflict(id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,tax_id=excluded.tax_id,address=excluded.address,notes=excluded.notes,updated_at=now();
  return cid;
end; $$;

create function retail_private.create_document(p jsonb,typ text,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare did uuid:=gen_random_uuid(); contact public.retail_contacts; settings public.retail_settings; promo public.retail_promotions;
  v public.retail_variants; x jsonb; item record; ids uuid[]:='{}'; q integer; price numeric; sub numeric:=0; disc numeric:=0; tax numeric:=0;
  rate numeric; total numeric; eligible numeric:=0; line_sub numeric; line_disc numeric; line_tax numeric;
  line_eligible numeric; cumulative_eligible numeric:=0; cumulative_base numeric:=0; tender numeric; r text; pm text; deadline timestamptz; pid uuid; begin
  if typ='purchase' then r:=retail_private.require_role(array['owner','admin','inventory']);
  else r:=retail_private.require_role(array['owner','admin','sales']); end if;
  if typ not in ('purchase','sale','quote') then raise exception 'Tipo de documento inválido.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 200 then raise exception 'Agrega entre 1 y 200 artículos.'; end if;
  select * into settings from public.retail_settings where id=true;
  if nullif(p->>'contact_id','') is not null then
    select * into contact from public.retail_contacts where id=(p->>'contact_id')::uuid and active and kind=case when typ='purchase' then 'supplier' else 'customer' end;
    if not found then raise exception 'El contacto no existe o está archivado.'; end if;
  elsif typ='purchase' then raise exception 'Selecciona un proveedor.'; end if;
  for x in select value from jsonb_array_elements(p->'items') loop
    pid:=(x->>'variant_id')::uuid;
    if pid is null or pid=any(ids) then raise exception 'Cada variante debe aparecer una sola vez.'; end if;
    ids:=array_append(ids,pid); perform retail_private.num(x,'quantity',1,999999,null,true);
  end loop;
  perform id from public.retail_variants where id=any(ids) order by id for update;
  perform variant_id from public.retail_stocks where variant_id=any(ids) order by variant_id for update;
  if (select count(*) from public.retail_variants v join public.retail_products pr on pr.id=v.product_id where v.id=any(ids) and v.active and pr.active)<>cardinality(ids) then
    raise exception 'Uno de los artículos no existe o está archivado.';
  end if;
  if typ<>'purchase' and nullif(btrim(p->>'promotion_code'),'') is not null then
    select * into promo from public.retail_promotions where upper(code)=upper(btrim(p->>'promotion_code')) and active and starts_at<=now() and ends_at>now() for share;
    if not found then raise exception 'El cupón no existe, todavía no está vigente o ha vencido.'; end if;
  end if;
  for x in select value from jsonb_array_elements(p->'items') loop
    select * into strict v from public.retail_variants where id=(x->>'variant_id')::uuid;
    q:=retail_private.num(x,'quantity',1,999999,null,true);
    price:=case when typ='purchase' then retail_private.num(x,'unit_cost',0,999999999.99,null) else v.price end;
    if typ<>'purchase' and p ? 'items' and x ? 'expected_price' and retail_private.num(x,'expected_price',0,999999999.99,null)<>price then raise exception 'El precio de % cambió. Actualiza el carrito antes de confirmar.',v.sku; end if;
    if typ='sale' and (select available from public.retail_stocks where variant_id=v.id)<q then raise exception 'No hay suficientes unidades de %.',v.sku; end if;
    sub:=sub+price*q;
    if promo.id is null or ((promo.category is null or promo.category=(select category from public.retail_products where id=v.product_id)) and (cardinality(promo.product_ids)=0 or v.product_id=any(promo.product_ids))) then eligible:=eligible+price*q; end if;
  end loop;
  if sub>999999999999.99 then raise exception 'El importe del documento supera el máximo permitido.'; end if;
  if typ='purchase' then rate:=0;
  else
    rate:=retail_private.num(p,'tax_rate',0,100,settings.tax_rate);
    if r not in ('owner','admin') and rate<>settings.tax_rate then raise exception using errcode='42501',message='Solo administración puede cambiar la tasa de impuesto.'; end if;
    disc:=retail_private.num(p,'discount',0,sub,0);
    if promo.id is not null then
      if disc>0 then raise exception 'No se puede combinar un cupón con otro descuento.'; end if;
      if eligible<=0 then raise exception 'El cupón no aplica a los artículos seleccionados.'; end if;
      disc:=case when promo.kind='percent' then round(eligible*promo.value/100,2) else least(eligible,promo.value) end;
    elsif r not in ('owner','admin') and disc>round(sub*settings.max_sale_discount_percent/100,2) then
      raise exception using errcode='42501',message='El descuento supera el límite autorizado para caja.';
    end if;
  end if;
  tax:=round((sub-disc)*rate/100,2); total:=sub-disc+tax;
  if typ='sale' then
    pm:=p->>'payment_method'; if pm is null or pm not in ('cash','card','transfer','other') then raise exception 'Selecciona un medio de pago.'; end if;
    tender:=case when pm='cash' then retail_private.num(p,'tendered',total,999999999999.99,null) else total end;
  end if;
  if typ='quote' then deadline:=(p->>'expires_at')::timestamptz; if deadline is null or deadline<=now() or deadline>now()+interval '366 days' then raise exception 'La vigencia de la cotización debe estar entre hoy y un año.'; end if; end if;
  insert into public.retail_documents(id,number,type,status,contact_id,contact_snapshot,subtotal,discount,tax_rate,tax,total,payment_method,tendered,change_amount,notes,promotion_id,expires_at,created_by)
    values(did,retail_private.next_number(typ),typ,case typ when 'sale' then 'completed' when 'purchase' then 'pending' else 'open' end,
      contact.id,case when contact.id is null then jsonb_build_object('name','Cliente de mostrador') else to_jsonb(contact)-array['created_at','updated_at','notes'] end,
      sub,disc,rate,tax,total,pm,tender,coalesce(tender-total,0),retail_private.txt(p,'notes',4000),promo.id,deadline,auth.uid());
  for x in select value from jsonb_array_elements(p->'items') loop
    select * into strict v from public.retail_variants where id=(x->>'variant_id')::uuid;
    q:=retail_private.num(x,'quantity',1,999999,null,true)::integer; price:=case when typ='purchase' then (x->>'unit_cost')::numeric else v.price end;
    line_sub:=price*q;
    line_eligible:=case when promo.id is null or ((promo.category is null or promo.category=(select category from public.retail_products where id=v.product_id)) and (cardinality(promo.product_ids)=0 or v.product_id=any(promo.product_ids))) then line_sub else 0 end;
    -- Differences of rounded cumulative proportions conserve every cent without a negative last line.
    line_disc:=case when eligible=0 then 0 else round(disc*(cumulative_eligible+line_eligible)/eligible,2)-round(disc*cumulative_eligible/eligible,2) end;
    cumulative_eligible:=cumulative_eligible+line_eligible;
    line_tax:=case when sub=disc then 0 else round(tax*(cumulative_base+line_sub-line_disc)/(sub-disc),2)-round(tax*cumulative_base/(sub-disc),2) end;
    cumulative_base:=cumulative_base+line_sub-line_disc;
    insert into public.retail_document_items(document_id,variant_id,product_snapshot,quantity,unit_price,unit_cost,discount,tax,line_total)
      values(did,v.id,retail_private.snapshot(v.id),q,price,case when typ='purchase' then price else v.cost end,line_disc,line_tax,line_sub-line_disc+line_tax);
    if typ='sale' then perform retail_private.move(v.id,-q,'available','sale','Venta confirmada',did,op); end if;
  end loop;
  return did;
end; $$;

create function retail_private.receive_purchase(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_documents; i public.retail_document_items; x jsonb; ids uuid[]:='{}'; q integer; begin
  perform retail_private.require_role(array['owner','admin','inventory']);
  select * into d from public.retail_documents where id=(p->>'id')::uuid and type='purchase' for update;
  if not found or d.status not in ('pending','partial') then raise exception 'Esta compra ya fue recibida o cancelada.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 200 then raise exception 'Indica al menos un artículo recibido.'; end if;
  for x in select value from jsonb_array_elements(p->'items') loop
    if nullif(x->>'item_id','') is null or (x->>'item_id')::uuid=any(ids) then raise exception 'Hay artículos duplicados en la recepción.'; end if;
    ids:=array_append(ids,(x->>'item_id')::uuid);
    perform retail_private.num(x,'quantity',1,999999,null,true);
  end loop;
  if (select count(*) from public.retail_document_items where id=any(ids) and document_id=d.id)<>cardinality(ids) then raise exception 'Un artículo no pertenece a esta compra.'; end if;
  perform v.id from public.retail_variants v where v.id in(select variant_id from public.retail_document_items where id=any(ids)) order by v.id for update;
  perform s.variant_id from public.retail_stocks s where s.variant_id in(select variant_id from public.retail_document_items where id=any(ids)) order by s.variant_id for update;
  for x in select value from jsonb_array_elements(p->'items') loop
    select * into strict i from public.retail_document_items where id=(x->>'item_id')::uuid;
    q:=retail_private.num(x,'quantity',1,999999,null,true)::integer;
    if q>i.quantity-i.received_quantity then raise exception 'La cantidad recibida supera el saldo pendiente.'; end if;
    if i.variant_id is null then raise exception 'El artículo histórico requiere vincular una variante antes de recibirlo.'; end if;
    perform retail_private.revalue_available(i.variant_id,q,i.unit_cost);
    perform retail_private.move(i.variant_id,q,'available','purchase',coalesce(nullif(retail_private.txt(p,'notes',1000),''),'Recepción de compra'),d.id,op);
    update public.retail_document_items set received_quantity=received_quantity+q where id=i.id;
  end loop;
  update public.retail_documents set status=case when exists(select 1 from public.retail_document_items where document_id=d.id and received_quantity<quantity) then 'partial' else 'received' end,updated_at=now() where id=d.id;
  return d.id;
end; $$;

create function retail_private.convert_quote(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_documents; i public.retail_document_items; sid uuid:=gen_random_uuid(); pm text:=p->>'payment_method'; tender numeric; begin
  perform retail_private.require_role(array['owner','admin','sales']);
  select * into d from public.retail_documents where id=(p->>'id')::uuid and type='quote' for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if d.status='converted' then select id into sid from public.retail_documents where parent_id=d.id and type='sale'; return sid; end if;
  if d.status<>'open' or d.expires_at is null or d.expires_at<=now() then raise exception 'La cotización está vencida o no está abierta.'; end if;
  if pm is null or pm not in ('cash','card','transfer','other') then raise exception 'Selecciona un medio de pago.'; end if;
  tender:=case when pm='cash' then retail_private.num(p,'tendered',d.total,999999999999.99,null) else d.total end;
  perform v.id from public.retail_variants v where id in(select variant_id from public.retail_document_items where document_id=d.id) order by id for update;
  perform s.variant_id from public.retail_stocks s where variant_id in(select variant_id from public.retail_document_items where document_id=d.id) order by variant_id for update;
  for i in select * from public.retail_document_items where document_id=d.id loop
    if i.variant_id is null or not exists(select 1 from public.retail_variants v join public.retail_products pr on pr.id=v.product_id join public.retail_stocks s on s.variant_id=v.id where v.id=i.variant_id and v.active and pr.active and s.available>=i.quantity) then raise exception 'Un artículo está archivado o no tiene existencias suficientes.'; end if;
  end loop;
  insert into public.retail_documents(id,number,type,status,contact_id,contact_snapshot,subtotal,discount,tax_rate,tax,total,payment_method,tendered,change_amount,notes,parent_id,promotion_id,created_by)
  values(sid,retail_private.next_number('sale'),'sale','completed',d.contact_id,d.contact_snapshot,d.subtotal,d.discount,d.tax_rate,d.tax,d.total,pm,tender,tender-d.total,d.notes,d.id,d.promotion_id,auth.uid());
  for i in select * from public.retail_document_items where document_id=d.id loop
    insert into public.retail_document_items(document_id,variant_id,product_snapshot,quantity,unit_price,unit_cost,discount,tax,line_total)
    values(sid,i.variant_id,i.product_snapshot,i.quantity,i.unit_price,(select cost from public.retail_variants where id=i.variant_id),i.discount,i.tax,i.line_total);
    perform retail_private.move(i.variant_id,-i.quantity,'available','sale','Venta desde cotización',sid,op);
  end loop;
  update public.retail_documents set status='converted',updated_at=now() where id=d.id;
  return sid;
end; $$;

create function retail_private.return_sale(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_documents; i public.retail_document_items; rid uuid:=gen_random_uuid(); x jsonb; ids uuid[]:='{}'; q integer; cond text; reason text;
  sub numeric:=0; disc numeric:=0; tax_sum numeric:=0; ls numeric; ld numeric; lt numeric; pm text:=p->>'payment_method'; begin
  perform retail_private.require_role(array['owner','admin']); reason:=retail_private.txt(p,'reason',1000,true);
  if pm is null or pm not in ('cash','card','transfer','other') then raise exception 'Selecciona el medio del reembolso.'; end if;
  select * into d from public.retail_documents where id=(p->>'id')::uuid and type='sale' for update;
  if not found or d.status not in ('completed','partially_returned') then raise exception 'Esta venta no admite más devoluciones.'; end if;
  if exists(select 1 from public.retail_deliveries where sale_id=d.id and status in ('scheduled','in_transit','failed')) then raise exception 'Resuelve o cancela la entrega pendiente antes de registrar una devolución.'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 200 then raise exception 'Indica al menos un artículo a devolver.'; end if;
  for x in select value from jsonb_array_elements(p->'items') loop
    if nullif(x->>'item_id','') is null or (x->>'item_id')::uuid=any(ids) then raise exception 'Hay artículos duplicados en la devolución.'; end if;
    ids:=array_append(ids,(x->>'item_id')::uuid); perform retail_private.num(x,'quantity',1,999999,null,true);
    if x->>'condition' is null or x->>'condition' not in ('available','quarantine') then raise exception 'Indica si el artículo está apto para venta o en cuarentena.'; end if;
  end loop;
  if (select count(*) from public.retail_document_items where id=any(ids) and document_id=d.id)<>cardinality(ids) then raise exception 'Un artículo no pertenece a esta venta.'; end if;
  perform v.id from public.retail_variants v where v.id in(select variant_id from public.retail_document_items where id=any(ids)) order by v.id for update;
  perform s.variant_id from public.retail_stocks s where s.variant_id in(select variant_id from public.retail_document_items where id=any(ids)) order by s.variant_id for update;
  insert into public.retail_documents(id,number,type,status,contact_id,contact_snapshot,parent_id,payment_method,notes,tax_rate,created_by)
    values(rid,retail_private.next_number('return'),'return','completed',d.contact_id,d.contact_snapshot,d.id,pm,reason,d.tax_rate,auth.uid());
  for x in select value from jsonb_array_elements(p->'items') loop
    select * into strict i from public.retail_document_items where id=(x->>'item_id')::uuid;
    q:=retail_private.num(x,'quantity',1,999999,null,true)::integer; cond:=x->>'condition';
    if q>i.quantity-i.returned_quantity then raise exception 'La cantidad supera lo que queda por devolver.'; end if;
    if i.variant_id is null then raise exception 'El artículo histórico requiere vincular una variante antes de devolverlo.'; end if;
    ls:=i.unit_price*q;
    -- Cumulative allocations make the last partial refund absorb the rounding remainder.
    ld:=round(i.discount*(i.returned_quantity+q)/i.quantity,2)-round(i.discount*i.returned_quantity/i.quantity,2);
    lt:=round(i.tax*(i.returned_quantity+q)/i.quantity,2)-round(i.tax*i.returned_quantity/i.quantity,2);
    insert into public.retail_document_items(document_id,variant_id,product_snapshot,quantity,unit_price,unit_cost,discount,tax,line_total,parent_item_id)
      values(rid,i.variant_id,i.product_snapshot,q,i.unit_price,i.unit_cost,ld,lt,ls-ld+lt,i.id);
    update public.retail_document_items set returned_quantity=returned_quantity+q where id=i.id;
    if cond='available' then perform retail_private.revalue_available(i.variant_id,q,i.unit_cost); end if;
    perform retail_private.move(i.variant_id,q,cond,'return',reason,rid,op);
    sub:=sub+ls; disc:=disc+ld; tax_sum:=tax_sum+lt;
  end loop;
  update public.retail_documents set subtotal=sub,discount=disc,tax=tax_sum,total=sub-disc+tax_sum,tendered=sub-disc+tax_sum where id=rid;
  update public.retail_documents set status=case when exists(select 1 from public.retail_document_items where document_id=d.id and returned_quantity<quantity) then 'partially_returned' else 'returned' end,updated_at=now() where id=d.id;
  return rid;
end; $$;

-- Every new function defaults to PUBLIC EXECUTE, so close it after all definitions.
revoke all on all functions in schema retail_private from public,anon,authenticated;
grant execute on function retail_private.role() to authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
