import { describe, expect, it } from 'vitest';
import { addressComparisonKey, addressMapsUrl, addressText, addressValidation, emptyAddress } from './addresses';

const destination = emptyAddress({
  street: 'Calle Duarte 12', sector: 'Centro', city: 'Santo Domingo',
  province: 'Distrito Nacional', phone: '+1 (809) 555-0123', reference: 'Puerta azul',
});

describe('delivery destination helpers', () => {
  it('requires a useful street, city, province and a contactable telephone', () => {
    expect(addressValidation(destination)).toBe('');
    expect(addressValidation({ ...destination, city: '  ' })).not.toBe('');
    expect(addressValidation({ ...destination, phone: '8095550123 ext 4' })).not.toBe('');
    expect(addressValidation({ ...destination, phone: '123' })).not.toBe('');
    expect(addressValidation({ ...destination, phone: '1234567890123456' })).not.toBe('');
    expect(addressValidation({ ...destination, reference: 'a'.repeat(1001) })).not.toBe('');
  });

  it('formats only destination fields, without leaking phone or reference in Maps URLs', () => {
    expect(addressText(destination)).toBe('Calle Duarte 12, Centro, Santo Domingo, Distrito Nacional');
    const map = new URL(addressMapsUrl(destination)!);
    expect(map.origin).toBe('https://www.google.com');
    expect(map.searchParams.get('query')).toContain('Calle Duarte 12');
    expect(map.searchParams.get('query')).not.toContain('809');
    expect(map.searchParams.get('query')).not.toContain('Puerta azul');
    expect(addressMapsUrl(emptyAddress())).toBeNull();
  });

  it('escapes query syntax and normalizes only comparison values, never identities', () => {
    const url = new URL(addressMapsUrl({ ...destination, street: 'Calle & destino? #12' })!);
    expect(url.searchParams.get('query')).toContain('Calle & destino? #12');
    expect([...url.searchParams.keys()]).toEqual(['api', 'query']);
    expect(addressComparisonKey({ ...destination, sector: '  céntró ', phone: '18095550123' }))
      .toBe(addressComparisonKey(destination));
  });
});
