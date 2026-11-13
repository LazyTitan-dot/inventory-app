import { test, expect, customerId } from './adaptation-fixtures';
test('new customer saves structured Casa in the same command and shows preferred address', async ({page,featureData})=>{
  const id='20000000-0000-4000-8000-000000000099';
  let payload:Record<string,unknown>|undefined;
  await page.route('**/rest/v1/rpc/retail_command', async route=>{
    const body=route.request().postDataJSON();payload=body.p_payload;
    const p=body.p_payload,a=p.initial_home_address;
    featureData.contacts.push({id,kind:'customer',name:p.name,phone:p.phone,email:null,tax_id:null,address:p.address,notes:null,active:true,created_at:'2026-11-13',updated_at:'2026-11-13'});
    featureData.customer_addresses!.push({id:'20000000-0000-4000-8000-000000000098',contact_id:id,...a,label:'Casa',is_default:true,active:true,created_at:'2026-11-13',updated_at:'2026-11-13'});
    await route.fulfill({json:{operation_id:body.p_operation,action:'save_contact',entity_id:id,result:{}},headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/clientes');await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
  const m=page.getByRole('dialog',{name:'Agregar cliente'});
  await m.getByLabel('Nombre completo o razón social').fill('Cliente nuevo de prueba');
  await m.getByLabel('Teléfono',{exact:true}).fill('8095550123');
  await m.getByLabel('Calle y número').fill('Calle Prueba 12');
  await m.getByLabel('Sector',{exact:true}).fill('Sector Prueba');
  await m.getByRole('textbox',{name:/Municipio/}).fill('Distrito Nacional');
  await expect(m.getByLabel('Provincia',{exact:true})).toHaveValue('Distrito Nacional');
  await expect(m.getByRole('textbox',{name:/Teléfono de entrega/})).toHaveValue('8095550123');
  await m.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(m).not.toBeVisible();
  expect(payload?.initial_home_address).toMatchObject({street:'Calle Prueba 12',sector:'Sector Prueba',city:'Santo Domingo de Guzmán',province:'Distrito Nacional',phone:'8095550123'});
  await page.locator('.customer-profile-trigger').filter({hasText:'Cliente nuevo de prueba'}).click();
  const profile=page.getByRole('dialog',{name:'Cliente nuevo de prueba'});
  await expect(profile).toContainText('Casa');await expect(profile).toContainText('Preferida');
});
test('legacy customer first address is prefilled for review without saving', async ({page,featureData})=>{
  featureData.customer_addresses=[];featureData.contacts.find(c=>c.id===customerId)!.address='Calle Uno, Edif. 12, Centro, DISTRITO NACIONAL';
  await page.goto('/clientes?contacto='+customerId);
  const m=page.getByRole('dialog',{name:'Cliente de prueba'});
  await m.getByRole('button',{name:'Agregar dirección'}).click();
  await expect(m.getByRole('textbox',{name:/Etiqueta de la dirección/})).toHaveValue('Casa');
  await expect(m.getByLabel('Calle y número')).toHaveValue('Calle Uno, Edif. 12');
  await expect(m.getByLabel('Sector',{exact:true})).toHaveValue('Centro');
  await expect(m.getByLabel('Provincia',{exact:true})).toHaveValue('Distrito Nacional');
  await expect(m.getByRole('checkbox',{name:'Usar como dirección preferida'})).toBeChecked();
});
