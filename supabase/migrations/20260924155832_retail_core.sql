-- Additive retail schema. Legacy tables remain untouched.
create schema if not exists retail_private;
revoke all on schema retail_private from public, anon, authenticated;
grant usage on schema retail_private to authenticated;

create table public.retail_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('owner','admin','sales','inventory','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index retail_member_email_unique on public.retail_memberships(lower(email));
create table public.retail_settings (
  id boolean primary key default true check(id),
  business_name text not null default 'SmartLiving' check(length(business_name) between 1 and 160),
  tax_id text not null default '', phone text not null default '', email text not null default '', address text not null default '',
  currency text not null default 'DOP' check(currency='DOP'),
  timezone text not null default 'America/Santo_Domingo' check(timezone='America/Santo_Domingo'),
  tax_rate numeric(5,2) not null default 18 check(tax_rate between 0 and 100),
  max_sale_discount_percent numeric(5,2) not null default 0 check(max_sale_discount_percent between 0 and 100),
  receipt_footer text not null default 'Gracias por su compra. Conserve este recibo.',
  updated_at timestamptz not null default now()
);
insert into public.retail_settings(id) values(true);
create table public.retail_products (
  id uuid primary key default gen_random_uuid(), category text not null check(length(category) between 1 and 100),
  brand text not null check(length(brand) between 1 and 100), model text not null check(length(model) between 1 and 200),
  description text not null default '' check(length(description)<=4000),
  warranty_months integer not null default 12 check(warranty_months between 0 and 120),
  images jsonb not null default '[]'::jsonb check(jsonb_typeof(images)='array' and jsonb_array_length(images)<=8),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index retail_product_category_idx on public.retail_products(category) where active;
create table public.retail_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.retail_products(id),
  name text not null check(length(name) between 1 and 160), sku text not null check(length(sku) between 1 and 80),
  barcode text check(length(barcode) between 1 and 80),
  cost numeric(14,2) not null default 0 check(cost between 0 and 999999999.99),
  price numeric(14,2) not null default 0 check(price between 0 and 999999999.99),
  min_stock integer not null default 0 check(min_stock between 0 and 999999),
  reorder_target integer not null default 0 check(reorder_target between min_stock and 999999),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index retail_variant_product_idx on public.retail_variants(product_id);
comment on column public.retail_variants.cost is 'Costo promedio ponderado de unidades disponibles. La valoración es available * cost; cuarentena se controla en unidades y queda excluida. Recepciones, devoluciones aptas y anulaciones incorporan su costo histórico; ajustes usan el costo vigente.';
create unique index retail_variant_sku_unique on public.retail_variants(upper(btrim(sku)));
create unique index retail_variant_barcode_unique on public.retail_variants(barcode) where barcode is not null;
create table public.retail_stocks (
  variant_id uuid primary key references public.retail_variants(id),
  available integer not null default 0 check(available between 0 and 999999),
  quarantine integer not null default 0 check(quarantine between 0 and 999999), updated_at timestamptz not null default now()
);
create table public.retail_contacts (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('customer','supplier')),
  name text not null check(length(name) between 1 and 200), email text not null default '' check(length(email)<=254),
  phone text not null default '' check(length(phone)<=60), tax_id text not null default '' check(length(tax_id)<=40),
  address text not null default '' check(length(address)<=1000), notes text not null default '' check(length(notes)<=4000),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index retail_contact_kind_idx on public.retail_contacts(kind,active);
create unique index retail_contact_email_unique on public.retail_contacts(kind,lower(email)) where email<>'' and active;
create unique index retail_contact_tax_id_unique on public.retail_contacts(kind,tax_id) where tax_id<>'' and active;
create table public.retail_promotions (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160),
  code text check(length(code) between 1 and 60), kind text not null check(kind in ('percent','fixed')),
  value numeric(14,2) not null check(value>0 and value<=999999999.99 and (kind<>'percent' or value<=100)),
  starts_at timestamptz not null, ends_at timestamptz not null, category text,
  product_ids uuid[] not null default '{}', active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at)
);
create unique index retail_promo_code_unique on public.retail_promotions(upper(code)) where code is not null;
create table public.retail_documents (
  id uuid primary key default gen_random_uuid(), number text not null unique,
  type text not null check(type in ('sale','purchase','quote','return')),
  status text not null,
  contact_id uuid references public.retail_contacts(id), contact_snapshot jsonb not null default '{}'::jsonb,
  subtotal numeric(16,2) not null default 0 check(subtotal>=0), discount numeric(16,2) not null default 0 check(discount>=0 and discount<=subtotal),
  tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100), tax numeric(16,2) not null default 0 check(tax>=0),
  total numeric(16,2) not null default 0 check(total>=0 and total=subtotal-discount+tax),
  currency text not null default 'DOP' check(currency='DOP'), payment_method text check(payment_method in ('cash','card','transfer','other')),
  tendered numeric(16,2), change_amount numeric(16,2) not null default 0 check(change_amount>=0),
  notes text not null default '' check(length(notes)<=4000), parent_id uuid references public.retail_documents(id),
  promotion_id uuid references public.retail_promotions(id), expires_at timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((type='sale' and status in ('completed','partially_returned','returned','voided')) or
        (type='purchase' and status in ('pending','partial','received','cancelled')) or
        (type='quote' and status in ('open','converted','cancelled')) or (type='return' and status='completed'))
);
create index retail_document_type_date_idx on public.retail_documents(type,created_at desc);
create index retail_document_contact_idx on public.retail_documents(contact_id);
create index retail_document_parent_idx on public.retail_documents(parent_id);
create index retail_document_promotion_idx on public.retail_documents(promotion_id);
create unique index retail_single_quote_conversion on public.retail_documents(parent_id) where type='sale';
create table public.retail_document_items (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.retail_documents(id),
  variant_id uuid references public.retail_variants(id), product_snapshot jsonb not null,
  quantity integer not null check(quantity between 1 and 999999),
  received_quantity integer not null default 0 check(received_quantity between 0 and quantity),
  returned_quantity integer not null default 0 check(returned_quantity between 0 and quantity),
  unit_price numeric(14,2) not null check(unit_price>=0), unit_cost numeric(14,2) not null check(unit_cost>=0),
  discount numeric(16,2) not null default 0 check(discount between 0 and quantity*unit_price),
  tax numeric(16,2) not null default 0 check(tax>=0),
  line_total numeric(16,2) not null check(line_total=quantity*unit_price-discount+tax and line_total>=0),
  parent_item_id uuid references public.retail_document_items(id)
);
create index retail_item_document_idx on public.retail_document_items(document_id);
create index retail_item_variant_idx on public.retail_document_items(variant_id);
create index retail_item_parent_idx on public.retail_document_items(parent_item_id);
create table public.retail_movements (
  id uuid primary key default gen_random_uuid(), variant_id uuid not null references public.retail_variants(id),
  type text not null check(type in ('opening','adjustment','sale','purchase','return','void')),
  quantity integer not null check(quantity<>0), bucket text not null check(bucket in ('available','quarantine')),
  before_quantity integer not null check(before_quantity>=0), after_quantity integer not null check(after_quantity>=0),
  reason text not null check(length(reason) between 1 and 1000), document_id uuid references public.retail_documents(id),
  operation_id uuid not null, created_by uuid not null, created_at timestamptz not null default now(),
  check(after_quantity=before_quantity+quantity)
);
create index retail_movement_variant_date_idx on public.retail_movements(variant_id,created_at desc);
create index retail_movement_document_idx on public.retail_movements(document_id);
create index retail_movement_operation_idx on public.retail_movements(operation_id);
create table public.retail_deliveries (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.retail_documents(id),
  status text not null default 'scheduled' check(status in ('scheduled','in_transit','delivered','failed','cancelled')),
  address text not null check(length(address) between 1 and 1000), phone text not null check(length(phone) between 1 and 60),
  contact_name text not null check(length(contact_name) between 1 and 200), scheduled_at timestamptz not null,
  assignee text not null default '', notes text not null default '' check(length(notes)<=4000),
  received_by text, delivered_at timestamptz, history jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index retail_one_delivery on public.retail_deliveries(sale_id) where status<>'cancelled';
create index retail_delivery_schedule_idx on public.retail_deliveries(status,scheduled_at);
create table public.retail_audit (
  id bigint generated always as identity primary key, action text not null, entity_id uuid,
  operation_id uuid not null unique, actor_id uuid not null, actor_email text not null,
  details jsonb not null, created_at timestamptz not null default now()
);
create index retail_audit_date_idx on public.retail_audit(created_at desc);
create table retail_private.operations (
  id uuid primary key, actor_id uuid not null, action text not null, payload jsonb not null,
  response jsonb not null, created_at timestamptz not null default now()
);
alter table retail_private.operations enable row level security;
create table retail_private.counters (type text primary key, value bigint not null default 0 check(value>=0));
alter table retail_private.counters enable row level security;
insert into retail_private.counters(type) values('sale'),('purchase'),('quote'),('return');

create function retail_private.role() returns text language sql stable security definer set search_path='' as $$
  select m.role from public.retail_memberships m join auth.users u on u.id=m.user_id
  where m.user_id=(select auth.uid()) and m.active and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<now());
