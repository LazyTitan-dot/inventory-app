import { test, expect, deliveryId } from './adaptation-fixtures';

/** Visual-only disclosure control, aligned with the supplied Apple Settings reference.
 * Isolated fixtures: no access to production data or business mutations.
 */
for(const width of [1024,1440,1920]){
 for(const theme of ['light','dark'] as const){
  test('Apple cyan disclosure in Windows delivery table '+width+' '+theme,async({page},testInfo)=>{
   await page.setViewportSize({width,height:900});
   await page.emulateMedia({colorScheme:theme});
   await page.goto('/entregas');
   const root=page.locator('.delivery-visual-v1');
   const row=root.locator('.delivery-desktop-table tbody tr').first();
   const cell=row.locator('td.delivery-disclosure-cell');
   const action=cell.getByRole('button',{name:'Ver entrega a Cliente de prueba'});
   await expect(action).toBeVisible();
   await expect(action).toHaveAttribute('type','button');
   await expect(action).toHaveAttribute('aria-haspopup','dialog');
   await expect(action.locator('svg.lucide-chevron-right')).toHaveCount(1);
   await expect(action).toHaveText('');
   await expect(cell).not.toContainText('Ver entrega');
   const geometry=await action.evaluate(button=>{
    const cell=button.closest('td')!;
    const buttonRect=button.getBoundingClientRect(),cellRect=cell.getBoundingClientRect();
    const probe=document.createElement('span');
    probe.style.color='var(--sl-refined-accent)';
    button.closest('.delivery-visual-v1')!.append(probe);
    const expectedColor=getComputedStyle(probe).color;
    probe.remove();
    return {
      width:buttonRect.width,
      height:buttonRect.height,
      rightGap:cellRect.right-buttonRect.right,
      cyan:getComputedStyle(button).color===expectedColor,
      bg:getComputedStyle(button).backgroundColor
    };
   });
   expect(geometry.width).toBeGreaterThanOrEqual(44);
   expect(geometry.height).toBeGreaterThanOrEqual(44);
   expect(geometry.rightGap).toBeGreaterThanOrEqual(0);
   expect(geometry.rightGap).toBeLessThan(23);
   expect(geometry.cyan).toBe(true);
   await page.screenshot({path:testInfo.outputPath('apple-cyan-disclosure-'+width+'-'+theme+'.png'),fullPage:true});
   await action.focus();
   await expect(action).toBeFocused();
   await expect(action).toHaveCSS('outline-style','solid');
   await page.keyboard.press('Enter');
   const detail=page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'});
   await expect(detail).toBeVisible();
   await expect(detail.getByRole('region',{name:'Historial de entrega'})).toBeVisible();
   await detail.getByRole('button',{name:'Cerrar ventana'}).click();
   await expect(detail).not.toBeVisible();
   await action.focus();
   await page.keyboard.press('Space');
   await expect(detail).toBeVisible();
   await expect(detail.locator('.delivery-overview-sale')).toHaveText('VEN-PRUEBA-001');
  });
 }
}

for(const width of [390,430]){
 test('iPhone keeps approved full-card navigation '+width,async({page})=>{
  await page.setViewportSize({width,height:850});
  await page.goto('/entregas');
  const mobile=page.locator('.delivery-card-list');
  await expect(mobile).toBeVisible();
  await expect(mobile.locator('.delivery-list-card')).toHaveCount(1);
  await expect(mobile.getByRole('button',{name:'Ver entrega a Cliente de prueba'})).toContainText('Ver entrega');
  await expect(page.locator('.delivery-desktop-table')).not.toBeVisible();
  await mobile.getByRole('button',{name:'Ver entrega a Cliente de prueba'}).click();
  await expect(page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'})).toBeVisible();
 });
}
