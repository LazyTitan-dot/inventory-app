import { describe, expect, it } from 'vitest';
import { barcodeSvg, code128Symbols, generateInternalBarcode, validateBarcodes } from './barcode';

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
