-- Create the contact and its first delivery address in one existing command transaction.
create or replace function retail_private.save_contact(p jsonb) returns uuid language plpgsql set search_path='' as $$
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
  if p ? 'initial_home_address' then
    if k <> 'customer' or p ? 'id' then raise exception 'La dirección inicial solo corresponde a un cliente nuevo.'; end if;
    if jsonb_typeof(p->'initial_home_address') is distinct from 'object' then raise exception 'Completa la dirección de entrega.'; end if;
    perform retail_private.save_customer_address(retail_private.address_snapshot(p->'initial_home_address') || jsonb_build_object('contact_id',cid,'label','Casa','is_default',true));
  end if;
  return cid;
end; $$;
