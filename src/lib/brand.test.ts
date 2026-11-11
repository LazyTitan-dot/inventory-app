import { describe, expect, it } from 'vitest';
import { BRAND_NAME, displayBusinessName } from './brand';

describe('business display branding', () => {
  it.each(['SmartLiving', 'Smart Living', 'smartliving', 'SmartLiving Home', 'S-mart Living', ' S-Mart Living ', 'S–Mart Living'])(
    'uses the approved name for the known legacy brand %s', (name) => {
      expect(displayBusinessName(name)).toBe(BRAND_NAME);
    },
  );
  it('preserves explicitly customized business names', () => {
    expect(displayBusinessName('Tienda del Centro')).toBe('Tienda del Centro');
    expect(displayBusinessName('Smart Living Distribuidora')).toBe('Smart Living Distribuidora');
    expect(displayBusinessName(undefined)).toBe('');
  });
});
