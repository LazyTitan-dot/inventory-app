import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';

async function expectReadable(control: Locator) {
  const colors = await control.evaluate(node => {
    const style = getComputedStyle(node);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    let surface: Element | null = node;
    while (surface && rgba(getComputedStyle(surface).backgroundColor)[3] === 0) surface = surface.parentElement;
    return { color: rgba(style.color), background: rgba(surface ? getComputedStyle(surface).backgroundColor : '#fff') };
  });
  const luminance = (color: number[]) => {
    const values = color.slice(0, 3).map(v => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
  };
  const l1 = luminance(colors.color), l2 = luminance(colors.background);
  expect((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);
}

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`shell fits ${width}px in ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/inventario');
      await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
      await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', colorScheme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width < 851) {
        await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeVisible();
        await expect(page.locator('.sidebar')).not.toBeVisible();
      } else {
        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).not.toBeVisible();
        expect(await page.locator('.sidebar').evaluate(node => Math.round(node.getBoundingClientRect().height))).toBe(900);
      }
      await expect.poll(() => page.locator('.sidebar-brand img').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
      if ([390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`shell-${width}-${colorScheme}.png`), fullPage: true });
    });
  }
}

for (const role of ['admin', 'sales', 'inventory', 'viewer'] as const) {
  test.describe(`${role} navigation`, () => {
    test.use({ role, viewport: { width: 390, height: 844 } });
    test('dock and More follow existing permissions', async ({ page }) => {
      await page.goto('/');
      const dock = page.getByRole('navigation', { name: 'Navegación móvil' });
      await expect(dock).toBeVisible();
      await expect(dock.getByRole('link', { name: 'Inicio' })).toBeVisible();
      await expect(dock.getByRole('link', { name: 'Inventario' })).toBeVisible();
      if (role === 'admin' || role === 'sales') await expect(dock.getByRole('link', { name: 'Ventas' })).toBeVisible();
      else await expect(dock.getByRole('link', { name: 'Ventas' })).toHaveCount(0);
      if (role === 'inventory') await expect(dock.getByRole('link', { name: 'Compras' })).toBeVisible();
      await page.getByRole('button', { name: 'Más secciones' }).click();
      const nav = page.getByRole('navigation', { name: 'Navegación principal' });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Configuración' })).toHaveCount(role === 'admin' ? 1 : 0);
      await expect(nav.getByRole('link', { name: 'Compras', exact: true })).toHaveCount(role === 'admin' || role === 'inventory' ? 1 : 0);
      await expect(nav.getByRole('link', { name: 'Ventas', exact: true })).toHaveCount(role === 'admin' || role === 'sales' ? 1 : 0);
    });
    if (role !== 'admin') test('restricted URLs still redirect to inventory', async ({ page }) => {
      await page.goto(role === 'sales' ? '/compras' : '/ventas');
      await expect(page).toHaveURL(/\/inventario$/);
      await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
      await expect(page.getByText('Valor del inventario', { exact: true })).toHaveCount(role === 'inventory' ? 1 : 0);
      await expect(page.getByRole('button', { name: 'Agregar producto' })).toHaveCount(role === 'inventory' ? 1 : 0);
    });
  });
}

test('mobile menu traps focus, closes with Escape, and restores its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const more = page.getByRole('button', { name: 'Más secciones' });
  await more.click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.sidebar') !== null)).toBe(true);
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.sidebar') !== null)).toBe(true);
  }
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('.sidebar') !== null)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await expect(more).toBeFocused();
  await more.click();
  await page.locator('.mobile-sidebar-close').click();
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Inventario' }).click();
  await expect(page).toHaveURL(/\/inventario$/);
  await expect(page.locator('.sidebar')).not.toBeVisible();
});

test('theme toggles and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Activar modo claro' }).click();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'light');
});

test.describe('blocked appearance storage', () => {
  test.use({ themeStorageBlocked: true });
  test('does not break the shell or appearance toggle', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  });
});

test('dark inventory and sale dialogs retain opaque readable controls', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'Agregar producto' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expectReadable(dialog.getByRole('textbox', { name: 'Marca', exact: true }));
  await expectReadable(dialog.getByRole('combobox', { name: 'Categoría', exact: true }));
  await page.keyboard.press('Escape');
  await page.goto('/ventas?nuevo=1');
  await expect(page.getByRole('region', { name: 'Caja de ventas' })).toBeVisible();
  await expectReadable(page.getByRole('textbox', { name: 'Buscar productos para agregar' }));
});

test('print excludes shell chrome without hiding page content', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/inventario');
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await expect(page.locator('.topbar')).not.toBeVisible();
  await expect(page.locator('.sl-bottom-dock')).not.toBeVisible();
  await expect(page.getByText('FIXTURE-001', { exact: true })).toBeVisible();
  await expect(page.locator('.page-content')).toHaveCSS('padding-bottom', '0px');
  await expect(page.locator('.app-layout')).toHaveCSS('color-scheme', 'light');
});

test('client logout rejection stays visible above mobile dock and permits retry', async ({ page, backend }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Más secciones' }).click();
  // Only stub the rejected client result. The installed SDK clears its session on
  // HTTP sign-out failures; changing that existing behavior is outside shell scope.
  await page.evaluate(async () => {
    const moduleUrl = '/src/lib/supabase.ts';
    const { supabase } = await import(moduleUrl);
    const original = supabase.auth.signOut.bind(supabase.auth);
    supabase.auth.signOut = async () => {
      supabase.auth.signOut = original;
      return { error: new Error('Local rejected client fixture') };
    };
  });
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No pudimos cerrar la sesión' })).toBeVisible();
  await page.keyboard.press('Escape');
  const toast = await page.locator('.toast').boundingBox();
  const dock = await page.locator('.sl-bottom-dock').boundingBox();
  expect(toast!.y + toast!.height).toBeLessThanOrEqual(dock!.y);
  await page.getByRole('button', { name: 'Más secciones' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect(backend.logoutRequests).toBe(1);
});

test('desktop resize clears the mobile modal and scroll lock', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Más secciones' }).click();
  await expect(page.getByRole('dialog', { name: 'Menú principal' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Menú principal' })).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(page.locator('.app-main')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-theme', 'dark');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`dashboard dark panel remains readable in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const panel = page.locator('.panel.dark-panel');
    await expect(panel).toBeVisible();
    await expectReadable(panel.locator('.delivery-highlight > strong'));
    await expectReadable(panel.getByRole('link', { name: 'Gestionar entregas' }));
  });
}

test.describe('signed-out authentication', () => {
  test.use({ signedIn: false });
  test('login enters the existing authenticated shell', async ({ page, backend }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('shell@example.test');
    await page.getByLabel('Contraseña', { exact: true }).fill('fixture-only-password');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
    expect(backend.loginRequests).toBe(1);
  });
  test('expired recovery remains outside the shell and offers a fresh link', async ({ page, backend }) => {
    await page.goto('/recuperar?error_code=otp_expired');
    await expect(page.getByText('Este enlace de recuperación no es válido o ya venció.', { exact: false })).toBeVisible();
    await expect(page.locator('.app-layout')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('shell@example.test');
    await page.getByRole('button', { name: 'Enviar instrucciones' }).click();
    await expect(page.getByRole('status')).toContainText('Si el correo está registrado');
    expect(backend.recoverRequests).toBe(1);
  });
});
