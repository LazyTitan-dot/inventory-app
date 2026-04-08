-- ============================================================
-- SmartLiving Home — Shared Inventory Migration
-- Converts per-user isolated schema → single shared dataset.
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================
-- Before: every entity table has PK (user_id, id) and RLS policies
--         that restrict reads/writes to auth.uid() = user_id.
-- After:  every entity table has PK (id) and RLS policies that grant
--         full CRUD to any authenticated user. `settings` becomes a
--         singleton row with id = 'global'.
-- ============================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. Delete user B's parallel seed rows so the new (id) PK has
--    no collisions. Keep user A's data as the canonical dataset.
-- ─────────────────────────────────────────────────────────────
delete from products        where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from sales           where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from customers       where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from suppliers       where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from purchase_orders where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from quotes          where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from returns         where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from deliveries      where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from promotions      where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';
delete from activity_log    where user_id = '89c1dfc2-cb51-4449-8d73-7af35abec920';

-- ─────────────────────────────────────────────────────────────
-- 2. Swap composite PK (user_id, id) → PK (id) for every entity
--    table. user_id becomes a nullable "last writer" audit column.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
  pk_name text;
begin
  foreach t in array array[
    'products','sales','customers','suppliers','purchase_orders',
    'quotes','returns','deliveries','promotions','activity_log'
  ] loop
    select conname into pk_name
      from pg_constraint
      where conrelid = ('public.'||t)::regclass
        and contype  = 'p';
    if pk_name is not null then
      execute format('alter table public.%I drop constraint %I', t, pk_name);
    end if;
    execute format('alter table public.%I add primary key (id)', t);
    execute format('alter table public.%I alter column user_id drop not null', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Rebuild settings as a singleton global table.
-- ─────────────────────────────────────────────────────────────
drop table if exists public.settings cascade;

create table public.settings (
  id            text primary key default 'global' check (id = 'global'),
  currency      text,
  exchange_rate numeric,
  ncf_seq       int,
  updated_at    timestamptz not null default now()
);

alter table public.settings enable row level security;

-- Reuse existing updated_at trigger function if present; otherwise create it.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function public.set_updated_at()
    returns trigger language plpgsql as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at
  before update on public.settings
  for each row execute procedure public.set_updated_at();

-- Make sure settings is in the realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Rewrite RLS policies: any authenticated user has full CRUD.
-- ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'products','sales','customers','suppliers','purchase_orders',
    'quotes','returns','deliveries','promotions','activity_log'
  ] loop
    execute format('drop policy if exists "own rows select" on public.%I', t);
    execute format('drop policy if exists "own rows insert" on public.%I', t);
    execute format('drop policy if exists "own rows update" on public.%I', t);
    execute format('drop policy if exists "own rows delete" on public.%I', t);

    execute format('create policy "authenticated read"   on public.%I for select to authenticated using (true)', t);
    execute format('create policy "authenticated insert" on public.%I for insert to authenticated with check (true)', t);
    execute format('create policy "authenticated update" on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('create policy "authenticated delete" on public.%I for delete to authenticated using (true)', t);
  end loop;
end $$;

create policy "authenticated settings read"   on public.settings for select to authenticated using (true);
create policy "authenticated settings insert" on public.settings for insert to authenticated with check (true);
create policy "authenticated settings update" on public.settings for update to authenticated using (true) with check (true);
create policy "authenticated settings delete" on public.settings for delete to authenticated using (true);

commit;

-- ─────────────────────────────────────────────────────────────
-- Post-migration verification queries (run manually if desired)
-- ─────────────────────────────────────────────────────────────
-- select tablename, policyname, cmd from pg_policies
--   where schemaname='public' order by tablename, policyname;
--
-- select conrelid::regclass, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where contype='p' and connamespace='public'::regnamespace
--   order by conrelid::regclass::text;
--
-- select 'products' t, count(*) from products
-- union all select 'sales',     count(*) from sales
-- union all select 'customers', count(*) from customers
-- union all select 'settings',  count(*) from settings;
