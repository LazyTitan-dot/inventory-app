import { test, expect, customerId } from './adaptation-fixtures';
for (const [width,theme] of [[320,'light'],[390,'dark'],[430,'light'],[1440,'dark']] as const) {
 test(`customer workspace fits ${width}px in ${theme}`,async({page,featureData},testInfo)=>{
  await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:844});
  featureData.contacts.find(c=>c.id===customerId)!.name='Cliente de prueba con nombre completo largo';
  await page.goto('/clientes');
  const card=page.locator('.customer-directory-card').first(), avatar=card.locator('.contact-avatar');
  await expect(card).toBeVisible();
  const c=await card.boundingBox(),a=await avatar.boundingBox();expect(c).not.toBeNull();expect(a!.x-c!.x).toBeGreaterThanOrEqual(15);
  expect(c!.x+c!.width).toBeLessThanOrEqual(width+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:testInfo.outputPath('list.jpg'),type:'jpeg',quality:75});
  await card.locator('.customer-profile-trigger').click();
  const profile=page.getByRole('dialog',{name:'Cliente de prueba con nombre completo largo'});
  await expect(profile).toBeVisible();
  const b=await profile.boundingBox();expect(b).not.toBeNull();
  if(width<=760){expect(b!.x).toBe(0);expect(b!.width).toBe(width);expect(b!.height).toBe(844);await expect(profile.getByText('Clientes',{exact:true})).toBeVisible();}
  else {expect(b!.width).toBeLessThan(width);expect(b!.x+b!.width).toBeCloseTo(width,0);}
  expect(await profile.evaluate(e=>e.scrollWidth)).toBeLessThanOrEqual(Math.ceil(b!.width));
  await expect(profile.getByRole('link',{name:'Nueva venta'})).toHaveAttribute('href',/ventas\?contacto=/);
  await expect(profile.getByRole('link',{name:'Ver en Maps'})).toHaveAttribute('href',/google/);
  await page.screenshot({path:testInfo.outputPath('profile.jpg'),type:'jpeg',quality:75});
  await profile.getByRole('button',{name:'Agregar dirección'}).click();
  const street=profile.getByLabel('Calle y número');await expect(street).toBeVisible();
  if(width<=760){const sector=await profile.getByLabel('Sector',{exact:true}).boundingBox();const city=await profile.getByLabel('Ciudad o municipio').boundingBox();expect(city!.y).toBeGreaterThan(sector!.y);}
  await profile.getByRole('button',{name:'Cancelar',exact:true}).click();
  await profile.getByRole('button',{name:'Cerrar ventana'}).click();
  await expect(profile).not.toBeVisible();
  await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Agregar cliente'});
  await expect(editor.getByRole('button',{name:'Escanear cédula',exact:true})).toBeVisible();
  if(width<=760){const e=await editor.boundingBox();expect(e!.width).toBe(width);expect(e!.height).toBe(844);const phone=await editor.getByLabel('Teléfono',{exact:true}).boundingBox();const email=await editor.getByLabel('Correo electrónico').boundingBox();expect(email!.y).toBeGreaterThan(phone!.y);}
  await page.screenshot({path:testInfo.outputPath('editor.jpg'),type:'jpeg',quality:75});
  await editor.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(editor).not.toBeVisible();
 });
}
