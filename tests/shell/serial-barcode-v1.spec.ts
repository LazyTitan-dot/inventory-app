import { test, expect } from './adaptation-fixtures';

const stamp='2026-11-17T00:00:00Z';
const firstId='30000000-0000-4000-8000-000000000021';
for (const [width, theme] of [[320,'dark'],[390,'dark'],[1280,'light'],[1280,'dark']] as const) {
 test('identifiers V1: progressive scan entry, barcode choices and responsive glass shell '+width+'px '+theme,async({page,featureData},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:900});
  const variant=featureData.variants[0]!;
  featureData.features?.push('serial_barcode_management_v1');
  let serials=[{id:firstId,variant_id:variant.id,serial:'TV-00123',source:'manual',created_at:stamp,updated_at:stamp}];
  let codes=[{code:'TEST0001',kind:'internal',primary:true}];
  const writes: {action:string;payload:Record<string,unknown>}[]=[];
  const reply=(route:import('@playwright/test').Route,json:unknown)=>route.fulfill({json,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_identifiers',route=>{
    const body=route.request().postDataJSON() as {p_search?:string};
    const matching=serials.filter(row=>row.serial.toLowerCase().includes((body.p_search??'').toLowerCase()));
    return reply(route,{variant_id:variant.id,available:3,identified:serials.length,pending:3-serials.length,
      reconciliation:0,total_matching:matching.length,serials:matching,codes,barcode_history:[]});
  });
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command',route=>{
    const body=route.request().postDataJSON() as {p_action:string;p_payload:Record<string,unknown>;p_operation:string};
    writes.push({action:body.p_action,payload:body.p_payload});
    if(body.p_action==='add_unit_serial')serials=[...serials,{id:'30000000-0000-4000-8000-000000000022',
      variant_id:variant.id,serial:String(body.p_payload.serial),source:'manual',created_at:stamp,updated_at:stamp}];
    if(body.p_action==='manage_variant_barcode'&&body.p_payload.mode==='add'){
      codes=[...codes,{code:String(body.p_payload.code),kind:String(body.p_payload.kind),primary:false}];
    }
    return reply(route,{operation_id:body.p_operation,action:body.p_action,entity_id:variant.id,result:{}});
  });
  await page.goto('/inventario?variante='+variant.id);
  await expect(page.getByRole('dialog').getByRole('button',{name:'Gestionar series y códigos'})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Gestionar series y códigos'}).click();
  const modal=page.getByRole('dialog',{name:'Identificación',exact:true});
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Fixture Nevera de prueba', { exact: true })).toBeVisible();
  await expect(modal.getByText('SKU: '+variant.sku,{exact:false})).toBeVisible();
  const glass=await modal.evaluate(el=>{
   const heading=el.querySelector(':scope > .modal-heading')!;
   const hero=el.querySelector('.sl-identifiers-hero')!;
   const styles=getComputedStyle(el);
   return {
    width:el.getBoundingClientRect().width,
    headerBlur:getComputedStyle(heading).backdropFilter,
    heroBackground:getComputedStyle(hero).backgroundImage,
    segmentedRadius:getComputedStyle(el.querySelector('.sl-identifiers-tabs')!).borderRadius,
    canvas:styles.backgroundColor,
    overflow:el.scrollWidth>el.clientWidth,
   };
  });
  expect(glass.headerBlur).toContain('blur(');
  expect(glass.heroBackground).toContain('gradient(');
  expect(glass.segmentedRadius).toBe('999px');
  expect(glass.overflow).toBe(false);
  if(width<=760)expect(glass.width).toBeGreaterThanOrEqual(width-1);
  await page.screenshot({path:testInfo.outputPath('identifier-glass-'+width+'-'+theme+'.png')});
  await expect(modal.getByText('1 de 3 unidades identificadas')).toBeVisible();
  await expect(modal.getByText('TV-00123')).toBeVisible();
  expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await modal.getByPlaceholder('S/N del fabricante').fill('TV-00999');
  await modal.getByRole('button',{name:'Guardar número de serie'}).click();
  await expect(modal.getByText('2 de 3 unidades identificadas')).toBeVisible();
  await expect(modal.getByText('TV-00999')).toBeVisible();
  expect(writes.some(w=>w.action==='add_unit_serial'&&w.payload.serial==='TV-00999')).toBe(true);
  await modal.getByRole('button',{name:'Códigos de barras'}).click();
  await expect(modal.getByText('TEST0001')).toBeVisible();
  await modal.getByPlaceholder('Introduce o escanea el código').fill('MANUFACTURER-QR-A');
  await modal.getByRole('button',{name:'Añadir código',exact:true}).click();
  await expect(modal.getByText('MANUFACTURER-QR-A')).toBeVisible();
  expect(writes.some(w=>w.action==='manage_variant_barcode'&&w.payload.kind==='manufacturer')).toBe(true);
  expect(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 });
}
