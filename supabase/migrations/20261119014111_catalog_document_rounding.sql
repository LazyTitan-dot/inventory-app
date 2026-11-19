-- Commercial prices follow the catalog's tax-inclusive, cent-rounded unit price.
-- Existing documents keep their original snapshots, tax and refund allocation.
create function retail_private.money_share(amount numeric, part numeric, whole numeric)
returns numeric language sql immutable strict set search_path = '' as $$
  select case when whole = 0 then 0
    else div(200 * amount * part + whole, 2 * whole) * 0.01 end
$$;

create function retail_private.price_document_lines(items jsonb, rate numeric, document_discount numeric)
returns table (variant_id uuid, discount numeric, tax numeric)
language sql immutable strict set search_path = '' as $$
  with lines as (
    select i.variant_id,
           i.unit_price * i.quantity as base,
           round(i.unit_price * (1 + rate / 100), 2) * i.quantity as gross,
           case when i.eligible then i.unit_price * i.quantity else 0 end as weight
    from jsonb_to_recordset(items) as i(variant_id uuid, unit_price numeric, quantity integer, eligible boolean)
  ), weights as (
    select l.*, sum(weight) over () as total_weight,
           sum(weight) over (order by l.variant_id rows unbounded preceding) as weight_through
    from lines l
  ), allocated as (
    select w.*, retail_private.money_share(document_discount, weight_through, total_weight)
              - retail_private.money_share(document_discount, weight_through - weight, total_weight) as line_discount
    from weights w
  )
  select a.variant_id, line_discount,
         retail_private.money_share(gross, base - line_discount, base) - (base - line_discount)
  from allocated a
$$;

-- If net and gross share a floor per unit, assign net's extra cents only to
-- units receiving an extra gross cent. Even a very small refund then has nonnegative tax.
create function retail_private.refund_net_through(net numeric, gross numeric, units integer, through_units integer)
returns numeric language plpgsql immutable strict set search_path = '' as $$
declare
  base_per_unit numeric := div(net * 100, units) * 0.01;
  gross_extras_through numeric;
begin
  if gross = net or base_per_unit <> div(gross * 100, units) * 0.01 then
    return retail_private.money_share(net, through_units, units);
  end if;
  gross_extras_through := retail_private.money_share(gross, through_units, units) - base_per_unit * through_units;
  return base_per_unit * through_units + retail_private.money_share(
    net - base_per_unit * units, gross_extras_through, gross - base_per_unit * units
  );
end;
$$;

revoke all on function retail_private.money_share(numeric,numeric,numeric),
  retail_private.price_document_lines(jsonb,numeric,numeric),
  retail_private.refund_net_through(numeric,numeric,integer,integer) from public, anon, authenticated;

