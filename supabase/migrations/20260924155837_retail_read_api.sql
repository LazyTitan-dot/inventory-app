create function retail_private.bootstrap() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']);
  financial boolean:=r in ('owner','admin'); costs boolean:=r in ('owner','admin','inventory');
  commerce boolean:=r in ('owner','admin','sales'); warehouse boolean:=r in ('owner','admin','inventory');
  result jsonb; allowed_ids uuid[]; begin
  select coalesce(array_agg(id),'{}') into allowed_ids from public.retail_documents where
    financial or (r='sales' and type in ('sale','quote','return')) or (r='inventory' and type='purchase');
  result:=jsonb_build_object(
    'profile',(select jsonb_build_object('id',user_id,'email',email,'display_name',display_name,'role',role) from public.retail_memberships where user_id=auth.uid()),
    'permissions',jsonb_build_object('manage_catalog',warehouse,'view_costs',costs,'sell',commerce,'purchase',warehouse,'refund',financial,
      'manage_business',financial,'manage_team',financial,'view_audit',financial),
    'settings',(select to_jsonb(s)||jsonb_build_object('id','global') from public.retail_settings s where id=true),
    'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.brand,p.model),'[]') from public.retail_products p),
    'variants',(select coalesce(jsonb_agg(case when costs then to_jsonb(v) else to_jsonb(v)-'cost' end order by v.sku),'[]') from public.retail_variants v),
    'stocks',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.retail_stocks s),
    'contacts',(select coalesce(jsonb_agg(to_jsonb(c) order by c.name),'[]') from public.retail_contacts c where financial or (r='sales' and c.kind='customer') or (r='inventory' and c.kind='supplier')),
    'documents',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id),'[]') from public.retail_documents d where id=any(allowed_ids)),
    'document_items',(select coalesce(jsonb_agg(case when costs then to_jsonb(i) else to_jsonb(i)-'unit_cost' end),'[]') from public.retail_document_items i where document_id=any(allowed_ids)),
    'movements',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id),'[]') from public.retail_movements m where r<>'viewer'),
    'deliveries',(select coalesce(jsonb_agg(to_jsonb(d) order by d.scheduled_at),'[]') from public.retail_deliveries d where r<>'viewer'),
    'promotions',(select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_at desc),'[]') from public.retail_promotions p where commerce),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc),'[]') from public.retail_audit a where financial),
    'team',(select coalesce(jsonb_agg(to_jsonb(m) order by m.email),'[]') from public.retail_memberships m where financial));
  return result;
end; $$;
create function public.retail_bootstrap() returns jsonb language sql stable security invoker set search_path='' as $$
  select retail_private.bootstrap();
$$;
revoke all on function retail_private.bootstrap() from public,anon,authenticated;
revoke all on function public.retail_bootstrap() from public,anon,authenticated;
grant execute on function retail_private.bootstrap() to authenticated;
grant execute on function public.retail_bootstrap() to authenticated;

comment on function public.retail_command(uuid,text,jsonb) is 'Authenticated transactional retail command with live membership authorization and idempotency.';
comment on function public.retail_bootstrap() is 'Authorized retail snapshot. Costs and purchasing data are omitted for sales and viewer roles.';
