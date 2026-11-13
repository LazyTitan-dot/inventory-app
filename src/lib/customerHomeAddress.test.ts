import {describe,it,expect} from 'vitest';
import {municipalityLocation,scannedHome,legacyHome,hasHomeAddress} from './customerHomeAddress';
import {emptyAddress,addressValidation} from './addresses';
describe('initial customer delivery address',()=>{
 it('maps scanned Distrito Nacional to the municipality and province',()=>{const a=scannedHome('Calle Prueba 12','Sector Prueba','DISTRITO NACIONAL','8095551234');expect(a.city).toBe('Santo Domingo de Guzmán');expect(a.province).toBe('Distrito Nacional');expect(addressValidation(a)).toBe('');});
 it('matches municipality without accents and avoids guessing unknown or ambiguous places',()=>{expect(municipalityLocation('San Jose de las Matas')?.province).toBe('Santiago');expect(municipalityLocation('Santo Domingo Este')?.province).toBe('Santo Domingo');expect(municipalityLocation('Santo Domingo')).toBeNull();expect(municipalityLocation('CANE')).toBeNull();});
 it('preserves old free text and only splits known municipality',()=>{expect(legacyHome('Calle Uno, Edif. 12, Centro, DISTRITO NACIONAL','8095551234').street).toBe('Calle Uno, Edif. 12');expect(legacyHome('Calle Uno, Edif. 12','').street).toBe('Calle Uno, Edif. 12');expect(hasHomeAddress(emptyAddress({phone:'8095551234'}))).toBe(false);});
});
