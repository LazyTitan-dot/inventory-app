import { test, expect } from './fixtures';

for (const [width, colorScheme] of [[320,'light'],[390,'dark'],[430,'light'],[1440,'dark']] as const) {
  test(`dashboard V1 fits ${width}px in ${colorScheme}`, async ({page},testInfo) => {
    await page.emulateMedia({colorScheme});
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    const dashboard = page.locator('.sl-dashboard-v1');
    await expect(dashboard).toBeVisible();
    await expect(dashboard.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible();
    await expect(dashboard.getByRole('link',{name:'Nueva venta',exact:true})).toHaveAttribute('href','/ventas?nuevo=1');
    const financials = dashboard.getByRole('region',{name:'Resumen financiero del inventario'});
    await expect(financials).toContainText('15,000');
    await expect(financials).toContainText('28,320');
    await expect(financials).toContainText('13,320');
    await dashboard.getByRole('button',{name:'30 días',exact:true}).click();
    await expect(dashboard.getByRole('button',{name:'30 días',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(dashboard.getByRole('img',{name:/últimos 30 días/})).toBeVisible();
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
