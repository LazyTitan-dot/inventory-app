import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations=fileURLToPath(new URL('../migrations/',import.meta.url));
const users={owner:'00000000-0000-4000-8000-000000000401',inventory:'00000000-0000-4000-8000-000000000402',viewer:'00000000-0000-4000-8000-000000000403'};

test('catalog tax-rate guard: atomic intent check, input bounds, legacy calls and exact retries',async()=>{
 const db=new PGlite();let checks=0;
 const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
 const scalar=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
 const as=async role=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[role]??'']);if(role)await db.exec('set role authenticated');};
 const command=(payload,op=randomUUID())=>scalar("select public.retail_command($1,'save_product',$2)",[op,payload]);
 const state=()=>scalar('select public.retail_bootstrap()');
 const reject=async(payload,pattern,op)=>{await assert.rejects(()=>command(payload,op),pattern);checks++;};
 const setTax=async rate=>{await as();await db.query('update public.retail_settings set tax_rate=$1 where id=true',[rate]);await as('owner');};
 const draft=sku=>({category:'tv',brand:'Marca',model:'Producto',warranty_months:12,variants:[{name:'Única',sku,cost:80,price:105.93,min_stock:1,reorder_target:3,opening_quantity:2}]});
 const edit=async id=>{const s=await state(),p=s.products.find(x=>x.id===id),variants=s.variants.filter(x=>x.product_id===id);return {...p,expected_updated_at:p.updated_at,variants,expected_variants:variants.map(v=>({id:v.id,expected_updated_at:v.updated_at}))};};
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
   alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  for(const name of(await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(`${migrations}/${name}`,'utf8'));
  for(const[role,id]of Object.entries(users)){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}@example.test`]);
   await db.query('insert into public.retail_memberships(user_id,email,role) values($1,$2,$3)',[id,`${role}@example.test`,role]);
  }
  await as('owner');
  const createPayload={...draft('TAX-GUARD'),expected_tax_rate:18},createOp=randomUUID();
  const created=await command(createPayload,createOp),pid=created.entity_id;
  let snapshot=await state();
  eq(snapshot.variants.find(v=>v.product_id===pid).price,105.93,'Guard does not convert or rewrite stored net price');
  eq(snapshot.variants.find(v=>v.product_id===pid).cost,80,'Guard preserves submitted cost');
  const staleEdit={...await edit(pid),expected_tax_rate:18,model:'Cambio que debe fallar'};
  staleEdit.variants=staleEdit.variants.map(v=>({...v,price:222,cost:111}));
  await setTax(0);
  const beforeReject=await state(),rejectedOp=randomUUID();
  await reject(staleEdit,/tasa de ITBIS cambió/,rejectedOp);
  snapshot=await state();
  eq(snapshot.products,beforeReject.products,'Stale tax intent changes no product metadata/version');
  eq(snapshot.variants,beforeReject.variants,'Stale tax intent changes no price/cost/version');
  eq(snapshot.stocks,beforeReject.stocks,'Stale tax intent changes no stock');
  eq(snapshot.audit,beforeReject.audit,'Stale tax intent creates no audit');
  await as();eq(Number(await scalar('select count(*) from retail_private.operations where id=$1',[rejectedOp])),0,'Rejected tax intent consumes no operation key');await as('owner');
  eq(await command(createPayload,createOp),created,'Exact completed retry remains stable after tax changed');
  const zeroEdit={...await edit(pid),expected_tax_rate:0,model:'Tasa cero'};
  await command(zeroEdit);
  eq((await state()).products.find(x=>x.id===pid).model,'Tasa cero','Zero tax is an accepted exact guard');
  const compatibility={...await edit(pid),model:'Cliente anterior sin campo'};
  await command(compatibility);
  eq((await state()).products.find(x=>x.id===pid).model,compatibility.model,'Existing calls without optional guard retain behavior');
  for(const value of ['0',null,-1,100.01,18.001,{},[]]){
   const baseline=await state();
   await reject({...await edit(pid),expected_tax_rate:value,model:'No guardar'},/numérico|rango permitido/);
   const after=await state();eq(after.products,baseline.products,'Invalid rate cannot mutate metadata');eq(after.variants,baseline.variants,'Invalid rate cannot mutate price/cost');
  }
  await setTax(100);await command({...await edit(pid),expected_tax_rate:100});checks++;
  const highTax=await state();eq(highTax.variants.find(v=>v.product_id===pid).price,105.93,'Full tax does not alter catalog base price');
  await setTax(16.25);await as('inventory');
  await command({...await edit(pid),expected_tax_rate:16.25});checks++;
  await as('viewer');await reject(createPayload,/permiso/,createOp);
  await as();await db.exec('set role anon');await assert.rejects(()=>command(draft('ANON')),/permission denied/);checks++;
  console.log(`catalog tax-rate guard assertions: ${checks}`);
 }finally{await db.close();}
});
