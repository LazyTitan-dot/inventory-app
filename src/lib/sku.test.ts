import { describe, expect, it } from 'vitest';
import { generateSku, validateSkus } from './sku';

const input = {
  brand: ' Mábé ',
  model: 'No Frost / 18 pies',
  variant: 'Blánca & Acéro',
  seed: '12345678-abcd-4321-8123-123456789abc',
};
describe('SKUs de variantes', () => {
  it('normaliza acentos y separadores, conserva información legible y un sufijo estable', () => {
    const sku = generateSku(input);
    expect(sku).toBe('MABE-NO-FROST-18-PIES-BLANCA-ACERO-12345678ABCD');
    expect(generateSku(input)).toBe(sku);
    expect(generateSku({ ...input, model: 'Otro modelo' })).toMatch(/-12345678ABCD$/);
  });
  it('distingue variantes idénticas creadas con UUIDs diferentes', () => {
    expect(generateSku(input)).not.toBe(
      generateSku({ ...input, seed: '22345678-abcd-4321-8123-123456789abc' }),
    );
  });
  it('resuelve colisiones conocidas sin azar, incluyendo códigos con otro uso de mayúsculas', () => {
    const first = generateSku(input);
    expect(generateSku({ ...input, occupied: [` ${first.toLowerCase()} `, `${first}-2`] })).toBe(
      `${first}-3`,
    );
  });
  it('limita el SKU sin perder el sufijo y admite campos todavía vacíos', () => {
    const sku = generateSku({
      ...input,
      brand: 'A'.repeat(100),
      model: 'B'.repeat(160),
      variant: 'C'.repeat(100),
    });
    expect(sku.length).toBeLessThanOrEqual(80);
    expect(sku).toMatch(/-12345678ABCD$/);
    expect(generateSku({ ...input, brand: '', model: '', variant: '' })).toBe(
      'MARCA-MODELO-VARIANTE-12345678ABCD',
    );
  });
  it('bloquea duplicados del formulario y del catálogo, pero permite conservar el SKU propio', () => {
    const catalog = [{ id: 'existing', sku: 'MABE-01' }];
    expect(validateSkus([{ sku: ' mabe-01 ' }], catalog)).toMatch(/ya está registrado/);
    expect(validateSkus([{ sku: 'NUEVO' }, { sku: ' nuevo ' }], catalog)).toMatch(/se repite/);
    expect(validateSkus([{ id: 'existing', sku: 'MABE-01' }], catalog)).toBeNull();
    expect(catalog).toEqual([{ id: 'existing', sku: 'MABE-01' }]);
  });
  it('rechaza vacíos y largos también en la validación previa al envío', () => {
    expect(validateSkus([{ sku: ' ' }], [])).toMatch(/necesita un SKU/);
    expect(validateSkus([{ sku: 'A'.repeat(81) }], [])).toMatch(/80 caracteres/);
    expect(() => generateSku({ ...input, seed: 'not-a-uuid' })).toThrow(/identificar/);
  });
});
