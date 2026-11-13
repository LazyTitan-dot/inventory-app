import { municipalityLocation } from '../lib/customerHomeAddress';
import { Field } from './ui';
import type { AddressInput } from '../lib/addresses';

export function AddressFields({
  value,
  onChange,
  disabled = false,
  required = true,
  autoMunicipality = false,
}: {
  value: AddressInput;
  onChange: (next: AddressInput) => void;
  disabled?: boolean;
  required?: boolean;
  autoMunicipality?: boolean;
}) {
  const field = (key: keyof AddressInput, next: string) => {
    if(autoMunicipality && key==='city') {const place=municipalityLocation(next);onChange({...value,city:next,province:place?.province??''});}
    else onChange({ ...value, [key]: next });
  };
  return (
    <div className="address-fields stack">
      <Field label="Calle y número">
        <input required={required} disabled={disabled} autoComplete="street-address" maxLength={300}
          value={value.street} onChange={(event) => field('street', event.target.value)}
          placeholder="Calle, edificio, número o apartamento" />
      </Field>
      <div className="form-grid">
        <Field label="Sector">
          <input disabled={disabled} maxLength={120} value={value.sector}
            onChange={(event) => field('sector', event.target.value)} />
        </Field>
        <Field label={autoMunicipality ? "Municipio" : "Ciudad o municipio"} hint={autoMunicipality ? "La provincia se completa cuando se reconoce el municipio." : undefined}>
          <input required={required} disabled={disabled} autoComplete="address-level2" maxLength={120}
            value={value.city} onChange={(event) => field('city', event.target.value)}
            onBlur={() => {if(autoMunicipality){const place=municipalityLocation(value.city);if(place)onChange({...value,...place});}}} />
        </Field>
        <Field label="Provincia">
          <input required={required} disabled={disabled} autoComplete="address-level1" maxLength={120}
            value={value.province} onChange={(event) => field('province', event.target.value)} />
        </Field>
        <Field label="Teléfono de entrega" hint="De 7 a 15 dígitos; incluye el país cuando corresponda.">
          <input required={required} disabled={disabled} type="tel" autoComplete="tel" maxLength={60}
            value={value.phone} onChange={(event) => field('phone', event.target.value)} />
        </Field>
      </div>
      <Field label="Referencia para llegar" hint="Opcional. Un punto de referencia o indicaciones para encontrar el destino.">
        <textarea disabled={disabled} rows={2} maxLength={1000} value={value.reference}
          onChange={(event) => field('reference', event.target.value)} />
      </Field>
    </div>
  );
}
