import { test, expect, deliveryId } from './adaptation-fixtures';

/** Responsive visual acceptance in isolated mocked browser; never calls production. */
for (const [width, theme] of [[320,'light'],[375,'dark'],[390,'light'],[430,'dark']] as const) {
  test('Entregas refinement V1: mobile filters and 4 operational KPIs '+width+' '+theme, async ({page,featureData},testInfo) => {
    const first=featureData.deliveries[0]!;
    featureData.deliveries.push(
      {...first,id:'20000000-0000-4000-8000-000000000025',contact_name:'Cliente entregado',status:'delivered',scheduled_at:'2026-11-10T16:00:00Z'},
      {...first,id:'20000000-0000-4000-8000-000000000026',contact_name:'Cliente intento fallido',status:'failed',scheduled_at:'2026-11-11T16:00:00Z'}
    );
    await page.setViewportSize({width,height:850});
    await page.emulateMedia({colorScheme:theme});
    await page.goto('/entregas');
    const root=page.locator('.delivery-visual-v1');
    const metrics=root.locator('.delivery-kpis .delivery-metric');
    await expect(metrics).toHaveCount(4);
    await expect(metrics.nth(2)).toContainText('Requieren atención');
    await expect(metrics.nth(2).locator('strong')).toHaveText('2');
    await expect(metrics.nth(3)).toContainText('Entregadas');
    await expect(metrics.nth(3).locator('strong')).toHaveText('1');
    const toggle=root.getByRole('button',{name:'Filtros',exact:true});
    await expect(toggle).toHaveAttribute('aria-expanded','false');
    const statuses=root.getByRole('group',{name:'Filtrar entregas por estado'});
    await expect(statuses).not.toBeVisible();
    await toggle.click();
    await expect(root.getByRole('button',{name:'Filtros',exact:true})).toHaveAttribute('aria-expanded','true');
    await expect(statuses).toBeVisible();
    await statuses.getByRole('button',{name:'Entregada',exact:true}).click();
    await expect(root.locator('.delivery-card-list .delivery-list-card')).toHaveCount(1);
    await expect(root.locator('.delivery-card-list')).toContainText('Cliente entregado');
    await expect(root.getByRole('button',{name:'Filtros (1)'})).toBeVisible();
    await root.getByRole('combobox',{name:'Ordenar entregas'}).selectOption('date_desc');
    await expect(root.getByRole('button',{name:'Filtros (2)'})).toBeVisible();
    await root.getByRole('button',{name:'Limpiar filtros'}).click();
    await expect(root.locator('.delivery-card-list .delivery-list-card')).toHaveCount(3);
    await expect(root.getByRole('button',{name:'Filtros',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('mobile-agenda-'+width+'-'+theme+'.png'),fullPage:true});
  });

  test('Entregas refinement V1: full-screen detail, usable actions, history and back '+width+' '+theme, async ({page},testInfo) => {
    await page.setViewportSize({width,height:850});
    await page.emulateMedia({colorScheme:theme});
    await page.goto('/entregas?documento='+deliveryId);
    const detail=page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'});
    await expect(detail).toBeVisible();
    const box=await detail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(width-1);
    expect(box!.height).toBeGreaterThanOrEqual(849);
    await expect(detail).toHaveCSS('border-radius','0px');
    await expect(detail.locator('.delivery-overview-sale')).toHaveText('VEN-PRUEBA-001');
    await expect(detail.getByText('Volver a Entregas')).toBeVisible();
    await expect(detail.getByRole('link',{name:'Ver destino en Maps'})).toHaveAttribute('href',/google\.com\/maps\/search/);
    await expect(detail.getByRole('link',{name:'Llamar'})).toHaveAttribute('href','tel:8095550101');
    await expect(detail.getByRole('button',{name:'WhatsApp',exact:true})).toBeVisible();
    await expect(detail.getByRole('region',{name:'Artículos de la entrega'})).toBeVisible();
    await expect(detail.getByRole('region',{name:'Historial de entrega'})).toContainText('Entrega programada');
    await expect(detail.getByRole('button',{name:'Iniciar entrega',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('mobile-detail-'+width+'-'+theme+'.png'),fullPage:true});
    await detail.getByRole('button',{name:'Cerrar ventana'}).click();
    await expect(detail).not.toBeVisible();
    await expect(page).toHaveURL(/\/entregas$/);
  });
}

for (const width of [1024,1440,1920]) {
  test('Entregas refinement V1: Windows table, sticky heading, filters and drawer '+width,async ({page,featureData},testInfo)=>{
    const first=featureData.deliveries[0]!;
    featureData.deliveries.push({...first,id:'20000000-0000-4000-8000-000000000027',contact_name:'Otra entrega',status:'delivered',scheduled_at:'2026-11-11T14:00:00Z'});
    await page.setViewportSize({width,height:900});
    await page.goto('/entregas');
    const root=page.locator('.delivery-visual-v1');
    const table=root.locator('.delivery-desktop-table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th')).toHaveCount(6);
    await expect(table.locator('thead th').nth(1)).toContainText('Fecha y hora');
    await expect(table.locator('thead th').nth(4)).toContainText('Asignado a');
    await expect(table.locator('thead th').first()).toHaveCSS('position','sticky');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.locator('tbody time')).toHaveCount(2);
    await expect(root.getByRole('button',{name:'Filtros',exact:true})).not.toBeVisible();
    const status=root.getByRole('group',{name:'Filtrar entregas por estado'});
    await expect(status).toBeVisible();
    await status.getByRole('button',{name:'Entregada',exact:true}).click();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await root.getByRole('button',{name:'Limpiar filtros'}).click();
    await table.getByRole('button',{name:'Ver entrega a Cliente de prueba'}).click();
    const detail=page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'});
    await expect(detail).toBeVisible();
    await expect(detail.locator('.delivery-overview-sale')).toHaveText('VEN-PRUEBA-001');
    await expect(detail.getByRole('region',{name:'Historial de entrega'})).toBeVisible();
    const bounds=await detail.boundingBox();
    expect(bounds!.width).toBeLessThan(width);
    expect(bounds!.height).toBeGreaterThanOrEqual(899);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('windows-delivery-'+width+'.png'),fullPage:true});
  });
}
