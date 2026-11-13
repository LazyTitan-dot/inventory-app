import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2 } from 'lucide-react';
import jsQR from 'jsqr';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { cameraFailureMessage } from '../lib/cameraScanner';
import './customer-live-scanner.css';

import {readIdentityCode,type LiveIdentity} from '../lib/customerLiveIdentity';

export function CustomerLiveScanner({onCapture,onClose}:{onCapture:(file:File,id:LiveIdentity)=>void;onClose:()=>void}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream|null>(null);
  const raf = useRef(0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const audioRef = useRef<AudioContext|null>(null);
  const active = useRef(false);
  const [phase,setPhase]=useState<'idle'|'starting'|'ready'|'detected'>('idle');
  const [message,setMessage]=useState('Activa la cámara y coloca el reverso completo dentro del marco.');
  const [ratio,setRatio]=useState(1.58);

  const release=useCallback(()=>{
    generation.current++;active.current=false;cancelAnimationFrame(raf.current);
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
      const frame=document.createElement('canvas'),small=document.createElement('canvas');
      const fc=frame.getContext('2d',{willReadFrequently:true}),sc=small.getContext('2d',{willReadFrequently:true});
      if(!fc||!sc)throw Error('No se pudo preparar la cámara');
      const reader=new BrowserMultiFormatReader(new Map<DecodeHintType,unknown>([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.CODABAR,BarcodeFormat.CODE_128,BarcodeFormat.CODE_39]],[DecodeHintType.TRY_HARDER,true]]));
      let previous='',matches=0,last=0;
      setPhase('ready');setMessage('Cámara lista. Coloca el reverso completo en el marco y mantén la cédula quieta.');
      const tick=(time:number)=>{
        if(token!==generation.current)return;
        if(time-last>=220&&v.readyState>=2&&v.videoWidth&&v.videoHeight){
          last=time;
          const scale=Math.min(1,1920/Math.max(v.videoWidth,v.videoHeight)),w=Math.round(v.videoWidth*scale),h=Math.round(v.videoHeight*scale);
          if(frame.width!==w||frame.height!==h){frame.width=w;frame.height=h;setRatio(w/h);}
          fc.drawImage(v,0,0,w,h);
          const dscale=Math.min(1,960/Math.max(w,h)),dw=Math.round(w*dscale),dh=Math.round(h*dscale);
          if(small.width!==dw||small.height!==dh){small.width=dw;small.height=dh;}
          sc.drawImage(frame,0,0,dw,dh);
          let id:LiveIdentity|null=null;
          try{
            const pixels=sc.getImageData(0,0,dw,dh),q=jsQR(pixels.data,dw,dh,{inversionAttempts:'dontInvert'});
            if(q){const p=q.location;const size=Math.hypot(p.topRightCorner.x-p.topLeftCorner.x,p.topRightCorner.y-p.topLeftCorner.y);
              if(size>=Math.max(45,dw*.075))id=readIdentityCode(q.data,'qr');}
            if(!id){try{id=readIdentityCode(reader.decodeFromCanvas(small).getText(),'barcode');}catch{/* No valid old-format barcode in this frame. */}}
          }catch{/* Try the next frame. */}
          const key=id? id.mode+'|'+id.ced+'|'+id.full:'';
          matches=key&&key===previous?matches+1:key?1:0;previous=key;
          if(id&&matches>=2){
            const identity=id;
            // Freeze the exact frame that supplied the confirmed code. Do not take a different photograph.
            frame.toBlob(blob=>{
              if(token!==generation.current)return;
              if(!blob){stop();setMessage('No se pudo capturar la imagen. Inténtalo de nuevo.');return;}
              release();setPhase('detected');setMessage('Cédula detectada. Leyendo dirección…');beep();
              timer.current=setTimeout(()=>{timer.current=null;onCapture(new File([blob],'cedula-camara.png',{type:'image/png'}),identity);},260);
            },'image/png');
            return;
          }
        }
        raf.current=requestAnimationFrame(tick);
      };
      raf.current=requestAnimationFrame(tick);
    }catch(cause){if(token!==generation.current)return;release();setPhase('idle');setMessage(cameraFailureMessage(cause));}
  }
  return <section className="customer-live stack" aria-label="Escáner en vivo">
    <div className={'barcode-readiness '+(phase==='ready'?'ready':phase==='detected'?'complete':'')} role="status" aria-live="polite">
      {phase==='detected'?<CheckCircle2 size={22} aria-hidden="true"/>:<span className="barcode-readiness-dot" aria-hidden="true"/>}
      <div><strong>{phase==='detected'?'Cédula detectada':phase==='ready'?'Cámara lista':'Escaneo en vivo'}</strong><p>{message}</p></div>
    </div>
    <div className="customer-live-preview" hidden={phase!=='ready'&&phase!=='starting'} style={{aspectRatio:ratio,maxWidth:'calc(48vh * '+ratio+')'}}>
      <video ref={video} muted autoPlay playsInline aria-label="Vista previa de la cámara de cédula"/>
      <div className="customer-live-guide" aria-hidden="true"/>
    </div>
    <div className="modal-footer">
      <button type="button" className="button secondary" onClick={()=>{release();onClose();}}>Volver</button>
      {phase==='idle'?<button type="button" className="button primary" onClick={()=>void start()}><Camera size={17}/> Activar cámara</button>:phase!=='detected'&&<button type="button" className="button secondary" onClick={stop}><CameraOff size={17}/> Detener cámara</button>}
    </div>
  </section>;
}
