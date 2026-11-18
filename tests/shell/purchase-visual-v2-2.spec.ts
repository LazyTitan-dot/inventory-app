import { test, expect, purchaseId } from './adaptation-fixtures';

for (const [width, theme] of [[320, 'dark'], [390, 'light'], [430, 'dark'], [1440, 'light']] as const) {
  test('Recepción V2.2 Glass, Apple margins and scanner unchanged ' + width + ' ' + theme, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/compras?documento=' + purchaseId);
    const detail = page.getByRole('dialog', { name: 'COM-PRUEBA-001', exact: true });
    await detail.getByRole('button', { name: 'Recibir mercancía', exact: true }).click();
    const surface = detail.locator('.purchase-receiving-scan');
    await expect(surface).toBeVisible();
    const receivingField = surface.locator('.field');
    const code = receivingField.getByRole('textbox', { name: 'Código de barras o SKU de esta orden' });
    await expect(code).toBeVisible();
    await expect(surface.getByRole('button', { name: 'Contar unidad' })).toBeVisible();
    await expect(surface.getByRole('button', { name: 'Cámara continua' })).toBeVisible();
    const safeReceiving = await surface.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const inp = el.querySelector('input')!.getBoundingClientRect();
      const label = el.querySelector('.field > span')!.getBoundingClientRect();
      const css = getComputedStyle(el);
      return {
        left: inp.left - r.left, right: r.right - inp.right,
        labelLeft: label.left - r.left, labelTop: label.top - r.top,
        background: css.backgroundImage, radius: parseFloat(css.borderTopLeftRadius),
      };
    });
    expect(safeReceiving.left).toBeGreaterThanOrEqual(15);
    expect(safeReceiving.right).toBeGreaterThanOrEqual(15);
    expect(safeReceiving.labelLeft).toBeGreaterThanOrEqual(15);
    expect(safeReceiving.labelTop).toBeGreaterThanOrEqual(15);
    expect(safeReceiving.background).toContain('gradient');
    expect(safeReceiving.radius).toBeGreaterThanOrEqual(18);
    await page.screenshot({ path: testInfo.outputPath('recepcion-v22-' + width + '-' + theme + '.png'), fullPage: true });

    await surface.getByRole('button', { name: 'Cámara continua' }).click();
    const scanner = page.getByRole('dialog', { name: 'Recepción · Escaneo continuo' });
    await expect(scanner).toBeVisible();
    const inner = scanner.locator('.barcode-scanner.purchase-continuous-glass');
    await expect(inner).toBeVisible();
    const field = inner.locator('.field');
    const input = field.getByRole('textbox', { name: 'Código escaneado o manual' });
    await expect(input).toBeVisible();
    await expect(inner.getByRole('button', { name: 'Usar código' })).toBeVisible();
    const safeScan = await inner.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const field = el.querySelector('.field')!;
      const label = field.querySelector('span')!.getBoundingClientRect();
      const input = field.querySelector('input')!.getBoundingClientRect();
      return {
        labelLeft: label.left - r.left, labelTop: label.top - r.top,
        fieldBorder: parseFloat(getComputedStyle(field).borderTopWidth),
        inputLeft: input.left - r.left, inputRight: r.right - input.right,
        cardBackground: getComputedStyle(el).backgroundImage,
      };
    });
    expect(safeScan.fieldBorder).toBe(0);
    expect(safeScan.labelLeft).toBeGreaterThanOrEqual(15);
    expect(safeScan.labelTop).toBeGreaterThanOrEqual(15);
    expect(safeScan.inputLeft).toBeGreaterThanOrEqual(15);
    expect(safeScan.inputRight).toBeGreaterThanOrEqual(15);
    expect(safeScan.cardBackground).toContain('gradient');
    await page.screenshot({ path: testInfo.outputPath('scanner-v22-' + width + '-' + theme + '.png'), fullPage: true });
  });
}
