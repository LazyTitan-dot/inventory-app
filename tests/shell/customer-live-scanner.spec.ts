import { test, expect } from './fixtures';
import { QRCodeWriter, BarcodeFormat } from '@zxing/library';

test('live customer scanner confirms the same QR, beeps, releases camera and applies draft only', async ({ page }) => {
  test.setTimeout(90000);
  const matrix=new QRCodeWriter().encode('00000000000|PERSONA PRUEBA|APELLIDO|FICTICIO|fixture',BarcodeFormat.QR_CODE,240,240,new Map());
  let pixels='';for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)if(matrix.get(x,y))pixels+='<rect x="'+x+'" y="'+y+'" width="1" height="1"/>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#d5e4f8"/><g transform="translate(480 35)"><rect width="240" height="240" fill="white"/>'+pixels+'</g><g fill="#111" font-family="Arial" font-size="26"><text x="745" y="247">Dirección de residencia</text><text x="745" y="279">CALLE PRUEBA, EDIF. 12</text><text x="745" y="308">PISO 2 APTO 2-B</text><text x="745" y="333">Sector</text><text x="745" y="371">BARRIO FICTICIO</text><text x="745" y="404">Municipio</text><text x="745" y="443">DISTRITO NACIONAL</text></g></svg>';
  await page.addInitScript(svg=>{
    const state={beeps:0,stops:0};Object.defineProperty(window,'__liveTest',{value:state});
    const original=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){state.beeps++;return original.call(this);};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
      const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=884;
      const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
      const ctx=canvas.getContext('2d')!;const draw=()=>ctx.drawImage(img,0,0);draw();
      const stream=canvas.captureStream(15), interval=setInterval(draw,60);
      for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{state.stops++;clearInterval(interval);stop();};}
      return stream;
    }});
  },svg);
  await page.goto('/clientes');
  await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Agregar cliente'});
  await modal.getByRole('button',{name:'Escanear cédula',exact:true}).click();
  await modal.getByRole('button',{name:'Escanear en vivo'}).click();
  await modal.getByRole('button',{name:'Activar cámara'}).click();
  await expect(modal.getByRole('button',{name:'Aplicar datos al formulario'})).toBeVisible({timeout:60000});
  await expect(modal.getByLabel('Nombre completo',{exact:true})).toHaveValue('PERSONA PRUEBA APELLIDO FICTICIO');
  await expect(modal.getByLabel('Cédula',{exact:true})).toHaveValue('000-0000000-0');
  const counters=await page.evaluate(()=> (window as unknown as Window & {__liveTest:{beeps:number;stops:number}}).__liveTest);
  expect(counters.beeps).toBe(1);expect(counters.stops).toBe(1);
  await expect(modal.locator('section textarea')).toHaveValue(/CALLE PRUEBA/i);
  await expect(modal.locator('section textarea')).toHaveValue(/PISO 2/i);
  await expect(modal.getByLabel('Sector',{exact:true})).toHaveValue(/FICTICIO/i);
  await expect(modal.getByLabel('Municipio',{exact:true})).toHaveValue(/DISTRITO NACIONAL/i);
  await modal.locator('section textarea').fill('Calle de prueba, 12');
  await modal.getByRole('button',{name:'Aplicar datos al formulario'}).click();
  await expect(modal.getByLabel('Nombre completo o razón social')).toHaveValue('PERSONA PRUEBA APELLIDO FICTICIO');
  await expect(modal.getByLabel('RNC o cédula')).toHaveValue('00000000000');
  await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(modal).not.toBeVisible();
});

