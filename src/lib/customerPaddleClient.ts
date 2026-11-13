import {parseAddressBlock} from './customerLiveAddress';
import {usableLiveAddress,usablePlace} from './customerLiveQuality';
let frame:HTMLIFrameElement|null=null, ready:Promise<void>|null=null, seq=0;
let warm:Promise<unknown>|null=null;
function getFrame(){
 if(ready)return ready;
 ready=new Promise<void>((resolve,reject)=>{
   const f=document.createElement('iframe');frame=f;f.hidden=true;f.title='Motor OCR local';f.src='/assets/customer-paddle-v4/index.html';f.setAttribute('aria-hidden','true');
   const cleanup=()=>{window.removeEventListener('message',listen);clearTimeout(timeout);};
   const listen=(e:MessageEvent)=>{if(e.source===f.contentWindow&&e.origin===location.origin&&e.data?.channel==='customer-paddle-v4'&&e.data.ready){cleanup();resolve();}};
   const timeout=window.setTimeout(()=>{cleanup();f.remove();frame=null;ready=null;warm=null;reject(Error('Motor OCR no disponible'));},90000);
   window.addEventListener('message',listen);document.body.append(f);
 });return ready;
}
async function request(action:'warm'|'read',file?:File):Promise<{text?:string}>{
 await getFrame();const target=frame?.contentWindow;if(!target)throw Error('Motor OCR no disponible');const id=++seq;
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{window.removeEventListener('message',listen);clearTimeout(timeout);};
  const listen=(e:MessageEvent)=>{if(e.source!==target||e.origin!==location.origin||e.data?.channel!=='customer-paddle-v4'||e.data.id!==id)return;cleanup();if(e.data.ok)resolve(e.data);else reject(Error('No se pudo leer con PaddleOCR'));};
  const timeout=window.setTimeout(()=>{cleanup();reject(Error('Tiempo de OCR agotado'));},90000);
  window.addEventListener('message',listen);target.postMessage({channel:'customer-paddle-v4',id,action,file},location.origin);
 });
}
export function preloadCustomerPaddle(){if(!warm)warm=request('warm').catch(()=>{warm=null;});return warm;}
export async function readPaddleAddress(file:File,onProgress:(s:string)=>void){
 onProgress('Leyendo dirección con PaddleOCR…');
 const {text}=await request('read',file);
 const r=parseAddressBlock(text??'');
 const valid=usableLiveAddress(r.address,r.sector,r.municipio);
 return {address:valid?r.address:'',sector:usablePlace(r.sector)?r.sector:'',municipio:usablePlace(r.municipio)?r.municipio:'',warning:valid?'':'Revisa los datos. Si falta información, repite solo la dirección o usa una foto original.'};
}
