import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migrations=fileURLToPath(new URL('../migrations/',import.meta.url));
const owner='00000000-0000-4000-8000-000000000011';
const viewer='00000000-0000-4000-8000-000000000012';
const stranger='00000000-0000-4000-8000-000000000013';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBSkAAAAASUVORK5CYII=';
const sourceNames=['products','sales','customers','suppliers','purchase_orders','quotes','returns','deliveries','promotions','activity_log'];

async function setup({existingPublicBucket=false,broadStoragePolicies=false}={}) {
  const db=new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated,anon;`);
  if(existingPublicBucket) await db.exec("insert into storage.buckets(id,name,public) values('retail-product-media','retail-product-media',true)");
  if(broadStoragePolicies) await db.exec('create policy unrelated_permissive_policy on storage.objects for all to public using(true) with check(true)');
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now()),($2,'viewer@example.test',now()),($3,'stranger@example.test',now())",[owner,viewer,stranger]);
  for(const name of sourceNames) await db.exec(`create table public.${name}(id text primary key,user_id uuid,data jsonb not null,updated_at timestamptz not null default now());grant select,insert,update,delete on public.${name} to authenticated`);
  await db.exec("create table public.settings(id text primary key,currency text,exchange_rate numeric,ncf_seq integer,updated_at timestamptz default now());grant select,insert,update,delete on public.settings to authenticated");
  try { for(const name of (await readdir(migrations)).filter(n=>/retail_(core|commands|read_api|legacy_archive_import|deferred_constraint_security|document_lifecycle)\.sql$/.test(n)).sort()) await db.exec(await readFile(`${migrations}/${name}`,'utf8')); }
  catch(error) {await db.close();throw error;}
  await db.query("insert into public.retail_memberships(user_id,email,role) values($1,'owner@example.test','owner'),($2,'viewer@example.test','viewer')",[owner,viewer]);
  return db;
}
async function insertSource(db,source,data) { await db.query(`insert into public.${source}(id,user_id,data) values($1,$2,$3)`,[data.id,owner,data]); }
const scalar=async(db,sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
async function as(db,id,role='authenticated') {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec(`set role ${role}`);}
const command=(db,action,payload)=>scalar(db,'select public.retail_command($1,$2,$3)',[randomUUID(),action,payload]);

async function synthetic(db) {
  await insertSource(db,'products',{id:'p-reused',category:'tv',brand:'Marca',model:'Modelo nuevo',sku:'EJEMPLO',warrantyMonths:0,images:[image],variants:[
    {id:'v-same',name:'Blanco',barcode:'001234',quantity:3,cost:100,price:200,minStock:0,reorderQty:10},
    {id:'v-two',name:'Negro',barcode:'001235',quantity:2,cost:50,price:100,minStock:5,reorderQty:10}]});
  await insertSource(db,'customers',{id:'customer-1',name:'Cliente sintético',email:'cliente@example.test',phone:'8095550101',line1:'Calle de prueba',city:'Ciudad',rnc:'',reference:'Referencia',note:'Nota'});
  await insertSource(db,'suppliers',{id:'supplier-1',name:'Proveedor sintético',email:'proveedor@example.test',phone:'8095550102',address:'Dirección de prueba',paymentTerms:'30 días'});
  const line={key:'p-reused__v-same',productId:'p-reused',variantId:'v-same',productBrand:'Marca',productModel:'Modelo nuevo',variantName:'Blanco',productSku:'EJEMPLO',category:'tv',quantity:1,price:100,cost:60};
  await insertSource(db,'sales',{id:'sale-1',date:'2026-01-10T10:00:00',saleNumber:1,status:'completed',customer:{id:'customer-1',name:'Cliente original'},items:[line],subtotal:100,discountAmount:0,taxRate:18,taxAmount:20,total:120,paymentMethod:'card',ncfNumber:'LEGADO-SIN-VALIDAR'});
  await insertSource(db,'sales',{id:'sale-2',date:'2026-01-11T10:00:00Z',saleNumber:2,status:'pending',customer:{id:'walk',name:'Mostrador'},items:[{...line,productModel:'Modelo anterior'}],subtotal:100,discountAmount:0,taxRate:0,taxAmount:0,total:100,paymentMethod:'transfer'});
  await insertSource(db,'purchase_orders',{id:'purchase-1',date:'2026-01-01T10:00:00',poNumber:1,status:'received',supplierId:'supplier-1',items:[{...line,id:'poi-1',qty:7,unitCost:60,total:420}],subtotal:420,taxRate:0,taxAmount:0,grandTotal:420});
  await insertSource(db,'purchase_orders',{id:'purchase-2',date:'2026-01-02T10:00:00',poNumber:2,status:'draft',supplierId:'supplier-1',items:[{...line,id:'poi-2',qty:2,unitCost:60,total:120}],subtotal:120,taxRate:0,taxAmount:0,grandTotal:120});
  await insertSource(db,'deliveries',{id:'delivery-1',saleId:'sale-1',date:'2026-01-12',timeSlot:'PM (12:00-5:00)',status:'delivered',customer:{name:'Cliente',phone:'8095550101'},address:'Dirección de prueba',deliveredAt:'2026-01-12T19:00:00Z'});
  await insertSource(db,'activity_log',{id:'activity-1',time:'2026-01-01T10:00:00',type:'sale',text:'Venta <strong>original</strong>',detail:'Sin actor conocido'});
}

test('legacy cutover: preserve source, identities, amounts, timestamps, stock, media and access',async()=>{
  const db=await setup({broadStoragePolicies:true});let checks=0;
  const check=(v,message)=>{assert.ok(v,message);checks++;};
  try {
    await synthetic(db);
    await db.exec('grant select(data) on public.sales to authenticated');
    let manifest=await scalar(db,'select retail_private.legacy_manifest()');
    check(manifest.sha256.length===64,'Canonical SHA256 manifest');
    await assert.rejects(()=>scalar(db,'select retail_private.import_legacy($1,$2,$3,false)',[manifest.sha256,'fixture-commit',owner]),/congelar/);checks++;
    await assert.rejects(()=>scalar(db,'select retail_private.import_legacy($1,$2,$3,true)',['0'.repeat(64),'fixture-commit',owner]),/origen cambió/);checks++;
    check(Number(await scalar(db,'select count(*) from retail_private.legacy_archive'))===0,'Failed preflight does not change archive or target');
    await db.exec('begin');
    const rehearsal=await scalar(db,'select retail_private.import_legacy($1,$2,$3,true)',[manifest.sha256,'fixture-commit',owner]);
    check(rehearsal.stock_units===5,'Rehearsal imports current quantity only');
    await db.exec('rollback');
    check(Number(await scalar(db,'select count(*) from public.retail_products'))===0,'Rehearsal rollback leaves catalog untouched');
    check(await scalar(db,"select has_table_privilege('authenticated','public.products','INSERT')"),'Rehearsal rollback restores original grants');
    const imported=await scalar(db,'select retail_private.import_legacy($1,$2,$3,true)',[manifest.sha256,'fixture-commit',owner]);
    check(imported.sales===2&&imported.purchases===2&&imported.contacts===2&&imported.deliveries===1,'All source entities normalized');
    assert.deepEqual(await scalar(db,'select retail_private.import_legacy($1,$2,$3,true)',[manifest.sha256,'fixture-commit',owner]),imported);checks++;
    check((await scalar(db,'select retail_private.legacy_manifest()')).sha256===manifest.sha256,'Source JSON data stays byte-canonically identical');
    check(Number(await scalar(db,'select count(*) from retail_private.legacy_archive'))===manifest.row_count,'Every source record archived once');
    check(Number(await scalar(db,"select sum(quantity) from public.retail_movements where type='opening'"))===5,'Only opening quantities, no sale/receipt replay');
    check(Number(await scalar(db,"select count(*) from public.retail_movements where type<>'opening'"))===0,'No fabricated historical movement ledger');
    const docs=(await db.query('select * from public.retail_documents order by number')).rows;
    const sale=docs.find(d=>d.type==='sale'&&d.legacy.id==='sale-1');
    const pending=docs.find(d=>d.legacy.id==='sale-2');
    check(Number(sale.total)===120&&Number(sale.tax)===20,'Preserves recorded tax instead of recomputing 18%');
    check(pending.status==='legacy_pending','Pending old sale remains unconfirmed');
    check(docs.some(d=>d.status==='draft'),'Draft old purchase remains a draft');
    check(docs.every(d=>d.created_by===null),'Does not invent historical commercial authors');
    check(new Date(sale.created_at).toISOString()==='2026-01-10T14:00:00.000Z','Naive historical date interpreted in Santo Domingo');
    check(new Date(pending.created_at).toISOString()==='2026-01-11T10:00:00.000Z','Explicit UTC date preserved');
    const items=(await db.query('select * from public.retail_document_items')).rows;
    check(items.find(i=>i.document_id===pending.id).variant_id===null,'Reused identity with different model never links to current stock');
    check(items.find(i=>i.document_id===sale.id).variant_id!==null,'Exact original snapshot can link safely');
    check(items.find(i=>i.document_id===sale.id).product_snapshot.warranty_months===null,'Missing historical warranty remains unknown');
    check(items.find(i=>i.document_id===sale.id).product_snapshot.warranty_unknown===true,'Unknown warranty is explicit');
    check(Number(items.find(i=>i.document_id===sale.id).unit_cost)===60,'Historical cost does not use current catalog cost');
    const product=(await db.query('select * from public.retail_products')).rows[0];
    check(product.category==='tv','Catalog keeps canonical category code used by editor and filters');
    check(items.find(i=>i.document_id===sale.id).product_snapshot.category==='tv','Historical category snapshot keeps same canonical code');
    check(product.images[0]===`legacy:${product.id}:0`&&!JSON.stringify(product).includes('base64'),'Bootstrap catalog carries media reference only');
    await assert.rejects(()=>db.query("update retail_private.legacy_archive set data='{}'"),/inmutable/);checks++;
    await as(db,owner);
    const state=await scalar(db,'select public.retail_bootstrap()');
    check(state.products[0].warranty_months===0,'Zero current warranty preserved');
    check(await scalar(db,'select public.retail_product_image($1,0)',[product.id])===image,'Authorized lazy media retrieves original bytes');
    const report=await scalar(db,'select public.retail_migration_report()');
    check(report.issues.some(i=>i.code==='tax_rate_amount_disagreement'),'Tax mismatch explicitly reported');
    check(report.activity[0].text==='Venta original','Legacy audit markup never exposed as active HTML');
    await command(db,'save_promotion',{name:'Categoría importada',code:'CATEGORIA',kind:'percent',value:10,category:'tv',product_ids:[],starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString()});
    const quote=await command(db,'create_quote',{items:[{variant_id:items.find(i=>i.document_id===sale.id).variant_id,quantity:1,expected_price:200}],promotion_code:'CATEGORIA',expires_at:new Date(Date.now()+86400000).toISOString()});
    check(quote.result.total===212.4,'Category promotion applies to imported catalog code');
    await assert.rejects(()=>db.query("insert into public.products(id,data) values('bad','{}')"),/permission denied/);checks++;
    await assert.rejects(()=>db.query('select * from public.sales'),/permission denied/);checks++;
    await assert.rejects(()=>db.query('select data from public.sales'),/permission denied/);checks++;
    await assert.rejects(()=>db.query('select * from retail_private.legacy_archive'),/permission denied/);checks++;
    const path=`${product.id}/${randomUUID()}.png`;
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['retail-product-media',path]);
    const variants=state.variants.filter(v=>v.product_id===product.id);
    await command(db,'save_product',{...product,images:[product.images[0],`storage:${path}`],variants});
    await assert.rejects(()=>command(db,'save_product',{...product,images:[`legacy:${randomUUID()}:0`],variants}),/imagen/);checks++;
    await assert.rejects(()=>command(db,'save_product',{...product,images:['storage:missing.png'],variants}),/subirse/);checks++;
    await command(db,'return_sale',{id:sale.id,items:[{item_id:items.find(i=>i.document_id===sale.id).id,quantity:1,condition:'available'}],reason:'Devolución histórica de prueba',payment_method:'card'});
    const refundedState=await scalar(db,'select public.retail_bootstrap()');
    const historicalVariant=refundedState.variants.find(v=>v.id===items.find(i=>i.document_id===sale.id).variant_id);
    check(historicalVariant.cost===90,'Historical return uses recorded cost 60 with 3 current units at cost 100');
    check(refundedState.document_items.find(i=>i.id===items.find(i=>i.document_id===sale.id).id).unit_cost===60,'Return never rewrites original cost snapshot');
    check((await db.query("delete from storage.objects where bucket_id='retail-product-media' returning id")).rows.length===0,'Even owner has no Storage delete policy through broad pre-existing policy');
    await as(db,viewer);
    check(await scalar(db,'select public.retail_product_image($1,0)',[product.id])===image,'Viewer can see product photo without financial data');
    await assert.rejects(()=>scalar(db,'select public.retail_migration_report()'),/permiso/);checks++;
    await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['retail-product-media','viewer.png']),/row-level security/);checks++;
    check((await db.query("update storage.objects set name='tampered.png' where bucket_id='retail-product-media' returning id")).rows.length===0,'Viewer cannot update media even when unrelated permissive policies exist');
    await db.exec('reset role');
    await db.query("update public.retail_memberships set role='sales' where user_id=$1",[viewer]);
    await as(db,viewer);
    const salesState=await scalar(db,'select public.retail_bootstrap()');
    check(!JSON.stringify(salesState).includes('"unit_cost":')&&!JSON.stringify(salesState).includes('"cost":'),'Sales response excludes current and historical cost, including legacy metadata');
    check(salesState.documents.every(d=>d.type!=='purchase'),'Sales cannot see imported purchase amounts');
    await as(db,stranger);
    await assert.rejects(()=>scalar(db,'select public.retail_product_image($1,0)',[product.id]),/permiso/);checks++;
    check((await db.query("select * from storage.objects where bucket_id='retail-product-media'")).rows.length===0,'Non-member cannot bypass media membership through broad policy');
    await as(db,null,'anon');
    await assert.rejects(()=>scalar(db,'select public.retail_product_image($1,0)',[product.id]),/permission denied/);checks++;
    check((await db.query("select * from storage.objects where bucket_id='retail-product-media'")).rows.length===0,'Anonymous cannot use a pre-existing public Storage policy for private product media');
    await db.exec('reset role');
    check(await scalar(db,'select retail_private.is_legacy_product_image($1)',[image]),'PNG signature accepted');
    check(!await scalar(db,'select retail_private.is_legacy_product_image($1)',['data:image/png;base64,'+Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')]),'Disguised SVG rejected despite PNG prefix');
    check(!await scalar(db,'select retail_private.is_legacy_product_image($1)',['data:image/png;base64,iVBORw0KGgoAAA===']), 'Malformed base64 rejected');
    console.log(`Legacy import: ${checks} assertions passed; fixture-only, no live import performed.`);
  } finally {await db.close();}
});

test('legacy migration refuses an existing public media bucket instead of silently exposing files',async()=>{
  await assert.rejects(()=>setup({existingPublicBucket:true}),/bucket existente requiere revisión/);
});

test('legacy cutover refuses arithmetic disagreements and rolls back every partially assembled entity',async()=>{
  const db=await setup();
  try {
    await synthetic(db);
    await db.query("update public.sales set data=jsonb_set(data,'{total}','121') where id='sale-1'");
    const manifest=await scalar(db,'select retail_private.legacy_manifest()');
    await assert.rejects(()=>scalar(db,'select retail_private.import_legacy($1,$2,$3,true)',[manifest.sha256,'fixture-commit',owner]),/importes discordantes/);
    assert.equal(Number(await scalar(db,'select count(*) from public.retail_products')),0);
    assert.equal(Number(await scalar(db,'select count(*) from retail_private.legacy_archive')),0);
    assert.equal(await scalar(db,"select has_table_privilege('authenticated','public.products','INSERT')"),true);
  } finally {await db.close();}
});

test('optional sanitized live profile rehearsal (no PII or media payloads)',{skip:!process.env.RETAIL_LEGACY_PROFILE},async()=>{
  const db=await setup();
  try {
    const profile=JSON.parse(await readFile(process.env.RETAIL_LEGACY_PROFILE,'utf8'));
    for(const p of profile.products) await insertSource(db,'products',{...p.data,images:Array(p.images_count).fill(image)});
    for(const c of profile.customers) await insertSource(db,'customers',{id:c.id,name:'Cliente sintético del perfil',email:'',phone:''});
    for(const s of profile.suppliers) await insertSource(db,'suppliers',{id:s.id,name:'Proveedor sintético del perfil',email:'',phone:''});
    for(const s of profile.sales) await insertSource(db,'sales',{...s.data,customer:{id:'walk',name:'Mostrador sintético'}});
    for(const p of profile.purchase_orders) await insertSource(db,'purchase_orders',p.data);
    for(const d of profile.deliveries) await insertSource(db,'deliveries',{id:d.id,date:d.date,saleId:d.sale_id,status:d.status,timeSlot:d.time_slot,deliveredAt:d.delivered_at,address:'Dirección sintética',customer:{name:'Cliente sintético',phone:'8095550100'}});
    const manifest=await scalar(db,'select retail_private.legacy_manifest()');
    const result=await scalar(db,'select retail_private.import_legacy($1,$2,$3,true)',[manifest.sha256,'sanitized-profile',owner]);
    const originalStock=profile.products.flatMap(p=>p.data.variants).reduce((n,v)=>n+v.quantity,0);
    assert.equal(result.stock_units,originalStock);
    assert.equal(result.sales,profile.sales.length);
    assert.equal(result.purchases,profile.purchase_orders.length);
    assert.equal(result.variants,profile.products.flatMap(p=>p.data.variants).length);
    for(const p of profile.products) assert.equal(await scalar(db,"select category from public.retail_products where legacy->>'id'=$1",[p.id]),p.data.category.trim());
    const originalSalesCents=profile.sales.reduce((n,s)=>n+Math.round(s.data.total*100),0);
    assert.equal(Math.round(Number(await scalar(db,"select sum(total) from public.retail_documents where type='sale'"))*100),originalSalesCents);
    const issues=(await db.query('select code,count(*)::integer count from retail_private.legacy_issues group by code order by code')).rows;
    console.log(JSON.stringify({sanitized_profile_rehearsal:'passed',products:result.products,variants:result.variants,stock_units:result.stock_units,sales:result.sales,purchases:result.purchases,document_items:result.document_items,deliveries:result.deliveries,issues}));
  } finally {await db.close();}
});
