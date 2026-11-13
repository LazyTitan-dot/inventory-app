import { describe, expect, it } from 'vitest';
import { isValidProductGtin, parseProductLabel } from './productLabel';

describe('product label suggestions', () => {
  it('reads the supplied label essentials without guessing Hisense or BTU capacity', () => {
    const result = parseProductLabel('Modelo\nAC122CE\nColor\nBLANCO\nRefrigerante R410A\nIndoor unit\nBatch NO. K-83PZ\n1KK012 03UCNP 083PZJ7 0020\n6 946087 393113');
    expect(result.suggestions).toEqual({ model: 'AC122CE', category: 'air_conditioner', variantName: 'Blanco', barcode: '6946087393113' });
    expect(Object.keys(result.suggestions)).not.toContain('refrigerant');
  });
  it('takes a visible brand and capacity only from explicit text', () => {
    expect(parseProductLabel('HISENSE\nMODEL: AC122CE\nCOLOR: WHITE\nCAPACITY 12,000 BTU/h').suggestions).toEqual({ brand: 'Hisense', model: 'AC122CE', variantName: '12,000 BTU · Blanco' });
  });
  it('handles a column header row without treating ambiguous colors as certain', () => {
    expect(parseProductLabel('Color Refrigerante\nBLANCO R410A').suggestions.variantName).toBe('Blanco');
    expect(parseProductLabel('Color\nWHITE BLACK').suggestions.variantName).toBeUndefined();
  });
  it('keeps tracking codes and incorrect checksums out of the product barcode', () => {
    expect(parseProductLabel('Batch NO K-83PZ\n1KK01203UCNP083PZJ70020\n6946087393114').suggestions).toEqual({});
    expect(isValidProductGtin('0000000000000')).toBe(false);
    expect(isValidProductGtin('036000291452')).toBe(true);
    expect(isValidProductGtin('6946087393113')).toBe(true);
  });
  it('requires selection when several valid product codes are present', () => {
    const result = parseProductLabel('Modelo: AC122CE', ['6946087393113', '036000291452']);
    expect(result.barcodes).toEqual(['6946087393113', '036000291452']);
    expect(result.suggestions.barcode).toBeUndefined();
  });
  it('does not infer category/capacity from a model, serial or batch prefix', () => {
    expect(parseProductLabel('Modelo: AC122CE\nSERIAL 18000\nBatch 24000').suggestions).toEqual({ model: 'AC122CE' });
    expect(parseProductLabel('Serial number: AC122CE\nColorful packaging').suggestions).toEqual({});
  });
});
