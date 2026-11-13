import { test, expect } from './adaptation-fixtures';
import { retailFixture } from './fixtures';

test('a manufacturer code opens its existing product while preserving the internal code', async ({ page, featureData }) => {
  featureData.variants[0]!.barcode_aliases = ['6946087393113'];
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Escanear código', exact: true }).click();
  const scanner = page.getByRole('dialog', { name: 'Buscar una referencia' });
  await scanner.getByRole('textbox', { name: 'Código escaneado o manual' }).fill('6946087393113');
  await scanner.getByRole('button', { name: 'Usar código' }).click();
  await expect(page).toHaveURL(new RegExp(`variante=${featureData.variants[0]!.id}`));
  const details = page.getByRole('dialog');
  await expect(details.getByRole('heading', { name: 'Fixture Nevera de prueba' })).toBeVisible();
  await details.locator('summary').filter({ hasText: 'Códigos y etiquetas' }).click();
  await expect(details).toContainText('TEST0001');
  await expect(details).toContainText('6946087393113');
});

test('an unknown code starts an unsaved product draft without replacing its internal code', async ({ page }) => {
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { code: 'P0001', message: 'Prueba de código nuevo sin guardar.' } });
  });
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Escanear código', exact: true }).click();
  const scanner = page.getByRole('dialog', { name: 'Buscar una referencia' });
  await scanner.getByRole('textbox', { name: 'Código escaneado o manual' }).fill('6946087393113');
  await scanner.getByRole('button', { name: 'Usar código' }).click();
  const unknown = page.getByRole('dialog', { name: 'Código nuevo' });
  await expect(unknown).toContainText('6946087393113');
  expect(command).toBeUndefined();
  await unknown.getByRole('button', { name: 'Agregar con este código' }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto' });
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Hisense');
  await editor.getByRole('textbox', { name: 'Modelo', exact: true }).fill('AC122CE');
  await editor.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('sin guardar');
  expect(command?.p_action).toBe('save_product');
  const variant = (command?.p_payload as { variants: { barcode: string; barcode_aliases: string[] }[] }).variants[0]!;
  expect(variant.barcode).toMatch(/^SL/);
  expect(variant.barcode_aliases).toContain('6946087393113');
});

test.describe('read-only staff', () => {
  test.use({ role: 'viewer' });
  test('an unrecognized scan never offers to create a product', async ({ page, featureData }) => {
    const viewer = retailFixture('viewer');
    featureData.profile = viewer.profile;
    featureData.permissions = viewer.permissions;
    delete featureData.variants[0]!.cost;
    await page.goto('/inventario');
    await page.getByRole('button', { name: 'Escanear código', exact: true }).click();
    const scanner = page.getByRole('dialog', { name: 'Buscar una referencia' });
    await scanner.getByRole('textbox', { name: 'Código escaneado o manual' }).fill('6946087393113');
    await scanner.getByRole('button', { name: 'Usar código' }).click();
    await expect(page.getByText('No encontramos ese código. Revisa el valor con el equipo de inventario.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar con este código' })).toHaveCount(0);
  });
});
