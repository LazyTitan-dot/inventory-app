import {readFile} from 'node:fs/promises';
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

test('Ventas V1.2 long receipt produces a downloadable multipage PDF without losing pages',async({page,featureData},testInfo)=>{
 const first=featureData.document_items.find(item=>item.document_id===saleId)!;
 featureData.document_items.push(...Array.from({length:20},(_,i)=>({...first,id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,product_snapshot:{...first.product_snapshot,name:`Variante de prueba ${i+1} con descripción extensa`}})));
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto(`/ventas?documento=${saleId}`);
 const detail=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await expect(detail.locator('tbody tr')).toHaveCount(21);
 await detail.getByRole('button',{name:'Imprimir',exact:true}).click();
 const ready=detail.getByRole('region',{name:'Recibo PDF'});
 await expect(ready).toContainText('PDF preparado');
 const downloadPromise=page.waitForEvent('download');
 await ready.getByRole('link',{name:'Guardar PDF',exact:true}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('Recibo-VEN-PRUEBA-001.pdf');
 const file=await readFile((await download.path())!);
 const pdf=file.toString('latin1');
 expect(pdf.startsWith('%PDF-1.4')).toBe(true);
 const count=Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)?.[1]);
 expect(count).toBeGreaterThan(1);
 expect(pdf.match(/\/Subtype \/Image/g)?.length).toBe(count);
 const start=Number(pdf.match(/startxref\n(\d+)/)?.[1]);
 expect(pdf.slice(start,start+4)).toBe('xref');
 const entries=pdf.slice(start).split('\n').slice(3,3+2+count*3);
 for(const [index,entry] of entries.entries()){
  const offset=Number(entry.slice(0,10));
  expect(pdf.slice(offset,offset+String(index+1).length+6)).toBe(`${index+1} 0 obj`);
 }
 await testInfo.attach('recibo-multipagina',{body:file,contentType:'application/pdf'});
});

