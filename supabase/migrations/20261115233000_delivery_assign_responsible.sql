-- Independent assignment: preserve the delivery status, schedule and historical destination.
alter function retail_private.command(uuid,text,jsonb) rename to command_before_delivery_assignment;
revoke all on function retail_private.command_before_delivery_assignment(uuid,text,jsonb) from public,anon,authenticated;
create function retail_private.command(op uuid,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare cached retail_private.operations; d public.retail_deliveries; sid uuid; eid uuid; responsible text; response jsonb; result jsonb; actual timestamptz;
begin
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
end; $$;
revoke all on function retail_private.command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
create or replace function public.retail_command(p_operation uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select retail_private.command(p_operation,p_action,p_payload);$$;
revoke all on function public.retail_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.retail_command(uuid,text,jsonb) to authenticated;
