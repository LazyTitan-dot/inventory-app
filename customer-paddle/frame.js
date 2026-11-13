import { PaddleOCR } from '@paddleocr/paddleocr-js';
const base=location.origin+'/assets/customer-paddle-v4/';
let engine;
function init(){return engine??=(PaddleOCR.create({textDetectionModelName:'PP-OCRv5_mobile_det',textDetectionModelAsset:{url:base+'PP-OCRv5_mobile_det.tar'},textRecognitionModelName:'latin_PP-OCRv5_mobile_rec',textRecognitionModelAsset:{url:base+'latin_PP-OCRv5_mobile_rec.tar'},ortOptions:{backend:'wasm',wasmPaths:base,numThreads:1},textRecognitionBatchSize:4}).catch(e=>{engine=null;throw e;}));}
let busy=false;
window.addEventListener('message',async e=>{
 if(e.source!==parent||e.origin!==location.origin||e.data?.channel!=='customer-paddle-v4')return;
 const {id,action,file}=e.data; if(!Number.isSafeInteger(id))return;
 const reply=(data)=>parent.postMessage({channel:'customer-paddle-v4',id,...data},location.origin);
 if(action==='warm'){try{await init();reply({ok:true});}catch{reply({ok:false});}return;}
 if(action!=='read'||!(file instanceof Blob)||busy)return;
 busy=true;let url;
 try{
   const ocr=await init();url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();
   const scale=Math.min(4,Math.max(1,800/img.naturalWidth)),c=document.createElement('canvas');
   c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
   const [result]=await ocr.predict(c,{textDetLimitSideLen:960,textRecScoreThresh:.35});
   const items=[...result.items].sort((a,b)=>Math.min(...a.poly.map(p=>p[1]))-Math.min(...b.poly.map(p=>p[1])));
   reply({ok:true,text:items.map(v=>v.text).join('\n')});
 }catch{reply({ok:false});}finally{if(url)URL.revokeObjectURL(url);busy=false;}
});
parent.postMessage({channel:'customer-paddle-v4',ready:true},location.origin);
