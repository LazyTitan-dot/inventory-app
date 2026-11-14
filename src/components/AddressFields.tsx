import { Building2, MapPin, Map, Phone, Navigation } from 'lucide-react';
import { municipalityLocation } from '../lib/customerHomeAddress';
import { Field } from './ui';
import type { AddressInput } from '../lib/addresses';

export function AddressFields({
  value,
  onChange,
  disabled = false,
  required = true,
  autoMunicipality = false,
  customerIcons = false,
}: {
  value: AddressInput;
  onChange: (next: AddressInput) => void;
  disabled?: boolean;
  required?: boolean;
  autoMunicipality?: boolean;
  customerIcons?: boolean;
}) {
  const field = (key: keyof AddressInput, next: string) => {
    if(autoMunicipality && key==='city') {const place=municipalityLocation(next);onChange({...value,city:next,province:place?.province??''});}
    else onChange({ ...value, [key]: next });
  };
  return (
    <div className="address-fields stack">
      <Field icon={customerIcons ? <MapPin size={20}/> : undefined} label="Calle y número">
        <input required={required} disabled={disabled} autoComplete="street-address" maxLength={300}
          value={value.street} onChange={(event) => field('street', event.target.value)}
          placeholder="Calle, edificio, número o apartamento" />
      </Field>
      <div className="form-grid">
        <Field icon={customerIcons ? <MapPin size={20}/> : undefined} label="Sector">
          <input disabled={disabled} maxLength={120} value={value.sector}
            onChange={(event) => field('sector', event.target.value)} />
        </Field>
        <Field icon={customerIcons ? <Building2 size={20}/> : undefined} label={autoMunicipality ? "Municipio" : "Ciudad o municipio"} hint={autoMunicipality ? "La provincia se completa cuando se reconoce el municipio." : undefined}>
          <input required={required} disabled={disabled} autoComplete="address-level2" maxLength={120}
            value={value.city} onChange={(event) => field('city', event.target.value)}
            onBlur={() => {if(autoMunicipality){const place=municipalityLocation(value.city);if(place)onChange({...value,...place});}}} />
        </Field>
        <Field icon={customerIcons ? <Map size={20}/> : undefined} label="Provincia">
          <input required={required} disabled={disabled} autoComplete="address-level1" maxLength={120}
            value={value.province} onChange={(event) => field('province', event.target.value)} />
        </Field>
        <Field icon={customerIcons ? <Phone size={20}/> : undefined} label="Teléfono de entrega" hint="De 7 a 15 dígitos; incluye el país cuando corresponda.">
          <input required={required} disabled={disabled} type="tel" autoComplete="tel" maxLength={60}
            value={value.phone} onChange={(event) => field('phone', event.target.value)} />
        </Field>
      </div>
      <Field icon={customerIcons ? <Navigation size={20}/> : undefined} label="Referencia para llegar" hint="Opcional. Un punto de referencia o indicaciones para encontrar el destino.">
        <textarea disabled={disabled} rows={2} maxLength={1000} value={value.reference}
          onChange={(event) => field('reference', event.target.value)} />
      </Field>
    </div>
  );
}
