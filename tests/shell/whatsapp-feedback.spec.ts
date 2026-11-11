import { test, expect, customerId, deliveryId, saleId } from './adaptation-fixtures';

test('tracking opens a prepared WhatsApp chat without clipboard access', async ({ page, featureData }) => {
  featureData.settings.business_name = 'SmartLiving';
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => { throw new Error('This flow must not use copy and paste.'); } },
    });
  });
  await page.goto(`/entregas?documento=${deliveryId}`);
  await page.getByRole('button', { name: 'Enviar seguimiento por WhatsApp' }).click();
  const composer = page.getByRole('dialog', { name: 'Seguimiento por WhatsApp' });
  await expect(composer).toBeVisible();
  const message = composer.getByRole('textbox', { name: /^Mensaje para el cliente/ });
  await expect(message).toHaveValue(/S-Mart Living · Seguimiento de entrega/);
  await expect(message).toHaveValue(/Puedes escribirnos por este mismo chat para cualquier consulta o cambio en tu entrega/);
  await expect(message).not.toHaveValue(/Consulta con la tienda/);
  await expect(composer.getByRole('button', { name: 'Copiar mensaje' })).toHaveCount(0);
  const send = composer.getByRole('link', { name: 'Enviar por WhatsApp', exact: true });
  const url = new URL((await send.getAttribute('href'))!);
  expect(url.origin).toBe('https://wa.me');
  expect(url.pathname).toBe('/18095550101');
  expect(url.searchParams.get('text')).toBe(await message.inputValue());
  // Check the real control without opening an external chat or sending anything.
  await send.evaluate((node) => node.addEventListener('click', (event) => event.preventDefault(), { capture: true }));
  await send.click();
  await expect(composer.getByRole('status')).toContainText('Revisa el mensaje en WhatsApp');
  await expect(composer).not.toContainText('Mensaje enviado');
  const recipient = composer.getByRole('textbox', { name: /^WhatsApp del cliente/ });
  await recipient.fill('849');
  await composer.getByRole('button', { name: 'Enviar por WhatsApp', exact: true }).click();
  await expect(composer.getByRole('alert')).toBeVisible();
  await expect(composer.getByRole('link', { name: 'Enviar por WhatsApp', exact: true })).toHaveCount(0);
  await recipient.fill('8095550101');
  await expect(composer.getByRole('link', { name: 'Enviar por WhatsApp', exact: true })).toBeVisible();
});

test('contact and receipt entry points share the same editable prepared-chat flow', async ({ page }) => {
  for (const entry of [
    { path: `/clientes?contacto=${customerId}`, title: 'Cliente de prueba' },
    { path: `/ventas?documento=${saleId}`, title: 'VEN-PRUEBA-001' },
  ]) {
    await page.goto(entry.path);
    const detail = page.getByRole('dialog', { name: entry.title, exact: true });
    await detail.getByRole('button', { name: 'WhatsApp', exact: true }).click();
    const composer = page.getByRole('dialog');
    await expect(composer.getByRole('link', { name: 'Enviar por WhatsApp', exact: true })).toBeVisible();
    const message = composer.getByRole('textbox', { name: /^Mensaje para el cliente/ });
    await message.fill('Consulta de prueba: entrega y cambios por este mismo chat.');
    const href = await composer.getByRole('link', { name: 'Enviar por WhatsApp', exact: true }).getAttribute('href');
    expect(new URL(href!).searchParams.get('text')).toBe('Consulta de prueba: entrega y cambios por este mismo chat.');
    await expect(composer.getByRole('button', { name: 'Copiar mensaje' })).toHaveCount(0);
  }
});
