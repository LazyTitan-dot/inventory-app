// Preserve the exact approved artwork, including its original background and margins.
// Fit its original aspect ratio into square OS icon sizes without crop or distortion.
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
function makeIcon(size) {
  const data = Buffer.alloc(size * (size * 3 + 1));
  const scale = size / Math.max(w,h), insetX = (size - w*scale)/2, insetY = (size - h*scale)/2;
  // The source is 810×852. Extend only its edge pixels into the narrow
  // horizontal padding; every original pixel remains inside the icon.
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const sx = Math.max(0,Math.min(w-1,(x+.5-insetX)/scale-.5));
    const sy = Math.max(0,Math.min(h-1,(y+.5-insetY)/scale-.5));
    const ix=Math.floor(sx), iy=Math.floor(sy), fx=sx-ix, fy=sy-iy;
    const rx=Math.min(w-1,ix+1), ry=Math.min(h-1,iy+1);
    const i=y*(size*3+1)+1+x*3;
    for(let c=0;c<3;c++) {
      const a=pixels[(iy*w+ix)*3+c], b=pixels[(iy*w+rx)*3+c];
      const d=pixels[(ry*w+ix)*3+c], e=pixels[(ry*w+rx)*3+c];
      data[i+c]=Math.round((a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy);
    }
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const out = resolve(root, 'public/icons'); mkdirSync(out,{recursive:true});
for (const [name, size] of [['s-mart-living-v3-180.png',180],['s-mart-living-v3-192.png',192],['s-mart-living-v3-512.png',512]]) {
  writeFileSync(resolve(out,name), makeIcon(size));
}
