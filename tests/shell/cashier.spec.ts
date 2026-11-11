import { test, expect, supplierId } from './adaptation-fixtures';

test('cashier scans an exact variant and sends the percentage discount as a pretax amount', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ventas');
  const search = page.getByRole('textbox', { name: 'Buscar productos para agregar' });
  await search.fill('TEST0001');
  await search.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Cantidad de Nevera de prueba Blanco' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Porcentaje %', exact: true }).click();
  await page.getByRole('spinbutton', { name: /^Descuento %/ }).fill('10');
  await page.getByRole('combobox', { name: 'Medio de pago', exact: true }).selectOption('transfer');
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async route => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Prueba de conservación del carrito.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.getByRole('button', { name: /Completar venta/ }).click();
  await expect(page.getByRole('alert')).toContainText('conservación del carrito');
  expect(command?.p_action).toBe('create_sale');
  expect(command?.p_payload).toMatchObject({ discount: 800, tax_rate: 18, payment_method: 'transfer' });
  await expect(page.getByRole('spinbutton', { name: /^Descuento %/ })).toHaveValue('10');
});

test('a quick purchase keeps its exact variant, expected date and quantity on a failed command', async ({ page, featureData }) => {
  await page.goto(`/compras?nuevo=1&variante=${featureData.variants[0]!.id}&cantidad=4`);
  const editor = page.getByRole('dialog', { name: 'Nueva orden', exact: true });
  await editor.getByRole('combobox', { name: 'Proveedor', exact: true }).selectOption(supplierId);
  await expect(editor.getByRole('spinbutton', { name: 'Cantidad de Nevera de prueba Blanco' })).toHaveValue('4');
  await editor.getByLabel(/^Fecha esperada de recepción/).fill('2027-01-15');
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async route => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Prueba de conservación de la compra.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await editor.getByRole('button', { name: 'Crear orden de compra' }).click();
  await expect(editor.getByRole('alert')).toContainText('conservación de la compra');
  expect(command?.p_action).toBe('create_purchase');
  expect(command?.p_payload).toMatchObject({ expected_at: '2027-01-15', contact_id: supplierId, items: [{ variant_id: featureData.variants[0]!.id, quantity: 4, unit_cost: 5000 }] });
  await expect(editor.getByRole('spinbutton', { name: 'Cantidad de Nevera de prueba Blanco' })).toHaveValue('4');
});
