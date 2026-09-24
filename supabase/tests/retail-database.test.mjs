import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = fileURLToPath(new URL('../migrations/', import.meta.url));
const owner = '00000000-0000-4000-8000-000000000001';
const sales = '00000000-0000-4000-8000-000000000002';
const inventory = '00000000-0000-4000-8000-000000000003';
const viewer = '00000000-0000-4000-8000-000000000004';
const outsider = '00000000-0000-4000-8000-000000000005';
const secondOwner = '00000000-0000-4000-8000-000000000006';

test('retail SQL: atomic operations, accounting, authorization and adversarial inputs', async () => {
  const db = new PGlite();
  let count = 0;
  const check = (value, message) => { assert.ok(value, message); count++; };
  const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
  const as = async (id, role='authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id ?? '']);
    await db.exec(`set role ${role}`);
  };
  const command = async (action,payload,operation=randomUUID()) => scalar('select public.retail_command($1,$2,$3)',[operation,action,payload]);
  // Preserve the JSON spelling 1.0; JSON.stringify would normalize it to 1 before PostgreSQL sees it.
  const decimalCommand = (action,payload) => scalar("select public.retail_command($1,$2,jsonb_set($3::jsonb,'{items,0,quantity}','1.0'::jsonb))",[randomUUID(),action,payload]);
  const bootstrap = () => scalar('select public.retail_bootstrap()');
  const fail = async (action,payload,pattern) => {
    await assert.rejects(() => command(action,payload), pattern); count++;
  };
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
    `);
    await db.query(`insert into auth.users(id,email,email_confirmed_at) values
      ($1,'propietario@example.test',now()),($2,'caja@example.test',now()),
      ($3,'almacen@example.test',now()),($4,'consulta@example.test',now()),($5,'externo@example.test',now()),
      ($6,'segundo@example.test',now())`,[owner,sales,inventory,viewer,outsider,secondOwner]);
    for (const name of (await readdir(migrations)).filter(name=>/retail_(core|commands|read_api|deferred_constraint_security)\.sql$/.test(name)).sort()) {
      await db.exec(await readFile(`${migrations}/${name}`,'utf8'));
    }
    check(Number(await scalar('select count(*) from public.retail_memberships'))===0,'Portable migrations do not seed a personal account');
    await db.query("insert into public.retail_memberships(user_id,email,display_name,role) values($1,'propietario@example.test','Propietario de prueba','owner')",[owner]);
    await as(owner);
    let state=await bootstrap();
    check(state.profile.role==='owner' && state.settings.currency==='DOP','Owner bootstrap and Dominican currency');
    for (const [email,role] of [['caja@example.test','sales'],['almacen@example.test','inventory'],['consulta@example.test','viewer']]) {
      await command('set_member_role',{email,role,active:true,display_name:role});
    }
    await fail('set_member_role',{email:'propietario@example.test',role:'viewer',active:true},/propietario activo/);
    // Membership transitions exercise fresh authorization; a true waiting-lock race requires two PostgreSQL sessions.
    await command('set_member_role',{email:'segundo@example.test',role:'owner',active:true});
    await as(secondOwner);
    await command('set_member_role',{email:'segundo@example.test',role:'admin',active:true});
    await fail('set_member_role',{email:'segundo@example.test',role:'owner',active:true},/Solo el propietario/);
    await fail('set_member_role',{email:'propietario@example.test',role:'viewer',active:true},/Solo el propietario/);
    await as(owner);
    await command('set_member_role',{email:'segundo@example.test',role:'viewer',active:true});
    await as(secondOwner);
    await fail('set_member_role',{email:'segundo@example.test',role:'owner',active:true},/permiso/);
    await as(owner);
    await fail('set_member_role',{email:'propietario@example.test',role:'owner',active:false},/propietario activo/);
    await fail('unknown_action',{},/no está disponible/);
    await fail('create_sale',{payment_method:'cash',tendered:0},/artículos/);
    await fail('create_sale',{items:[],payment_method:'cash',tendered:0},/artículos/);
    await fail('save_product',{category:'Prueba',brand:'Prueba',model:'Prueba'},/variantes/);
    const product={category:'Neveras',brand:'Prueba',model:'A',warranty_months:0,variants:[{name:'Blanca',sku:'PR-A',cost:100,price:200,min_stock:0,reorder_target:10,opening_quantity:3}]};
    const operation=randomUUID();
    const p=await command('save_product',product,operation);
    assert.deepEqual(await command('save_product',product,operation),p); count++;
    await assert.rejects(()=>command('save_product',{...product,model:'B'},operation),/otros datos/); count++;
    state=await bootstrap();
    const v=state.variants.find(v=>v.product_id===p.entity_id);
    check(state.stocks.find(s=>s.variant_id===v.id).available===3,'Opening stock only once');
    check(state.products.find(p=>p.id===v.product_id).warranty_months===0,'Zero warranty is preserved');
    // Force deferred validation before resetting the authenticated application role.
    await db.exec('begin');
    try {
      await command('create_quote',{items:[{variant_id:v.id,quantity:1}],expires_at:new Date(Date.now()+86400000).toISOString()});
      check(await scalar('select current_user')==='authenticated','Deferred checks run under the real authenticated SQL role');
      await db.exec('set constraints all immediate'); count++;
    } finally { await db.exec('rollback'); }
    // This PGlite version preserves the INSERT actor for deferred RPC triggers, unlike the
    // deployed PostgreSQL version. Queue the same validator from authenticated on a temporary
    // probe so that its protected-table reads are also checked under that exact actor.
    const constraintQuote=await command('create_quote',{items:[{variant_id:v.id,quantity:1}],expires_at:new Date(Date.now()+86400000).toISOString()});
    await db.exec('reset role');
    await db.exec('begin');
    try {
      await db.exec(`create temporary table retail_documents(id uuid) on commit drop;
        create constraint trigger retail_authenticated_probe after insert on pg_temp.retail_documents deferrable initially deferred
          for each row execute function retail_private.check_document_totals();
        grant insert on pg_temp.retail_documents to authenticated;
        set local role authenticated;`);
      await db.query('insert into pg_temp.retail_documents values($1)',[constraintQuote.entity_id]);
      check(await scalar('select current_user')==='authenticated','Probe queues the totals validator under authenticated');
      await db.exec('set constraints all immediate'); count++;
    } finally { await db.exec('rollback'); }
    await as(owner);
    await fail('save_product',{...product,variants:[{...product.variants[0],sku:' pr-a '}]},/unique|duplicate/i);
    await fail('save_product',{...product,variants:[{...product.variants[0],sku:'NEG',price:-1}]},/rango/);
    await fail('save_product',{...product,variants:[{...product.variants[0],sku:'FRAC',opening_quantity:1.5}]},/rango/);
    await fail('save_product',{...product,images:['http://example.test/photo.jpg']},/HTTPS/);
    await fail('archive_product',{id:p.entity_id,active:false},/existencias/);
    const supplier=await command('save_contact',{kind:'supplier',name:'Proveedor de pruebas',email:'proveedor@example.test'});
    const customer=await command('save_contact',{kind:'customer',name:'Cliente de pruebas',email:'cliente@example.test'});
    await fail('save_contact',{kind:'customer',name:'Duplicado',email:'CLIENTE@example.test'},/unique|duplicate/i);
    await fail('save_contact',{kind:'customer',name:'Email inválido',email:'not-an-email'},/correo/);
    await as(inventory);
    const purchase=await command('create_purchase',{contact_id:supplier.entity_id,items:[{variant_id:v.id,quantity:7,unit_cost:100}]});
    state=await bootstrap();
    const pi=state.document_items.find(i=>i.document_id===purchase.entity_id);
    const receiveOp=randomUUID();
    const received=await command('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:2}]},receiveOp);
    check(received.result.status==='partial','Partial purchase receipt');
    await command('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:2}]},receiveOp);
    await fail('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:6}]},/saldo pendiente/);
    await fail('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:0}]},/rango/);
    await fail('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:1},{item_id:pi.id,quantity:1}]},/duplicados/);
    await fail('adjust_stock',{variant_id:v.id,quantity:-1,expected_quantity:3,reason:'Conteo viejo'},/cambiaron/);
    await fail('adjust_stock',{variant_id:v.id,quantity:-1,expected_quantity:5,reason:''},/obligatorio/);
    await fail('adjust_stock',{variant_id:v.id,quantity:-6,expected_quantity:5,reason:'Ajuste negativo'},/insuficientes/);
    await as(owner);
    await command('save_settings',{business_name:'Tienda de pruebas',tax_rate:0,max_sale_discount_percent:10});
    await as(sales);
    state=await bootstrap();
    check(!('cost' in state.variants[0]),'Sales cannot see variant costs');
    check(state.documents.every(d=>d.type!=='purchase') && state.document_items.every(i=>!('unit_cost' in i)),'Sales cannot see purchases or historical cost');
    check(state.audit.length===0 && state.team.length===0,'Sales cannot see audit or team');
    await fail('adjust_stock',{variant_id:v.id,quantity:1,expected_quantity:5,reason:'Ataque'},/permiso/);
    await fail('save_product',product,/permiso/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1,expected_price:199}],payment_method:'cash',tendered:200},/precio/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],discount:21,payment_method:'cash',tendered:200},/límite/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],tax_rate:10,payment_method:'cash',tendered:220},/tasa/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],payment_method:'cash',tendered:199},/rango/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1.1}],payment_method:'cash',tendered:300},/rango/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1},{variant_id:v.id,quantity:1}],payment_method:'cash',tendered:400},/una sola vez/);
    const saleOp=randomUUID();
    const saleData={contact_id:customer.entity_id,items:[{variant_id:v.id,quantity:2,expected_price:200}],payment_method:'cash',tendered:500};
    const sale=await command('create_sale',saleData,saleOp);
    check(sale.result.total===400,'Server-calculated sale total');
    assert.deepEqual(await command('create_sale',saleData,saleOp),sale); count++;
    state=await bootstrap();
    check(state.stocks.find(s=>s.variant_id===v.id).available===3,'Sale retry does not deduct twice');
    check(state.documents.find(d=>d.id===sale.entity_id).change_amount===100,'Cash change exact');
    const quote=await command('create_quote',{items:[{variant_id:v.id,quantity:2}],expires_at:new Date(Date.now()+86400000).toISOString()});
    state=await bootstrap();
    check(state.stocks.find(s=>s.variant_id===v.id).available===3,'Quote does not reserve inventory');
    const conversion=await command('convert_quote',{id:quote.entity_id,payment_method:'card'});
    const conversion2=await command('convert_quote',{id:quote.entity_id,payment_method:'card'});
    check(conversion.entity_id===conversion2.entity_id,'Quote conversion unique across different operations');
    await command('create_sale',{items:[{variant_id:v.id,quantity:1}],payment_method:'card'});
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],payment_method:'card'},/suficientes/);
    await fail('return_sale',{id:sale.entity_id,items:[],reason:'Ataque',payment_method:'cash'},/permiso/);
    await as(owner);
    state=await bootstrap();
    const si=state.document_items.find(i=>i.document_id===sale.entity_id);
    const refundOp=randomUUID();
    const refundData={id:sale.entity_id,items:[{item_id:si.id,quantity:1,condition:'available'}],reason:'Devolución de prueba',payment_method:'cash'};
    const refund=await command('return_sale',refundData,refundOp);
    check(refund.result.total===200,'Historical refund amount');
    await command('return_sale',refundData,refundOp);
    await fail('return_sale',{...refundData,items:[{item_id:si.id,quantity:2,condition:'available'}]},/queda por devolver/);
    await fail('void_sale',{id:sale.entity_id,reason:'Intento doble'},/sin devoluciones/);
    const delivery=await command('save_delivery',{sale_id:conversion.entity_id,address:'Dirección de prueba',phone:'8095550100',contact_name:'Cliente',scheduled_at:new Date(Date.now()+3600000).toISOString()});
    const conversionItem=state.document_items.find(i=>i.document_id===conversion.entity_id);
    await fail('return_sale',{id:conversion.entity_id,items:[{item_id:conversionItem.id,quantity:1,condition:'available'}],reason:'Entrega pendiente',payment_method:'cash'},/entrega pendiente/);
    await fail('status_delivery',{id:delivery.entity_id,status:'delivered',received_by:'Cliente'},/no está permitido/);
    await command('status_delivery',{id:delivery.entity_id,status:'in_transit'});
    await fail('status_delivery',{id:delivery.entity_id,status:'failed'},/motivo/);
    await command('status_delivery',{id:delivery.entity_id,status:'failed',note:'Cliente ausente'});
    await command('status_delivery',{id:delivery.entity_id,status:'scheduled'});
    await command('status_delivery',{id:delivery.entity_id,status:'in_transit'});
    await fail('status_delivery',{id:delivery.entity_id,status:'delivered'},/quién recibió/);
    await command('status_delivery',{id:delivery.entity_id,status:'delivered',received_by:'Cliente'});
    await command('status_delivery',{id:delivery.entity_id,status:'delivered',received_by:'Cliente'});
    state=await bootstrap();
    check(state.deliveries.find(d=>d.id===delivery.entity_id).history.length===6,'Delivery history preserves failed attempt and reprogramming');
    check(state.stocks.find(s=>s.variant_id===v.id).available===1,'Delivery does not deduct inventory');
    await fail('void_sale',{id:conversion.entity_id,reason:'Entrega existente'},/entrega/);
    await as(inventory);
    await command('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:5}]});
    await fail('receive_purchase',{id:purchase.entity_id,items:[{item_id:pi.id,quantity:1}]},/recibida o cancelada/);
    state=await bootstrap();
    check(state.stocks.find(s=>s.variant_id===v.id).available===6,'Integrated ledger reconciles 3 + 7 - 5 + 1 = 6');
    await as(owner);
    state=await bootstrap();
    check(state.documents.filter(d=>d.type==='sale').reduce((n,d)=>n+d.total,0)-state.documents.filter(d=>d.type==='return').reduce((n,d)=>n+d.total,0)===800,'Net sales reconcile RD$800');
    const movementTotal=state.movements.filter(m=>m.variant_id===v.id && m.bucket==='available').reduce((n,m)=>n+m.quantity,0);
    check(movementTotal===6,'Movement ledger reconciles stock');
    // Exact historical allocation: refund the same discounted/taxed line in three portions.
    await command('save_settings',{business_name:'Tienda de pruebas',tax_rate:18,max_sale_discount_percent:10});
    const precise=await command('create_sale',{items:[{variant_id:v.id,quantity:3}],discount:1,payment_method:'card'});
    state=await bootstrap(); const preciseItem=state.document_items.find(i=>i.document_id===precise.entity_id);
    let refunded=0;
    for(let n=0;n<3;n++) refunded+=(await command('return_sale',{id:precise.entity_id,items:[{item_id:preciseItem.id,quantity:1,condition:n===0?'quarantine':'available'}],reason:'Prueba de redondeo',payment_method:'card'})).result.total;
    check(Math.round(refunded*100)===Math.round(precise.result.total*100),`Partial refunds absorb exact rounding remainder: ${refunded} vs ${precise.result.total}`);
    state=await bootstrap();
    check(state.stocks.find(s=>s.variant_id===v.id).quarantine===1,'Damaged return stays outside sellable stock');
    await fail('return_sale',{id:precise.entity_id,items:[{item_id:preciseItem.id,quantity:1,condition:'available'}],reason:'Exceso',payment_method:'card'},/más devoluciones/);
    // Promotion scope, validity and non-stacking.
    const promo=await command('save_promotion',{name:'Cupón de prueba',code:'PRUEBA',kind:'percent',value:10,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),product_ids:[p.entity_id]});
    check(Boolean(promo.entity_id),'Promotion saved');
    const promoSale=await command('create_sale',{items:[{variant_id:v.id,quantity:1}],promotion_code:'prueba',payment_method:'card'});
    check(promoSale.result.total===212.4,'Scoped promotion and tax calculated on discounted base');
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],promotion_code:'PRUEBA',discount:1,payment_method:'card'},/combinar/);
    await fail('save_promotion',{name:'Mala',kind:'percent',value:101,starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+86400000).toISOString()},/rango/);
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],promotion_code:'NOEXISTE',payment_method:'card'},/cupón/);
    // Regression: five one-cent lines previously put a two-cent discount on the final one-cent line.
    const tinyProduct=await command('save_product',{category:'Prueba centavos',brand:'Prueba',model:'Redondeo',variants:Array.from({length:5},(_,i)=>({name:`Variante ${i}`,sku:`CENT-${i}`,cost:0,price:0.01,opening_quantity:2}))});
    state=await bootstrap();
    const tinyVariants=state.variants.filter(item=>item.product_id===tinyProduct.entity_id);
    const tinyItems=tinyVariants.map(item=>({variant_id:item.id,quantity:1,expected_price:0.01}));
    const tinySale=await command('create_sale',{items:tinyItems,discount:0.02,tax_rate:18,payment_method:'card'});
    state=await bootstrap();
    const tinyLines=state.document_items.filter(item=>item.document_id===tinySale.entity_id);
    check(tinySale.result.total===0.04 && tinyLines.every(item=>item.line_total>=0 && item.discount<=0.01),'Cent-level discount never creates a negative line');
    check(Math.round(tinyLines.reduce((sum,item)=>sum+item.discount,0)*100)===2 && Math.round(tinyLines.reduce((sum,item)=>sum+item.tax,0)*100)===1,'Cumulative allocations reconcile global discount and tax exactly');
    let tinyRefundCents=0;
    for(const item of tinyLines) {
      const result=await command('return_sale',{id:tinySale.entity_id,items:[{item_id:item.id,quantity:1,condition:'available'}],reason:'Reconciliar centavos',payment_method:'card'});
      tinyRefundCents+=Math.round(result.result.total*100);
    }
    check(tinyRefundCents===4,'Individual line refunds reconcile the original cent-level sale');
    const freeSale=await command('create_sale',{items:tinyItems,discount:0.05,tax_rate:18,payment_method:'card'});
    check(freeSale.result.total===0,'Full discount has zero tax and valid zero-value lines');
    await command('save_promotion',{name:'Centavos elegibles',code:'CENTAVOS',kind:'fixed',value:0.02,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),product_ids:[tinyProduct.entity_id]});
    const scopedQuote=await command('create_quote',{items:[tinyItems[0],{variant_id:v.id,quantity:1},...tinyItems.slice(1)],promotion_code:'CENTAVOS',expires_at:new Date(Date.now()+86400000).toISOString()});
    state=await bootstrap();
    check(state.document_items.find(item=>item.document_id===scopedQuote.entity_id && item.variant_id===v.id).discount===0,'Cumulative discount excludes ineligible lines in the middle of a document');
    // Available stock is valued at its own weighted cost; quarantine is a separate unit count.
    const costProduct=await command('save_product',{category:'Prueba costos',brand:'Prueba',model:'Costo histórico',variants:[{name:'Única',sku:'COST-HISTORY',cost:100,price:300,opening_quantity:3}]});
    state=await bootstrap();
    const costVariant=state.variants.find(item=>item.product_id===costProduct.entity_id);
    const historicalSale=await command('create_sale',{items:[{variant_id:costVariant.id,quantity:3}],payment_method:'card'});
    state=await bootstrap();
    const historicalItem=state.document_items.find(item=>item.document_id===historicalSale.entity_id);
    const newPurchase=await decimalCommand('create_purchase',{contact_id:supplier.entity_id,items:[{variant_id:costVariant.id,quantity:1,unit_cost:200}]});
    state=await bootstrap();
    const newPurchaseItem=state.document_items.find(item=>item.document_id===newPurchase.entity_id);
    check(newPurchaseItem.quantity===1,'Whole JSON decimal accepted when creating a document');
    await decimalCommand('receive_purchase',{id:newPurchase.entity_id,items:[{item_id:newPurchaseItem.id,quantity:1}]});
    await decimalCommand('return_sale',{id:historicalSale.entity_id,items:[{item_id:historicalItem.id,quantity:1,condition:'available'}],reason:'Retorno apto',payment_method:'card'});
    state=await bootstrap();
    check(state.stocks.find(item=>item.variant_id===costVariant.id).available===2 && state.variants.find(item=>item.id===costVariant.id).cost===150,'Apt return restores historical cost into the available weighted average');
    await command('return_sale',{id:historicalSale.entity_id,items:[{item_id:historicalItem.id,quantity:1,condition:'quarantine'}],reason:'Retorno por daño',payment_method:'card'});
    state=await bootstrap();
    check(state.stocks.find(item=>item.variant_id===costVariant.id).quarantine===1 && state.variants.find(item=>item.id===costVariant.id).cost===150,'Quarantined return leaves available valuation unchanged');
    const mixedPurchase=await command('create_purchase',{contact_id:supplier.entity_id,items:[{variant_id:costVariant.id,quantity:2,unit_cost:300}]});
    state=await bootstrap();
    const mixedItem=state.document_items.find(item=>item.document_id===mixedPurchase.entity_id);
    await fail('receive_purchase',{id:mixedPurchase.entity_id,items:[{item_id:mixedItem.id,quantity:1.5}]},/rango/);
    await command('receive_purchase',{id:mixedPurchase.entity_id,items:[{item_id:mixedItem.id,quantity:1}]});
    state=await bootstrap();
    check(state.variants.find(item=>item.id===costVariant.id).cost===200,'Purchase average excludes quarantined units: (2×150 + 1×300) / 3');
    const voidableSale=await decimalCommand('create_sale',{items:[{variant_id:costVariant.id,quantity:1,expected_price:300}],payment_method:'card'});
    await command('receive_purchase',{id:mixedPurchase.entity_id,items:[{item_id:mixedItem.id,quantity:1}]});
    await command('void_sale',{id:voidableSale.entity_id,reason:'Anulación de prueba'});
    state=await bootstrap();
    check(state.stocks.find(item=>item.variant_id===costVariant.id).available===4 && state.variants.find(item=>item.id===costVariant.id).cost===225,'Voiding a sale restores its historical unit cost after subsequent purchases');
    await fail('return_sale',{id:historicalSale.entity_id,items:[{item_id:historicalItem.id,quantity:1.5,condition:'available'}],reason:'Fracción inválida',payment_method:'card'},/rango/);
    // Permission checks are server-side and respond to membership changes immediately.
    await as(viewer);
    state=await bootstrap();
    check(state.contacts.length===0 && state.documents.length===0 && state.deliveries.length===0,'Viewer has catalog only');
    await fail('create_sale',{items:[{variant_id:v.id,quantity:1}],payment_method:'card'},/permiso/);
    await assert.rejects(()=>db.query('select * from public.retail_variants'),/permission denied/i); count++;
    await assert.rejects(()=>db.query('update public.retail_stocks set available=999'),/permission denied/i); count++;
    await assert.rejects(()=>db.query("select retail_private.next_number('sale')"),/permission denied/i); count++;
    await assert.rejects(()=>db.query('select retail_private.revalue_available($1,1,0)',[v.id]),/permission denied/i); count++;
    await assert.rejects(()=>db.query("select retail_private.validate_product_images($1,'[]')",[p.entity_id]),/permission denied/i); count++;
    check(await scalar("select not has_function_privilege('authenticated','retail_private.check_document_totals()','EXECUTE') and not has_function_privilege('anon','retail_private.check_document_totals()','EXECUTE')"),'Totals trigger stays unavailable for direct API execution');
    await assert.rejects(()=>db.query('delete from public.retail_audit'),/permission denied/i); count++;
    check((await db.query('select * from public.retail_revision')).rows.length===1,'Member can read non-sensitive revision counter');
    await as(outsider);
    await assert.rejects(bootstrap,/permiso/); count++;
    check((await db.query('select * from public.retail_revision')).rows.length===0,'Non-member has no realtime revision access');
    await as(owner);
    await command('set_member_role',{email:'caja@example.test',role:'sales',active:false});
    await as(sales);
    await assert.rejects(bootstrap,/permiso/); count++;
    await as(null,'anon');
    await assert.rejects(bootstrap,/permission denied/i); count++;
    await db.exec('reset role');
    await assert.rejects(()=>db.query('update public.retail_documents set subtotal=subtotal+1,total=total+1 where id=$1',[sale.entity_id]),/renglones.*totales/); count++;
    await assert.rejects(()=>db.query('delete from public.retail_document_items where document_id=$1',[sale.entity_id]),/renglones.*totales|foreign key/); count++;
    await db.exec(await readFile(new URL('./retail-smoke-rollback.sql',import.meta.url),'utf8'));
    check(Number(await scalar("select count(*) from public.retail_products where category='Prueba transaccional'"))===0,'Rollback smoke leaves no fixtures');
    console.log(`Retail database: ${count} assertions passed; local PostgreSQL engine, no live data changed.`);
  } finally { await db.close(); }
});
