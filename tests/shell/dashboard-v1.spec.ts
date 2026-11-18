import { test, expect } from './fixtures';

for (const [width, colorScheme] of [[320,'light'],[390,'dark'],[430,'light'],[1440,'dark']] as const) {
  test(`dashboard V1 fits ${width}px in ${colorScheme}`, async ({page},testInfo) => {
    await page.emulateMedia({colorScheme});
    const height = width === 1440 ? 900 : 844;
    await page.setViewportSize({width,height});
    await page.goto('/');
    const dashboard = page.locator('.sl-dashboard-v1');
    await expect(dashboard).toBeVisible();
    await expect(dashboard.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
    const header = dashboard.locator('.page-header');
    const primary = header.getByRole('link', {name:'Nueva venta', exact:true});
    await expect(primary).toHaveAttribute('href','/ventas?nuevo=1');
    expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await expect(dashboard.getByRole('region', {name:'Prioridades del negocio'})).toHaveText('Tu operación está al día.');
    if (width === 390) {
      expect((await dashboard.locator('.sl-dashboard-kpis').boundingBox())!.y).toBeLessThanOrEqual(300);
      await expect(header.getByRole('button', {name:/Buscar cualquier cosa/})).toHaveCount(0);
      await expect(page.getByRole('button', {name:'Buscar en el negocio'})).toBeVisible();
    }
    if (width === 1440) {
      const charts = await dashboard.locator('.sl-insight-card').evaluateAll(cards =>
        cards.map(card => ({top:card.getBoundingClientRect().top, bottom:card.getBoundingClientRect().bottom})));
      expect(charts).toHaveLength(2);
      expect(charts[0]!.top).toBe(charts[1]!.top);
      expect(charts.every(card => card.bottom <= height)).toBe(true);
    }
    const financials = dashboard.getByRole('region',{name:'Resumen financiero del inventario'});
    await expect(financials).toContainText('15,000');
    await expect(financials).toContainText('28,320');
    await expect(financials).toContainText('13,320');
    await dashboard.getByRole('button',{name:'30 días',exact:true}).click();
    await expect(dashboard.getByRole('button',{name:'30 días',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(dashboard.getByRole('img',{name:/últimos 30 días/})).toBeVisible();
    const daily = dashboard.locator('.sl-chart-data');
    await daily.locator('summary').press('Enter');
    await expect(daily.locator('tbody tr')).toHaveCount(30);
    await daily.locator('summary').press('Enter');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:testInfo.outputPath('dashboard.jpg'),type:'jpeg',quality:75,fullPage:true});
  });
}
test.describe('sales permission boundary',()=>{
  test.use({role:'sales'});
  test('does not expose inventory financials',async({page})=>{
    await page.goto('/');
    await expect(page.locator('.sl-dashboard-v1')).toBeVisible();
    await expect(page.getByRole('region',{name:'Resumen financiero del inventario'})).toHaveCount(0);
    await expect(page.getByText('Ganancia potencial',{exact:true})).toHaveCount(0);
  });
});
