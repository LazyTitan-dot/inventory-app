import { test, expect } from './adaptation-fixtures';

for (const [width, theme] of [[320, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']] as const) {
  test(`inventory V1 layout and stock comparison at ${width}px ${theme}`, async ({ page, featureData }, testInfo) => {
    featureData.stocks[0]!.quarantine = 2;
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/inventario');
    const catalog = page.locator('.inventory-visual-v1');
    await expect(catalog.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
    await expect(catalog.getByRole('button', { name: 'Escanear código', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('inventory-catalog.png'), fullPage: true });
    if (width > 920) {
      const table = catalog.locator('.catalog-desktop');
      await expect(table.getByRole('columnheader', { name: 'En revisión' })).toBeVisible();
      await expect(table.getByRole('row').filter({ hasText: 'Fixture Nevera de prueba' }).getByRole('cell', { name: '2', exact: true }).first()).toBeVisible();
      await table.locator('.inventory-action-trigger').first().click();
      await expect(table.getByRole('button', { name: 'Editar', exact: true }).first()).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      await expect(catalog.locator('.catalog-mobile-product').first()).toBeVisible();
      await expect(catalog.locator('.catalog-mobile-product').first()).toContainText('2 en revisión');
    }
    await catalog.getByText('Resumen financiero del inventario', { exact: true }).click();
    await expect(catalog.getByText('Ganancia potencial', { exact: true })).toBeVisible();
    await page.goto(`/inventario?variante=${featureData.variants[0]!.id}`);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Fixture Nevera de prueba' })).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('inventory-detail.png'), fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Editar ficha', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Editar producto' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('inventory-editor.png'), fullPage: true });
  });
}

test('desktop V1.1 action popover stays inside the viewport without resizing rows', async ({ page, featureData }) => {
  const seed = featureData.variants[0]!;
  for (let i = 1; i <= 16; i++) {
    const id = `10000000-0000-4000-8000-${String(100 + i).padStart(12,'0')}`;
    featureData.variants.push({ ...seed, id, name: `Variante ${String(i).padStart(2,'0')}`, sku: `FIXTURE-${i+1}`, barcode: `TEST${i+1}` });
    featureData.stocks.push({ ...featureData.stocks[0]!, variant_id: id });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/inventario');
  const table = page.locator('.catalog-desktop');
  const trigger = table.locator('.inventory-action-trigger').last();
  await trigger.scrollIntoViewIfNeeded();
  const row = table.locator('tbody tr').last();
  const before = await row.boundingBox();
  await trigger.click();
  const popover = table.locator('.inventory-actions-popover:popover-open');
  await expect(popover).toBeVisible();
  const box = (await popover.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect((await row.boundingBox())!.height).toBe(before!.height);
  await expect(popover.getByRole('button', { name: 'Ver ficha', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(popover).toBeVisible();
  await trigger.click();
  await expect(popover).toHaveCount(0);
  await trigger.click();
  await popover.getByRole('button', { name: 'Ver ficha', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('desktop V1.1 aligns indicators and keeps a constrained table scroll local', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/inventario');
  const cards = page.locator('.catalog-stats .stat-card');
  const bounds = await cards.evaluateAll(nodes => nodes.map(node => ({ h: node.getBoundingClientRect().height, valueTop: node.querySelector('strong')!.getBoundingClientRect().top })));
  expect(bounds).toHaveLength(3);
  expect(new Set(bounds.map(b => Math.round(b.h))).size).toBe(1);
  expect(new Set(bounds.map(b => Math.round(b.valueTop))).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const table = page.locator('.catalog-desktop');
  await expect(table).toBeVisible();
  const trigger = table.locator('.inventory-action-trigger').first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const popover = table.locator('.inventory-actions-popover:popover-open');
  await expect(popover.getByRole('button', { name: 'Editar', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Inventario', exact: true }).click();
  await expect(popover).toHaveCount(0);
});
