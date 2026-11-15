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
  await cart.getByText('Transferencia',{exact:true}).click();
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

test('Ventas V1.1 final unit price and payment choice preserve pretax arithmetic',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/ventas');
 const root=page.locator('.sales-visual-v1');
 const search=root.getByRole('textbox',{name:'Buscar productos para agregar'});
 await search.fill('TEST0001');await search.press('Enter');
 await root.getByRole('button',{name:'Ver pedido',exact:true}).click();
 const cart=page.getByRole('dialog',{name:'Pedido y cobro'});
 const line=cart.locator('.commerce-cart-line');
 await expect(line.locator('.sales-line-price')).toContainText('9,440.00');
 await expect(line).not.toContainText('8,000.00');
 await cart.getByRole('button',{name:'Aumentar Nevera de prueba Blanco'}).click();
 await expect(line.locator('.sales-line-extended')).toContainText('18,880.00');
 await expect(cart.locator('.commerce-totals')).toContainText('16,000.00');
 const payments=cart.getByRole('group',{name:'Medio de pago'});
 await expect(payments.getByRole('radio',{name:'Efectivo',exact:true})).toBeChecked();
 for(const name of ['Tarjeta','Transferencia','Otro','Efectivo']){
  await payments.getByText(name,{exact:true}).click();
  await expect(payments.getByRole('radio',{name,exact:true})).toBeChecked();
 }
 await cart.getByRole('button',{name:'Monto exacto',exact:true}).click();
 await expect(cart.getByRole('spinbutton',{name:'Efectivo recibido RD$',exact:true})).toHaveValue('18880.00');
 const bounds=await cart.evaluate(el=>{const r=el.getBoundingClientRect();return Array.from(el.querySelectorAll('.commerce-cart-line,.sales-payment-tile,.commerce-totals,.commerce-cash,.modal-footer .button')).every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left+10&&b.right<=r.right-10&&b.width>0;});});
 expect(bounds).toBe(true);
 await expect(cart.getByRole('button',{name:/Completar venta/})).toBeVisible();
});
test('Ventas V1.1 receipt print and WhatsApp preserve document totals',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto(`/ventas?documento=${saleId}`);
 const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await expect(detail).toBeVisible();
 await page.evaluate(()=>{window.print=()=>{document.documentElement.dataset.printCalled='true';};});
 await detail.getByRole('button',{name:'Imprimir',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-print-called','true');
 await page.emulateMedia({media:'print',colorScheme:'dark'});
 // Print hides the dialog from the accessibility tree; the article remains printable.
 const receipt=page.locator('.sales-detail-v1 .retail-print');
 await expect(receipt).toBeVisible();
 await expect(receipt.locator('.sales-receipt-logo')).toBeVisible();
 await expect(receipt).toContainText('9,440.00');
 await expect(receipt).toContainText('No es un comprobante fiscal');
 await expect(page.locator('.sales-detail-v1 .commerce-document-actions')).not.toBeVisible();
 expect(await receipt.locator('table').evaluate(el=>el.scrollWidth<=el.parentElement!.clientWidth+1)).toBe(true);
 await page.emulateMedia({media:'screen',colorScheme:'dark'});
 await detail.getByRole('button',{name:'WhatsApp',exact:true}).click();
 const composer=page.getByRole('dialog',{name:'Recibo de venta por WhatsApp'});
 const message=composer.getByRole('textbox',{name:/Mensaje para el cliente/});
 await expect(message).toHaveValue(/Total original de la venta: RD\$9,440\.00/);
 const url=new URL((await composer.getByRole('link',{name:'Enviar por WhatsApp',exact:true}).getAttribute('href'))!);
 expect(url.pathname).toBe('/18095550101');
 expect(url.searchParams.get('text')).toBe(await message.inputValue());
});

test('Ventas V1.2 iPhone prepares an actual PDF and shares it only on a second tap',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
  Object.defineProperty(navigator,'canShare',{configurable:true,value:(data:ShareData)=>Boolean(data.files?.[0]?.type==='application/pdf')});
  Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{
   const file=data.files?.[0]; if(!file)throw new Error('Missing file');
   document.documentElement.dataset.sharedFile=file.name;
   document.documentElement.dataset.sharedType=file.type;
  }});
  window.print=()=>{document.documentElement.dataset.printCalled='true';};
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/ventas?documento=${saleId}`);
 const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 const logo=detail.getByRole('img',{name:'S-mart Living',exact:true});
 await expect(logo).toHaveAttribute('src','/brand/alternate_light.png');
 await expect.poll(()=>logo.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await detail.getByRole('button',{name:'Imprimir',exact:true}).click();
 const ready=detail.getByRole('region',{name:'Recibo PDF'});
 await expect(ready).toContainText('PDF preparado');
 await expect(page.locator('html')).not.toHaveAttribute('data-print-called','true');
 await expect(page.locator('html')).not.toHaveAttribute('data-shared-file',/./);
 const href=await ready.getByRole('link',{name:'Abrir PDF',exact:true}).getAttribute('href');
 expect(href).toMatch(/^blob:/);
 const pdf=await page.evaluate(async(url)=>{
  const response=await fetch(url!);const b=new Uint8Array(await response.arrayBuffer());
  const content=new TextDecoder('latin1').decode(b);
  const start=Number(content.match(/startxref\n(\d+)/)?.[1]);
  const jpegStart=b.findIndex((v,i)=>v===255&&b[i+1]===216);
  const jpegEnd=b.findIndex((v,i)=>i>jpegStart&&v===255&&b[i+1]===217);
  const bitmap=await createImageBitmap(new Blob([b.slice(jpegStart,jpegEnd+2)],{type:'image/jpeg'}));
  const result={type:response.headers.get('content-type'),header:content.slice(0,8),xref:content.slice(start,start+4),pages:content.includes('/Type /Pages /Count 1'),width:bitmap.width,height:bitmap.height};
  bitmap.close();return result;
 },href);
 expect(pdf).toEqual({type:'application/pdf',header:'%PDF-1.4',xref:'xref',pages:true,width:1190,height:1684});
 await ready.getByRole('button',{name:'Compartir / imprimir PDF'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-shared-file','Recibo-VEN-PRUEBA-001.pdf');
 await expect(page.locator('html')).toHaveAttribute('data-shared-type','application/pdf');
 await expect(ready.getByRole('link',{name:'Guardar PDF'})).toHaveAttribute('download','Recibo-VEN-PRUEBA-001.pdf');
});
test('Ventas V1.2 PDF fallback works when file sharing is unavailable on iPadOS',async({page})=>{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});
  Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:5});
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
  Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/ventas?documento=${saleId}`);
 const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await detail.getByRole('button',{name:'Imprimir',exact:true}).click();
 const ready=detail.getByRole('region',{name:'Recibo PDF'});
 await expect(ready).toContainText('PDF preparado');
 await ready.getByRole('button',{name:'Compartir / imprimir PDF'}).click();
 await expect(detail.getByRole('alert')).toContainText('no permite compartir archivos');
 await expect(ready.getByRole('link',{name:'Abrir PDF',exact:true})).toBeVisible();
 await expect(ready.getByRole('link',{name:'Guardar PDF',exact:true})).toBeVisible();
});
