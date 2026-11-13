import { test, expect } from './fixtures';
import { QRCodeWriter, BarcodeFormat } from '@zxing/library';

function qrSvg(value:string){
 const m=new QRCodeWriter().encode(value,BarcodeFormat.QR_CODE,260,260,new Map());
 let pixels='';for(let y=0;y<m.getHeight();y++)for(let x=0;x<m.getWidth();x++)if(m.get(x,y))pixels+='<rect x="'+x+'" y="'+y+'" width="1" height="1"/>';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#fff"/><g transform="translate(570 312)">'+pixels+'</g></svg>';
}
const addressSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#fff"/><g fill="#111" font-family="Arial" font-size="40"><text x="200" y="185">Dirección de residencia</text><text x="200" y="250">CALLE PRUEBA, EDIF. 12</text><text x="200" y="310">PISO 2 APTO 2-B</text><text x="200" y="380">Sector</text><text x="200" y="420">BARRIO</text><text x="200" y="460">FICTICIO</text><text x="200" y="510">Municipio</text><text x="200" y="570">DISTRITO NACIONAL</text></g></svg>';
const blankSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#ddd"/></svg>';
async function mockCamera(page:import('@playwright/test').Page,identitySvg:string){
 await page.addInitScript(({identitySvg,addressSvg,blankSvg})=>{
   const state={beeps:0,stops:0,starts:0,scene:0};Object.defineProperty(window,'__liveTest',{value:state});
   const original=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){state.beeps++;return original.call(this);};
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
     state.starts++;const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=884;const ctx=canvas.getContext('2d')!;
     const images=await Promise.all([identitySvg,addressSvg,blankSvg].map(async svg=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();return img;}));
     const draw=()=>ctx.drawImage(images[state.scene]!,0,0);draw();const stream=canvas.captureStream(15),interval=setInterval(draw,60);
     for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{state.stops++;clearInterval(interval);stop();};}return stream;
   }});
 },{identitySvg,addressSvg,blankSvg});
}
async function scene(page:import('@playwright/test').Page,n:number){await page.evaluate(n=>{(window as unknown as Window & {__liveTest:{scene:number}}).__liveTest.scene=n;},n);}
async function counters(page:import('@playwright/test').Page){return page.evaluate(()=> (window as unknown as Window & {__liveTest:{beeps:number;stops:number;starts:number}}).__liveTest);}
test('two steps read QR then separate address without requiring full card; retry keeps identity',async({page})=>{
 test.setTimeout(90000);
 await page.route('**/assets/customer-paddle-v4/index.html',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'content-security-policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'",'x-frame-options':'SAMEORIGIN'}});});
 await mockCamera(page,qrSvg('00000000000|PERSONA PRUEBA|APELLIDO|FICTICIO|fixture'));
 await page.goto('/clientes');await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Agregar cliente'});
 await modal.getByRole('button',{name:'Escanear cédula',exact:true}).click();
 await modal.getByRole('button',{name:'Escanear en vivo'}).click();await modal.getByRole('button',{name:'Activar cámara'}).click();
 const capture=modal.getByRole('button',{name:'Capturar dirección',exact:true});
 await expect(capture).toBeVisible({timeout:20000});await expect.poll(async()=> (await counters(page)).beeps).toBe(1);
 expect((await counters(page)).stops).toBe(0);
 await scene(page,2);await page.waitForTimeout(250);await capture.click();
 await expect(modal.getByRole('button',{name:'Repetir solo dirección'})).toBeVisible({timeout:60000});
 await expect(modal.getByLabel('Nombre completo',{exact:true})).toHaveValue('PERSONA PRUEBA APELLIDO FICTICIO');
 await expect(modal.locator('section textarea')).toHaveValue('');
 await expect.poll(async()=> (await counters(page)).stops).toBe(1);
 await scene(page,1);
 await modal.getByRole('button',{name:'Repetir solo dirección'}).click();await modal.getByRole('button',{name:'Activar cámara'}).click();
 await expect(capture).toBeVisible();await page.waitForTimeout(300);await capture.click();
 await expect(modal.getByRole('button',{name:'Aplicar datos al formulario'})).toBeVisible({timeout:60000});
 await expect(modal.locator('section textarea')).toHaveValue(/CALLE PRUEBA/);
 await expect(modal.locator('section textarea')).toHaveValue(/PISO 2/);
 await expect(modal.getByLabel('Sector',{exact:true})).toHaveValue('BARRIO FICTICIO');
 await expect(modal.getByLabel('Municipio',{exact:true})).toHaveValue('DISTRITO NACIONAL');
 expect((await counters(page)).beeps).toBe(1);expect((await counters(page)).stops).toBe(2);
 await modal.getByRole('button',{name:'Aplicar datos al formulario'}).click();
 await expect(modal.getByLabel('Nombre completo o razón social')).toHaveValue('PERSONA PRUEBA APELLIDO FICTICIO');
 await expect(modal.getByLabel('RNC o cédula')).toHaveValue('00000000000');
 await modal.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(modal).not.toBeVisible();
});
test('old card barcode opens address step and manual fallback preserves identity',async({page})=>{
 const patterns:Record<string,string>={'A':'nnwwnwn','B':'nwnwnnw','0':'nnnnnww','1':'nnnnwwn','2':'nnnwnnw','3':'wwnnnnn','4':'nnwnnwn','5':'wnnnnwn','6':'nwnnnnw','7':'nwnnwnn','8':'nwwnnnn','9':'wnnwnnn'};
 let x=20,bars='';for(const char of 'A01234567890B'){const p=patterns[char]!;for(let j=0;j<7;j++){const w=p[j]==='w'?9:3;if(j%2===0)bars+='<rect x="'+x+'" y="0" width="'+w+'" height="100"/>';x+=w;}x+=3;}
 await mockCamera(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#fff"/><g transform="translate(500 350)">'+bars+'</g></svg>');
 await page.goto('/clientes');await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'Agregar cliente'});
 await modal.getByRole('button',{name:'Escanear cédula',exact:true}).click();await modal.getByRole('button',{name:'Escanear en vivo'}).click();await modal.getByRole('button',{name:'Activar cámara'}).click();
 await modal.getByRole('button',{name:'Usar identidad y completar dirección'}).click({timeout:20000});
 await expect(modal.getByLabel('Cédula',{exact:true})).toHaveValue('012-3456789-0');
 await expect(modal.locator('section textarea')).toHaveValue('');
});