create or replace function retail_private.create_document(p jsonb,typ text,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare did uuid:=gen_random_uuid(); contact public.retail_contacts; settings public.retail_settings; promo public.retail_promotions;
  v public.retail_variants; x jsonb; ids uuid[]:='{}'; q integer; price numeric; sub numeric:=0; disc numeric:=0; tax numeric:=0;
  rate numeric; total numeric; eligible numeric:=0; line_sub numeric; line_disc numeric; line_tax numeric;
  priced_items jsonb := '[]'; amounts jsonb; applies boolean; tender numeric; r text; pm text; deadline timestamptz; pid uuid; begin
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
    applies := promo.id is null or (
      (promo.category is null or promo.category = (select category from public.retail_products where id=v.product_id))
      and (cardinality(promo.product_ids)=0 or v.product_id=any(promo.product_ids))
    );
    if applies then eligible := eligible + price*q; end if;
    priced_items := priced_items || jsonb_build_object(
      'variant_id', v.id, 'unit_price', price, 'quantity', q, 'eligible', applies
    );
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
  select sum(l.tax), jsonb_object_agg(l.variant_id, jsonb_build_object('discount', l.discount, 'tax', l.tax))
    into tax, amounts from retail_private.price_document_lines(priced_items, rate, disc) l;
  total := sub - disc + tax;
  if typ <> 'purchase' then
    if p ? 'expected_total' then
      if retail_private.num(p,'expected_total',0,99999999999999.99,null) <> total then
        raise exception 'El total cambió. Actualiza y revisa el documento antes de confirmar.';
      end if;
    elsif p ? 'discount' and p ? 'tax_rate' and sub-disc+round((sub-disc)*rate/100,2) <> total then
      raise exception 'Actualiza la aplicación para revisar el total con el redondeo vigente.';
    end if;
  end if;
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
    line_disc := (amounts->(v.id::text)->>'discount')::numeric;
    line_tax := (amounts->(v.id::text)->>'tax')::numeric;
    insert into public.retail_document_items(document_id,variant_id,product_snapshot,quantity,unit_price,unit_cost,discount,tax,line_total)
      values(did,v.id,retail_private.snapshot(v.id) ||
        case when typ in ('sale','quote') then '{"catalog_unit_rounding":true}'::jsonb else '{}'::jsonb end,
        q,price,case when typ='purchase' then price else v.cost end,line_disc,line_tax,line_sub-line_disc+line_tax);
    if typ='sale' then perform retail_private.move(v.id,-q,'available','sale','Venta confirmada',did,op); end if;
  end loop;
  return did;
end; $$;

create or replace function retail_private.convert_quote(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_documents; i public.retail_document_items; sid uuid:=gen_random_uuid(); pm text:=p->>'payment_method'; tender numeric; begin
  perform retail_private.require_role(array['owner','admin','sales']);
  select * into d from public.retail_documents where id=(p->>'id')::uuid and type='quote' for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if d.status='converted' then select id into sid from public.retail_documents where parent_id=d.id and type='sale'; return sid; end if;
  if d.status<>'open' or d.expires_at is null or d.expires_at<=now() then raise exception 'La cotización está vencida o no está abierta.'; end if;
  if p ? 'expected_total' and retail_private.num(p,'expected_total',0,99999999999999.99,null) <> d.total then
    raise exception 'El total de la cotización cambió. Actualiza y revisa la venta antes de cobrar.';
  end if;
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

create or replace function retail_private.return_sale(p jsonb,op uuid) returns uuid language plpgsql set search_path='' as $$
#variable_conflict use_column
declare d public.retail_documents; i public.retail_document_items; rid uuid:=gen_random_uuid(); x jsonb; ids uuid[]:='{}'; q integer; cond text; reason text;
  sub numeric:=0; disc numeric:=0; tax_sum numeric:=0; ls numeric; ld numeric; lt numeric;
  line_net numeric; refund_net numeric; refund_gross numeric; old_preview numeric:=0; pm text:=p->>'payment_method'; begin
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
    -- Unmarked sales retain their original discount and tax schedules.
    ld:=round(i.discount*(i.returned_quantity+q)/i.quantity,2)-round(i.discount*i.returned_quantity/i.quantity,2);
    lt:=round(i.tax*(i.returned_quantity+q)/i.quantity,2)-round(i.tax*i.returned_quantity/i.quantity,2);
    old_preview := old_preview + ls - ld + lt;
    if i.product_snapshot @> '{"catalog_unit_rounding":true}'::jsonb then
      line_net := i.unit_price * i.quantity - i.discount;
      refund_gross := retail_private.money_share(i.line_total, i.returned_quantity+q, i.quantity)
                    - retail_private.money_share(i.line_total, i.returned_quantity, i.quantity);
      refund_net := retail_private.refund_net_through(line_net, i.line_total, i.quantity, i.returned_quantity+q)
                  - retail_private.refund_net_through(line_net, i.line_total, i.quantity, i.returned_quantity);
      ld := ls - refund_net;
      lt := refund_gross - refund_net;
    end if;
    insert into public.retail_document_items(document_id,variant_id,product_snapshot,quantity,unit_price,unit_cost,discount,tax,line_total,parent_item_id)
      values(rid,i.variant_id,i.product_snapshot,q,i.unit_price,i.unit_cost,ld,lt,ls-ld+lt,i.id);
    update public.retail_document_items set returned_quantity=returned_quantity+q where id=i.id;
    if cond='available' then perform retail_private.revalue_available(i.variant_id,q,i.unit_cost); end if;
    perform retail_private.move(i.variant_id,q,cond,'return',reason,rid,op);
    sub:=sub+ls; disc:=disc+ld; tax_sum:=tax_sum+lt;
  end loop;
  if p ? 'expected_total' then
    if retail_private.num(p,'expected_total',0,99999999999999.99,null) <> sub-disc+tax_sum then
      raise exception 'El reembolso cambió. Actualiza y revisa las cantidades antes de confirmar.';
    end if;
  elsif old_preview <> sub-disc+tax_sum then
    raise exception 'Actualiza la aplicación para revisar el importe del reembolso.';
  end if;
  update public.retail_documents set subtotal=sub,discount=disc,tax=tax_sum,total=sub-disc+tax_sum,tendered=sub-disc+tax_sum where id=rid;
  update public.retail_documents set status=case when exists(select 1 from public.retail_document_items where document_id=d.id and returned_quantity<quantity) then 'partially_returned' else 'returned' end,updated_at=now() where id=d.id;
  return rid;
end; $$;
