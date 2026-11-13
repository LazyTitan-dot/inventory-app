/* eslint-disable */
// Port of the laboratory v0.6. Independent of product receiving.
import jsQR from 'jsqr';
import * as Z from '@zxing/library';
import {createWorker} from 'tesseract5';
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
function cFormat(s){s=s.replace(/\D/g,"");return s.length===11?s.slice(0,3)+"-"+s.slice(3,10)+"-"+s.slice(10):"";}
function idMatch(s){const m=String(s||"").match(/\b\d{3}[- ]?\d{7}[- ]?\d\b/);return m?cFormat(m[0]):"";}
function canvasFrom(src,x=0,y=0,w=src.width,h=src.height,max=1700){const c=document.createElement("canvas"),scale=Math.min(1,max/Math.max(w,h));c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext("2d",{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,c.width,c.height);const m=src._coords||{x:0,y:0,sx:1,sy:1};c._coords={x:m.x+x*m.sx,y:m.y+y*m.sy,sx:w/c.width*m.sx,sy:h/c.height*m.sy};return c;}
function region(c,x,y,w,h){return canvasFrom(c,c.width*x,c.height*y,c.width*w,c.height*h);}
function colorCard(c){const k=canvasFrom(c,0,0,c.width,c.height,500),d=k.getContext("2d").getImageData(0,0,k.width,k.height).data;let xs=[],ys=[];for(let y=0;y<k.height;y++)for(let x=0;x<k.width;x++){let i=(y*k.width+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(Math.max(r,g,b)-Math.min(r,g,b)>15&&Math.max(r,g,b)>90){xs.push(x);ys.push(y);}}if(xs.length<k.width*k.height*.015)return c;xs.sort((a,b)=>a-b);ys.sort((a,b)=>a-b);let i=Math.floor(xs.length*.005),j=xs.length-i-1,x=Math.max(0,xs[i]-2),y=Math.max(0,ys[i]-2),w=Math.min(k.width-x,xs[j]-x+3),h=Math.min(k.height-y,ys[j]-y+3);if(w/h>1.2&&w/h<2.2)return region(c,x/k.width,y/k.height,w/k.width,h/k.height);return c;}
function padded(c,scale=3,channel="rgb"){const o=document.createElement("canvas");let w=Math.round(c.width*scale),h=Math.round(c.height*scale),p=32;o.width=w+2*p;o.height=h+2*p;let ctx=o.getContext("2d",{willReadFrequently:true});ctx.fillStyle="white";ctx.fillRect(0,0,o.width,o.height);ctx.drawImage(c,p,p,w,h);if(channel!=="rgb"){let d=ctx.getImageData(0,0,o.width,o.height),hist=new Array(256).fill(0),a=d.data;for(let i=0;i<a.length;i+=4){let v=channel==="green"?a[i+1]:Math.max(a[i],a[i+1],a[i+2]);a[i]=a[i+1]=a[i+2]=v;hist[v]++;}let total=a.length/4,sum=hist.reduce((z,v,i)=>z+v*i,0),n=0,ss=0,best=0,t=128;for(let i=0;i<256;i++){n+=hist[i];if(!n||n===total)continue;ss+=i*hist[i];let z=n*(total-n)*(ss/n-(sum-ss)/(total-n))**2;if(z>best){best=z;t=i;}}for(let i=0;i<a.length;i+=4)a[i]=a[i+1]=a[i+2]=a[i]>t?255:0;ctx.putImageData(d,0,0);}return o;}
function qrRead(c){try{let d=c.getContext("2d",{willReadFrequently:true}).getImageData(0,0,c.width,c.height);return jsQR(d.data,c.width,c.height,{inversionAttempts:"attemptBoth"})?.data||null;}catch{return null;}}
function qrSearch(raw,card){let crops=[region(card,.31,.005,.25,.34),region(raw,.34,.355,.21,.12),card,raw];for(let c of crops){let q=qrRead(padded(c,c.width<400?3:1));if(q)return q;q=qrRead(padded(c,c.width<400?3:1,"max"));if(q)return q;}return null;}


function qrGeometry(raw,card){
  const candidates=[region(card,.31,.005,.25,.34),region(raw,.34,.355,.21,.12),card,raw];
  for(const c of candidates){
    for(const ch of ["rgb","max"]){
      const scale=c.width<400?3:1, p=32, b=padded(c,scale,ch);
      const d=b.getContext("2d",{willReadFrequently:true}).getImageData(0,0,b.width,b.height);
      let q;try{q=jsQR(d.data,b.width,b.height,{inversionAttempts:"attemptBoth"});}catch{continue;}
      if(!q||!q.location)continue;
      const map=c._coords||{x:0,y:0,sx:1,sy:1};
      const pt=v=>[map.x+(v.x-p)/scale*map.sx,map.y+(v.y-p)/scale*map.sy];
      const loc=q.location;
      return {data:q.data,points:[loc.topLeftCorner,loc.topRightCorner,loc.bottomRightCorner,loc.bottomLeftCorner].map(pt)};
    }
  }
  return null;
}
function qrMap(points){
  const uv=[[0,0],[1,0],[1,1],[0,1]], a=[];
  for(let i=0;i<4;i++){let [u,v]=uv[i],[x,y]=points[i];a.push([u,v,1,0,0,0,-u*x,-v*x,x]);a.push([0,0,0,u,v,1,-u*y,-v*y,y]);}
  for(let i=0;i<8;i++){let k=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;if(Math.abs(a[k][i])<1e-9)return null;[a[i],a[k]]=[a[k],a[i]];let n=a[i][i];for(let j=i;j<9;j++)a[i][j]/=n;for(let k=0;k<8;k++)if(k!==i){n=a[k][i];for(let j=i;j<9;j++)a[k][j]-=n*a[i][j];}}
  return a.map(r=>r[8]);
}
function qrWarp(raw,points,box){
  const m=qrMap(points);if(!m)return null;
  const [x,y,w,h]=box,W=Math.round(w*550),H=Math.round(h*550);
  if(W<10||H<10||W>2000||H>1000)return null;
  const project=(u,v)=>{let den=m[6]*u+m[7]*v+1;return [(m[0]*u+m[1]*v+m[2])/den,(m[3]*u+m[4]*v+m[5])/den];};
  for(const [u,v] of [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]){let [X,Y]=project(u,v);if(!Number.isFinite(X)||!Number.isFinite(Y)||X<0||Y<0||X>=raw.width||Y>=raw.height)return null;}
  const src=raw.getContext("2d",{willReadFrequently:true}).getImageData(0,0,raw.width,raw.height).data;
  const c=document.createElement("canvas");c.width=W;c.height=H;const ctx=c.getContext("2d",{willReadFrequently:true}),out=ctx.createImageData(W,H);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){let [X,Y]=project(x+i/(W-1)*w,y+j/(H-1)*h),x0=Math.floor(X),y0=Math.floor(Y),fx=X-x0,fy=Y-y0;let p=(j*W+i)*4;for(let k=0;k<3;k++){let q=(y0*raw.width+x0)*4+k,r=q+raw.width*4;out.data[p+k]=Math.round(src[q]*(1-fx)*(1-fy)+src[q+4]*fx*(1-fy)+src[r]*(1-fx)*fy+src[r+4]*fx*fy);}out.data[p+3]=255;}
  ctx.putImageData(out,0,0);return c;
}

function decode(c,formats){try{const Z=Z;if(!Z)return null;let hints=new Map([[Z.DecodeHintType.POSSIBLE_FORMATS,formats],[Z.DecodeHintType.TRY_HARDER,true]]);let data=c.getContext("2d",{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;let gray=new Uint8ClampedArray(c.width*c.height);for(let i=0,j=0;i<data.length;i+=4,j++)gray[j]=(data[i]+2*data[i+1]+data[i+2])>>2;const src=new Z.RGBLuminanceSource(gray,c.width,c.height);const reader=new Z.MultiFormatReader();reader.setHints(hints);return reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(src))).getText();}catch{return null;}}
function parseQR(s){if(!s)return null;let a=s.split("|").map(x=>x.trim());if(a.length>=4&&/^\d{11}$/.test(a[0].replace(/-/g,""))&&a.slice(1,4).every(v=>v.length>0&&/^[\p{L} .'-]+$/u.test(v)))return {ced:cFormat(a[0]),first:a[1],last:a[2]+" "+a[3]};return null;}

export async function scanCustomerId(file,requestedMode,say=()=>{}) {
 const result={ced:"",first:"",last:"",full:"",address:"",sector:"",municipio:"",sources:{},warning:""};
 let worker=null; const set=(id,v,source)=>{if(v){result[id]=v.trim();if(source)result.sources[id]=source;}};
 const url=URL.createObjectURL(file);let image=new Image();
 try { await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("No se pudo abrir la foto. Usa JPG o PNG."));image.src=url;});
 async function ocr(c,psm="6"){if(!worker){worker=await createWorker("spa",1,{workerPath:location.origin+"/assets/customer-ocr-v06/worker.min.js",corePath:location.origin+"/assets/customer-ocr-v06/core",langPath:location.origin+"/assets/customer-ocr-v06/lang",workerBlobURL:false,cacheMethod:"none",logger:m=>{if(m.status==="recognizing text")say("Leyendo texto… "+Math.round(m.progress*100)+"%");}});}await worker.setParameters({tessedit_pageseg_mode:psm});const result=await worker.recognize(c);return result.data;}
function prep(c){const out=canvasFrom(c,0,0,c.width,c.height,1900);if(out.width<1150){const k=document.createElement("canvas");k.width=Math.min(1600,out.width*2);k.height=Math.round(out.height*k.width/out.width);k.getContext("2d").drawImage(out,0,0,k.width,k.height);return k;}return out;}
function parseAddress(t){const lines=t.split(/\n/).map(x=>x.trim()).filter(Boolean);let a="",s="",m="";const idx=lines.findIndex(x=>/DIRECCI[OÓ]N\s+DE\s+RESIDENCIA/i.test(x));if(idx>=0){let block=[];for(let i=idx+1;i<Math.min(lines.length,idx+5);i++){if(/^(SECTOR|MUNICIPIO|C[ÓO]DIGO|REGISTRO)/i.test(lines[i]))break;block.push(lines[i]);}a=block.join(" ");}const get=label=>{let i=lines.findIndex(x=>norm(x).startsWith(label));if(i<0)return "";let tail=lines[i].replace(new RegExp("^"+label+"\\s*[:. ]*","i"),"").trim();return tail||lines[i+1]||"";};s=get("SECTOR");m=get("MUNICIPIO");if(s&&a.endsWith(s))a=a.slice(0,-s.length).trim();return {address:a,sector:s,municipio:m};}
function parseFront(t){const lines=t.split(/\n/).map(x=>x.trim()).filter(Boolean);const get=label=>{let i=lines.findIndex(x=>norm(x)===label);return i>=0?lines[i+1]||"":"";};let first=get("NOMBRE"),last=get("APELLIDO");let i=lines.findIndex(x=>norm(x)==="APELLIDO");if(i>=0&&lines[i+2]&&/^[\p{L} -]+$/u.test(lines[i+2])&&!/NACIONALIDAD|FECHA|SEXO|ESTADO|LUGAR|OCUPACI/i.test(norm(lines[i+2])))last+=" "+lines[i+2];if(!first||!last){const upper=lines.filter(x=>/^[\p{Lu}][\p{Lu} .'-]{5,}$/u.test(x)&&!/(REPUBLICA|DOMINICANA|ELECTORAL|JUNTA|IDENTIDAD|NACIMIENTO|AGOSTO|NACIONALIDAD|OCUPACION|ESTUDIANTE|SOLTERO|EXPIRACION|SANTIAGO|CEDULA|DOCUMENTO)/.test(norm(x)));if(upper.length>=2){first=first||upper[upper.length-2];last=last||upper[upper.length-1];}}return {first,last,ced:idMatch(t)};}

 say("Preparando imagen…");const raw=canvasFrom(image,0,0,image.naturalWidth,image.naturalHeight,1800);raw._coords={x:0,y:0,sx:1,sy:1};let card=colorCard(raw),mode=requestedMode;let qr=null;const geom=qrGeometry(raw,card);qr=geom?geom.data:qrSearch(raw,card);const q=parseQR(qr);if(mode==="auto"){if(q)mode="new";else if(qr)mode="old";else{let probe=await ocr(prep(card));let t=norm(probe.text);if(/DIRECCI[O0]N.{0,15}RESIDENCIA|COLEGIO ELECTORAL|IDDOM/.test(t))mode=card.width/card.height>1.2&&card.width/card.height<2.2&&raw.height/raw.width>1.25?"new":"old";else if(/NACIMIENTO|NACIONALIDAD|NOMBRE|APELLIDO/.test(t))mode="front";else{throw Error("No se reconoció la cara. Selecciona el formato manualmente.");}}}if(mode==="old"&&raw.height/raw.width>1.05&&raw.height/raw.width<1.65)mode="combined";if(mode==="combined")card=region(raw,0,.5,1,.5);else if(mode==="old")card=raw.width/raw.height<1.1?colorCard(raw):raw;
if(q){set("ced",q.ced,"QR del documento");set("first",q.first,"QR del documento");set("last",q.last,"QR del documento");set("full",q.first+" "+q.last,"QR del documento");}else if(mode==="old"||mode==="combined"){let id="";for(const c of [region(card,.42,0,.55,.26),card]){let b=decode(c,[Z.BarcodeFormat.CODABAR,Z.BarcodeFormat.CODE_128,Z.BarcodeFormat.CODE_39]);id=b&&/^[A-D]?\d{11}[A-D]?$/i.test(b)?cFormat(b):idMatch(b);if(id)break;}if(id)set("ced",id,"Código de barras");}
if(mode==="front"){say("Leyendo frente…");let d=await ocr(prep(card)),p=parseFront(d.text);if(!result.ced)set("ced",p.ced,"OCR · revisar");set("first",p.first,"OCR · revisar");set("last",p.last,"OCR · revisar");if(p.first&&p.last)set("full",p.first+" "+p.last,"OCR · revisar");}
else{say("Leyendo dirección…");let a={};if(mode==="new"||mode==="old"||mode==="combined"){const isNew=mode==="new";const anchored=isNew&&q&&geom;const boxes=anchored?{address:[1.07,1.00,1.98,.29],sector:[1.04,1.40,2.01,.29],municipio:[1.07,1.74,1.98,.22]}:isNew?{address:[.53,.29,.32,.105],sector:[.53,.42,.30,.065],municipio:[.53,.50,.32,.065]}:{address:[.005,.425,.85,.065],sector:[.005,.513,.48,.056],municipio:[.005,.60,.48,.055]};const read=async(box,psm)=>{let c=anchored?qrWarp(raw,geom.points,box):null;if(!c&&anchored){const old=box===boxes.address?[.53,.29,.32,.105]:box===boxes.sector?[.53,.42,.30,.065]:[.53,.50,.32,.065];c=region(card,...old);}else if(!c)c=region(card,...box);let d=await ocr(padded(c,anchored?1:4,"max"),psm);return d.text.trim();};let addressText=await read(boxes.address,isNew?"6":"7");let lines=addressText.split(/\n/).map(x=>x.trim()).filter(Boolean).filter(x=>!/^DIRECCI[OÓ0]N\s+DE\s+RESIDENCIA\s*[:.]?$/i.test(x));a.address=lines.join("\n").replace(/[\t ]+/g," ").trim();const cleanPlace=t=>{let v=String(t||"").normalize("NFC").split(/\n/).map(x=>x.trim()).filter(Boolean).join(" ").replace(/^(SECTOR|MUNICIPIO)\s*[:.]?\s*/i,"").replace(/[^\p{L}\p{N} .'-]+/gu," ").replace(/\s+/g," ").trim();let parts=v.split(" ");while(parts.length>1&&(/^\d+$/.test(parts.at(-1))||parts.at(-1).length<=2&&/^[A-Za-z]+$/.test(parts.at(-1))&&!/^(DE|LA|EL)$/i.test(parts.at(-1))))parts.pop();v=parts.join(" ").replace(/[\s.'-]+$/,"").trim();return v.length>=4&&/[A-ZÁÉÍÓÚÑ]{3}/i.test(v)&&v.split(" ").some(x=>x.length>=4)?v:"";};a.sector=cleanPlace((await read(boxes.sector,anchored?"6":"7")).split(/\n/).find(x=>x.trim()&&!/^(SECTOR|MUNICIP)/i.test(x.trim()))||"");a.municipio=cleanPlace(await read(boxes.municipio,"7"));if(!a.address||!a.sector||!a.municipio){let d=await ocr(prep(card)),p=parseAddress(d.text);a.address=a.address||p.address;a.sector=a.sector||cleanPlace(p.sector);a.municipio=a.municipio||cleanPlace(p.municipio);if(!result.ced)set("ced",idMatch(d.text),"OCR · revisar");}if(isNew&&!q&&!result.ced){let mrz=await ocr(padded(region(card,.04,.64,.92,.32),2,"max"),"6");let m=mrz.text.match(/<([0-9]{11})</);if(m)set("ced",cFormat(m[1]),"MRZ · revisar");}}set("address",a.address,mode==="new"&&q&&geom?"OCR guiado por QR · confirma ambas líneas y el apartamento":"OCR · confirma ambas líneas y el apartamento");set("sector",a.sector);set("municipio",a.municipio);if(mode==="combined"&&(!result.first||!result.last)){let f=await ocr(prep(region(raw,0,0,1,.5))),p=parseFront(f.text);if(!result.ced)set("ced",p.ced,"OCR · revisar");set("first",p.first,"OCR · revisar");set("last",p.last,"OCR · revisar");if(p.first&&p.last)set("full",p.first+" "+p.last,"OCR · revisar");}}

 return result;
 }catch(e){if(!result.ced&&!result.full&&!result.address)throw e;result.warning="Lectura parcial. Completa los campos que faltan.";return result;}finally{URL.revokeObjectURL(url);if(worker)await worker.terminate().catch(()=>{});}
}
