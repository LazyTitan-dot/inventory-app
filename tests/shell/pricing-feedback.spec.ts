import { test, expect } from './fixtures';

test('new product suggests cost plus25% as final price and preserves a manual override', async ({ page }) => {
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto' });
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Marca de prueba');
  await editor.getByRole('textbox', { name: 'Modelo', exact: true }).fill('Modelo de prueba');
  const cost = editor.getByRole('spinbutton', { name: 'Costo (RD$)', exact: true });
  const price = editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ });
  await cost.fill('100');
  await expect(price).toHaveValue('125');
  await price.fill('150');
  await cost.fill('300');
  await expect(price).toHaveValue('150');
  await editor.getByRole('button', { name: /Usar sugerencia del 25% para la variante 1/ }).click();
  await expect(price).toHaveValue('375');
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { code: 'P0001', message: 'No se guardó la prueba de precio.' } });
  });
  await editor.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('prueba de precio');
  expect(command?.p_action).toBe('save_product');
  expect((command?.p_payload as { variants: { cost: number; price: number }[] }).variants[0]).toMatchObject({ cost: 300, price: 317.8 });
  await expect(price).toHaveValue('375');
});

test('existing net price survives editor open and cost changes until final price is explicitly edited', async ({ page }) => {
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar producto' });
  const price = editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ });
  await expect(price).toHaveValue('9440');
  await editor.getByRole('spinbutton', { name: 'Costo (RD$)', exact: true }).fill('6000');
  await expect(price).toHaveValue('9440');
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { code: 'P0001', message: 'Conserva el precio original.' } });
  });
  await editor.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('precio original');
  expect((command?.p_payload as { variants: { cost: number; price: number }[] }).variants[0]).toMatchObject({ cost: 6000, price: 8000 });
  await price.fill('100');
  await price.blur();
  await expect(price).toHaveValue('99.99');
  await expect(editor.getByRole('status')).toContainText('redondeo de ITBIS');
});

test('potential profit uses the complete final price minus cost', async ({ page }) => {
  await page.goto('/inventario');
  const card = page.locator('.catalog-financials .stat-card').filter({ hasText: 'Ganancia potencial' });
  await expect(card).toContainText('13,320.00');
  await expect(card).toContainText('Precio final con ITBIS');
});

test('out-of-range automatic suggestions cannot retain an old price silently', async ({ page }) => {
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto' });
  const cost = editor.getByRole('spinbutton', { name: 'Costo (RD$)', exact: true });
  const price = editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ });
  await cost.fill('100');
  await expect(price).toHaveValue('125');
  await cost.fill('999999999.99');
  await expect(price).toHaveValue('');
  await expect(editor.getByRole('alert')).toContainText('supera el límite');
  await price.fill('1000');
  await expect(editor.getByRole('alert')).toHaveCount(0);
});

test.describe('cost privacy', () => {
  test.use({ role: 'viewer' });
  test('viewers receive no potential-profit estimate', async ({ page }) => {
    await page.goto('/inventario');
    await expect(page.getByText('Ganancia potencial', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Ganancia estimada' })).toHaveCount(0);
  });
});
