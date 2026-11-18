import { test, expect, purchaseId } from './adaptation-fixtures';

const mobileViewports = [[320,'light'],[375,'dark'],[390,'light'],[430,'dark']] as const;

for (const [width,theme] of mobileViewports) {
  test('Compras V2 iPhone agenda, collapsible advanced filters, historical orders '+width+' '+theme, async ({page,featureData}, testInfo) => {
    const first = featureData.documents.find(doc => doc.id === purchaseId)!;
    featureData.documents.push({
      ...first,
      id: '20000000-0000-4000-8000-000000000030',
      number: 'COM-PRUEBA-002',
      status: 'received',
      created_at: '2026-11-09T12:00:00Z',
    });
    await page.setViewportSize({width,height:850});
    await page.emulateMedia({colorScheme:theme});
    await page.goto('/compras');
    const root = page.locator('.purchase-visual-v1');
    await expect(root.getByRole('heading',{name:'Compras',exact:true})).toBeVisible();
    await expect(root.locator('.purchase-kpis .stat-card')).toHaveCount(4);
    await expect(root.locator('.purchase-mobile-list .purchase-order-card')).toHaveCount(2);
    const filters = root.getByRole('button',{name:'Filtros',exact:true});
    const advanced = root.locator('#purchase-advanced-filters');
    await expect(filters).toHaveAttribute('aria-expanded','false');
    await expect(advanced).not.toBeVisible();
    await filters.click();
    await expect(filters).toHaveAttribute('aria-expanded','true');
    await expect(advanced).toBeVisible();
    await expect(root.getByRole('combobox',{name:'Filtrar compras por proveedor'})).toBeVisible();
    await expect(root.getByRole('combobox',{name:'Ordenar órdenes de compra'})).toBeVisible();
    await root.getByRole('combobox',{name:'Filtrar por estado'}).selectOption('received');
    await expect(root.locator('.purchase-mobile-list .purchase-order-card')).toHaveCount(1);
    await expect(root.getByRole('button',{name:'Filtros (1)'})).toBeVisible();
    await root.getByRole('button',{name:'Limpiar filtros'}).click();
    await expect(root.locator('.purchase-mobile-list .purchase-order-card')).toHaveCount(2);
    await root.getByRole('combobox',{name:'Ordenar órdenes de compra'}).selectOption('oldest');
    await expect(root.locator('.purchase-mobile-list .purchase-order-card').first()).toContainText('COM-PRUEBA-002');
    await root.getByRole('button',{name:'Limpiar filtros'}).click();
    const card=root.getByRole('button',{name:'Ver COM-PRUEBA-001'});
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-haspopup','dialog');
    await expect(card).not.toContainText('Ver detalle');
    await expect(card.locator('.purchase-card-open svg.lucide-chevron-right')).toHaveCount(1);
    const colors=await card.locator('.purchase-card-open').evaluate(el=>{
      const probe=document.createElement('span');
      probe.style.color='var(--sl-refined-accent)';
      el.closest('.purchase-visual-v1')!.append(probe);
      const match=getComputedStyle(el).color===getComputedStyle(probe).color;
      probe.remove();
      return match;
    });
    expect(colors).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('compras-v2-iphone-agenda-'+width+'-'+theme+'.png'),fullPage:true});
    await card.click();
    const dialog=page.getByRole('dialog',{name:'COM-PRUEBA-001'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('region',{name:'Progreso de la orden'})).toBeVisible();
    const geometry=await dialog.boundingBox();
    expect(geometry).not.toBeNull();
    expect(geometry!.width).toBeGreaterThanOrEqual(width-1);
    await expect(dialog.getByText('Volver a Compras')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('compras-v2-iphone-detail-'+width+'-'+theme+'.png'),fullPage:true});
  });
}

