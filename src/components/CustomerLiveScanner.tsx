import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2 } from 'lucide-react';
import {prepareZXingModule,readBarcodes} from 'zxing-wasm/reader';
import {preloadCustomerPaddle} from '../lib/customerPaddleClient';
import { cameraFailureMessage } from '../lib/cameraScanner';
import './customer-live-scanner.css';
import {addressGuide} from '../lib/customerLiveAddress';

import {readIdentityCode,type LiveIdentity} from '../lib/customerLiveIdentity';

export function CustomerLiveScanner({onCapture,onClose,initialIdentity=null}:{onCapture:(file:File|null,id:LiveIdentity)=>void;onClose:()=>void;initialIdentity?:LiveIdentity|null}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream|null>(null);
  const raf = useRef(0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const audioRef = useRef<AudioContext|null>(null);
  const active = useRef(false);
  const [phase,setPhase]=useState<'idle'|'starting'|'ready'|'address'|'detected'>('idle');
  const [message,setMessage]=useState('Activa la cámara y acerca el QR o código de barras de la cédula.');
  const [ratio,setRatio]=useState(1.58);
  const pending=useRef<LiveIdentity|null>(null);
  const capturing=useRef(false);

  const release=useCallback(()=>{
    generation.current++;active.current=false;cancelAnimationFrame(raf.current);pending.current=null;capturing.current=false;
    if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    if(video.current)video.current.srcObject=null;
  },[]);
  useEffect(()=>{
    const hidden=()=>{if(document.visibilityState==='hidden'){release();setPhase('idle');setMessage('Cámara detenida. Actívala nuevamente.');}};
    document.addEventListener('visibilitychange',hidden);
    return()=>{document.removeEventListener('visibilitychange',hidden);release();const a=audioRef.current;audioRef.current=null;if(a&&a.state!=='closed')void a.close().catch(()=>{});};
  },[release]);
  function unlock(){
    try {const A=window.AudioContext||(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!A)return;
      const a=audioRef.current??new A();audioRef.current=a;if(a.state==='suspended')void a.resume().catch(()=>{});
    }catch{/* Visual confirmation remains available. */}
  }
  function beep(){
    const a=audioRef.current;if(!a)return;
    const play=()=>{if(a.state!=='running'||audioRef.current!==a)return;try{
      const o=a.createOscillator(),g=a.createGain(),now=a.currentTime;
      o.type='sine';o.frequency.setValueAtTime(1100,now);g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(.65,now+.012);g.gain.exponentialRampToValueAtTime(.001,now+.18);
      o.connect(g).connect(a.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start(now);o.stop(now+.19);
    }catch{/* Sound must not interrupt the scan. */}};
    if(a.state==='running')play();else if(a.state==='suspended')void a.resume().then(play).catch(()=>{});
  }
  function finish(file:File|null,id:LiveIdentity){release();setPhase('detected');setMessage(file?'Cédula capturada. Leyendo dirección…':'Identificación leída. Completa la dirección con una foto.');timer.current=setTimeout(()=>{timer.current=null;onCapture(file,id);},260);}
  function stop(){release();setPhase('idle');setMessage('Cámara detenida. Puedes volver a activarla o subir una foto.');}
  async function start(){
    if(active.current)return;unlock();
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setMessage('La cámara necesita HTTPS y permiso del navegador. Abre la app en Safari o Chrome, o sube una foto.');return;}
    const token=++generation.current;active.current=true;setPhase('starting');setMessage('Permite el acceso a la cámara.');
    try{
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
      if(token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;const v=video.current;if(!v)throw Error('Cámara no disponible');
      for(const t of media.getVideoTracks())t.addEventListener('ended',()=>{if(token===generation.current){stop();setMessage('El acceso a la cámara terminó. Vuelve a activarla.');}},{once:true});
      v.srcObject=media;await v.play();if(token!==generation.current)return;
      const small=document.createElement('canvas'),sc=small.getContext('2d',{willReadFrequently:true});
      if(!sc)throw Error('No se pudo preparar la cámara');
      if(!initialIdentity)await prepareZXingModule({overrides:{locateFile:()=>'/assets/customer-paddle-v4/zxing_reader.wasm'},fireImmediately:true});if(token!==generation.current)return;
      let last=0;
      const addressStep=(id:LiveIdentity)=>{pending.current=id;setPhase('address');setMessage('Acerca solo el bloque de dirección, sector y municipio. Cuando el texto se vea nítido, pulsa Capturar dirección.');};
      if(initialIdentity){addressStep(initialIdentity);void preloadCustomerPaddle();}
      else {setPhase('ready');setMessage('Acerca el QR de la nueva cédula o el código de barras de la anterior. No necesitas mostrar toda la tarjeta.');}
      const tick=async(time:number)=>{
        if(token!==generation.current)return;
        if(v.videoWidth&&v.videoHeight)setRatio(v.videoWidth/v.videoHeight);
        if(!pending.current&&time-last>=150&&v.readyState>=2&&v.videoWidth&&v.videoHeight){
          last=time;
          const scale=Math.min(1,1280/Math.max(v.videoWidth,v.videoHeight)),dw=Math.round(v.videoWidth*scale),dh=Math.round(v.videoHeight*scale);
          if(small.width!==dw||small.height!==dh){small.width=dw;small.height=dh;}
          sc.drawImage(v,0,0,dw,dh);
          let id:LiveIdentity|null=null;
          try{
            const hits=await readBarcodes(sc.getImageData(0,0,dw,dh),{formats:['QRCode','Codabar','Code128','Code39'],tryHarder:true,maxNumberOfSymbols:4});
            if(token!==generation.current)return;
            for(const hit of hits){id=readIdentityCode(hit.text,hit.format==='QRCode'?'qr':'barcode');if(id)break;}
          }catch{/* Continue scanning. */}
          if(id){addressStep(id);beep();void preloadCustomerPaddle();}
        }
        raf.current=requestAnimationFrame(tick);
      };
      raf.current=requestAnimationFrame(tick);
    }catch(cause){if(token!==generation.current)return;release();setPhase('idle');setMessage(cameraFailureMessage(cause));}
  }
  function captureAddress(){
    const v=video.current,id=pending.current;
    if(!v||!id||capturing.current||v.readyState<2||!v.videoWidth)return;
    const {x,y,width,height}=addressGuide(v.videoWidth,v.videoHeight);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.drawImage(v,x,y,width,height,0,0,width,height);capturing.current=true;
    const token=generation.current;
    canvas.toBlob(blob=>{if(token!==generation.current)return;capturing.current=false;if(blob)finish(new File([blob],'direccion-camara.png',{type:'image/png'}),id);else setMessage('No se pudo capturar. Intenta nuevamente.');},'image/png');
  }
  return <section className="customer-live stack" aria-label="Escáner en vivo">
    <div className={'barcode-readiness '+(phase==='ready'||phase==='address'?'ready':phase==='detected'?'complete':'')} role="status" aria-live="polite">
      {phase==='detected'?<CheckCircle2 size={22} aria-hidden="true"/>:<span className="barcode-readiness-dot" aria-hidden="true"/>}
      <div><strong>{phase==='detected'?'Cédula detectada':phase==='address'?'Paso 2 de 2 · Dirección':phase==='ready'?'Paso 1 de 2 · Identificación (ZXing)':'Escaneo en vivo'}</strong><p>{message}</p></div>
    </div>
    <div className="customer-live-preview" hidden={phase!=='ready'&&phase!=='starting'&&phase!=='address'} style={{aspectRatio:ratio,maxWidth:'calc(48vh * '+ratio+')'}}>
      <video ref={video} muted autoPlay playsInline aria-label="Vista previa de la cámara de cédula"/>
      <div className={phase==="address"?"customer-address-guide":"customer-live-guide customer-qr-guide"} style={phase==="address"?{width:"86%",height:Math.min(.82,.86*ratio/1.65)*100+"%"}:undefined} aria-hidden="true"/>
    </div>
    <div className="modal-footer">
      <button type="button" className="button secondary" onClick={()=>{release();onClose();}}>Volver</button>
      {phase==='address'&&<><button type="button" className="button primary" onClick={captureAddress}>Capturar dirección</button><button type="button" className="button secondary" onClick={()=>{if(pending.current)finish(null,pending.current);}}>Usar identidad y completar dirección</button></>}
      {phase==='idle'?<button type="button" className="button primary" onClick={()=>void start()}><Camera size={17}/> Activar cámara</button>:phase!=='detected'&&<button type="button" className="button secondary" onClick={stop}><CameraOff size={17}/> Detener cámara</button>}
    </div>
  </section>;
}
