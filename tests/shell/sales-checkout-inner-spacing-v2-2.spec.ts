import {test,expect,saleId} from './adaptation-fixtures';

/* The approved Agregar producto editor puts text and controls ~20 CSS pixels
 * inside each card. Verify *measured* bounding boxes rather than stylesheet
 * declarations, because the Sales V2 mobile selector used to override padding.
 */
for(const [width,theme] of [[320,'light'],[375,'dark'],[390,'dark'],[430,'light']] as const){
 test('Ventas checkout V2.2 — inner card gutters and sections '+width+' '+theme,async({page},testInfo)=>{
   await page.emulateMedia({colorScheme:theme});
   await page.setViewportSize({width,height:844});
   await page.goto('/ventas');
   await page.getByRole('textbox',{name:'Buscar productos para agregar'}).fill('TEST0001');
   await page.getByRole('textbox',{name:'Buscar productos para agregar'}).press('Enter');
   await page.getByRole('button',{name:'Ver pedido',exact:true}).click();
   const modal=page.getByRole('dialog',{name:'Pedido y cobro'});
   await expect(modal).toBeVisible();
   const measures=await modal.evaluate(el=>{
     const bounds=(e:Element)=>{
       const r=e.getBoundingClientRect();
       return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
     };
     const card=el.querySelector('fieldset.commerce-cart')!;
     const firstTitle=card.querySelector('.commerce-cart-heading h3')!;
     const cardStyle=getComputedStyle(card);
     const fields=[...card.querySelectorAll(':scope > .field, :scope > .form-grid, :scope > .sales-section-label, :scope > .sales-payment-options, :scope > .commerce-cart-lines')]
      .map(x=>({name:x.className||x.tagName,rect:bounds(x)}));
     const discount=Array.from(card.querySelectorAll('.sales-section-label'))
      .find(x=>x.textContent?.includes('Descuentos'))!;
     const payment=Array.from(card.querySelectorAll('.sales-section-label'))
      .find(x=>x.textContent?.includes('Cobro'))!;
     const legend=card.querySelector('.sales-payment-options legend')!;
     const total=card.querySelector('.commerce-grand-total')!;
     return {
       card:bounds(card),title:bounds(firstTitle),discount:bounds(discount),
       payment:bounds(payment),legend:bounds(legend),total:bounds(total),
       fields, paddingLeft:cardStyle.paddingLeft,paddingRight:cardStyle.paddingRight,
       borderRadius:cardStyle.borderTopLeftRadius,
       overflow:card.scrollWidth>card.clientWidth+1,
       footerPosition:getComputedStyle(el.querySelector('.modal-footer')!).position
     };
   });
   const minInset=width<=360?15:19;
   expect(parseFloat(measures.paddingLeft)).toBeGreaterThanOrEqual(minInset);
   expect(parseFloat(measures.paddingRight)).toBeGreaterThanOrEqual(minInset);
   expect(measures.title.left-measures.card.left).toBeGreaterThanOrEqual(minInset);
   for(const line of [measures.discount,measures.payment,measures.legend,measures.total]){
     expect(line.left-measures.card.left).toBeGreaterThanOrEqual(minInset);
     expect(measures.card.right-line.right).toBeGreaterThanOrEqual(minInset-1);
   }
   for(const field of measures.fields){
     expect(field.rect.left-measures.card.left).toBeGreaterThanOrEqual(minInset-1);
     expect(measures.card.right-field.rect.right).toBeGreaterThanOrEqual(minInset-2);
   }
   expect(measures.overflow).toBe(false);
   expect(measures.footerPosition).toBe('static');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
   const cart=modal.locator('.commerce-cart');
   await expect(cart.getByRole('heading',{name:'Venta actual'})).toBeVisible();
   await expect(cart.getByText('Descuentos y cupón')).toBeVisible();
   await expect(cart.getByText('Cobro',{exact:true})).toBeVisible();
   await expect(cart.getByText('Total a cobrar')).toBeVisible();
   await modal.getByRole('button',{name:'Monto exacto',exact:true}).click();
   await expect(modal.getByRole('spinbutton',{name:'Efectivo recibido RD$',exact:true})).toHaveValue('9440.00');
   await modal.getByText('Transferencia',{exact:true}).click();
   await expect(modal).toContainText('Confirma el cobro en tu terminal');
   await page.screenshot({path:testInfo.outputPath('checkout-inner-spacing-v2-2-'+width+'-'+theme+'.png'),fullPage:true});
 });
}
test('Sales V2.2 leaves Windows checkout, Inventory, approved printed receipts unaffected',async({page})=>{
 await page.setViewportSize({width:1280,height:860});
 await page.goto('/ventas');
 const search=page.getByRole('textbox',{name:'Buscar productos para agregar'});
 await search.fill('TEST0001');await search.press('Enter');
 const desk=page.getByRole('region',{name:'Documento actual'});
 await expect(desk).toBeVisible();
 await expect(desk.getByText('Venta actual')).toBeVisible();
 const desktop=await desk.evaluate(el=>{
   const card=getComputedStyle(el);
   return {padding:card.paddingLeft,foreground:card.color};
 });
 expect(parseFloat(desktop.padding)).toBeGreaterThanOrEqual(12);
 await page.goto('/inventario');
 await expect(page.getByRole('heading',{name:'Inventario',exact:true})).toBeVisible();
 await page.goto('/ventas?documento='+saleId);
 const receipt=page.getByRole('dialog',{name:'VEN-PRUEBA-001'});
 await expect(receipt).toBeVisible();
 await page.emulateMedia({media:'print'});
 await expect(page.locator('.retail-print')).toContainText('VEN-PRUEBA-001');
});
