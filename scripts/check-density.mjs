import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? path.resolve(__dirname, '..', 'artifacts', 'exported.png');
const bytes = new Uint8Array(readFileSync(target));

const sig = [137, 80, 78, 71, 13, 10, 26, 10];
for (let i = 0; i < sig.length; i++) {
  if (bytes[i] !== sig[i]) throw new Error('not a PNG');
}

const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
let offset = 8;
let width = 0;
let height = 0;
let ppmX = null;
let ppmY = null;
let unit = null;

while (offset < bytes.length) {
  const length = dv.getUint32(offset);
  const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
  const dataStart = offset + 8;
  if (type === 'IHDR') {
    width = dv.getUint32(dataStart);
    height = dv.getUint32(dataStart + 4);
  }
  if (type === 'pHYs') {
    ppmX = dv.getUint32(dataStart);
    ppmY = dv.getUint32(dataStart + 4);
    unit = bytes[dataStart + 8];
  }
  if (type === 'IEND') break;
  offset = dataStart + length + 4;
}

const dpi = ppmX && unit === 1 ? Math.round(ppmX / 39.3701) : null;

console.log(JSON.stringify({
  file: target,
  bytes: bytes.length,
  width,
  height,
  physUnitIsMetre: unit === 1,
  ppmX,
  ppmY,
  effectiveDpiX: dpi,
}, null, 2));

if (unit !== 1) {
  console.error('FAIL: pHYs unit is not 1 (metres)');
  process.exit(2);
}
if (!ppmX || !ppmY || ppmX !== ppmY) {
  console.error('FAIL: pHYs missing or non-square');
  process.exit(2);
}
if (dpi !== 300 && dpi !== 600) {
  console.error(`FAIL: unexpected DPI ${dpi}`);
  process.exit(2);
}
console.log('OK');