$$;
create function retail_private.require_role(p_roles text[]) returns text language plpgsql stable security definer set search_path='' as $$
declare v_role text:=retail_private.role(); begin
  if auth.uid() is null or v_role is null or not (v_role=any(p_roles)) then
    raise exception using errcode='42501',message='No tienes permiso para realizar esta acción.';
  end if; return v_role;
end; $$;
create function retail_private.txt(p jsonb,k text,max_len integer,required boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare v text:=btrim(coalesce(p->>k,'')); begin
  if (required and v='') or length(v)>max_len or (p ? k and jsonb_typeof(p->k) not in ('string','null')) then
    raise exception 'El campo % es obligatorio o tiene un formato inválido.',k;
  end if; return v;
end; $$;
create function retail_private.num(p jsonb,k text,lo numeric,hi numeric,dflt numeric default null,whole boolean default false) returns numeric language plpgsql immutable set search_path='' as $$
declare v numeric; begin
  if not (p ? k) or p->k='null'::jsonb then v:=dflt; else
    if jsonb_typeof(p->k)<>'number' then raise exception 'El campo % debe ser numérico.',k; end if;
    v:=(p->>k)::numeric;
  end if;
  if v is null or not(v between lo and hi) or v<>round(v,case when whole then 0 else 2 end) then
    raise exception 'El campo % está fuera del rango permitido.',k;
  end if; return v;
end; $$;
create function retail_private.next_number(p_type text) returns text language plpgsql set search_path='' as $$
#variable_conflict use_column
declare n bigint; begin
  update retail_private.counters set value=value+1 where type=p_type returning value into n;
  if n is null then raise exception 'Tipo de documento inválido.'; end if;
  return case p_type when 'sale' then 'VEN-' when 'purchase' then 'COM-' when 'quote' then 'COT-' else 'DEV-' end||lpad(n::text,greatest(7,length(n::text)),'0');
end; $$;
create function retail_private.snapshot(p_variant uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('category',p.category,'brand',p.brand,'model',p.model,'name',v.name,'sku',v.sku,'barcode',v.barcode,'warranty_months',p.warranty_months)
 from public.retail_variants v join public.retail_products p on p.id=v.product_id where v.id=p_variant;
$$;
create function retail_private.move(p_variant uuid,p_qty integer,p_bucket text,p_type text,p_reason text,p_document uuid,p_operation uuid) returns void language plpgsql set search_path='' as $$
#variable_conflict use_column
declare s public.retail_stocks; b integer; begin
  if p_qty=0 or p_bucket not in ('available','quarantine') or length(btrim(p_reason))=0 then raise exception 'Movimiento de inventario inválido.'; end if;
  select * into strict s from public.retail_stocks where variant_id=p_variant for update;
  b:=case p_bucket when 'available' then s.available else s.quarantine end;
  if b+p_qty<0 then raise exception 'Existencias insuficientes. Actualiza los datos e inténtalo de nuevo.'; end if;
  if b+p_qty>999999 then raise exception 'El saldo supera el máximo permitido.'; end if;
  update public.retail_stocks set available=case when p_bucket='available' then available+p_qty else available end,
    quarantine=case when p_bucket='quarantine' then quarantine+p_qty else quarantine end,updated_at=now() where variant_id=p_variant;
  insert into public.retail_movements(variant_id,type,quantity,bucket,before_quantity,after_quantity,reason,document_id,operation_id,created_by)
    values(p_variant,p_type,p_qty,p_bucket,b,b+p_qty,p_reason,p_document,p_operation,auth.uid());
end; $$;

-- Call before adding sellable stock; callers lock all variants and then all stocks in UUID order.
-- Quarantined units never dilute the cost of available stock or its reported valuation.
create function retail_private.revalue_available(p_variant uuid,p_qty integer,p_unit_cost numeric) returns void language plpgsql set search_path='' as $$
declare current_cost numeric; current_qty integer; begin
  if p_qty is null or p_qty<=0 or p_unit_cost is null or p_unit_cost<0 then raise exception 'El costo o la cantidad de entrada no es válido.'; end if;
  select cost into strict current_cost from public.retail_variants where id=p_variant for update;
  select available into strict current_qty from public.retail_stocks where variant_id=p_variant for update;
  update public.retail_variants set cost=round((current_cost*current_qty+p_unit_cost*p_qty)/(current_qty+p_qty),2),updated_at=now() where id=p_variant;
end; $$;

-- The optional legacy/media migration extends this validator without replacing save_product.
create function retail_private.validate_product_images(pid uuid,images jsonb) returns void language plpgsql set search_path='' as $$
declare img jsonb; begin
  if jsonb_typeof(images) is distinct from 'array' or jsonb_array_length(images)>8 then raise exception 'Puedes agregar hasta ocho imágenes.'; end if;
  for img in select value from jsonb_array_elements(images) loop
    if jsonb_typeof(img)<>'string' or img#>>'{}' !~ '^https://' or length(img#>>'{}')>2048 then raise exception 'Las imágenes deben usar una dirección HTTPS válida.'; end if;
  end loop;
end; $$;

do $$ declare t text; begin
  foreach t in array array['memberships','settings','products','variants','stocks','contacts','promotions','documents','document_items','movements','deliveries','audit'] loop
    execute format('alter table public.retail_%I enable row level security',t);
    execute format('revoke all on public.retail_%I from anon, authenticated',t);
    execute format('create policy retail_admin_read on public.retail_%I for select to authenticated using ((select retail_private.role()) in (''owner'',''admin''))',t);
  end loop;
end $$;
revoke all on all tables in schema retail_private from public,anon,authenticated;
revoke all on all functions in schema retail_private from public,anon,authenticated;
revoke all on sequence public.retail_audit_id_seq from public,anon,authenticated;

-- Only this non-sensitive invalidation counter is published to authenticated members.
create table public.retail_revision(id boolean primary key default true check(id),version bigint not null default 0,updated_at timestamptz not null default now());
insert into public.retail_revision(id) values(true);
alter table public.retail_revision enable row level security;
revoke all on public.retail_revision from public,anon,authenticated;
grant select on public.retail_revision to authenticated;
grant execute on function retail_private.role() to authenticated;
create policy retail_revision_member_read on public.retail_revision for select to authenticated using ((select retail_private.role()) is not null);
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.retail_revision;
  end if;
end $$;

-- Provision the initial owner after migration using an explicit administrative SQL operation
-- against the confirmed auth.users account authorized for this installation. No account is seeded here.

-- Commit-time accounting checks allow transaction assembly but reject partial/mismatched documents.
create function retail_private.check_document_totals() returns trigger language plpgsql set search_path='' as $$
declare did uuid; d public.retail_documents; s numeric; ds numeric; tx numeric; tt numeric; n bigint; begin
  if tg_table_name='retail_documents' then did:=new.id;
  elsif tg_op='DELETE' then did:=old.document_id;
  else did:=new.document_id; end if;
  select * into d from public.retail_documents where id=did;
  if not found then return null; end if;
  select count(*),coalesce(sum(quantity*unit_price),0),coalesce(sum(discount),0),coalesce(sum(tax),0),coalesce(sum(line_total),0)
    into n,s,ds,tx,tt from public.retail_document_items where document_id=did;
  if n=0 or s<>d.subtotal or ds<>d.discount or tx<>d.tax or tt<>d.total then
    raise exception using errcode='23514',message='Los renglones y los totales del documento no coinciden.';
  end if;
  return null;
end; $$;
create constraint trigger retail_document_totals after insert or update on public.retail_documents deferrable initially deferred
  for each row execute function retail_private.check_document_totals();
create constraint trigger retail_item_totals after insert or update or delete on public.retail_document_items deferrable initially deferred
  for each row execute function retail_private.check_document_totals();
revoke all on function retail_private.check_document_totals() from public,anon,authenticated;
