import {test,expect,saleId} from './adaptation-fixtures';

type Material = {
  background:string; border:string; radius:string; ink:string; glass:string; width:number; scrollWidth:number; clientWidth:number;
};
async function surface(page:import('@playwright/test').Page, selector:string):Promise<Material>{
 return page.locator(selector).first().evaluate(el=>{
  const style=getComputedStyle(el);
  return {background:style.backgroundImage,border:style.borderTopColor,radius:style.borderTopLeftRadius,
    ink:style.color,glass:style.getPropertyValue('--gl-hero').trim(),
    width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};
 });
}
for(const [width,theme] of [[320,'light'],[390,'dark'],[1280,'light'],[1440,'dark']] as const){
 test('Inventory Glass V2 — scoped material, catalog and editor '+width+'px '+theme,async({page,featureData},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:860});
  await page.goto('/inventario');
  const root=page.locator('.inventory-visual-v1');
  await expect(root.getByRole('heading',{name:'Inventario',exact:true})).toBeVisible();
  const header=await surface(page,'.inventory-visual-v1 .page-header.sl-glass-header');
  expect(header.background).toContain('radial-gradient');
  expect(header.glass).toContain('radial-gradient');
  const stat=await surface(page,'.inventory-visual-v1 .stat-card');
  expect(stat.radius).toBe(width<=800?'18px':'21px');
  await root.getByText('Resumen financiero del inventario',{exact:true}).click();
  await expect(root.getByText('Ganancia potencial',{exact:true})).toBeVisible();
  const summary=await surface(page,'.inventory-visual-v1 .catalog-financial-disclosure');
  expect(summary.radius).toBe('22px');
  await root.getByRole('group',{name:'Filtrar inventario'}).getByRole('button',{name:/Disponibles/}).click();
  await expect(root.getByRole('group',{name:'Filtrar inventario'}).getByRole('button',{name:/Disponibles/})).toHaveAttribute('aria-pressed','true');
  if(width<=920){
   const card=await surface(page,'.inventory-visual-v1 .catalog-mobile-product');
   expect(card.radius).toBe('21px');
   expect(card.glass).toContain('radial-gradient');
  }else{
   const table=root.locator('.catalog-desktop');
   await expect(table).toBeVisible();
   expect(await table.evaluate(el=>el.scrollWidth>=el.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('inventory-glass-v2-'+width+'-'+theme+'.png'),fullPage:true});
  await page.goto('/inventario?variante='+featureData.variants[0]!.id);
  const detail=page.getByRole('dialog');
  await expect(detail.getByRole('button',{name:'Editar ficha'})).toBeVisible();
  const detailHeader=await surface(page,'.inventory-detail-v1 .modal-heading');
  expect(detailHeader.glass).toContain('radial-gradient');
  await detail.getByRole('button',{name:'Editar ficha'}).click();
  await expect(page.getByRole('dialog',{name:'Editar producto'})).toBeVisible();
  const editorHeader=await surface(page,'.inventory-editor-v1 .modal-heading');
  expect(editorHeader.glass).toContain('radial-gradient');
 });
 test('Sales Glass V2 — cart, totals, payment and responsive focus '+width+'px '+theme,async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:860});
  await page.goto('/ventas');
  const root=page.locator('.sales-visual-v1');
  await expect(root.getByRole('heading',{name:'Ventas',exact:true})).toBeVisible();
  const header=await surface(page,'.sales-visual-v1 .page-header.sl-glass-header');
  expect(header.background).toContain('radial-gradient');
  const catalog=await surface(page,'.sales-visual-v1 .commerce-catalog');
  expect(catalog.radius).toBe('24px');
  const search=root.getByRole('textbox',{name:'Buscar productos para agregar'});
  await search.fill('TEST0001');await search.press('Enter');
  if(width<=800){
   await expect(root.getByRole('button',{name:'Ver pedido',exact:true})).toBeVisible();
   const mobileDock=await surface(page,'.sales-visual-v1 .commerce-mobile-checkout');
   expect(mobileDock.background).toContain('radial-gradient');
   expect(mobileDock.radius).toBe('24px');
   await root.getByRole('button',{name:'Ver pedido',exact:true}).click();
  }
  const cart=width<=800?page.getByRole('dialog',{name:'Pedido y cobro'}):root.getByRole('region',{name:'Documento actual'});
  await expect(cart.getByText('Venta actual',{exact:true})).toBeVisible();
  const line=await surface(page,width<=800?'.sales-checkout-v1 .commerce-cart-line':'.sales-visual-v1 .commerce-cart-line');
  expect(line.radius).toBe(width<=800?'19px':'18px');
  const qty=cart.getByRole('spinbutton',{name:'Cantidad de Nevera de prueba Blanco'});
  await expect(qty).toHaveValue('1');
  const increment=cart.getByRole('button',{name:'Aumentar Nevera de prueba Blanco'});
  expect((await increment.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await increment.click();
  await expect(qty).toHaveValue('2');
  await cart.getByRole('button',{name:'Reducir Nevera de prueba Blanco'}).click();
  await expect(qty).toHaveValue('1');
  const total=await surface(page,width<=800?'.sales-checkout-v1 .commerce-totals':'.sales-visual-v1 .commerce-cart .commerce-totals');
  expect(total.background).toContain('radial-gradient');
  const payment=await surface(page,width<=800?'.sales-checkout-v1 .sales-payment-tile':'.sales-visual-v1 .sales-payment-tile');
  expect(payment.radius).toBe('19px');
  await cart.getByRole('button',{name:'Monto exacto',exact:true}).click();
  await expect(cart.getByRole('spinbutton',{name:'Efectivo recibido RD$',exact:true})).toHaveValue('9440.00');
  await cart.getByText('Transferencia',{exact:true}).click();
  await expect(cart).toContainText('Confirma el cobro en tu terminal');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('sales-glass-v2-'+width+'-'+theme+'.png'),fullPage:true});
 });
}
test('Glass V2 does not modify receipt/PDF print media or unrelated modules',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 for(const [route,selector] of [['/clientes','.customer-workspace'],['/compras','.purchase-visual-v1'],['/','.dashboard-visual-v1']] as const){
  await page.goto(route);
  const node=page.locator(selector).first();
  if(await node.count()) expect(await node.evaluate(el=>getComputedStyle(el).getPropertyValue('--gl-hero').trim())).toBe('');
 }
 await page.goto('/ventas?documento='+saleId);
 const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await expect(detail).toBeVisible();
 const screen=await detail.evaluate(el=>getComputedStyle(el).getPropertyValue('--gl-hero').trim());
 expect(screen).toContain('radial-gradient');
 await expect(detail).toContainText('No es un comprobante fiscal');
 await page.emulateMedia({media:'print'});
 // Print layouts intentionally hide/replace dialogs. Inspect DOM directly so
 // the test asserts stylesheet isolation rather than a screen-only locator.
 const print=await page.evaluate(()=>{
   const el=document.querySelector('.sales-detail-v1');
   return el ? getComputedStyle(el).getPropertyValue('--gl-hero').trim() : '';
 });
 expect(print).toBe('');
});
