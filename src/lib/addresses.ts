export interface AddressInput {
  street: string;
  sector: string;
  city: string;
  province: string;
  phone: string;
  reference: string;
}

export function emptyAddress(value: Partial<AddressInput> = {}): AddressInput {
  return {
    street: value.street ?? '',
    sector: value.sector ?? '',
    city: value.city ?? '',
    province: value.province ?? '',
    phone: value.phone ?? '',
    reference: value.reference ?? '',
  };
}

export function addressText(address: Partial<AddressInput>): string {
  return [address.street, address.sector, address.city, address.province]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

export function addressValidation(address: AddressInput): string {
  if (!address.street.trim() || !address.city.trim() || !address.province.trim()) {
    return 'Completa la calle y número, la ciudad o municipio y la provincia.';
  }
  if (!/^\+?[0-9 ().-]+$/.test(address.phone.trim())) {
    return 'Escribe un teléfono de entrega válido, sin letras ni extensiones.';
  }
  const digits = address.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return 'El teléfono de entrega debe contener entre 7 y 15 dígitos.';
  }
  const limits: Record<keyof AddressInput, number> = {
    street: 300,
    sector: 120,
    city: 120,
    province: 120,
    phone: 60,
    reference: 1000,
  };
  if (Object.entries(limits).some(([key, limit]) => address[key as keyof AddressInput].length > limit)) {
    return 'La dirección contiene un campo demasiado largo. Revisa los datos antes de guardar.';
  }
  return '';
}

export function addressMapsUrl(address: Partial<AddressInput>): string | null {
  if (!address.street?.trim() || !address.city?.trim() || !address.province?.trim()) return null;
  const query = `${addressText(address)}, República Dominicana`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Used only to warn about existing entries; saved identity always remains its UUID. */
export function addressComparisonKey(address: Partial<AddressInput>): string {
  return [...[address.street, address.sector, address.city, address.province].map((value) =>
    (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase(),
  ), (address.phone ?? '').replace(/\D/g, '')].join('|');
}
