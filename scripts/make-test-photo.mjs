import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build a minimal 300x400 PNG entirely by hand (portrait aspect, roughly ID-photo shape).
// Two-color radial gradient using palette PNG — smallest valid file.
// We use a filtered raw image with a simple pattern: sky-blue top, warm orange bottom.
const W = 300;
const H = 400;

function encodePng(pixels, width, height) {
  // pixels: Uint8Array of RGB bytes, length = width*height*3
  const scanlineSize = width * 3 + 1;
  const raw = new Uint8Array(scanlineSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * scanlineSize] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = y * scanlineSize + 1 + x * 3;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }
  // Compress with pako-free deflate: use zlib via node
  const { deflateSync } = require('node:zlib');
  const compressed = deflateSync(raw, { level: 9 });

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = data.length;
    const buf = new Uint8Array(8 + len + 4);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, len);
    for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);
    buf.set(data, 8);
    dv.setUint32(8 + len, crc32(buf.subarray(4, 8 + len)));
    return buf;
  }

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = new Uint8Array(13);
  const dv = new DataView(ihdrData.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let o = 0;
  out.set(sig, o); o += sig.length;
  out.set(ihdr, o); o += ihdr.length;
  out.set(idat, o); o += idat.length;
  out.set(iend, o);
  return out;
}

const pixels = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = Math.round(30 + t * 220);
  const g = Math.round(120 + Math.sin(t * Math.PI) * 80);
  const b = Math.round(210 - t * 150);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    // Add subtle vertical stripes to make cropping/scaling visible.
    const stripe = (Math.floor(x / 20) % 2) * 20;
    pixels[i] = Math.max(0, Math.min(255, r + stripe));
    pixels[i + 1] = Math.max(0, Math.min(255, g));
    pixels[i + 2] = Math.max(0, Math.min(255, b));
  }
}

// Draw a rough face outline so cropping is obvious.
function drawEllipse(cx, cy, rx, ry, color) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const i = (y * W + x) * 3;
        pixels[i] = color[0];
        pixels[i + 1] = color[1];
        pixels[i + 2] = color[2];
      }
    }
  }
}

drawEllipse(150, 180, 90, 120, [240, 210, 175]); // face
drawEllipse(120, 165, 10, 8, [50, 40, 30]); // left eye
drawEllipse(180, 165, 10, 8, [50, 40, 30]); // right eye
drawEllipse(150, 220, 20, 10, [180, 90, 90]); // mouth

// Import zlib in ESM via createRequire
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { deflateSync } = require('node:zlib');
// Re-run encode using the closure require
function encodePngWithZlib(pixels, width, height) {
  const scanlineSize = width * 3 + 1;
  const raw = new Uint8Array(scanlineSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * scanlineSize] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = y * scanlineSize + 1 + x * 3;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }
  const compressed = deflateSync(raw, { level: 9 });
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = data.length;
    const buf = new Uint8Array(8 + len + 4);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, len);
    for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);
    buf.set(data, 8);
    dv.setUint32(8 + len, crc32(buf.subarray(4, 8 + len)));
    return buf;
  }
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = new Uint8Array(13);
  const dv = new DataView(ihdrData.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdrData[8] = 8; ihdrData[9] = 2;
  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let o = 0;
  out.set(sig, o); o += sig.length;
  out.set(ihdr, o); o += ihdr.length;
  out.set(idat, o); o += idat.length;
  out.set(iend, o);
  return out;
}

const png = encodePngWithZlib(pixels, W, H);
const outPath = path.resolve(__dirname, '..', 'artifacts', 'test-photo.png');
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
