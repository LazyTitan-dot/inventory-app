import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));
const users = Object.fromEntries(['owner','admin','sales','inventory','viewer','outsider'].map((role,index) => [role,`00000000-0000-4000-8000-00000000020${index}`]));

// Sequential independent snapshots simulate stale editors. This suite does not claim
// to exercise PostgreSQL lock waits across two real server connections.
test('master versions: stale editors, receipt costs, variant set, retries and live permissions', async () => {
  const db = new PGlite(); let checks = 0;
  const equal = (actual,expected,label) => { assert.deepEqual(actual,expected,label); checks++; };
  const check = (value,label) => { assert.ok(value,label); checks++; };
  const scalar = async (sql,params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
  const as = async role => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[role]??'']); if(role) await db.exec('set role authenticated'); };
  const command = (action,payload,op=randomUUID()) => scalar('select public.retail_command($1,$2,$3)',[op,action,payload]);
  const reject = async (action,payload,pattern,op) => { await assert.rejects(() => command(action,payload,op),pattern); checks++; };
  const state = () => scalar('select public.retail_bootstrap()');
  const productEdit = async id => {
    const s = await state(), p = s.products.find(p => p.id===id), variants = s.variants.filter(v => v.product_id===id);
    return { ...p, expected_updated_at:p.updated_at, variants, expected_variants:variants.map(v => ({id:v.id,expected_updated_at:v.updated_at})) };
  };
  const version = row => ({id:row.id,expected_updated_at:row.updated_at});
  const future = () => new Date(Date.now()+86400000).toISOString();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated,anon;`);
    for (const name of (await readdir(migrations)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(`${migrations}/${name}`,'utf8'));
    for (const [role,id] of Object.entries(users)) {
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`${role}@example.test`]);
      if(role!=='outsider') await db.query('insert into public.retail_memberships(user_id,email,role) values($1,$2,$3)',[id,`${role}@example.test`,role]);
    }
    await as('owner');
    const pid = (await command('save_product',{category:'tv',brand:'Marca',model:'Modelo',warranty_months:12,variants:[{name:'Negro',sku:'VERSION-NEGRO',cost:50,price:100,min_stock:1,reorder_target:4,opening_quantity:10}]})).entity_id;
    const initial = await productEdit(pid), vid = initial.variants[0].id;
    await reject('save_product',{...initial,expected_updated_at:undefined},/Falta la versión/);
    await reject('save_product',{...initial,expected_variants:undefined},/Faltan las versiones/);
    const firstOp = randomUUID(), firstPayload = {...initial,model:'Modelo nuevo'};
    const first = await command('save_product',firstPayload,firstOp);
    check(first.result.updated_at!==initial.updated_at,'Product version advances');
    equal(await command('save_product',firstPayload,firstOp),first,'Exact retry returns enriched cached response despite old timestamp');
    await reject('save_product',{...firstPayload,model:'Otra intención'},/ya se usó/,firstOp);
    await reject('save_product',{...initial,model:'Edición vieja'},/Otra operación modificó/);
    equal((await productEdit(pid)).model,'Modelo nuevo','Stale edit preserves newer metadata');

    // Receipts update cost and the variant token, but intentionally do not edit the product row.
    const supplier = (await command('save_contact',{kind:'supplier',name:'Proveedor'})).entity_id;
    const beforeReceipt = await productEdit(pid);
    const purchase = (await command('create_purchase',{contact_id:supplier,items:[{variant_id:vid,quantity:2,unit_cost:110}]})).entity_id;
    const purchaseItem = (await state()).document_items.find(i => i.document_id===purchase);
    await command('receive_purchase',{id:purchase,items:[{item_id:purchaseItem.id,quantity:2}]});
    const afterReceipt = await productEdit(pid);
    equal(afterReceipt.updated_at,beforeReceipt.updated_at,'Receipt leaves product token unchanged');
    check(afterReceipt.variants[0].updated_at!==beforeReceipt.variants[0].updated_at,'Receipt changes variant token');
    equal(afterReceipt.variants[0].cost,60,'Receipt computes weighted average cost');
    const stockAfterReceipt = (await state()).stocks;
    await reject('save_product',beforeReceipt,/variante o su costo/);
    equal((await productEdit(pid)).variants[0].cost,60,'Stale product form cannot overwrite the new receipt cost');
    equal((await state()).stocks,stockAfterReceipt,'Rejected edit cannot alter physical stock');

    const oldVariantSet = await productEdit(pid);
    await command('save_product',{...oldVariantSet,variants:[...oldVariantSet.variants,{name:'Blanco',sku:'VERSION-BLANCO',cost:40,price:90,min_stock:0,reorder_target:2}]});
    const withNewVariant = await productEdit(pid), added = withNewVariant.variants.find(v => v.sku==='VERSION-BLANCO');
    await reject('save_product',{...oldVariantSet,expected_updated_at:withNewVariant.updated_at,expected_variants:withNewVariant.expected_variants.filter(v => v.id!==added.id)},/variantes del producto cambiaron/);
    equal((await productEdit(pid)).variants.find(v => v.id===added.id).active,true,'Unseen concurrent variant cannot be archived by an old form');
    await reject('save_product',{...withNewVariant,expected_variants:[withNewVariant.expected_variants[0],withNewVariant.expected_variants[0]]},/duplicadas/);
    await reject('save_product',{...withNewVariant,expected_variants:withNewVariant.expected_variants.slice(0,1)},/variantes del producto cambiaron/);
    await reject('save_product',{...withNewVariant,expected_variants:[...withNewVariant.expected_variants,{id:randomUUID(),expected_updated_at:withNewVariant.updated_at}]},/variantes del producto cambiaron/);
    const noVersion = structuredClone(withNewVariant); delete noVersion.expected_variants[0].expected_updated_at;
    await reject('save_product',noVersion,/Falta la versión/);
    await command('save_product',{...withNewVariant,variants:withNewVariant.variants.filter(v => v.id!==added.id)});
    equal((await productEdit(pid)).variants.find(v => v.id===added.id).active,false,'Observed empty variant can be archived with complete baseline');

    const contactId = (await command('save_contact',{kind:'customer',name:'Cliente'})).entity_id;
    const contact = (await state()).contacts.find(c => c.id===contactId);
    const contactPayload = {...contact,...version(contact),name:'Cliente actualizado'};
    const contactOp = randomUUID(), contactSaved = await command('save_contact',contactPayload,contactOp);
    await reject('save_contact',{...contact,name:'Sin versión'},/Falta la versión/);
    await reject('archive_contact',{...version(contact),active:false},/Otra operación modificó/);
    equal(await command('save_contact',contactPayload,contactOp),contactSaved,'Contact replay is stable');
    const freshContact = (await state()).contacts.find(c => c.id===contactId);
    await command('archive_contact',{...version(freshContact),active:false});
    equal((await state()).contacts.find(c => c.id===contactId).active,false,'Fresh archive is accepted');

    const settings = (await state()).settings;
    await reject('save_settings',{...settings,business_name:'Sin versión'},/Falta la versión/);
    const settingsPayload = {...settings,expected_updated_at:settings.updated_at,business_name:'Nombre actualizado'};
    const settingsOp = randomUUID(), settingsSaved = await command('save_settings',settingsPayload,settingsOp);
    equal(settingsSaved.result.updated_at,(await state()).settings.updated_at,'Settings response carries actual server version');
    equal(await command('save_settings',settingsPayload,settingsOp),settingsSaved,'Settings replay keeps enriched version');
    await reject('save_settings',settingsPayload,/Otra operación modificó/);
    await db.exec('begin');
    const settings2 = await command('save_settings',{...settingsPayload,expected_updated_at:settingsSaved.result.updated_at,business_name:'Segunda edición'});
    const settings3 = await command('save_settings',{...settingsPayload,expected_updated_at:settings2.result.updated_at,business_name:'Tercera edición'});
    await db.exec('commit');
    check(settings2.result.updated_at!==settings3.result.updated_at,'Two updates in one transaction receive distinct tokens');

    const promotionId = (await command('save_promotion',{name:'Oferta',kind:'percent',value:10,starts_at:new Date().toISOString(),ends_at:future(),product_ids:[pid]})).entity_id;
    const promotion = (await state()).promotions.find(p => p.id===promotionId);
    await command('save_promotion',{...promotion,...version(promotion),value:20});
    await reject('save_promotion',{...promotion,...version(promotion),active:false},/Otra operación modificó/);
    equal((await state()).promotions.find(p => p.id===promotionId).value,20,'Stale promotion toggle does not overwrite edited discount');

    const sale = (await command('create_sale',{items:[{variant_id:vid,quantity:1}],payment_method:'card'})).entity_id;
    const sale2 = (await command('create_sale',{items:[{variant_id:vid,quantity:1}],payment_method:'card'})).entity_id;
    const deliveryId = (await command('save_delivery',{sale_id:sale,contact_name:'Receptor',address:'Calle uno',phone:'8095551234',scheduled_at:future()})).entity_id;
    const delivery = (await state()).deliveries.find(d => d.id===deliveryId);
    await reject('save_delivery',{...delivery,...version(delivery),sale_id:sale2},/conservar su venta original/);
    await command('save_delivery',{...delivery,...version(delivery),address:'Calle corregida'});
    await reject('status_delivery',{...version(delivery),status:'in_transit'},/Otra operación modificó/);
    const reprogrammed = (await state()).deliveries.find(d => d.id===deliveryId);
    equal(reprogrammed.history.length,2,'Failed transition preserves delivery history');
    const deliveryOp = randomUUID(), deliveryPayload = {...version(reprogrammed),status:'in_transit'};
    const transitioned = await command('status_delivery',deliveryPayload,deliveryOp);
    equal(await command('status_delivery',deliveryPayload,deliveryOp),transitioned,'Delivery status exact retry remains safe');
    equal((await state()).deliveries.find(d => d.id===deliveryId).history.length,3,'Delivery retry appends no duplicate history');

    let team = (await state()).team, member = team.find(m => m.user_id===users.viewer);
    await reject('set_member_role',{email:member.email,role:'sales',active:true},/Falta la versión/);
    await command('set_member_role',{email:member.email,role:'sales',active:true,expected_updated_at:member.updated_at});
    await reject('set_member_role',{email:member.email,role:'inventory',active:true,expected_updated_at:member.updated_at},/Otra operación modificó/);
    await as(); await db.query('update auth.users set email=$2 where id=$1',[users.viewer,'changed@example.test']); await as('owner');
    await reject('set_member_role',{email:'changed@example.test',role:'viewer',active:true},/Falta la versión/);
    member = (await state()).team.find(m => m.user_id===users.viewer);
    await command('set_member_role',{email:'changed@example.test',role:'viewer',active:true,expected_updated_at:member.updated_at});
    equal((await state()).team.find(m => m.user_id===users.viewer).email,'changed@example.test','Changed Auth email uses same existing membership version');
    await command('set_member_role',{email:'outsider@example.test',role:'viewer',active:true});
    equal((await state()).team.find(m => m.user_id===users.outsider).role,'viewer','New confirmed account authorization needs no old version');

    const emptyProduct = (await command('save_product',{category:'tv',brand:'Vacío',model:'Archivo',variants:[{name:'Única',sku:'VERSION-VACIO',cost:5,price:10,min_stock:0,reorder_target:1}]})).entity_id;
    const archiveBefore = await productEdit(emptyProduct);
    await command('save_product',{...archiveBefore,model:'Actualizado'});
    await reject('archive_product',{...version(archiveBefore),active:false},/Otra operación modificó/);
    await command('archive_product',{...version(await productEdit(emptyProduct)),active:false});
    equal((await productEdit(emptyProduct)).active,false,'Fresh product archive succeeds');

    const conflictOp = randomUUID(), beforeConflict = await state();
    await reject('save_product',initial,/Otra operación modificó/,conflictOp);
    equal((await state()).audit.length,beforeConflict.audit.length,'Conflicts create no audit side effect');
    await as();
    equal(Number(await scalar('select count(*) from retail_private.operations where id=$1',[conflictOp])),0,'Conflicts do not consume operation key');
    await db.query("update public.retail_memberships set role='viewer' where user_id=$1",[users.owner]);
    await as('owner');
    await reject('save_product',firstPayload,/permiso/,firstOp);
    await as(); await db.query('update public.retail_memberships set active=false where user_id=$1',[users.owner]); await as('owner');
    await reject('save_product',firstPayload,/acceso|cuenta|permiso/,firstOp);
    await as('admin');
    for (const name of ['command_document_lifecycle','command_core']) {
      await assert.rejects(() => db.query(`select retail_private.${name}($1,$2,$3)`,[randomUUID(),'save_settings',settingsPayload]),/permission denied/); checks++;
    }
    await assert.rejects(() => db.query("update public.retail_settings set business_name='Bypass'"),/permission denied/); checks++;
    await as('inventory'); await reject('save_settings',settingsPayload,/permiso/);
    await as('sales'); await reject('save_product',firstPayload,/permiso/);
    console.log(`${checks} master-version checks passed with all migrations applied.`);
  } finally { await db.close(); }
});
