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

/* The approved Clientes material alone was not enough: compare the actual
 * hero geometry, without replacing the functional navigation assertions. */
for (const width of [320, 390, 430, 1024, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Clientes reference header proportions ${width} ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/clientes');
      const reference = page.locator('.customer-workspace > .page-header.sl-glass-header');
      await expect(reference).toBeVisible();
      const material = await reference.evaluate(el => getComputedStyle(el).backgroundImage);
      expect(material).toContain('radial-gradient');
      for (const route of ['/', '/ventas', '/ventas?vista=historial']) {
        await page.goto(route);
        const header = page.locator(':is(.sl-dashboard-v1,.sales-visual-v1) > .page-header.sl-glass-header');
        await expect(header).toBeVisible();
        const metrics = await header.evaluate(el => {
          const css = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const content = [...el.querySelectorAll('h1, .eyebrow, .header-actions > :is(a,button)')]
            .filter(node => node.getClientRects().length > 0 && getComputedStyle(node).display !== 'none')
            .map(node => {
              const r = node.getBoundingClientRect();
              return {left:r.left-rect.left,right:rect.right-r.right,top:r.top-rect.top,bottom:rect.bottom-r.bottom};
            });
          return { height:rect.height, padding:parseFloat(css.paddingTop), radius:parseFloat(css.borderTopLeftRadius),
            material:css.backgroundImage, content, overflow:el.scrollWidth>el.clientWidth+1 };
        });
        expect(metrics.height).toBeGreaterThanOrEqual(width>800?142:124);
        expect(metrics.padding).toBe(width>800?24:20);
        expect(metrics.radius).toBe(24);
        expect(metrics.material).toBe(material);
        expect(metrics.overflow).toBe(false);
        for (const box of metrics.content) {
          expect(Math.min(box.left,box.right,box.top,box.bottom)).toBeGreaterThanOrEqual(18);
        }
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await header.screenshot({path:testInfo.outputPath('header-'+(route==='/'?'resumen':route.includes('?')?'historial':'ventas')+'.png')});
      }
    });
  }
}
