import { test, expect } from './adaptation-fixtures';

test('an editor requires explicit review after a live tax-rate refresh and preserves the final-price intent', async ({ page, featureData }) => {
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar producto' });
  const price = editor.getByRole('spinbutton', { name: /^Precio final con ITBIS/ });
  await price.fill('150');
  await price.blur();
  featureData.settings.tax_rate = 20;
  const refresh = page.waitForResponse((response) => response.url().endsWith('/rest/v1/rpc/retail_bootstrap'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await refresh;
  await expect(editor.getByRole('alert')).toContainText('La tasa de ITBIS cambió');
  await expect(editor.getByRole('button', { name: 'Guardar producto' })).toBeDisabled();
  await expect(price).toHaveValue('150');
  await editor.getByRole('button', { name: 'Recalcular con la tasa actual' }).click();
  await expect(editor.getByRole('button', { name: 'Guardar producto' })).toBeEnabled();
  let command: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    command = route.request().postDataJSON();
    await route.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, json: { code: 'P0001', message: 'Mantener el formulario de prueba.' } });
  });
  await editor.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(editor.getByRole('alert')).toContainText('Mantener el formulario');
  expect((command?.p_payload as { expected_tax_rate: number }).expected_tax_rate).toBe(20);
  expect((command?.p_payload as { variants: { price: number }[] }).variants[0]!.price).toBe(125);
});
