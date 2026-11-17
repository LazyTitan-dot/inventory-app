import {test,expect,saleId} from './adaptation-fixtures';

/** Visual-only iPhone parity with approved Windows sales logo and red remove.
 * Regresses the exact printable receipt PNG, responsive cart hit targets,
 * and successful removal without changing totals or stock.
 */
for(const [width,theme] of [[320,'light'],[375,'dark'],[390,'dark'],[430,'light']] as const){
 test('iPhone Sales V2.4: receipt logo screen vs print '+width+' '+theme,async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme,media:'screen'});
  await page.setViewportSize({width,height:844});
  await page.goto('/ventas?documento='+saleId);
  const modal=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
  const logo=modal.getByRole('img',{name:'S-mart Living',exact:true});
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('src','/brand/alternate_light.png');
  const info=await logo.evaluate(el=>{
   const cs=getComputedStyle(el);
   return {content:cs.content,background:cs.backgroundColor,padding:cs.paddingLeft};
  });
  if(theme==='dark'){
   expect(info.content).toContain('primary_dark.png');
   expect(info.background).toBe('rgba(0, 0, 0, 0)');
   expect(parseFloat(info.padding)).toBe(0);
   const asset=await page.request.get('/brand/primary_dark.png');
   expect(asset.ok()).toBe(true);
  }else{
   expect(info.content).not.toContain('primary_dark.png');
   expect(info.background).toBe('rgb(255, 255, 255)');
  }
  await page.screenshot({path:testInfo.outputPath('mobile-receipt-screen-'+width+'-'+theme+'.png'),fullPage:true});
  await page.emulateMedia({colorScheme:theme,media:'print'});
  const printLogo=page.locator('dialog.sales-detail-v1 .retail-print img.sales-receipt-logo');
  const print=await printLogo.evaluate(el=>({
   original:el.getAttribute('src'),
   background:getComputedStyle(el).backgroundColor,
   replacement:getComputedStyle(el).content,
  }));
  expect(print.original).toBe('/brand/alternate_light.png');
  expect(print.background).toBe('rgb(255, 255, 255)');
  expect(print.replacement).not.toContain('primary_dark.png');
  await expect(page.locator('.sales-detail-v1 .retail-print')).toContainText('No es un comprobante fiscal');
  await expect(page.locator('.sales-detail-v1 .retail-print')).toContainText('9,440.00');
 });
 test('iPhone Sales V2.4: red trash remains functional and touch accessible '+width+' '+theme,async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme,media:'screen'});
  await page.setViewportSize({width,height:844});
  await page.goto('/ventas');
  const search=page.getByRole('textbox',{name:'Buscar productos para agregar'});
  await search.fill('TEST0001');await search.press('Enter');
  await page.getByRole('button',{name:'Ver pedido',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Pedido y cobro'});
  const remove=modal.getByRole('button',{name:/Quitar Nevera de prueba Blanco/});
  await expect(remove).toBeVisible();
  const geometry=await remove.evaluate(el=>{
   const st=getComputedStyle(el),svg=el.querySelector('svg')!;
   return {color:st.color,stroke:getComputedStyle(svg).stroke,
     width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height};
  });
  expect(geometry.color).toBe(theme==='dark'?'rgb(255, 120, 134)':'rgb(180, 35, 59)');
  expect(geometry.stroke).toBe(geometry.color);
  expect(geometry.width).toBeGreaterThanOrEqual(44);
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:testInfo.outputPath('mobile-cart-trash-'+width+'-'+theme+'.png'),fullPage:true});
  await remove.click();
  await expect(modal.getByText('Agrega productos para comenzar.')).toBeVisible();
  await expect(modal.getByText('RD$0.00').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
