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

test('Entregas V1 state confirmation preserves version, receiver and proof payload',async({page,featureData})=>{
 featureData.deliveries[0]!.status='in_transit';
 await page.goto(`/entregas?documento=${deliveryId}`);
 await page.getByRole('button',{name:'Confirmar entrega',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Confirmar entrega'});
 await form.getByRole('textbox',{name:'Nombre de quien recibió'}).fill('Receptor de prueba');
 await form.getByRole('textbox',{name:'Constancia de recepción'}).fill('Mercancía verificada');
 let payload:Record<string,unknown>|undefined;
 await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command',async route=>{
  payload=route.request().postDataJSON();
  await route.fulfill({status:400,json:{code:'P0001',message:'Prueba de confirmación.'},headers:{'access-control-allow-origin':'*'}});
 });
 await form.getByRole('button',{name:'Confirmar entrega',exact:true}).click();
 await expect(form.getByRole('alert')).toContainText('Prueba de confirmación');
 expect(payload?.p_payload).toMatchObject({id:deliveryId,expected_updated_at:featureData.deliveries[0]!.updated_at,status:'delivered',received_by:'Receptor de prueba',proof:'Mercancía verificada'});
 await expect(form.getByRole('textbox',{name:'Constancia de recepción'})).toHaveValue('Mercancía verificada');
});
test('Entregas V1 terminal states keep history and do not expose mutation actions',async({page,featureData})=>{
 featureData.deliveries[0]!.status='delivered';
 await page.goto(`/entregas?documento=${deliveryId}`);
 const detail=page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'});
 await expect(detail.getByRole('region',{name:'Historial de entrega'})).toBeVisible();
 await expect(detail.getByRole('button',{name:'Iniciar entrega',exact:true})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'Editar / reprogramar'})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'Cancelar entrega'})).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'WhatsApp',exact:true})).toHaveCount(1);
});

test('Entregas V1.1 priority, dates, status pills and timeline preserve order and data',async({page,featureData})=>{
 const first=featureData.deliveries[0]!;
 first.scheduled_at=new Date(Date.now()+86400000).toISOString();
 featureData.deliveries.push(
  {...first,id:'20000000-0000-4000-8000-000000000011',contact_name:'En ruta prueba',status:'in_transit',scheduled_at:new Date(Date.now()+3600000).toISOString()},
  {...first,id:'20000000-0000-4000-8000-000000000012',contact_name:'Entregada prueba',status:'delivered',scheduled_at:'2025-01-01T12:00:00Z'},
  {...first,id:'20000000-0000-4000-8000-000000000013',contact_name:'Fallida prueba',status:'failed',scheduled_at:new Date(Date.now()-3600000).toISOString()}
 );
 first.history=[
  {at:'2026-11-11T12:00:00Z',actor:featureData.profile.id,status:'scheduled',note:'Coordinada'},
  {at:'2026-11-11T13:00:00Z',actor:featureData.profile.id,status:'in_transit',note:'Salida registrada'},
  {at:'2026-11-11T14:00:00Z',actor:featureData.profile.id,status:'failed',note:'Sin respuesta'},
  {at:'2026-11-11T15:00:00Z',actor:featureData.profile.id,status:'scheduled',note:'Reprogramada'}
 ];
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/entregas');
 const root=page.locator('.delivery-visual-v1'), rows=root.locator('.delivery-desktop-table tbody tr');
 await expect(rows).toHaveCount(4);
 await expect(rows.first()).toContainText('En ruta prueba');
 await expect(rows.nth(1)).toContainText('Fallida prueba');
 await expect(rows.last()).toContainText('Entregada prueba');
 await root.getByRole('combobox',{name:'Ordenar entregas'}).selectOption('date_asc');
 await expect(rows.first()).toContainText('Entregada prueba');
 await root.getByRole('combobox',{name:'Ordenar entregas'}).selectOption('date_desc');
 await expect(rows.first()).toContainText('Cliente de prueba');
 await root.getByRole('combobox',{name:'Ordenar entregas'}).selectOption('status');
 await expect(rows.first()).toContainText('En ruta prueba');
 const filters=root.getByRole('group',{name:'Filtrar entregas por estado'});
 await filters.getByRole('button',{name:'En camino',exact:true}).click();
 await expect(rows).toHaveCount(1);
 await expect(rows.first()).toContainText('En ruta prueba');
 await expect(filters.getByRole('button',{name:'En camino',exact:true})).toHaveAttribute('aria-pressed','true');
 await filters.getByRole('button',{name:'Programada',exact:true}).click();
 await rows.getByRole('button',{name:'Ver entrega a Cliente de prueba'}).click();
 const history=page.getByRole('region',{name:'Historial de entrega'});
 await expect(history.locator('.delivery-event-timeline li')).toHaveCount(4);
 await expect(history.locator('.delivery-event-timeline li').first()).toContainText('Coordinada');
 await expect(history.locator('.delivery-event-timeline li').last()).toContainText('Reprogramada');
 await expect(history.locator('.delivery-event-icon svg')).toHaveCount(4);
});