test('Ventas V1.2.1 Windows print excludes hidden app layout and creates exactly one sheet',async({page},testInfo)=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto(`/ventas?documento=${saleId}`);
 const receipt=page.locator('.sales-detail-v1 .retail-print');
 await expect(receipt).toBeVisible();
 await expect.poll(()=>receipt.locator('img.sales-receipt-logo').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 // Chromium's real PDF pagination, not merely print-media visibility.
 for(const format of ['Letter','A4'] as const){
  const pdf=await page.pdf({format,printBackground:true});
  const pageCount=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  expect(pageCount,format).toBe(1);
  await testInfo.attach(`recibo-${format}`,{body:pdf,contentType:'application/pdf'});
 }
 await page.emulateMedia({media:'print'});
 await expect(receipt).toBeVisible();
 await expect(page.locator('.sales-visual-v1 .commerce-cashier')).not.toBeVisible();
 await expect(page.locator('.sales-detail-v1 .commerce-document-actions')).not.toBeVisible();
 await expect(receipt).toContainText('9,440.00');
 await page.emulateMedia({media:'screen'});
 await expect(page.getByRole('button',{name:'Imprimir',exact:true})).toBeVisible();
});
test('Ventas V1.2.1 Windows long receipt paginates instead of clipping rows',async({page,featureData},testInfo)=>{
 const first=featureData.document_items.find(item=>item.document_id===saleId)!;
 featureData.document_items.push(...Array.from({length:32},(_,i)=>({...first,id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,product_snapshot:{...first.product_snapshot,name:`Artículo de prueba ${i+1}`}})));
 await page.setViewportSize({width:1440,height:900});
 await page.goto(`/ventas?documento=${saleId}`);
 const receipt=page.locator('.sales-detail-v1 .retail-print');
 await expect(receipt.locator('tbody tr')).toHaveCount(33);
 await expect.poll(()=>receipt.locator('img.sales-receipt-logo').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 const pdf=await page.pdf({format:'Letter',printBackground:true});
 const count=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
 expect(count).toBeGreaterThan(1);
 expect(count).toBeLessThanOrEqual(6);
 await testInfo.attach('recibo-largo-windows',{body:pdf,contentType:'application/pdf'});
});

test('Ventas V1.3 dark card and print-only customer totals', async ({page}, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/ventas?documento=' + saleId);
  const receipt=page.locator('.sales-detail-v1 .retail-print');
  const totals=receipt.locator('.commerce-totals');
  await expect(totals).toBeVisible();
  expect(await totals.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  await expect(receipt.locator('.receipt-screen-only').first()).toBeVisible();
  await expect(receipt.locator('.receipt-tax-row')).toBeVisible();
  await page.emulateMedia({media:'print',colorScheme:'dark'});
  await expect(receipt.locator('.receipt-tax-row')).not.toBeVisible();
  await expect(receipt.locator('.receipt-print-only').first()).toBeVisible();
  await expect(receipt.locator('.receipt-screen-only').first()).not.toBeVisible();
  expect(await receipt.innerText()).not.toContain('ITBIS');
  await expect(receipt.locator('.commerce-totals > div').first()).toContainText('9,440.00');
  await expect(receipt.locator('.sales-print-footer')).toBeVisible();
  const totalStyle=await receipt.locator('.commerce-grand-total').evaluate(el=>{
    const style=getComputedStyle(el);
    return {background:style.backgroundImage,color:style.color};
  });
  expect(totalStyle.background).toContain('linear-gradient');
  expect(totalStyle.color).toBe('rgb(255, 255, 255)');
  const pdf=await page.pdf({format:'A4',printBackground:true});
 const count=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  expect(count).toBe(1);
  await testInfo.attach('recibo-v1-3',{body:pdf,contentType:'application/pdf'});
});

test('Ventas V1.4 two-item iPhone receipt fits one decorated A4 PDF page', async ({page, featureData}, testInfo) => {
  const sale = featureData.documents.find(document => document.id === saleId)!;
  sale.contact_snapshot.address = 'Calle de prueba Evaristo Mejía esquina 41, Cristo Rey, Santo Domingo de Guzmán, Distrito Nacional';
  const source = featureData.document_items.find(item => item.document_id === saleId)!;
  source.product_snapshot.name = '128 GB · Usado';
  source.product_snapshot.sku = 'APPLE-IPHONE-16-128-GB-USADO-159284C35856';
  featureData.document_items.push({
    ...source,
    id: '30000000-0000-4000-8000-000000000152',
    product_snapshot: {
      ...source.product_snapshot,
      model: 'iPhone 17',
      name: '256 GB · Usado',
      sku: 'APPLE-IPHONE-17-256-GB-USADO-3D9018C779D2',
    },
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
  });
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/ventas?documento=' + saleId);
  const dialog = page.getByRole('dialog', {name: 'VEN-PRUEBA-001'});
  await expect(dialog.locator('tbody tr')).toHaveCount(2);
  await dialog.getByRole('button', {name: 'Imprimir', exact: true}).click();
  const ready = dialog.getByRole('region', {name: 'Recibo PDF'});
  await expect(ready).toContainText('PDF preparado');
  const url = await ready.getByRole('link', {name: 'Abrir PDF'}).getAttribute('href');
  const result = await page.evaluate(async (href) => {
    const b = new Uint8Array(await (await fetch(href!)).arrayBuffer());
    const pdf = new TextDecoder('latin1').decode(b);
    const jpgStart = b.findIndex((value, i) => value === 255 && b[i + 1] === 216);
    const jpgEnd = b.findIndex((value, i) => i > jpgStart && value === 255 && b[i + 1] === 217);
    const bitmap = await createImageBitmap(new Blob([b.slice(jpgStart, jpgEnd + 2)], {type: 'image/jpeg'}));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const top = ctx.getImageData(bitmap.width - 14, 13, 1, 1).data;
    const bottom = ctx.getImageData(9, bitmap.height - 14, 1, 1).data;
    const data = {pages: Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)?.[1]),
      width: bitmap.width, height: bitmap.height,
      top: Array.from(top).slice(0, 3), bottom: Array.from(bottom).slice(0, 3)};
    bitmap.close(); return data;
  }, url);
  const download = page.waitForEvent('download');
  await ready.getByRole('link', {name: 'Guardar PDF'}).click();
  const saved = await download;
  await testInfo.attach('recibo-dos-articulos-decorado', {
    body: await readFile((await saved.path())!), contentType: 'application/pdf',
  });
  expect(result.pages).toBe(1);
  expect(result).toMatchObject({width: 1190, height: 1684});
  expect(result.top[2]!).toBeGreaterThan(result.top[0]!);
  expect(result.bottom[2]!).toBeGreaterThan(result.bottom[0]!);
});
