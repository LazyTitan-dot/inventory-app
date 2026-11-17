import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
const owner='00000000-0000-4000-8000-000000000901',sales='00000000-0000-4000-8000-000000000902',viewer='00000000-0000-4000-8000-000000000903';
test('Serial Sales V2: atomic assignment, rollback, returns, quarantine, void and warranty history',async()=>{
 const db=new PGlite();let checks=0;
 const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++};
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const as=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);if(id)await db.exec('set role authenticated');};
 const command=(action,payload,operation=randomUUID())=>scalar('select public.retail_command($1,$2,$3)',[operation,action,payload]);
 const state=()=>scalar('select public.retail_bootstrap()');
 const currentStock=async(vid)=>(await state()).stocks.find(s=>s.variant_id===vid).available;
 const identifiers=(id)=>scalar('select public.retail_identifiers($1)',[id]);
 const links=(id)=>scalar('select public.retail_sale_serials($1)',[id]);
 try{
 await db.exec([
  'create role anon nologin;create role authenticated nologin;create schema auth;',
  'create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);',
  "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  'grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;',
  'create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);',
  'create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));',
  'alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;',
  'grant select,insert,update,delete on storage.objects to authenticated,anon;'
 ].join('\n'));
 for(const name of(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(dir+'/'+name,'utf8'));
 for(const [id,role] of [[owner,'owner'],[sales,'sales'],[viewer,'viewer']]){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,role+'@example.test']);
   await db.query('insert into public.retail_memberships(user_id,email,role) values($1,$2,$3)',[id,role+'@example.test',role]);
 }
 await as(owner);
 const prod=await command('save_product',{category:'tv',brand:'Samsung',model:'S90FD',warranty_months:12,
  variants:[{name:'55 OLED',sku:'V2-TEST-SERIAL',barcode:'V2-BASE',cost:140,price:200,min_stock:0,reorder_target:3,opening_quantity:8}]});
 const vid=(await state()).variants.find(v=>v.product_id===prod.entity_id).id;
 eq((await state()).features.includes('serial_sales_v2'),true,'V2 capability is advertised');
 for(const serial of ['TV-001','TV-002','TV-003','TV-004'])await command('add_unit_serial',{variant_id:vid,serial,source:'manual'});
 const options=await scalar('select public.retail_available_sale_serials($1)',[vid]);
 eq(options.total,4,'registered serials can be searched from sale');
 const serialIds=Object.fromEntries(options.serials.map(s=>[s.serial,s.id]));
 await as(sales);
 const payload={items:[{variant_id:vid,quantity:2,expected_price:200}],payment_method:'card',
  serial_assignments:[{variant_id:vid,serial_ids:[serialIds['TV-001'],serialIds['TV-002']]}]};
 const op=randomUUID();
 const sold=await command('create_sale',payload,op);
 eq(await command('create_sale',payload,op),sold,'Idempotent operation never double-sells');
 eq(await currentStock(vid),6,'Stock moves exactly once');
 eq((await identifiers(vid)).identified,2,'Sold serials disappear from available count');
 eq((await links(sold.entity_id)).map(x=>x.serial).sort(),['TV-001','TV-002'],'Sale knows exact units');
 await assert.rejects(()=>command('create_sale',{...payload,serial_assignments:[{variant_id:vid,serial_ids:[serialIds['TV-001']]}]}),/no está disponible|serie/i);checks++;
 eq(await currentStock(vid),6,'Failed double-sale rolls back stock');
 const ordinary=await command('create_sale',{items:[{variant_id:vid,quantity:1,expected_price:200}],payment_method:'card'});
 eq((await links(ordinary.entity_id)).length,0,'Untracked sale remains optional');
 eq(await currentStock(vid),5,'Untracked sale still moves stock');
 await as(viewer);
 eq((await links(sold.entity_id)).length,2,'Viewer may query sale trace through RPC');
 await assert.rejects(()=>command('create_sale',payload),/permiso|acceso/i);checks++;
 await assert.rejects(()=>scalar('select count(*) from public.retail_serial_sale_links'),/permission denied|permiso/i);checks++;
 await as(owner);
 const saleItem=(await state()).document_items.find(i=>i.document_id===sold.entity_id);
 const returned=await command('return_sale',{id:sold.entity_id,payment_method:'card',reason:'Devolución por garantía',
  items:[{item_id:saleItem.id,quantity:1,condition:'quarantine',serial_ids:[serialIds['TV-001']]}]});
 eq((await links(sold.entity_id)).find(x=>x.serial==='TV-001').return_condition,'quarantine','Specific returned unit marked quarantine');
 eq((await links(sold.entity_id)).find(x=>x.serial==='TV-002').returned_at,null,'Unreturned unit remains sold');
 eq(await currentStock(vid),5,'Quarantine return does not add sellable stock');
 eq((await state()).stocks.find(x=>x.variant_id===vid).quarantine,1,'Quarantine stock is separate');
 await assert.rejects(()=>command('return_sale',{id:sold.entity_id,payment_method:'card',reason:'Devolución duplicada',
  items:[{item_id:saleItem.id,quantity:1,condition:'available',serial_ids:[serialIds['TV-001']]}]}),/serie|pendiente|vendida/i);checks++;
 const second=await command('return_sale',{id:sold.entity_id,payment_method:'card',reason:'Segunda devolución',
  items:[{item_id:saleItem.id,quantity:1,condition:'available',serial_ids:[serialIds['TV-002']]}]});
 eq((await links(sold.entity_id)).filter(x=>x.return_id===second.entity_id).length,1,'Return is linked to specific serial');
 eq(await currentStock(vid),6,'Sellable return adds stock only once');
 eq((await identifiers(vid)).identified,3,'Returned sellable serial becomes available');
 eq((await scalar('select public.retail_serial_history($1)',[serialIds['TV-002']])).map(x=>x.event),
  ['created','sold','returned_available'],'Sale and return form immutable events');
 const resale=await command('create_sale',{items:[{variant_id:vid,quantity:1,expected_price:200}],payment_method:'card',
  serial_assignments:[{variant_id:vid,serial_ids:[serialIds['TV-002']]}]});
 eq((await links(resale.entity_id)).length,1,'Returned serial may be resold');
 await command('void_sale',{id:resale.entity_id,reason:'Error en transacción'});
 eq((await links(resale.entity_id))[0].return_condition,'void','Voiding sale releases linked unit');
 eq(await currentStock(vid),6,'Void restores stock once');
 const quote=await command('create_quote',{items:[{variant_id:vid,quantity:1,expected_price:200}]});
 const converted=await command('convert_quote',{id:quote.entity_id,payment_method:'card',
  serial_assignments:[{variant_id:vid,serial_ids:[serialIds['TV-003']]}]});
 eq((await links(converted.result.sale_id??converted.entity_id)).map(x=>x.serial),['TV-003'],'Quote conversion binds serial');
 console.log('Serial Sales V2 assertions passed: '+checks);
 }finally{await db.close();}
});
