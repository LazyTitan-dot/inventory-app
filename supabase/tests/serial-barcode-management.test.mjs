import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
const owner='00000000-0000-4000-8000-000000001101',viewer='00000000-0000-4000-8000-000000001102';
test('serial + barcode V1 is optional, progressive, auditable and inventory-safe',async()=>{
 const db=new PGlite();let checks=0;
 const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const as=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);if(id)await db.exec('set role authenticated');};
 const command=(act,p,op=randomUUID())=>scalar('select public.retail_command($1,$2,$3)',[op,act,p]);
 const state=()=>scalar('select public.retail_bootstrap()');
 const ids=(id)=>scalar('select public.retail_identifiers($1) as value',[id]);
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
 for(const filename of(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(dir+'/'+filename,'utf8'));
 for(const [id,role] of [[owner,'owner'],[viewer,'viewer']]){
   await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,role+'@example.test']);
   await db.query('insert into public.retail_memberships(user_id,email,role) values($1,$2,$3)',[id,role+'@example.test',role]);
 }
 await as(owner);
 const created=await command('save_product',{category:'tv',brand:'Samsung',model:'S90FD',warranty_months:12,
   variants:[{name:'55 OLED',sku:'TEST-S90FD-SERIAL',barcode:'SL-BASE',barcode_aliases:['MANUFACTURER-BASE'],
    cost:20000,price:25000,min_stock:0,reorder_target:0,opening_quantity:5}]});
 const v=(await state()).variants.find(x=>x.product_id===created.entity_id),vid=v.id;
 let x=await ids(vid);
 eq([x.available,x.identified,x.pending,x.reconciliation],[5,0,5,0],'Existing goods have no required serial');
 eq(x.codes.length,2,'Existing barcode system remains in use');
 eq((await state()).features.includes('serial_barcode_management_v1'),true,'New backend capability announced');
 const payload={variant_id:vid,serial:'sN-0001',source:'barcode'},op=randomUUID();
 const first=await command('add_unit_serial',payload,op);
 eq(await command('add_unit_serial',payload,op),first,'Idempotent serial submission');
 await command('add_unit_serial',{variant_id:vid,serial:'SN-0002',source:'manual'});
 x=await ids(vid);
 eq([x.available,x.identified,x.pending],[5,2,3],'Progress persists independently of stock');
 await assert.rejects(()=>command('add_unit_serial',{variant_id:vid,serial:'sn-0001',source:'qr'}),/serie|código|registrado/i);checks++;
 const row=x.serials.find(s=>s.serial==='SN-0002');
 await command('correct_unit_serial',{variant_id:vid,serial_id:row.id,serial:'SN-0003',expected_updated_at:row.updated_at,reason:'Corrección de etiqueta'});
 eq((await scalar('select public.retail_serial_history($1)',[row.id])).map(e=>e.event),['created','corrected'],'Correction has history');
 x=await ids(vid);
 const corrected=x.serials.find(s=>s.serial==='SN-0003');
 await command('remove_unit_serial',{variant_id:vid,serial_id:corrected.id,expected_updated_at:corrected.updated_at,reason:'Error de transcripción'});
 eq((await scalar('select public.retail_serial_history($1)',[row.id])).map(e=>e.event),['created','corrected','removed'],'Removal preserves history');
 for(let n=4;n<=7;n++)await command('add_unit_serial',{variant_id:vid,serial:'SN-000'+n,source:'manual'});
 x=await ids(vid);
 eq([x.available,x.identified,x.pending],[5,5,0],'Can fill all identified units across sessions');
 await assert.rejects(()=>command('add_unit_serial',{variant_id:vid,serial:'SN-EXTRA',source:'manual'}),/No quedan unidades/);checks++;
 await command('adjust_stock',{variant_id:vid,quantity:-1,expected_quantity:5,bucket:'available',reason:'Conteo físico de una unidad'});
 x=await ids(vid);
 eq([x.available,x.identified,x.reconciliation],[4,5,1],'Reconciliation visible after unrelated stock movement');
 const last=x.serials[0];
 await command('remove_unit_serial',{variant_id:vid,serial_id:last.id,expected_updated_at:last.updated_at,reason:'Conciliación de unidades'});
 x=await ids(vid);eq([x.available,x.identified,x.reconciliation],[4,4,0],'Manual reconciliation resolves excess');
 await command('manage_variant_barcode',{variant_id:vid,mode:'add',code:'SL-SECONDARY',kind:'internal',make_primary:false});
 x=await ids(vid);eq(x.codes.find(c=>c.code==='SL-SECONDARY').kind,'internal','Secondary code type retained');
 await command('manage_variant_barcode',{variant_id:vid,mode:'set_primary',code:'SL-SECONDARY',kind:'internal'});
 x=await ids(vid);eq(x.codes[0].code,'SL-SECONDARY','Promote code to primary');
 await command('manage_variant_barcode',{variant_id:vid,mode:'replace',code:'SL-NEW',previous_code:'SL-SECONDARY',kind:'internal'});
 x=await ids(vid);eq(x.codes[0].code,'SL-NEW','Replace main code');
 await command('manage_variant_barcode',{variant_id:vid,mode:'remove',code:'SL-NEW',kind:'internal'});
 x=await ids(vid);eq(x.codes.some(c=>c.code==='SL-NEW'),false,'Barcode unlink without deleting product');
 eq((await state()).stocks.find(s=>s.variant_id===vid).available,4,'Serial + barcode operations cannot change stock');
 assert.ok(x.barcode_history.length>=3);checks++;
 await as(viewer);
 eq((await ids(vid)).identified,4,'Viewer can consult history safely');
 await assert.rejects(()=>command('add_unit_serial',{variant_id:vid,serial:'NO',source:'manual'}),/permiso/i);checks++;
 await assert.rejects(()=>scalar('select count(*) from public.retail_unit_serials'),/permission denied|permiso/i);checks++;
 console.log('Serial-barcode assertions: '+checks);
 }finally{await db.close();}
});
