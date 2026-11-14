import {test,expect,saleId} from './adaptation-fixtures';

for (const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'dark'],[320,'light']] as const){
 test(`Ventas V1 cashier and history ${width}px ${theme}`,async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:850});
  await page.goto('/ventas');
  const root=page.locator('.sales-visual-v1');
  await expect(root.getByRole('heading',{name:'Ventas',exact:true})).toBeVisible();
  await expect(root.locator('.sl-glass-header')).toBeVisible();
  const search=root.getByRole('textbox',{name:'Buscar productos para agregar'});
  await search.fill('TEST0001');await search.press('Enter');
  if(width<=800) await root.getByRole('button',{name:'Ver pedido',exact:true}).click();
  const cart=width<=800?page.getByRole('dialog',{name:'Pedido y cobro'}):root.getByRole('region',{name:'Documento actual'});
  await expect(cart.getByRole('spinbutton',{name:'Cantidad de Nevera de prueba Blanco'})).toHaveValue('1');
  await expect(cart.getByText('Subtotal antes de ITBIS',{exact:true})).toBeVisible();
  await cart.getByRole('button',{name:'Monto exacto',exact:true}).click();
  await expect(cart.getByRole('spinbutton',{name:'Efectivo recibido RD$',exact:true})).toHaveValue('9440.00');
  await cart.getByRole('combobox',{name:'Medio de pago',exact:true}).selectOption('transfer');
  await expect(cart).toContainText('Confirma el cobro en tu terminal');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('caja.png'),fullPage:true});
  if(width<=800)await cart.getByRole('button',{name:'Seguir agregando',exact:true}).click();
  await root.getByRole('button',{name:'Historial de ventas',exact:true}).click();
  const list=root.locator(width>920?'.sales-desktop-history':'.sales-mobile-history');
  await expect(list).toBeVisible();
  await list.getByRole('button',{name:'Ver VEN-PRUEBA-001',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001',exact:true});
  await expect(detail.getByRole('button',{name:'Imprimir',exact:true})).toBeVisible();
  await expect(detail.getByRole('button',{name:'WhatsApp',exact:true})).toBeVisible();
  await expect(detail).toContainText('No es un comprobante fiscal');
  await expect(detail.getByRole('link',{name:'Nueva venta',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('recibo.png'),fullPage:true});
 });
}
test('shared Clientes-inspired header material is present across approved modules',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 for(const route of ['/','/inventario','/compras','/clientes','/ventas']){
  await page.goto(route);
  const header=page.locator('.page-header.sl-glass-header').first();
  await expect(header).toBeVisible();
  expect(await header.evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('radial-gradient');
 }
});
test('sale detail keeps linked delivery and receipt accessible',async({page})=>{
 await page.goto(`/ventas?documento=${saleId}`);
 const dialog=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await expect(dialog.getByRole('link',{name:'Ver entrega'})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Imprimir',exact:true})).toBeVisible();
});
