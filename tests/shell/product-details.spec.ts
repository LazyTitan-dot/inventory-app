import { test, expect } from './adaptation-fixtures';

for (const [width, theme] of [[320, 'light'], [390, 'dark'], [1440, 'light']] as const) test(`compact product details prioritize price and availability at ${width}px in ${theme}`, async ({ page, featureData }, testInfo) => {
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/inventario?variante=${featureData.variants[0]!.id}`);
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: 'Fixture Nevera de prueba' })).toBeVisible();
  await expect(drawer.getByRole('definition').filter({ hasText: '9,440.00' })).toBeVisible();
  await expect(drawer.getByText('3 unidades', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Costo por unidad', { exact: true })).not.toBeVisible();
  await expect(drawer.getByText('Ganancia estimada por unidad', { exact: true })).not.toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Imprimir etiqueta' })).not.toBeVisible();
  await expect(drawer.locator('.button.primary')).toHaveCount(1);
  await expect(drawer.getByRole('link', { name: 'Nueva venta' })).toHaveAttribute('href', new RegExp(`variante=${featureData.variants[0]!.id}`));
  expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('compact-product.png'), fullPage: true });
  await drawer.getByText('Gestión y precios', { exact: true }).click();
  await expect(drawer.getByText('Costo por unidad', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Ganancia estimada por unidad', { exact: true })).toBeVisible();
  await drawer.getByText('Códigos y etiquetas', { exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Imprimir etiqueta' })).toBeVisible();
  await drawer.getByRole('button', { name: /^Movimientos/ }).click();
  await expect(drawer.getByRole('heading', { name: 'Sin movimientos' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Ajustar stock', exact: true }).click();
  await expect(drawer.getByRole('spinbutton', { name: 'Cantidad contada' })).toHaveValue('3');
});

test('product disclosures support keyboard access and hide cost data without cost permission', async ({ page, featureData }) => {
  featureData.permissions.view_costs = false;
  delete featureData.variants[0]!.cost;
  await page.goto(`/inventario?variante=${featureData.variants[0]!.id}`);
  const drawer = page.getByRole('dialog');
  const disclosure = drawer.locator('summary').filter({ hasText: 'Desglose del precio' });
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(drawer.getByText('Precio sin ITBIS', { exact: true })).toBeVisible();
  await expect(drawer.getByText('Costo por unidad', { exact: true })).toHaveCount(0);
  await expect(drawer.getByText('Ganancia estimada por unidad', { exact: true })).toHaveCount(0);
  await expect(disclosure).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
});

test('an unavailable product prioritizes replenishment and retains guarded adjustments', async ({ page, featureData }) => {
  featureData.stocks[0]!.available = 0;
  await page.goto(`/inventario?variante=${featureData.variants[0]!.id}`);
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('link', { name: 'Nueva venta' })).toHaveCount(0);
  await expect(drawer.getByRole('link', { name: 'Reponer variante' })).toHaveClass(/primary/);
  await drawer.getByRole('button', { name: 'Ajustar stock', exact: true }).click();
  await drawer.getByRole('spinbutton', { name: 'Cantidad contada' }).fill('1');
  await drawer.getByRole('textbox', { name: 'Motivo del ajuste' }).fill('Conteo físico de prueba');
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { code: 'P0001', message: 'Las existencias cambiaron.' } });
  });
  await drawer.getByRole('button', { name: 'Confirmar ajuste' }).click();
  await expect(drawer.getByRole('alert')).toContainText('existencias cambiaron');
  expect(command?.p_action).toBe('adjust_stock');
  expect(command?.p_payload).toMatchObject({ variant_id: featureData.variants[0]!.id, expected_quantity: 0, quantity: 1, bucket: 'available' });
  await expect(drawer.getByRole('spinbutton', { name: 'Cantidad contada' })).toHaveValue('1');
});
