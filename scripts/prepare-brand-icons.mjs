// Generate full-bleed PWA icons from the approved, version-controlled RGB PNG.
// Keep the artwork unchanged; remove its presentation margin and fill the
// rounded source corners with navy so the OS supplies its own icon mask.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'public/brand/square_icon.png'));
const w = source.readUInt32BE(16), h = source.readUInt32BE(20);
if (w !== 810 || h !== 852 || source[24] !== 8 || source[25] !== 2 || source[28] !== 0) {
  throw new Error('Unexpected approved icon format; review crop before updating artwork.');
}
const chunks = [];
for (let i = 8; i < source.length;) {
  const n = source.readUInt32BE(i);
  if (source.toString('ascii', i + 4, i + 8) === 'IDAT') chunks.push(source.subarray(i + 8, i + 8 + n));
  i += 12 + n;
}
const raw = inflateSync(Buffer.concat(chunks));
const stride = w * 3, pixels = Buffer.alloc(stride * h);
function paeth(a, b, c) {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
}
for (let y = 0; y < h; y++) {
  const filter = raw[y * (stride + 1)];
  if (filter > 4) throw new Error('Unsupported PNG filter');
  for (let x = 0; x < stride; x++) {
    const i = y * stride + x, a = x >= 3 ? pixels[i - 3] : 0;
    const b = y ? pixels[i - stride] : 0, c = y && x >= 3 ? pixels[i - stride - 3] : 0;
    pixels[i] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, (a + b) >> 1, paeth(a,b,c)][filter]) & 255;
  }
}
function chunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
function makeIcon(size, maskable = false) {
  const data = Buffer.alloc(size * (size * 3 + 1));
  // Original tile is 636×626; crop just inside its border.
  const crop = { x: 100, y: 108, w: 626, h: 615 };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let u = (x + .5) / size, v = (y + .5) / size;
    if (maskable) { u = (u - .5) / .82 + .5; v = (v - .5) / .82 + .5; }
    const sx = crop.x + u * crop.w, sy = crop.y + v * crop.h;
    const dx = Math.max(0, .20 - u, u - .80), dy = Math.max(0, .20 - v, v - .80);
    const alpha = Math.max(0, Math.min(1, (.198 - Math.hypot(dx,dy)) / .013));
    const bg = [6, Math.round(37 - 16 * y / size), Math.round(81 - 29 * y / size)];
    const i = y * (size * 3 + 1) + 1 + x * 3;
    for (let c = 0; c < 3; c++) {
      let val = bg[c];
      if (alpha > 0) {
        const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        const a = pixels[(iy*w+ix)*3+c], b = pixels[(iy*w+ix+1)*3+c];
        const d = pixels[((iy+1)*w+ix)*3+c], e = pixels[((iy+1)*w+ix+1)*3+c];
        val = val * (1-alpha) + alpha * ((a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy);
      }
      data[i+c] = Math.round(val);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',header),chunk('IDAT',deflateSync(data,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const out = resolve(root, 'public/icons'); mkdirSync(out,{recursive:true});
for (const [name, size, maskable] of [['s-mart-living-v2-180.png',180,false],['s-mart-living-v2-192.png',192,false],['s-mart-living-v2-512.png',512,false],['s-mart-living-v2-maskable-512.png',512,true]]) {
  writeFileSync(resolve(out,name), makeIcon(size,maskable));
}
