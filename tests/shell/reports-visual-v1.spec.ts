import { test, expect, saleId, availableSaleId } from './adaptation-fixtures';
import { test as shell } from './fixtures';
import { businessDate } from '../../src/lib/format';
import { readFile } from 'node:fs/promises';
for(const [width,theme] of [[320,'light'],[390,'dark'],[430,'light'],[1440,'dark']] as const){
 test(`Reportes V1 reconciles responsive ${width}px ${theme}`,async({page,featureData},testInfo)=>{
  const stamp=new Date().toISOString();
  featureData.documents.find(d=>d.id===saleId)!.created_at=stamp;
  featureData.documents=featureData.documents.filter(d=>d.id!==availableSaleId);
  await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:theme});await page.goto('/reportes');
  const root=page.locator('.reports-visual-v1');
  await expect(root.locator('.sl-glass-header')).toBeVisible();
  await root.getByRole('button',{name:'Hoy',exact:true}).click();
  const kpis=root.getByRole('region',{name:'Indicadores financieros'});
  await expect(kpis).toContainText('8,000.00');await expect(kpis).toContainText('3,000.00');
  await expect(root.getByRole('region',{name:'Rentabilidad'})).toContainText('5,000.00');
  await expect(root.getByRole('img',{name:/Evolución de ingresos/})).toBeVisible();
  await expect(root.getByRole('region',{name:'Rendimiento por producto'})).toContainText('FIXTURE-001');
  await expect(root.getByRole('region',{name:'Inventario actual'})).toContainText('15,000.00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:testInfo.outputPath('reportes.png'),fullPage:true});
 });
}
test('Reportes V1 CSV exports signed refunds and reconciles summary',async({page,featureData})=>{
 const stamp=new Date().toISOString(), sale=featureData.documents.find(d=>d.id===saleId)!;
 sale.created_at=stamp;featureData.documents=featureData.documents.filter(d=>d.id!==availableSaleId);
 const line=featureData.document_items.find(i=>i.document_id===saleId)!;
 featureData.documents.push({...sale,id:'20000000-0000-4000-8000-000000000091',number:'DEV-PRUEBA',type:'return',parent_id:sale.id,subtotal:8000,tax:1440,total:9440});
 featureData.document_items.push({...line,id:'20000000-0000-4000-8000-000000000092',document_id:'20000000-0000-4000-8000-000000000091',parent_item_id:line.id});
 await page.goto('/reportes');await page.getByRole('button',{name:'Hoy',exact:true}).click();
 const root=page.locator('.reports-visual-v1');await expect(root.getByRole('region',{name:'Indicadores financieros'})).toContainText('0.00');
 const download=page.waitForEvent('download');await root.getByRole('button',{name:'Exportar CSV',exact:true}).click();const file=await download;
 expect(file.suggestedFilename()).toContain(businessDate(new Date()));
 const csv=await readFile((await file.path())!,'utf8');expect(csv).toContain('"-9440"');expect(csv).toContain('"-8000"');
 const summary=page.waitForEvent('download');await root.getByRole('button',{name:'Exportar resumen CSV'}).click();expect(await readFile((await (await summary).path())!,'utf8')).toContain('Conciliación');
});
for(const role of ['sales','inventory','viewer'] as const){shell.describe(role,()=>{shell.use({role});shell('cannot access financial reports',async({page})=>{await page.goto('/reportes');await expect(page).toHaveURL(/\/inventario/);await expect(page.locator('.reports-visual-v1')).toHaveCount(0);});});}
