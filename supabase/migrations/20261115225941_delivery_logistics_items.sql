-- Add a logistics-only projection to the existing role-filtered bootstrap.
-- No table data changes; no grants on documents, items or financial columns.
create or replace function retail_private.bootstrap() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=retail_private.require_role(array['owner','admin','sales','inventory','viewer']); result jsonb; begin
  result:=retail_private.bootstrap_without_fulfilment();
  return result||jsonb_build_object('features',jsonb_build_array('customer_addresses_v1','purchase_receipts_v1','barcode_aliases_v1'),
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
end; $$;
revoke all on function retail_private.bootstrap() from public,anon;
grant execute on function retail_private.bootstrap() to authenticated;
