import { test, expect } from './adaptation-fixtures';

test('compact editor keeps identity and final price visible and opens a hidden invalid field', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto', exact: true });
  await expect(editor).toBeVisible();
  expect(await editor.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(680);
  await expect(editor.getByRole('button', { name: 'Escanear etiqueta', exact: true })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Modelo', exact: true })).toBeVisible();
  await expect(editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: /^SKU(?: |$)/ })).not.toBeVisible();
  await expect(editor.getByRole('spinbutton', { name: 'Stock mínimo', exact: true })).not.toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Descripción', exact: true })).not.toBeVisible();
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Marca de prueba');
  await editor.getByRole('textbox', { name: 'Modelo', exact: true }).fill('Modelo compacto');
  const identification = editor.locator('details[data-identification]');
  await identification.locator('summary').click();
  const sku = editor.getByRole('textbox', { name: /^SKU(?: |$)/ });
  await sku.fill('');
  await identification.locator('summary').click();
  await editor.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(identification).toHaveAttribute('open', '');
  await expect(sku).toBeFocused();
});

test('manufacturer code is saved alongside the internal code and failed save preserves the draft', async ({ page, featureData }) => {
  featureData.features = [...(featureData.features ?? []), 'barcode_aliases_v1'];
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto', exact: true });
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Hisense');
  await editor.getByRole('textbox', { name: 'Modelo', exact: true }).fill('AC122CE');
  await editor.getByRole('spinbutton', { name: 'Costo (RD$)', exact: true }).fill('100');
  await editor.locator('details[data-identification] summary').click();
  const internal = await editor.getByRole('textbox', { name: /^Código de barras/ }).inputValue();
  await editor.getByRole('button', { name: 'Añadir código del fabricante', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Código adicional 1 de la variante 1', exact: true }).fill('6946087393113');
  let payload: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { code: 'P0001', message: 'Prueba de conservación del borrador.' } });
  });
  await editor.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('conservación del borrador');
  expect((payload?.p_payload as { variants: { barcode: string; barcode_aliases: string[]; cost: number; price: number }[] }).variants[0]).toMatchObject({ barcode: internal, barcode_aliases: ['6946087393113'], cost: 100, price: 105.93 });
  await expect(editor.getByRole('textbox', { name: /^Código de barras/ })).toHaveValue(internal);
  await expect(editor.getByRole('textbox', { name: 'Código adicional 1 de la variante 1', exact: true })).toHaveValue('6946087393113');
});

test('known scanned product offers an explicit choice without discarding the new draft', async ({ page }) => {
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto', exact: true });
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Borrador intacto');
  await editor.locator('details[data-identification] summary').click();
  await editor.getByRole('button', { name: 'Escanear código para la variante 1', exact: true }).click();
  const scanner = page.getByRole('dialog', { name: 'Código de la variante', exact: true });
  await scanner.getByRole('textbox', { name: 'Código escaneado o manual', exact: true }).fill('TEST0001');
  await scanner.getByRole('button', { name: 'Usar código', exact: true }).click();
  const recognized = page.getByRole('dialog', { name: 'Producto reconocido', exact: true });
  await expect(recognized).toContainText('Fixture Nevera de prueba');
  await recognized.getByRole('button', { name: 'Conservar borrador', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Marca', exact: true })).toHaveValue('Borrador intacto');
  await editor.getByRole('button', { name: 'Escanear código para la variante 1', exact: true }).click();
  await scanner.getByRole('textbox', { name: 'Código escaneado o manual', exact: true }).fill('TEST0001');
  await scanner.getByRole('button', { name: 'Usar código', exact: true }).click();
  await recognized.getByRole('button', { name: 'Abrir producto existente', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page).toHaveURL(/variante=10000000-0000-4000-8000-000000000003/);
});
