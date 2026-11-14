import { test, expect } from './adaptation-fixtures';

for (const [width, theme] of [[320, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']] as const) {
  test(`inventory V1 layout and stock comparison at ${width}px ${theme}`, async ({ page, featureData }) => {
    featureData.stocks[0]!.quarantine = 2;
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/inventario');
    const catalog = page.locator('.inventory-visual-v1');
    await expect(catalog.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
    await expect(catalog.getByRole('button', { name: 'Escanear código', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width > 920) {
      const table = catalog.locator('.catalog-desktop');
      await expect(table.getByRole('columnheader', { name: 'En revisión' })).toBeVisible();
      await expect(table.getByRole('row').filter({ hasText: 'Fixture Nevera de prueba' }).getByRole('cell', { name: '2', exact: true }).first()).toBeVisible();
      await table.locator('.inventory-row-actions summary').first().click();
      await expect(table.getByRole('button', { name: 'Editar', exact: true }).first()).toBeVisible();
    } else {
      await expect(catalog.locator('.catalog-mobile-product').first()).toBeVisible();
      await expect(catalog.locator('.catalog-mobile-product').first()).toContainText('2 en revisión');
    }
    await catalog.getByText('Resumen financiero del inventario', { exact: true }).click();
    await expect(catalog.getByText('Ganancia potencial', { exact: true })).toBeVisible();
    await page.goto(`/inventario?variante=${featureData.variants[0]!.id}`);
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Fixture Nevera de prueba' })).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}