for (const width of [1024,1440,1920]) {
  for (const theme of ['light','dark'] as const) {
    test('Compras V2 Windows Carbon table, sorting and cyan disclosure '+width+' '+theme,async({page,featureData},testInfo)=>{
      const first=featureData.documents.find(doc=>doc.id===purchaseId)!;
      featureData.documents.push({...first,id:'20000000-0000-4000-8000-000000000031',number:'COM-PRUEBA-002',status:'received',created_at:'2026-11-09T12:00:00Z'});
      await page.setViewportSize({width,height:900});
      await page.emulateMedia({colorScheme:theme});
      await page.goto('/compras');
      const root=page.locator('.purchase-visual-v1');
      const table=root.locator('.purchase-desktop-list .purchase-table');
      await expect(table).toBeVisible();
      await expect(table.locator('thead th')).toHaveCount(6);
      await expect(table.locator('thead th').first()).toHaveCSS('position','sticky');
      await expect(table.locator('tbody tr')).toHaveCount(2);
      await expect(root.getByRole('button',{name:'Filtros',exact:true})).not.toBeVisible();
      await expect(root.getByRole('combobox',{name:'Ordenar órdenes de compra'})).toBeVisible();
      await root.getByRole('combobox',{name:'Ordenar órdenes de compra'}).selectOption('oldest');
      await expect(table.locator('tbody tr').first()).toContainText('COM-PRUEBA-002');
      await root.getByRole('combobox',{name:'Ordenar órdenes de compra'}).selectOption('recent');
      const cell=table.locator('tbody tr').first().locator('td.purchase-disclosure-cell');
      const action=cell.getByRole('button',{name:'Detalle de COM-PRUEBA-001'});
      await expect(action).toBeVisible();
      await expect(action).toHaveAttribute('aria-haspopup','dialog');
      await expect(action.locator('svg.lucide-chevron-right')).toHaveCount(1);
      await expect(action).not.toContainText('Ver detalle');
      const geometry=await action.evaluate(el=>{
        const r=el.getBoundingClientRect(),cr=el.closest('td')!.getBoundingClientRect();
        const root=el.closest('.purchase-visual-v1')!;
        const probe=document.createElement('span');probe.style.color='var(--sl-refined-accent)';root.append(probe);
        const cyan=getComputedStyle(el).color===getComputedStyle(probe).color;probe.remove();
        return {width:r.width,height:r.height,rightGap:cr.right-r.right,cyan};
      });
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.rightGap).toBeGreaterThanOrEqual(-1);
      expect(geometry.rightGap).toBeLessThan(28);
      expect(geometry.cyan).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.screenshot({path:testInfo.outputPath('compras-v2-windows-'+width+'-'+theme+'.png'),fullPage:true});
      await action.focus();
      await expect(action).toBeFocused();
      await action.press('Enter');
      const detail=page.getByRole('dialog',{name:'COM-PRUEBA-001'});
      await expect(detail).toBeVisible();
      await expect(detail.getByRole('region',{name:'Progreso de la orden'})).toBeVisible();
      const bounds=await detail.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThan(width);
    });
  }
}

for(const width of [320,390,1440]){
  test('Compras V2 creation, receipt split and scanner preserved '+width,async({page,featureData},testInfo)=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/compras?nuevo=1&variante=10000000-0000-4000-8000-000000000003&cantidad=2');
    const create=page.getByRole('dialog',{name:'Nueva orden',exact:true});
    await expect(create).toBeVisible();
    await expect(create.getByRole('combobox',{name:'Proveedor',exact:true})).toBeVisible();
    await expect(create.getByRole('button',{name:'Crear orden de compra',exact:true})).toBeVisible();
    await expect(create).toContainText('Fixture Nevera de prueba');
    if(width<=640)await expect(create.getByText('Volver a Compras')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('compras-v2-create-'+width+'.png'),fullPage:true});
    await create.getByRole('button',{name:'Cerrar ventana'}).click();
    await page.goto('/compras?documento='+purchaseId);
    const dialog=page.getByRole('dialog',{name:'COM-PRUEBA-001',exact:true});
    await expect(dialog.getByRole('region',{name:'Progreso de la orden'})).toBeVisible();
    await dialog.getByRole('button',{name:'Recibir mercancía',exact:true}).click();
    const staged=dialog.getByRole('progressbar',{name:'Progreso del conteo provisional'});
    await expect(staged).toHaveAttribute('max','4');
    await expect(staged).toHaveAttribute('value','0');
    await expect(dialog.getByRole('button',{name:'Cámara continua',exact:true})).toBeVisible();
    await dialog.getByRole('spinbutton',{name:/Recibir conformes/}).fill('2');
    await dialog.getByRole('spinbutton',{name:/Recibir dañadas/}).fill('1');
    await expect(staged).toHaveAttribute('value','3');
    await expect(dialog.locator('.purchase-count-breakdown')).toContainText('1 pendientes');
    await expect(dialog.locator('.purchase-count-breakdown')).toContainText('2 conformes');
    await expect(dialog.locator('.purchase-count-breakdown')).toContainText('1 dañadas');
    await expect(dialog.getByRole('button',{name:'Confirmar recepción'})).toBeEnabled();
    const still=featureData.document_items.find(item=>item.document_id===purchaseId)!;
    expect(still.received_quantity).toBe(1);
    expect(still.damaged_quantity).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('compras-v2-receiving-'+width+'.png'),fullPage:true});
  });
}
