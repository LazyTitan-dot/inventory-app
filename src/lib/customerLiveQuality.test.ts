import {describe,it,expect} from 'vitest';
import {cardCrop,stableCrop,usableLiveAddress} from './customerLiveQuality';
describe('live customer image quality',()=>{
 it('bounds a complete readable card and rejects a small or clipped QR',()=>{
   const crop=cardCrop({x:500,y:50},{x:710,y:50},{x:500,y:260},{x:710,y:260},1400,884);
   expect(crop?.width).toBeGreaterThan(1000);
   expect(cardCrop({x:500,y:50},{x:590,y:50},{x:500,y:140},{x:590,y:140},1400,884)).toBeNull();
   expect(cardCrop({x:20,y:50},{x:230,y:50},{x:20,y:260},{x:230,y:260},1400,884)).toBeNull();
   expect(stableCrop(crop!,{...crop!,cx:crop!.cx+40})).toBe(false);
 });
 it('keeps readable address drafts but rejects empty places and label or symbol noise',()=>{
   expect(usableLiveAddress('CALLE PRUEBA, EDIF. 12\nPISO 2 APTO 2-B','BARRIO FICTICIO','DISTRITO NACIONAL')).toBe(true);
   expect(usableLiveAddress('UU','','')).toBe(false);
   expect(usableLiveAddress('Dirección de residencia > letras extrañas','','')).toBe(false);
   expect(usableLiveAddress('Dirección de residencia CALLE PRUEBA','BARRIO FICTICIO','DISTRITO NACIONAL')).toBe(false);
   expect(usableLiveAddress('CALLE PRUEBA = > --','BARRIO FICTICIO','DISTRITO NACIONAL')).toBe(false);
 });
});
