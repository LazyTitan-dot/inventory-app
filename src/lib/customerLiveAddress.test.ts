import {describe,it,expect} from 'vitest';
import {addressGuide,parseAddressBlock} from './customerLiveAddress';
describe('two-step address capture',()=>{
 it('keeps the guide inside portrait and landscape frames',()=>{for(const [w,h] of [[1080,1920],[1920,1080]]){const g=addressGuide(w!,h!);expect(g.x).toBeGreaterThan(0);expect(g.y).toBeGreaterThan(0);expect(g.x+g.width).toBeLessThan(w!);expect(g.y+g.height).toBeLessThan(h!);}});
 it('extracts only labeled fields',()=>{expect(parseAddressBlock('COLEGIO ELECTORAL\nDirección de residencia\nCALLE PRUEBA 12\nPISO 2 APTO 2-B\nSector\nBARRIO FICTICIO\nMunicipio\nDISTRITO NACIONAL')).toEqual({address:'CALLE PRUEBA 12\nPISO 2 APTO 2-B',sector:'BARRIO FICTICIO',municipio:'DISTRITO NACIONAL',complete:true});});
 it('does not claim complete when headers or fields are missing',()=>{expect(parseAddressBlock('UU\nSector\nBARRIO FICTICIO').complete).toBe(false);});
});
it('joins split PaddleOCR place lines without changing address identifiers',()=>{expect(parseAddressBlock('Dirección de residencia\nCALLE PRUEBA, EDIF. 12\nPISO 2 APTO 2-B\nSector\nBARRIO\nFICTICIO\nMunicipio\nDISTRITO\nNACIONAL')).toEqual({address:'CALLE PRUEBA, EDIF. 12\nPISO 2 APTO 2-B',sector:'BARRIO FICTICIO',municipio:'DISTRITO NACIONAL',complete:true});});
