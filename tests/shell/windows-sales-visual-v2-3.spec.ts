import {test,expect,saleId} from './adaptation-fixtures';

/** Exact two-surface acceptance scope:
 * 1) The dark Windows sale-detail logo must use approved navy art on-screen.
 * 2) Cart removal must appear red on Windows only.
 * Every existing PDF/print remains untouched. V2.4 extends visual parity to iPhone.
 */
for(const theme of ['dark','light'] as const){
 test('Windows sale receipt logo respects theme without changing print '+theme,async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme,media:'screen'});
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/ventas?documento='+saleId);
  const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
  const logo=detail.getByRole('img',{name:'S-mart Living',exact:true});
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src','/brand/alternate_light.png');
  const brand=await page.request.get('/brand/primary_dark.png');
  expect(brand.ok()).toBe(true);
  expect(brand.headers()['content-type']).toMatch(/image\/png/);
  const screenStyle=await logo.evaluate(el=>{
   const style=getComputedStyle(el);
   return {content:style.content,background:style.backgroundColor,padding:style.paddingLeft,display:style.display};
  });
  if(theme==='dark'){
   expect(screenStyle.content).toContain('primary_dark.png');
   expect(screenStyle.background).toBe('rgba(0, 0, 0, 0)');
   expect(parseFloat(screenStyle.padding)).toBe(0);
  }else{
   expect(screenStyle.content).not.toContain('primary_dark.png');
   expect(screenStyle.background).toBe('rgb(255, 255, 255)');
  }
  await page.screenshot({path:testInfo.outputPath('windows-receipt-screen-'+theme+'.png'),fullPage:true});

  await page.emulateMedia({media:'print',colorScheme:theme});
  // Print media hides the modal from the accessibility tree; the receipt DOM still exists.
  const printLogo=page.locator('dialog.sales-detail-v1 .retail-print img.sales-receipt-logo');
  const printStyle=await printLogo.evaluate(el=>{
   const style=getComputedStyle(el);
   return {content:style.content,background:style.backgroundColor,src:(el as HTMLImageElement).getAttribute('src')};
  });
  expect(printStyle.content).not.toContain('primary_dark.png');
  expect(printStyle.background).toBe('rgb(255, 255, 255)');
  expect(printStyle.src).toBe('/brand/alternate_light.png');
  const receipt=page.locator('.sales-detail-v1 .retail-print');
  await expect(receipt).toContainText('9,440.00');
  await expect(receipt).toContainText('No es un comprobante fiscal');
 });
 test('Windows cart remove is red and remains functional '+theme,async({page})=>{
  await page.emulateMedia({colorScheme:theme,media:'screen'});
  await page.setViewportSize({width:1280,height:850});
  await page.goto('/ventas');
  const search=page.getByRole('textbox',{name:'Buscar productos para agregar'});
  await search.fill('TEST0001');await search.press('Enter');
  const cart=page.getByRole('region',{name:'Documento actual'});
  await expect(cart.getByRole('spinbutton',{name:'Cantidad de Nevera de prueba Blanco'})).toHaveValue('1');
  const remove=cart.getByRole('button',{name:/Quitar Nevera de prueba Blanco/});
  await expect(remove).toBeVisible();
  const computed=await remove.evaluate(el=>{
   const style=getComputedStyle(el);
   const svg=el.querySelector('svg')!;
   return {button:style.color,icon:getComputedStyle(svg).stroke,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width};
  });
  const channels=computed.icon.match(/[\d.]+/g)?.map(Number)||[];
  expect(channels.length).toBeGreaterThanOrEqual(3);
  expect(channels[0]!).toBeGreaterThan(channels[1]!);
  expect(channels[0]!).toBeGreaterThan(channels[2]!);
  expect(computed.height).toBeGreaterThanOrEqual(30);
  expect(computed.width).toBeGreaterThanOrEqual(30);
  await remove.click();
  await expect(cart.getByText('Agrega productos para comenzar.')).toBeVisible();
  await expect(cart.getByRole('spinbutton',{name:'Cantidad de Nevera de prueba Blanco'})).toHaveCount(0);
  const total = cart.locator('.commerce-grand-total');
  await expect(total.getByText('Total a cobrar', {exact:true})).toBeVisible();
  await expect(total.getByText('RD$0.00', {exact:true})).toBeVisible();
 });
}
test('iPhone dark uses approved navy logo and red cart remove without print changes',async({page})=>{
 await page.emulateMedia({colorScheme:'dark',media:'screen'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/ventas?documento='+saleId);
 const logo=page.getByRole('dialog',{name:'VEN-PRUEBA-001'})
   .getByRole('img',{name:'S-mart Living',exact:true});
 await expect(logo).toHaveAttribute('src','/brand/alternate_light.png');
 expect(await logo.evaluate(el=>getComputedStyle(el).content)).toContain('primary_dark.png');
 await page.emulateMedia({media:'print',colorScheme:'dark'});
 const logoInPrint=page.locator('dialog.sales-detail-v1 .retail-print img.sales-receipt-logo');
 expect(await logoInPrint.evaluate(el=>getComputedStyle(el).content)).not.toContain('primary_dark.png');
 await expect(logoInPrint).toHaveAttribute('src','/brand/alternate_light.png');
 await page.emulateMedia({media:'screen',colorScheme:'dark'});
 await page.goto('/ventas');
 const search=page.getByRole('textbox',{name:'Buscar productos para agregar'});
 await search.fill('TEST0001');await search.press('Enter');
 await page.getByRole('button',{name:'Ver pedido',exact:true}).click();
 const remove=page.getByRole('dialog',{name:'Pedido y cobro'}).getByRole('button',{name:/Quitar Nevera de prueba Blanco/});
 await expect(remove).toBeVisible();
 const style=await remove.evaluate(el=>getComputedStyle(el).color);
 expect(style).toBe('rgb(255, 120, 134)');
});
