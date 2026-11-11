import { test, expect } from './fixtures';

test.use({ signedIn: false });

for (const width of [320, 390, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`glass login fits ${width}px in ${theme} with readable native controls`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/');
      await expect(page.locator('.auth-glass')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('heading', { name: 'Qué bueno verte de nuevo' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const logo = page.getByRole('img', { name: 'S-Mart Living', exact: true });
      await expect(logo).toBeVisible();
      await expect.poll(() => logo.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
      const email = page.getByRole('textbox', { name: 'Correo electrónico' });
      await expect(email).toHaveAttribute('autocomplete', 'username');
      const password = page.getByLabel('Contraseña', { exact: true });
      await expect(password).toHaveAttribute('autocomplete', 'current-password');
      await expect(password).toHaveAttribute('type', 'password');
      for (const control of [email, password, page.getByRole('button', { name: 'Mostrar contraseña' }), page.getByRole('button', { name: 'Iniciar sesión', exact: true })]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const colors = await email.evaluate((node) => {
        const style = getComputedStyle(node);
        const channel = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        return { color: channel(style.color), background: channel(style.backgroundColor) };
      });
      const luminance = (channels: number[]) => {
        const linear = channels.map((value) => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722;
      };
      const a = luminance(colors.color), b = luminance(colors.background);
      expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
      await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
      await expect(password).toHaveAttribute('type', 'text');
      await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
      await expect(password).toHaveAttribute('type', 'password');
      if (width !== 320) await page.screenshot({ path: testInfo.outputPath(`login-${width}-${theme}.png`), fullPage: true });
    });
  }
}

test('login appearance persists into the authenticated shell without changing the login flow', async ({ page, backend }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await expect(page.locator('.auth-glass')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('.auth-glass')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('shell@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('fixture-only-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark');
  expect(backend.loginRequests).toBe(1);
});

test.describe('unavailable appearance storage', () => {
  test.use({ themeStorageBlocked: true });
  test('keeps credentials and appearance controls usable', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    await expect(page.locator('.auth-glass')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('textbox', { name: 'Correo electrónico' })).toBeEnabled();
  });
});
