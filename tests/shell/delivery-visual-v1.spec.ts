import { test, expect, deliveryId, availableSaleId } from './adaptation-fixtures';

for(const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'dark'],[320,'light']] as const){
 test(`Entregas V1 agenda and destination ${width}px ${theme}`,async({page,featureData},testInfo)=>{
  featureData.deliveries[0]!.scheduled_at=new Date(Date.now()-60*60*1000).toISOString();
  await page.setViewportSize({width,height:850});
  await page.emulateMedia({colorScheme:theme});
  await page.goto('/entregas');
  const root=page.locator('.delivery-visual-v1');
  await expect(root.getByRole('heading',{name:'Entregas',exact:true})).toBeVisible();
  await expect(root.locator('.sl-glass-header')).toBeVisible();
  await expect(root.locator('.delivery-kpis .stat-card')).toHaveCount(4);
  await root.getByRole('button',{name:'Requieren atención',exact:true}).click();
  await expect(root.getByRole('button',{name:'Requieren atención',exact:true})).toHaveAttribute('aria-pressed','true');
  const list=root.locator(width>920?'.delivery-desktop-table':'.delivery-card-list');
  await expect(list).toBeVisible();
  await expect(list).toContainText('Hora vencida');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('agenda.png'),fullPage:true});
  await list.getByRole('button',{name:'Ver entrega a Cliente de prueba'}).click();
  const detail=page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'});
  await expect(detail).toContainText('Destino original de la entrega');
  await expect(detail).not.toContainText('Dirección nueva del perfil');
  await expect(detail.getByRole('link',{name:'Ver destino en Maps'})).toHaveAttribute('href',/https:\/\/www\.google\.com\/maps\/search\//);
  await expect(detail.getByRole('link',{name:'Llamar'})).toHaveAttribute('href','tel:8095550101');
  await expect(detail.getByRole('region',{name:'Historial de entrega'})).toContainText('Entrega programada');
  await expect(detail.getByRole('button',{name:'Iniciar entrega',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('destino.png'),fullPage:true});
  await detail.getByRole('button',{name:'Editar / reprogramar'}).click();
  const editor=page.getByRole('dialog',{name:'Editar o reprogramar entrega'});
  await expect(editor).toContainText('Horario anterior');
  await expect(editor.getByRole('textbox',{name:'Calle y número'})).toHaveValue('Destino original de la entrega');
  await page.screenshot({path:testInfo.outputPath('programacion.png'),fullPage:true});
 });
}
test('Entregas V1 preferred address and existing sale context',async({page})=>{
 await page.goto(`/entregas?nuevo=1&venta=${availableSaleId}`);
 const editor=page.getByRole('dialog',{name:'Programar entrega'});
 await expect(editor.getByRole('textbox',{name:'Calle y número'})).toHaveValue('Dirección nueva del perfil');
 await expect(editor.getByRole('heading',{name:'Contacto y destino'})).toBeVisible();
 await expect(editor.getByRole('heading',{name:'Programación',exact:true})).toBeVisible();
});
test('Entregas V1 confirmation and failed status require the existing fields',async({page,featureData})=>{
 featureData.deliveries[0]!.status='in_transit';
 await page.goto(`/entregas?documento=${deliveryId}`);
 await page.getByRole('button',{name:'Confirmar entrega',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Confirmar entrega'});
 await expect(form.getByRole('textbox',{name:'Nombre de quien recibió'})).toHaveAttribute('required','');
 await expect(form.getByRole('textbox',{name:'Constancia de recepción'})).toHaveAttribute('required','');
 await form.getByRole('button',{name:'Volver al detalle'}).click();
 await page.getByRole('button',{name:'Registrar intento fallido'}).click();
 await expect(page.getByRole('dialog',{name:'Registrar intento fallido'}).getByRole('textbox',{name:'Motivo del cambio'})).toHaveAttribute('required','');
});
