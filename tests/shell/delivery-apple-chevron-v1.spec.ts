import { test, expect } from './adaptation-fixtures';

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

// Mobile parity: preserve the entire clickable card while replacing only its
// visual trailing text with a cyan Apple-style chevron, both appearance modes.
for(const width of [320,375,390,430]){
 for(const theme of ['light','dark'] as const){
  test('Apple cyan disclosure in iPhone delivery card '+width+' '+theme,async({page},testInfo)=>{
   await page.setViewportSize({width,height:850});
   await page.emulateMedia({colorScheme:theme});
   await page.goto('/entregas');
   const root=page.locator('.delivery-visual-v1');
   const mobile=root.locator('.delivery-card-list');
   await expect(mobile).toBeVisible();
   await expect(mobile.locator('.delivery-list-card')).toHaveCount(1);
   const card=mobile.getByRole('button',{name:'Ver entrega a Cliente de prueba'});
   await expect(card).toBeVisible();
   await expect(card).toHaveAttribute('type','button');
   await expect(card).toHaveAttribute('aria-haspopup','dialog');
   await expect(card).not.toContainText('Ver entrega');
   const disclosure=card.locator('.delivery-mobile-disclosure');
   await expect(disclosure.locator('svg.lucide-chevron-right')).toHaveCount(1);
   await expect(disclosure).toHaveAttribute('aria-hidden','true');
   const geometry=await disclosure.evaluate(el=>{
    const target=el.getBoundingClientRect();
    const footer=el.closest('.delivery-card-bottom')!.getBoundingClientRect();
    const parent=el.closest('.delivery-visual-v1')!;
    const probe=document.createElement('span');
    probe.style.color='var(--sl-refined-accent)';
    parent.append(probe);
    const cyan=getComputedStyle(el).color===getComputedStyle(probe).color;
    probe.remove();
    return {width:target.width,height:target.height,rightGap:footer.right-target.right,cyan};
   });
   expect(geometry.width).toBeGreaterThanOrEqual(44);
   expect(geometry.height).toBeGreaterThanOrEqual(44);
   expect(geometry.rightGap).toBeGreaterThanOrEqual(-1);
   expect(geometry.rightGap).toBeLessThan(16);
   expect(geometry.cyan).toBe(true);
   await expect(root.locator('.delivery-desktop-table')).not.toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.screenshot({path:testInfo.outputPath('apple-cyan-iphone-'+width+'-'+theme+'.png'),fullPage:true});
   await card.click();
   const detail=page.getByRole('dialog',{name:'Entrega · VEN-PRUEBA-001'});
   await expect(detail).toBeVisible();
   await expect(detail.getByRole('region',{name:'Historial de entrega'})).toBeVisible();
   await detail.getByRole('button',{name:'Cerrar ventana'}).click();
   await expect(detail).not.toBeVisible();
   await expect(page).toHaveURL(/\/entregas$/);
   await expect(card).toBeVisible();
   await card.focus();
   await expect(card).toBeFocused();
   await card.press('Enter');
   await expect(detail).toBeVisible();
  });
 }
}
