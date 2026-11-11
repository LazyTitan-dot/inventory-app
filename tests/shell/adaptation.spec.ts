import { test, expect, customerId, availableSaleId, deliveryId, purchaseId } from './adaptation-fixtures';

test('global search opens an exact variant in its contextual drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Buscar en el negocio', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Buscar productos, contactos, documentos y secciones' });
  await search.fill('FIXTURE-001');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/inventario\?variante=/);
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  expect(await drawer.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(680);
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect(drawer).toContainText('FIXTURE-001');
  await expect(drawer.getByRole('link', { name: /Reponer variante/ })).toHaveAttribute('href', /variante=.*cantidad=/);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('mobile cashier keeps the exact variant, stock limits and cart when a command fails', async ({ page, featureData }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/ventas?nuevo=1&variante=${featureData.variants[0]!.id}`);
  await expect(page.getByRole('region', { name: 'Caja de ventas' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver pedido' }).click();
  const cart = page.getByRole('dialog', { name: 'Pedido y cobro' });
  await expect(cart).toBeVisible();
  expect(await cart.evaluate((node) => Math.round(node.getBoundingClientRect().width))).toBe(390);
  await expect(cart.getByRole('spinbutton', { name: 'Cantidad de Nevera de prueba Blanco' })).toHaveValue('1');
  await cart.getByRole('spinbutton', { name: 'Efectivo recibido RD$' }).fill('10000');
  let requestPayload: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    requestPayload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Las existencias cambiaron; revisa el pedido.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await cart.getByRole('button', { name: /Completar venta/ }).click();
  await expect(cart.getByRole('alert')).toContainText('existencias');
  await expect(cart.getByRole('spinbutton', { name: 'Cantidad de Nevera de prueba Blanco' })).toHaveValue('1');
  expect(requestPayload?.p_action).toBe('create_sale');
  expect(requestPayload?.p_operation).toMatch(/^[a-f0-9-]{36}$/);
});

test('customer addresses retain their exact customer identity on failed save', async ({ page }) => {
  await page.goto(`/clientes?contacto=${customerId}`);
  const profile = page.getByRole('dialog', { name: 'Cliente de prueba' });
  await expect(profile).toContainText('Dirección nueva del perfil');
  await profile.getByRole('button', { name: 'Agregar dirección' }).click();
  await profile.getByRole('textbox', { name: 'Etiqueta de la dirección' }).fill('Oficina');
  await profile.getByRole('textbox', { name: 'Calle y número' }).fill('Calle Segunda 12');
  await profile.getByRole('textbox', { name: 'Ciudad o municipio' }).fill('Santiago');
  await profile.getByRole('textbox', { name: 'Provincia', exact: true }).fill('Santiago');
  await profile.getByRole('textbox', { name: 'Teléfono de entrega' }).fill('8095550103');
  let payload: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'P0001', message: 'La dirección cambió; vuelve a intentar.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await profile.getByRole('button', { name: 'Guardar dirección' }).click();
  await expect(profile.getByRole('alert')).toContainText('dirección cambió');
  expect(payload?.p_action).toBe('save_customer_address');
  expect((payload?.p_payload as Record<string, unknown>).contact_id).toBe(customerId);
  await expect(profile.getByRole('textbox', { name: 'Calle y número' })).toHaveValue('Calle Segunda 12');
});

test('delivery keeps its historical snapshot and new deliveries select the saved preferred address', async ({ page }) => {
  await page.goto(`/entregas?documento=${deliveryId}`);
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Destino original de la entrega');
  await expect(drawer).not.toContainText('Dirección nueva del perfil');
  await expect(drawer.getByRole('link', { name: 'Ver destino en Maps' })).toHaveAttribute('href', /https:\/\/www\.google\.com\/maps\/search\//);
  await expect(drawer).toContainText('no muestra GPS');
  await page.keyboard.press('Escape');
  await page.goto(`/entregas?nuevo=1&venta=${availableSaleId}`);
  const editor = page.getByRole('dialog', { name: 'Programar entrega' });
  await expect(editor.getByRole('textbox', { name: 'Calle y número' })).toHaveValue('Dirección nueva del perfil');
  await expect(editor.getByRole('checkbox', { name: 'Guardar también en el perfil del cliente' })).toHaveCount(0);
});

for (const archivedAddress of [false, true]) test(`delivery can be reprogrammed after its saved profile address is ${archivedAddress ? 'archived' : 'edited'}`, async ({ page, featureData }) => {
  if (archivedAddress) {
    featureData.customer_addresses![0]!.active = false;
    featureData.customer_addresses![0]!.is_default = false;
  }
  await page.goto(`/entregas?documento=${deliveryId}`);
  await page.getByRole('button', { name: 'Editar / reprogramar' }).click();
  const editor = page.getByRole('dialog', { name: 'Editar o reprogramar entrega' });
  await expect(editor.getByRole('textbox', { name: 'Calle y número' })).toHaveValue('Destino original de la entrega');
  let payload: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'P0001', message: 'Prueba de conservación del destino.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await editor.getByRole('button', { name: 'Guardar programación' }).click();
  await expect(editor.getByRole('alert')).toContainText('conservación');
  const command = payload?.p_payload as Record<string, unknown>;
  expect(command.customer_address_id).toBeNull();
  expect(command.address_snapshot).toMatchObject({ street: 'Destino original de la entrega' });
  expect(command.expected_updated_at).toBe(featureData.deliveries[0]!.updated_at);
});

test('purchase receipt rejects combined over-receipt and retains good/damaged counts on server error', async ({ page }) => {
  await page.goto(`/compras?documento=${purchaseId}`);
  await page.getByRole('button', { name: 'Recibir mercancía', exact: true }).click();
  const good = page.getByRole('spinbutton', { name: /Recibir conformes/ });
  const damaged = page.getByRole('spinbutton', { name: /Recibir dañadas/ });
  await good.fill('2');
  await damaged.fill('3');
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/pendient|exced|supera/i);
  await damaged.fill('1');
  let payload: Record<string, unknown> | undefined;
  await page.route('https://phase5-fixture.supabase.co/rest/v1/rpc/retail_command', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { code: 'P0001', message: 'La orden cambió; revisa la recepción.' }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('orden cambió');
  expect(payload?.p_action).toBe('receive_purchase');
  expect((payload?.p_payload as { items: { quantity: number; damaged_quantity: number }[] }).items[0]).toMatchObject({ quantity: 2, damaged_quantity: 1 });
  await expect(good).toHaveValue('2');
  await expect(damaged).toHaveValue('1');
});
