/**
 * S-mart Living — canonical full-frame approved brand icon V4.
 *
 * V4 is the approved source of truth already checked into public/icons.
 * Do not crop, redraw, pad or regenerate its pixels from the legacy
 * square_icon.png: that original artwork contained unwanted white margins.
 *
 * Keep V3 compatibility paths populated byte-for-byte with V4 for devices
 * that may still request a prior manifest; the live manifest uses V4.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const icons = resolve(root, 'public/icons');
const signature = Buffer.from([137,80,78,71,13,10,26,10]);

for (const size of [180,192,512]) {
  const canonical = resolve(icons, 's-mart-living-v4-' + size + '.png');
  const image = readFileSync(canonical);
  if (!image.subarray(0,8).equals(signature) ||
      image.readUInt32BE(16) !== size ||
      image.readUInt32BE(20) !== size) {
    throw new Error('Invalid approved full-frame icon V4 (' + size + 'px).');
  }
  mkdirSync(icons,{recursive:true});
  writeFileSync(resolve(icons,'s-mart-living-v3-' + size + '.png'),image);
}
