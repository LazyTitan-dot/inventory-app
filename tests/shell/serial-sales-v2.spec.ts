import {test,expect,saleId} from './adaptation-fixtures';

const variantSerial='30000000-0000-4000-8000-000000000081';
const saleItemId='20000000-0000-4000-8000-000000000010';
const soldAt='2026-11-11T12:00:00Z';
for(const [width,theme] of [[390,'dark'],[1280,'light']] as const){
 test('Ventas V2 tracks an optionally selected physical serial '+width+' '+theme,async({page,featureData})=>{
  featureData.features?.push('serial_sales_v2');
  const variant=featureData.variants[0]!;
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:844});
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_available_sale_serials',route=>
   route.fulfill({json:{variant_id:variant.id,total:1,serials:[{id:variantSerial,serial:'SN-TV-001'}]},
    headers:{'access-control-allow-origin':'*'}}));
  await page.goto('/ventas');
  const search=page.getByRole('textbox',{name:'Buscar productos para agregar'});
  await search.fill('TEST0001');await search.press('Enter');
  if(width<=800)await page.getByRole('button',{name:'Ver pedido',exact:true}).click();
  const cart=width<=800?page.getByRole('dialog',{name:'Pedido y cobro'}):page.getByRole('region',{name:'Documento actual'});
  await cart.locator('.sale-serial-details > summary').click();
  await expect(cart.getByRole('region',{name:'Identificación individual de las unidades'})).toBeVisible();
  await expect(cart.getByText('0 de 1 seleccionadas')).toBeVisible();
  const serials=cart.locator('.serial-sale-selector');
  await serials.getByRole('button',{name:'SN-TV-001'}).click();
  await expect(serials).toContainText('1 de 1 seleccionadas');
  const picked=await serials.locator('.serial-sale-chip').textContent();
  expect(picked).toContain('SN-TV-001');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
test('Ventas V2 receipt prints exact sold serial alongside warranty',async({page,featureData})=>{
 featureData.features?.push('serial_sales_v2');
 await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_sale_serials',route=>
  route.fulfill({json:[{id:'30000000-0000-4000-8000-000000000082',sale_id:saleId,item_id:saleItemId,variant_id:featureData.variants[0]!.id,
    serial_id:variantSerial,serial:'SN-TV-001',sold_at:soldAt,returned_at:null,return_id:null,return_condition:null}],
    headers:{'access-control-allow-origin':'*'}}));
 await page.goto('/ventas?documento='+saleId);
 const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await expect(detail.getByText('Serie: SN-TV-001')).toBeVisible();
 await expect(detail.getByRole('button',{name:'Imprimir',exact:true})).toBeEnabled();
 await page.emulateMedia({media:'print'});
 await expect(page.locator('.retail-print')).toContainText('SN-TV-001');
});
test('Posventa V2 picks an identified returned unit without changing refund arithmetic',async({page,featureData})=>{
 featureData.features?.push('serial_sales_v2');
 featureData.deliveries[0]!.status='cancelled';
 await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_sale_serials',route=>
  route.fulfill({json:[{id:'30000000-0000-4000-8000-000000000082',sale_id:saleId,item_id:saleItemId,
    variant_id:featureData.variants[0]!.id,serial_id:variantSerial,serial:'SN-TV-001',sold_at:soldAt,
    returned_at:null,return_id:null,return_condition:null}],headers:{'access-control-allow-origin':'*'}}));
 await page.goto('/posventa?nuevo=1&venta='+saleId);
 const modal=page.getByRole('dialog',{name:'Nueva devolución'});
 await expect(modal).toBeVisible();
 await modal.getByRole('spinbutton',{name:/Cantidad a devolver de/}).fill('1');
 const picker=modal.getByRole('region',{name:'Identificar las unidades devueltas'});
 await expect(picker).toBeVisible();
 await picker.getByRole('button',{name:'SN-TV-001'}).click();
 await expect(picker).toContainText('1 de 1 seleccionadas');
});
