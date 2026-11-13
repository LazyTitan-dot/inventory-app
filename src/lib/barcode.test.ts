import { describe, expect, it } from 'vitest';
import { barcodeMatches, barcodeSvg, code128Symbols, generateInternalBarcode, getVariantBarcodes, validateBarcodes } from './barcode';

describe('Code 128B labels', () => {
  it('encodes start, printable character symbols, weighted checksum and stop', () => {
    expect(code128Symbols('ABC')).toEqual([104, 33, 34, 35, 1, 106]);
    expect(code128Symbols('0')).toEqual([104, 16, 17, 106]);
  });
  it('rejects unprintable data and preserves quiet zones without embedding the input as markup', () => {
    expect(barcodeSvg('é')).toBeNull();
    expect(barcodeSvg('A\nB')).toBeNull();
    expect(barcodeSvg('x'.repeat(81))).toBeNull();
    const svg = barcodeSvg('<script>');
    expect(svg).toContain('x="10"');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('fill="white"');
  });
});

describe('catalog barcode identity', () => {
  it('recognizes manufacturer aliases while keeping the internal code and exact matching', () => {
    const variant = { barcode: 'SL-ONE', barcode_aliases: ['6946087393113', ' Manufacturer-Code '] };
    expect(getVariantBarcodes(variant)).toEqual(['SL-ONE', '6946087393113', 'Manufacturer-Code']);
    expect(barcodeMatches(variant, ' sl-one ')).toBe(true);
    expect(barcodeMatches(variant, '6946087393113')).toBe(true);
    expect(barcodeMatches(variant, 'manufacturer-code')).toBe(true);
    expect(barcodeMatches(variant, '\u00a0manufacturer-code\ufeff')).toBe(true);
    expect(barcodeMatches(variant, '6946087')).toBe(false);
    expect(barcodeMatches(variant, '')).toBe(false);
    expect(barcodeMatches({ barcode: 'ß' }, 'SS')).toBe(false);
    expect(barcodeMatches({ barcode: 'é' }, 'É')).toBe(false);
  });
  it('reserves one namespace across primary codes and aliases, including archived products', () => {
    const catalog = [{ id: 'old', barcode: 'INTERNAL', barcode_aliases: ['6946087393113'] }];
    expect(validateBarcodes([{ barcode: '6946087393113' }], catalog)).toContain('otra variante');
    expect(validateBarcodes([{ barcode: 'NEW', barcode_aliases: ['internal'] }], catalog)).toContain('otra variante');
    expect(validateBarcodes([{ barcode: 'NEW', barcode_aliases: ['new'] }], [])).toContain('se repite');
    expect(validateBarcodes([{ barcode_aliases: ['6946087393113'] }, { barcode_aliases: ['6946087393113'] }], [])).toContain('se repite');
    expect(validateBarcodes([{ id: 'old', barcode: 'INTERNAL', barcode_aliases: ['6946087393113'] }], catalog)).toBeNull();
    expect(validateBarcodes([{ barcode_aliases: Array.from({ length: 11 }, (_, i) => `CODE-${i}`) }], [])).toContain('hasta 10');
    expect(validateBarcodes([{ barcode_aliases: [' '] }], [])).toContain('vacíos');
    expect(validateBarcodes([{ barcode_aliases: ['A\nB'] }], [])).toContain('caracteres');
  });
  it('keeps generated internal codes stable and avoids existing case-insensitive collisions', () => {
    const seed = 'aabbccdd-1111-2222-3333-444455556666';
    const first = generateInternalBarcode(seed);
    expect(first).toBe('SLAABBCCDD111122223333444455556666');
    expect(generateInternalBarcode(seed, [first.toLowerCase()])).toBe(first + '-2');
    expect(() => generateInternalBarcode('invalid')).toThrow();
  });
  it('reserves archived catalog codes and rejects ambiguous scanner matches', () => {
    expect(validateBarcodes([{ barcode: 'abc' }], [{ id: 'old', barcode: 'ABC' }])).toContain(
      'otra variante',
    );
    expect(
      validateBarcodes([{ id: 'one', barcode: 'abc' }], [{ id: 'one', barcode: 'abc' }]),
    ).toBeNull();
    expect(validateBarcodes([{ barcode: 'abc' }, { barcode: ' ABC ' }], [])).toContain('se repite');
    expect(validateBarcodes([{ barcode: '' }, { barcode: null }], [])).toBeNull();
    expect(validateBarcodes([{ barcode: 'abc\ndef' }], [])).not.toBeNull();
  });
});