test('old card live scanner ignores its UUID QR and reads the horizontal Codabar', async ({page})=>{
  test.setTimeout(90000);
  const qr=new QRCodeWriter().encode('11111111-2222-4333-8444-555555555555',BarcodeFormat.QR_CODE,160,160,new Map());
  let rects='';for(let y=0;y<qr.getHeight();y++)for(let x=0;x<qr.getWidth();x++)if(qr.get(x,y))rects+='<rect x="'+x+'" y="'+y+'" width="1" height="1"/>';
  const patterns:Record<string,string>={'A':'nnwwnwn','B':'nwnwnnw','0':'nnnnnww','1':'nnnnwwn','2':'nnnwnnw','3':'wwnnnnn','4':'nnwnnwn','5':'wnnnnwn','6':'nwnnnnw','7':'nwnnwnn','8':'nwwnnnn','9':'wnnwnnn'};
  let x=20,bars='';for(const char of 'A01234567890B'){const p=patterns[char]!;for(let j=0;j<7;j++){const w=p[j]==='w'?9:3;if(j%2===0)bars+='<rect x="'+x+'" y="0" width="'+w+'" height="100"/>';x+=w;}x+=3;}
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#fff"/><g transform="translate(410 32)">'+rects+'</g><g transform="translate(650 55)">'+bars+'</g><g font-size="25" fill="#111"><text x="10" y="410">DIRECCION DE RESIDENCIA</text><text x="10" y="465">CALLE DE PRUEBA 12</text><text x="10" y="510">SECTOR</text><text x="10" y="550">SECTOR FICTICIO</text><text x="10" y="590">MUNICIPIO</text><text x="10" y="620">DISTRITO NACIONAL</text></g></svg>';
  await page.addInitScript(svg=>{
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
      const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=884;const ctx=canvas.getContext('2d')!;
      const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
      const draw=()=>ctx.drawImage(img,0,0);draw();const stream=canvas.captureStream(15),interval=setInterval(draw,60);
      for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{clearInterval(interval);stop();};}return stream;
    }});
  },svg);
  await page.goto('/clientes');await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Agregar cliente'});
  await modal.getByRole('button',{name:'Escanear cédula',exact:true}).click();await modal.getByRole('button',{name:'Escanear en vivo'}).click();await modal.getByRole('button',{name:'Activar cámara'}).click();
  await expect(modal.getByRole('button',{name:'Aplicar datos al formulario'})).toBeVisible({timeout:60000});
  await expect(modal.getByLabel('Cédula',{exact:true})).toHaveValue('012-3456789-0');
});

test('a distant QR cannot trigger automatic address capture; identity-only fallback works', async ({page})=>{
  test.setTimeout(60000);
  const matrix=new QRCodeWriter().encode('00000000000|PERSONA PRUEBA|APELLIDO|FICTICIO|fixture',BarcodeFormat.QR_CODE,150,150,new Map());
  let pixels='';for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)if(matrix.get(x,y))pixels+='<rect x="'+x+'" y="'+y+'" width="1" height="1"/>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="884"><rect width="1400" height="884" fill="#e6e6e6"/><g transform="translate(600 300)"><rect width="150" height="150" fill="white"/>'+pixels+'</g></svg>';
  await page.addInitScript(svg=>{
    const state={beeps:0,stops:0};Object.defineProperty(window,'__liveTest',{value:state});
    const original=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){state.beeps++;return original.call(this);};
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
      const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=884;
      const ctx=canvas.getContext('2d')!,img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();
      const draw=()=>ctx.drawImage(img,0,0);draw();const stream=canvas.captureStream(15),interval=setInterval(draw,60);
      for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{state.stops++;clearInterval(interval);stop();};}return stream;
    }});
  },svg);
  await page.goto('/clientes');await page.getByRole('button',{name:'Agregar cliente',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Agregar cliente'});
  await modal.getByRole('button',{name:'Escanear cédula',exact:true}).click();await modal.getByRole('button',{name:'Escanear en vivo'}).click();await modal.getByRole('button',{name:'Activar cámara'}).click();
  const fallback=modal.getByRole('button',{name:'Usar identidad y completar dirección'});
  await expect(fallback).toBeVisible({timeout:20000});
  await expect(modal.getByRole('button',{name:'Aplicar datos al formulario'})).toHaveCount(0);
  const before=await page.evaluate(()=> (window as unknown as Window & {__liveTest:{beeps:number;stops:number}}).__liveTest);
  expect(before.beeps).toBe(0);expect(before.stops).toBe(0);
  await fallback.click();
  await expect(modal.getByRole('button',{name:'Aplicar datos al formulario'})).toBeVisible();
  await expect(modal.getByLabel('Nombre completo',{exact:true})).toHaveValue('PERSONA PRUEBA APELLIDO FICTICIO');
  await expect(modal.locator('section textarea')).toHaveValue('');
  await expect(modal.getByLabel('Subir foto del reverso (misma cédula)')).toBeVisible();
  const after=await page.evaluate(()=> (window as unknown as Window & {__liveTest:{beeps:number;stops:number}}).__liveTest);
  expect(after.beeps).toBe(1);expect(after.stops).toBe(1);
});
