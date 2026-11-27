import { test, expect } from './adaptation-fixtures';

for (const width of [320, 390, 430, 1024, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`cashier header contract ${width} ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/ventas');
      const header = page.locator('.sales-visual-v1 .page-header');
      await expect(header.getByRole('heading', { name: 'Ventas', exact: true })).toBeVisible();
      await expect(header.getByRole('button', { name: 'Historial de ventas' })).toBeVisible();
      const newSale = page.getByRole('button', { name: 'Nueva venta', exact: true });
      await expect(newSale).toHaveCount(1);
      await expect(newSale).toBeVisible();
      await expect(header.getByRole('button', { name: 'Nueva venta', exact: true })).toHaveCount(width > 800 ? 1 : 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const search = page.getByRole('textbox', { name: 'Buscar productos para agregar' });
      await search.fill('TEST0001');
      await search.press('Enter');
      await newSale.click();
      const confirm = page.getByRole('dialog', { name: 'Vaciar pedido' });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Conservar pedido' }).click();
      await expect(confirm).toHaveCount(0);
      await page.goto('/');
      const summary = page.locator('.sl-dashboard-v1 .page-header');
      await expect(summary.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
      await expect(summary.getByRole('link', { name: 'Nueva venta' })).toBeVisible();
      await expect(page.locator('.sl-dashboard-v1 svg.lucide-arrow-right')).toHaveCount(0);
    });
  }
}
