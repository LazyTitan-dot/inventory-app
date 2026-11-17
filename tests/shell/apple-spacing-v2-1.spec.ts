import {test,expect,saleId} from './adaptation-fixtures';

type Dimensions={left:number;right:number;top:number;bottom:number;width:number;height:number};
const rect=(el:Element):Dimensions=>{
 const r=el.getBoundingClientRect();
 return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
};
for(const [width,theme] of [[320,'light'],[375,'dark'],[390,'dark'],[430,'light']] as const){
 test('Apple-spacing V2.1 inventory cards and disclosure controls '+width+'px '+theme,
 async({page,featureData},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:844});
  await page.goto('/inventario');
  const catalog=page.getByRole('region',{name:'Catálogo de productos'});
  await expect(catalog.getByRole('heading',{name:'Catálogo',exact:true})).toBeVisible();
  const box=await catalog.evaluate(el=>{
   const panel=rect(el);
   const heading=rect(el.querySelector('.inventory-catalog-heading h2')!);
   const tax=rect(el.querySelector('.inventory-catalog-heading > span')!);
   const tabs=[...el.querySelectorAll('.catalog-filter-tabs button')].map(rect);
   const category=rect(el.querySelector('.catalog-toolbar select')!);
   return {panel,heading,tax,tabs,category,
    panelPadding:getComputedStyle(el).paddingLeft,
    firstHitHeight:tabs[0]?.height??0,
    overflow:el.scrollWidth>el.clientWidth};
  });
  expect(parseFloat(box.panelPadding)).toBeGreaterThanOrEqual(20);
  expect(box.heading.left-box.panel.left).toBeGreaterThanOrEqual(18);
  expect(box.tax.top-box.heading.bottom).toBeGreaterThanOrEqual(12);
  expect(box.tabs[0]!.left-box.panel.left).toBeGreaterThanOrEqual(18);
  expect(box.panel.right-box.tabs[1]!.right).toBeGreaterThanOrEqual(17);
  expect(box.firstHitHeight).toBeGreaterThanOrEqual(48);
  expect(box.category.height).toBeGreaterThanOrEqual(44);
  expect(box.overflow).toBe(false);
  await page.screenshot({path:testInfo.outputPath('inventory-apple-spacing-'+width+'-'+theme+'.png'),fullPage:true});

  await page.goto('/inventario?variante='+featureData.variants[0]!.id);
  const detail=page.getByRole('dialog');
  await expect(detail).toBeVisible();
  const groups=await detail.locator('.catalog-detail-disclosure').evaluateAll(nodes=>
   nodes.map(el=>({
    box:rect(el),
    summary:rect(el.querySelector('summary')!),
    padding:getComputedStyle(el.querySelector('summary')!).paddingLeft,
   }))
  );
  expect(groups.length).toBeGreaterThanOrEqual(4);
  expect(groups[1]!.box.top-groups[0]!.box.bottom).toBeGreaterThanOrEqual(12);
  expect(parseFloat(groups[0]!.padding)).toBeGreaterThanOrEqual(18);
  expect(groups[0]!.summary.height).toBeGreaterThanOrEqual(60);
  await detail.getByText('Descripción y garantía',{exact:true}).click();
  await expect(detail.getByText(/meses de garantía comercial/)).toBeVisible();
  await detail.getByText('Códigos y etiquetas',{exact:true}).click();
  await expect(detail.getByText('SKU',{exact:true})).toBeVisible();
  const buttons=detail.locator('.catalog-detail-footer .button');
  const btnBounds=await buttons.evaluateAll(nodes=>nodes.map(rect));
  for(const box of btnBounds)expect(box.height).toBeGreaterThanOrEqual(48);
  if(btnBounds.length===2)expect(btnBounds[1]!.top-btnBounds[0]!.bottom).toBeGreaterThanOrEqual(10);
  expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('product-detail-apple-spacing-'+width+'-'+theme+'.png'),fullPage:true});
 });
 test('Apple-spacing V2.1 mobile sale and payment have no edge collisions '+width+'px '+theme,
 async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});
  await page.setViewportSize({width,height:844});
  await page.goto('/ventas');
  const search=page.getByRole('textbox',{name:'Buscar productos para agregar'});
  await search.fill('TEST0001');
  await search.press('Enter');
  await page.getByRole('button',{name:'Ver pedido',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Pedido y cobro'});
  await expect(modal).toBeVisible();
  const spacing=await modal.evaluate(el=>{
   const body=el.querySelector(':scope > .modal-body')!;
   const cart=el.querySelector('.commerce-fieldset.commerce-cart')!;
   const groups=[...el.querySelectorAll('.sales-payment-tile')].map(n=>({
    ...rect(n),padding:getComputedStyle(n).paddingLeft,
    iconLeft:rect(n.querySelector('svg')!).left,
   }));
   const footer=el.querySelector(':scope > .modal-body > .modal-footer')!;
   const payment=el.querySelector('.sales-payment-options')!;
   const root=rect(el);
   return {root,body:rect(body),cart:rect(cart),payments:groups,
    footer:rect(footer),payment:rect(payment),
    bodyPadding:getComputedStyle(body).paddingLeft,
    cartPadding:getComputedStyle(cart).paddingLeft,
    footerPosition:getComputedStyle(footer).position,
    rootOverflow:el.scrollWidth>el.clientWidth,
    gridCols:getComputedStyle(el.querySelector('.sales-payment-grid')!).gridTemplateColumns};
  });
  expect(parseFloat(spacing.bodyPadding)).toBeGreaterThanOrEqual(20);
  expect(parseFloat(spacing.cartPadding)).toBeGreaterThanOrEqual(11);
  expect(spacing.payments).toHaveLength(4);
  for(const tile of spacing.payments){
   expect(parseFloat(tile.padding)).toBeGreaterThanOrEqual(14);
   expect(tile.iconLeft-tile.left).toBeGreaterThanOrEqual(13);
   expect(tile.height).toBeGreaterThanOrEqual(width<=360?60:74);
  }
  expect(spacing.footerPosition).toBe('static');
  expect(spacing.footer.top).toBeGreaterThanOrEqual(spacing.payment.bottom);
  expect(spacing.rootOverflow).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const discount=modal.getByRole('group',{name:'Tipo de descuento'});
  await discount.getByRole('button',{name:'Porcentaje %'}).click();
  await expect(discount.getByRole('button',{name:'Porcentaje %'})).toHaveAttribute('aria-pressed','true');
  await discount.getByRole('button',{name:'Importe RD$'}).click();
  await modal.getByText('Transferencia',{exact:true}).click();
  await expect(modal).toContainText('Confirma el cobro en tu terminal');
  await modal.getByText('Efectivo',{exact:true}).click();
  await modal.getByRole('button',{name:'Monto exacto',exact:true}).click();
  await expect(modal.getByRole('spinbutton',{name:'Efectivo recibido RD$',exact:true})).toHaveValue('9440.00');
  await page.screenshot({path:testInfo.outputPath('checkout-apple-spacing-'+width+'-'+theme+'.png'),fullPage:true});
 });
}
test('Apple spacing rules remain mobile screen-only; Windows and print are unaffected',async({page})=>{
 await page.setViewportSize({width:1280,height:850});
 await page.goto('/inventario');
 const panel=page.getByRole('region',{name:'Catálogo de productos'});
 const desk=await panel.evaluate(el=>getComputedStyle(el).paddingLeft);
 expect(parseFloat(desk)).toBeLessThan(30);
 await page.goto('/ventas?documento='+saleId);
 await expect(page.getByRole('dialog',{name:'VEN-PRUEBA-001'})).toBeVisible();
 await page.emulateMedia({media:'print'});
 // Printed documents are governed exclusively by their approved @media print rules.
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowX)).not.toBe('scroll');
 await expect(page.locator('.retail-print')).toContainText('VEN-PRUEBA-001');
});
