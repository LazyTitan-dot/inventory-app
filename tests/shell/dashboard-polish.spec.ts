import { test, expect, purchaseId } from './adaptation-fixtures';

for (const width of [320, 390, 430, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`dashboard polish ${width}px ${colorScheme} with long purchase data`, async ({ page, featureData }) => {
      const purchase = featureData.documents.find(doc => doc.id === purchaseId)!;
      purchase.contact_snapshot.name = 'Distribuidora Nacional de Electrodomésticos y Tecnología de República Dominicana';
      purchase.total = 123456789.99;
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const quick = page.getByRole('region', { name: 'Accesos rápidos' });
      await expect(quick.getByRole('heading', { name: 'Accesos rápidos', exact: true })).toBeVisible();
      await expect(quick.getByRole('heading')).toHaveCSS('font-size', '20px');
      await expect(quick.getByRole('link', { name: /Registrar compra/ })).toHaveAttribute('href', '/compras?nuevo=1');
      const activity = page.locator('.sl-recent-activity');
      const row = activity.getByRole('link', { name: /Compra registrada/ });
      await expect(row).toContainText('Distribuidora Nacional');
      await expect(row).toContainText('123,456,789.99');
      await expect(row).toHaveAttribute('href', `/compras?documento=${purchaseId}`);
      const bounds = await row.evaluate(node => {
        const panel = node.closest('.sl-recent-activity')!.getBoundingClientRect();
        const r = node.getBoundingClientRect();
        const content = Array.from(node.querySelectorAll('strong, small, b')).map(el=>el.getBoundingClientRect());
        return { left: r.left-panel.left, right: panel.right-r.right,
          inside: content.every(x=>x.left>=r.left-1 && x.right<=r.right+1),
          viewport: document.documentElement.scrollWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(16);
      expect(bounds.right).toBeGreaterThanOrEqual(16);
      expect(bounds.inside).toBe(true);
      expect(bounds.viewport).toBeLessThanOrEqual(width);
    });
  }
}
