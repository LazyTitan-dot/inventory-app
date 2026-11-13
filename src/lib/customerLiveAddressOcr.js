/* global URL, Image, document, location */
import {createWorker} from 'tesseract5';
import {parseAddressBlock} from './customerLiveAddress';
import {usableLiveAddress,usablePlace} from './customerLiveQuality';
export async function readLiveAddress(file,onProgress=()=>{}){
 const url=URL.createObjectURL(file);let worker=null;
 try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
  const canvas=document.createElement('canvas');
  const scale=Math.min(2,Math.max(1,1300/img.naturalWidth));
  canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
  worker=await createWorker('spa',1,{workerPath:location.origin+'/assets/customer-ocr-v06/worker.min.js',corePath:location.origin+'/assets/customer-ocr-v06/core',langPath:location.origin+'/assets/customer-ocr-v06/lang',workerBlobURL:false,cacheMethod:'none',logger:m=>{if(m.status==='recognizing text')onProgress('Leyendo dirección… '+Math.round(m.progress*100)+'%');}});
  await worker.setParameters({tessedit_pageseg_mode:'6'});
  const {data}=await worker.recognize(canvas);
  const r=parseAddressBlock(data.text);
  const valid=r.complete&&usableLiveAddress(r.address,r.sector,r.municipio);
  return {address:valid?r.address:'',sector:usablePlace(r.sector)?r.sector:'',municipio:usablePlace(r.municipio)?r.municipio:'',warning:valid?'':'No se reconoció el bloque completo. Repite el encuadre de la dirección o completa los campos manualmente.'};
 }finally{URL.revokeObjectURL(url);if(worker)await worker.terminate().catch(()=>{});}
}
