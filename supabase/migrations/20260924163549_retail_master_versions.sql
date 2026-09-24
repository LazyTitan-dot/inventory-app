-- Optimistic versions are checked under the same row locks as the mutation.
-- Successful idempotent replays return before version checks, after live authorization.
create function retail_private.advance_master_version() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  return new;
end; $$;
do $$ declare table_name text; begin
  foreach table_name in array array['retail_products','retail_variants','retail_contacts','retail_settings','retail_promotions','retail_deliveries','retail_memberships'] loop
    execute format('create trigger retail_master_version before update on public.%I for each row execute function retail_private.advance_master_version()',table_name);
  end loop;
end; $$;

create function retail_private.check_master_version(actual timestamptz,p jsonb,label text) returns void
language plpgsql stable set search_path='' as $$
begin
  if actual is null then raise exception 'El registro de % ya no está disponible. Actualiza la información.',label; end if;
  if nullif(p->>'expected_updated_at','') is null then raise exception 'Falta la versión de %. Actualiza la información y vuelve a abrir el formulario.',label; end if;
  if (p->>'expected_updated_at')::timestamptz<>actual then
    raise exception 'Otra operación modificó %. Tus cambios no se guardaron. Actualiza la información y vuelve a revisarla.',label;
  end if;
end; $$;

alter function retail_private.command(uuid,text,jsonb) rename to command_document_lifecycle;
revoke all on function retail_private.command_document_lifecycle(uuid,text,jsonb) from public,anon,authenticated;

