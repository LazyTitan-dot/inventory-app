import { test, expect, supplierId } from './adaptation-fixtures';

for (const [width,theme] of [[320,'dark'],[375,'light'],[390,'dark'],[430,'light'],[1024,'light'],[1440,'dark']] as const) {
  test('Proveedores V1 preserved behavior and responsive Glass ' + width + ' ' + theme, async ({page,featureData},testInfo) => {
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({colorScheme:theme});
    const supplier=featureData.contacts.find(c=>c.id===supplierId)!;
    supplier.name='Distribuidora de Electrodomésticos Internacional del Caribe SRL';
    supplier.address='Avenida prolongada de servicio comercial, Santiago de los Caballeros';
    supplier.notes='Indicaciones de compra y recepción conservadas';
    featureData.contacts.push({...supplier,id:'20000000-0000-4000-8000-000000000099',name:'Proveedor archivado',active:false});
    await page.goto('/proveedores');
    const main=page.locator('.supplier-workspace');
    await expect(main.getByRole('heading',{name:'Proveedores'})).toBeVisible();
    await expect(main.getByRole('button',{name:'Agregar proveedor'})).toBeVisible();
    await expect(main.getByRole('button',{name:'Exportar'})).toBeVisible();
    await expect(main.getByRole('combobox',{name:'Estado de los contactos'})).toHaveValue('active');
    await expect(main).toContainText('1 proveedores');
    const header=main.locator('.page-header');
    expect((await header.evaluate(el=>getComputedStyle(el).backgroundImage))).toContain('gradient');
    if(width<=760) {
      const card=main.locator('.supplier-mobile-card').first();
      await expect(card).toBeVisible();
      await expect(main.locator('.supplier-table-wrap')).toBeHidden();
      await expect(card.locator('.supplier-chevron')).toBeVisible();
      const dims=await card.evaluate(el=>{const rect=el.getBoundingClientRect();return {left:rect.left,right:rect.right,viewport:innerWidth}});
      expect(dims.left).toBeGreaterThanOrEqual(0);
      expect(dims.right).toBeLessThanOrEqual(width+1);
      await card.getByRole('button',{name:/Ver perfil de Distribuidora/}).click();
    } else {
      await expect(main.locator('.supplier-mobile-list')).toBeHidden();
      await expect(main.locator('.supplier-data-table')).toBeVisible();
      await expect(main.locator('.supplier-data-table thead')).toContainText('Identificación');
      await main.locator('.supplier-data-table').getByRole('button',{name:/Ver perfil de Distribuidora/}).click();
    }
    const detail=page.getByRole('dialog',{name:supplier.name,exact:true});
    await expect(detail).toBeVisible();
    await expect(detail.locator('.supplier-hero-name')).toHaveText(supplier.name);
    await expect(detail.getByRole('link',{name:'Nueva compra'})).toHaveAttribute('href',new RegExp('compras\\?contacto='+supplierId));
    await expect(detail).toContainText('Historial de operaciones');
    await expect(detail).toContainText('COM-PRUEBA-001');
    await expect(detail).toContainText('Indicaciones de compra');
    if(width<=760){
      const dimensions=await detail.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,screen:innerHeight}));
      expect(dimensions.width).toBeCloseTo(width,0);
      expect(dimensions.height).toBeCloseTo(dimensions.screen,0);
      await expect(detail.getByText('Volver a Proveedores')).toBeVisible();
      const bounds=await detail.locator('.customer-profile-summary').boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(15);
    }
    await page.screenshot({path:testInfo.outputPath('supplier-v1-detail-'+width+'-'+theme+'.png'),fullPage:true});
    await detail.getByRole('button',{name:'Editar datos'}).click();
    const editor=page.getByRole('dialog',{name:'Editar proveedor'});
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('textbox',{name:'Nombre del proveedor'})).toHaveValue(supplier.name);
    await expect(editor).toContainText('Información adicional');
    await expect(editor.getByRole('button',{name:'Guardar'})).toBeVisible();
    if(width<=760){
      await expect(editor.getByText('Volver a Proveedores')).toBeVisible();
      const dims=await editor.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,screen:innerHeight}));
      expect(dims.width).toBeCloseTo(width,0);
      expect(dims.height).toBeCloseTo(dims.screen,0);
    }
    await page.screenshot({path:testInfo.outputPath('supplier-v1-editor-'+width+'-'+theme+'.png'),fullPage:true});
    await editor.getByRole('button',{name:'Cancelar'}).click();
    await expect(detail).toBeVisible();
    await detail.getByRole('button',{name:'Cerrar ventana'}).click();
    await main.getByRole('combobox',{name:'Estado de los contactos'}).selectOption('archived');
    await expect(main).toContainText('Proveedor archivado');
    if(width<=760)await expect(main.locator('.supplier-mobile-card')).toHaveCount(1);
    else await expect(main.locator('.supplier-data-table tbody tr')).toHaveCount(1);
    await main.getByRole('combobox',{name:'Estado de los contactos'}).selectOption('active');
    await main.getByRole('button',{name:'Agregar proveedor'}).click();
    const creator=page.getByRole('dialog',{name:'Agregar proveedor'});
    await expect(creator).toBeVisible();
    await expect(creator.getByRole('textbox',{name:'Nombre del proveedor'})).toBeVisible();
    await expect(creator.getByRole('textbox',{name:'Teléfono'})).toBeVisible();
    await expect(creator.getByRole('textbox',{name:'Correo electrónico'})).toBeVisible();
    await expect(creator.getByRole('textbox',{name:'RNC o cédula'})).toBeVisible();
    await expect(creator.getByRole('textbox',{name:'Dirección'})).toBeVisible();
    await expect(creator.getByRole('textbox',{name:'Notas internas'})).toBeVisible();
    await creator.getByRole('button',{name:'Cancelar'}).click();
  });
}

test('Proveedores V1 remains permission gated and Clientes V2.1 unchanged',async({page,featureData})=>{
  featureData.permissions.purchase=false;
  await page.goto('/proveedores');
  await expect(page).not.toHaveURL(/proveedores/);
  await page.goto('/clientes');
  await expect(page.locator('.customer-workspace')).toBeVisible();
  await expect(page.locator('.supplier-workspace')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Clientes'})).toBeVisible();
});
