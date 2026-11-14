import { test, expect, purchaseId } from './adaptation-fixtures';

for (const [width,theme] of [[390,'dark'],[1440,'light'],[1024,'dark'],[320,'light']] as const) {
  test(`Compras V1 layout and receipt progress ${width}px ${theme}`, async ({ page, featureData }, testInfo) => {
    const doc = featureData.documents.find(d => d.id === purchaseId)!;
    const item = featureData.document_items.find(i => i.document_id === purchaseId)!;
    item.damaged_quantity = 1;
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/compras');
    const root = page.locator('.purchase-visual-v1');
    await expect(root.getByRole('heading', { name: 'Compras', exact: true })).toBeVisible();
    await expect(root.locator('.purchase-kpis .stat-card')).toHaveCount(4);
    const list = root.locator(width > 920 ? '.purchase-desktop-list' : '.purchase-mobile-list');
    await expect(list).toBeVisible();
    await expect(list.getByText('1 / 5', { exact: true })).toBeVisible();
    await expect(list.getByText('4 pendientes', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('compras.png'),fullPage:true});
    await list.getByRole('button', {name:`Ver ${doc.number}`,exact:true}).click();
    const dialog = page.getByRole('dialog', {name:doc.number,exact:true});
    await expect(dialog.getByRole('region',{name:'Progreso de la orden'})).toContainText('Dañadas registradas');
    await expect(dialog.getByRole('button',{name:'Recibir mercancía',exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('detalle.png'),fullPage:true});
    await dialog.getByRole('button',{name:'Recibir mercancía',exact:true}).click();
    await expect(dialog.getByRole('progressbar',{name:'Progreso del conteo provisional'})).toHaveAttribute('max','4');
    await expect(dialog.getByRole('button',{name:'Cámara continua',exact:true})).toBeVisible();
    await dialog.getByRole('spinbutton',{name:/Recibir conformes/}).fill('2');
    await dialog.getByRole('spinbutton',{name:/Recibir dañadas/}).fill('1');
    await expect(dialog.getByRole('progressbar',{name:'Progreso del conteo provisional'})).toHaveAttribute('value','3');
    await page.screenshot({path:testInfo.outputPath('recepcion.png'),fullPage:true});
  });
}
test('purchase creation retains supplier, unit cost and exact variant prefill', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/compras?nuevo=1&variante=10000000-0000-4000-8000-000000000003&cantidad=2');
  const dialog=page.getByRole('dialog',{name:'Nueva orden',exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox',{name:'Proveedor',exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Crear orden de compra',exact:true})).toBeVisible();
  await expect(dialog).toContainText('Fixture Nevera de prueba');
});