create function retail_private.command(op uuid,act text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare cached retail_private.operations; final_response jsonb; actual timestamptz; eid uuid; sid uuid;
  contact_kind text; role_name text; v record; expected jsonb; expected_rows jsonb; actual_count integer; target_email text;
begin
  if act is null or act not in ('save_product','archive_product','save_contact','archive_contact','save_delivery','status_delivery','save_promotion','save_settings','set_member_role') then
    return retail_private.command_document_lifecycle(op,act,p);
  end if;
  perform retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
  if op is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>2000000 then raise exception 'La operación tiene un formato inválido.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  -- Check the current action permission even for a cached response: demotion is immediate.
  if act in ('save_product','archive_product') then perform retail_private.require_role(array['owner','admin','inventory']);
  elsif act in ('save_delivery','status_delivery') then perform retail_private.require_role(array['owner','admin','sales','inventory']);
  elsif act in ('save_promotion','save_settings','set_member_role') then perform retail_private.require_role(array['owner','admin']);
  else
    if act='archive_contact' then select kind into contact_kind from public.retail_contacts where id=(p->>'id')::uuid;
    else contact_kind:=p->>'kind'; end if;
    if contact_kind='customer' then perform retail_private.require_role(array['owner','admin','sales']);
    elsif contact_kind='supplier' then perform retail_private.require_role(array['owner','admin','inventory']);
    else raise exception 'Selecciona un tipo de contacto válido.'; end if;
  end if;
  select * into cached from retail_private.operations where id=op;
  if found then
    if cached.actor_id<>auth.uid() or cached.action<>act or cached.payload<>p then raise exception 'Este identificador de operación ya se usó con otros datos.'; end if;
    return cached.response;
  end if;

  if act not in ('save_settings','set_member_role') then eid:=nullif(p->>'id','')::uuid; end if;
  case
  when act in ('save_product','archive_product') and (p ? 'id' or act='archive_product') then
    select updated_at into actual from public.retail_products where id=eid for update;
    perform retail_private.check_master_version(actual,p,'el producto');
    if act='save_product' then
      expected_rows:=p->'expected_variants';
      if jsonb_typeof(expected_rows) is distinct from 'array' then raise exception 'Faltan las versiones de las variantes. Actualiza el producto antes de editarlo.'; end if;
      if (select count(distinct (x->>'id')::uuid) from jsonb_array_elements(expected_rows) x)<>jsonb_array_length(expected_rows) then
        raise exception 'Las versiones de las variantes contienen referencias duplicadas o incompletas.';
      end if;
      actual_count:=0;
      for v in select id,updated_at from public.retail_variants where product_id=eid order by id for update loop
        actual_count:=actual_count+1;
        select x into expected from jsonb_array_elements(expected_rows) x where (x->>'id')::uuid=v.id;
        if expected is null then raise exception 'Las variantes del producto cambiaron. Actualiza la información antes de guardar.'; end if;
        perform retail_private.check_master_version(v.updated_at,expected,'una variante o su costo');
      end loop;
      if actual_count<>jsonb_array_length(expected_rows) then raise exception 'Las variantes del producto cambiaron. Actualiza la información antes de guardar.'; end if;
    end if;
  when act in ('save_contact','archive_contact') and (p ? 'id' or act='archive_contact') then
    select updated_at into actual from public.retail_contacts where id=eid for update;
    perform retail_private.check_master_version(actual,p,'el contacto');
  when act in ('save_delivery','status_delivery') and (p ? 'id' or act='status_delivery') then
    -- Keep the established document -> delivery lock order to avoid deadlocks.
    select sale_id into sid from public.retail_deliveries where id=eid;
    if act='save_delivery' and (p->>'sale_id')::uuid is distinct from sid then
      raise exception 'La entrega debe conservar su venta original.';
    end if;
    perform 1 from public.retail_documents where id=sid for update;
    select updated_at into actual from public.retail_deliveries where id=eid for update;
    perform retail_private.check_master_version(actual,p,'la entrega');
  when act='save_promotion' and p ? 'id' then
    select updated_at into actual from public.retail_promotions where id=eid for update;
    perform retail_private.check_master_version(actual,p,'la promoción');
  when act='save_settings' then
    select updated_at into actual from public.retail_settings where id=true for update;
    perform retail_private.check_master_version(actual,p,'la configuración');
  when act='set_member_role' then
    -- Match core's global membership lock, then refresh this actor's permissions.
    perform pg_advisory_xact_lock(hashtextextended('retail-memberships',0));
    role_name:=retail_private.require_role(array['owner','admin']);
    target_email:=lower(retail_private.txt(p,'email',254,true));
    -- Resolve the same immutable Auth identity as core, including a changed email.
    select id into eid from auth.users where lower(email)=target_email and email_confirmed_at is not null for share;
    select updated_at into actual from public.retail_memberships where user_id=eid for update;
    if found then perform retail_private.check_master_version(actual,p,'los permisos de esta cuenta');
    elsif p ? 'expected_updated_at' then raise exception 'La cuenta que estabas editando cambió. Actualiza el equipo antes de continuar.'; end if;
  else null;
  end case;

  final_response:=retail_private.command_document_lifecycle(op,act,p);
  eid:=nullif(final_response->>'entity_id','')::uuid;
  case
  when act in ('save_product','archive_product') then select updated_at into actual from public.retail_products where id=eid;
  when act in ('save_contact','archive_contact') then select updated_at into actual from public.retail_contacts where id=eid;
  when act in ('save_delivery','status_delivery') then select updated_at into actual from public.retail_deliveries where id=eid;
  when act='save_promotion' then select updated_at into actual from public.retail_promotions where id=eid;
  when act='save_settings' then select updated_at into actual from public.retail_settings where id=true;
  when act='set_member_role' then select updated_at into actual from public.retail_memberships where user_id=eid;
  end case;
  final_response:=jsonb_set(final_response,'{result}',coalesce(final_response->'result','{}')||jsonb_build_object('updated_at',actual));
  update retail_private.operations set response=final_response where id=op;
  return final_response;
end; $$;

create or replace function public.retail_command(p_operation uuid,p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
  select retail_private.command(p_operation,p_action,p_payload);
$$;
revoke all on function retail_private.advance_master_version() from public,anon,authenticated;
revoke all on function retail_private.check_master_version(timestamptz,jsonb,text) from public,anon,authenticated;
revoke all on function retail_private.command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function retail_private.command(uuid,text,jsonb) to authenticated;
revoke all on function public.retail_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.retail_command(uuid,text,jsonb) to authenticated;
