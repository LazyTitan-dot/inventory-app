import { test, expect } from './adaptation-fixtures';

test('label review applies selected essential fields without saving or changing manual prices', async ({ page, featureData }) => {
  featureData.features = [...(featureData.features ?? []), 'barcode_aliases_v1'];
  const ocrRequests: string[] = [];
  let commands = 0;
  page.on('request', (request) => {
    if (request.url().includes('/assets/label-ocr-v1/')) ocrRequests.push(request.url());
    if (request.url().endsWith('/rpc/retail_command')) commands++;
  });
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto', exact: true });
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Marca conservada');
  await editor.getByRole('spinbutton', { name: 'Costo (RD$)', exact: true }).fill('100');
  await editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ }).fill('150');
  await editor.getByRole('button', { name: 'Escanear etiqueta', exact: true }).click();
  const capture = page.getByRole('dialog', { name: 'Escanear etiqueta', exact: true });
  await expect(capture).toContainText('no se envía ni se guarda');
  await capture.getByRole('button', { name: 'Introducir datos manualmente', exact: true }).click();
  await capture.getByRole('textbox', { name: 'Marca', exact: true }).fill('Hisense');
  await capture.getByRole('textbox', { name: 'Modelo', exact: true }).fill('AC122CE');
  await capture.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption('air_conditioner');
  await capture.getByRole('textbox', { name: 'Opción o variante', exact: true }).fill('Blanco');
  await capture.getByRole('textbox', { name: 'Código del fabricante', exact: true }).fill('6946087393113');
  await capture.getByRole('checkbox', { name: 'Incluir marca', exact: true }).uncheck();
  await capture.getByRole('button', { name: 'Aplicar al formulario', exact: true }).click();
  await expect(capture).not.toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Marca', exact: true })).toHaveValue('Marca conservada');
  await expect(editor.getByRole('textbox', { name: 'Modelo', exact: true })).toHaveValue('AC122CE');
  await expect(editor.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue('air_conditioner');
  await expect(editor.getByRole('spinbutton', { name: 'Costo (RD$)', exact: true })).toHaveValue('100');
  await expect(editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ })).toHaveValue('150');
  await editor.locator('details[data-identification] summary').click();
  await expect(editor.getByRole('textbox', { name: /^Código de barras/ })).toHaveValue(/^SL/);
  await expect(editor.getByRole('textbox', { name: 'Código adicional 1 de la variante 1', exact: true })).toHaveValue('6946087393113');
  expect(commands).toBe(0);
  expect(ocrRequests).toEqual([]);
});

test('a known manufacturer alias opens the existing product flow instead of creating a duplicate', async ({ page, featureData }) => {
  featureData.features = [...(featureData.features ?? []), 'barcode_aliases_v1'];
  featureData.variants[0]!.barcode_aliases = ['6946087393113'];
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Agregar producto', exact: true });
  await editor.getByRole('textbox', { name: 'Marca', exact: true }).fill('Borrador que se conserva');
  await editor.getByRole('button', { name: 'Escanear etiqueta', exact: true }).click();
  const capture = page.getByRole('dialog', { name: 'Escanear etiqueta', exact: true });
  await capture.getByRole('button', { name: 'Leer código', exact: true }).click();
  const scanner = page.getByRole('dialog', { name: 'Leer código de la etiqueta', exact: true });
  await scanner.getByRole('textbox', { name: 'Código escaneado o manual', exact: true }).fill('6946087393113');
  await scanner.getByRole('button', { name: 'Usar código', exact: true }).click();
  await expect(capture.getByRole('region', { name: 'Producto reconocido', exact: true })).toContainText('Fixture Nevera de prueba');
  await expect(capture.getByRole('button', { name: 'Aplicar al formulario', exact: true })).toHaveCount(0);
  await capture.getByRole('button', { name: 'Abrir producto existente', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Producto reconocido', exact: true });
  await confirmation.getByRole('button', { name: 'Conservar borrador', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Marca', exact: true })).toHaveValue('Borrador que se conserva');
});

test('review can update the current product without treating its own barcode as a duplicate', async ({ page, featureData }) => {
  featureData.features = [...(featureData.features ?? []), 'barcode_aliases_v1'];
  await page.goto(`/inventario?variante=${featureData.variants[0]!.id}`);
  await page.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar producto', exact: true });
  await editor.getByRole('button', { name: 'Escanear etiqueta', exact: true }).click();
  const capture = page.getByRole('dialog', { name: 'Escanear etiqueta', exact: true });
  await capture.getByRole('button', { name: 'Introducir datos manualmente', exact: true }).click();
  await capture.getByRole('textbox', { name: 'Modelo', exact: true }).fill('Modelo revisado');
  await capture.getByRole('textbox', { name: 'Código del fabricante', exact: true }).fill('TEST0001');
  await expect(capture.getByRole('button', { name: 'Abrir producto existente', exact: true })).toHaveCount(0);
  await capture.getByRole('button', { name: 'Aplicar al formulario', exact: true }).click();
  await expect(capture).not.toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Modelo', exact: true })).toHaveValue('Modelo revisado');
});
