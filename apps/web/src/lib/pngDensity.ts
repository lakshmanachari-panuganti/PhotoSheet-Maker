import { dpiToPixelsPerMetre, type Dpi } from '@photosheet/shared';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const writeUint32BE = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value, false);
};

const buildPhysChunk = (dpi: Dpi): Uint8Array => {
  const ppm = dpiToPixelsPerMetre(dpi);
  const buf = new Uint8Array(21);
  const dv = new DataView(buf.buffer);
  writeUint32BE(dv, 0, 9);
  buf.set([0x70, 0x48, 0x59, 0x73], 4);
  writeUint32BE(dv, 8, ppm);
  writeUint32BE(dv, 12, ppm);
  buf[16] = 1;
  const crc = crc32(buf.subarray(4, 17));
  writeUint32BE(dv, 17, crc);
  return buf;
};

const readUint32BE = (bytes: Uint8Array, offset: number): number => {
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw new Error('injectPngDensity: PNG truncated');
  }
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
};

const chunkType = (bytes: Uint8Array, offset: number): string => {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
};

export const injectPngDensity = (png: Uint8Array, dpi: Dpi): Uint8Array => {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) {
      throw new Error('injectPngDensity: not a PNG');
    }
  }

  let offset = 8;
  let ihdrEnd = -1;
  let existingPhysStart = -1;
  let existingPhysEnd = -1;

  while (offset < png.length) {
    const length = readUint32BE(png, offset);
    const type = chunkType(png, offset + 4);
    const chunkEnd = offset + 8 + length + 4;
    if (type === 'IHDR') ihdrEnd = chunkEnd;
    if (type === 'pHYs') {
      existingPhysStart = offset;
      existingPhysEnd = chunkEnd;
    }
    if (type === 'IEND') break;
    offset = chunkEnd;
  }

  if (ihdrEnd < 0) throw new Error('injectPngDensity: missing IHDR');

  const phys = buildPhysChunk(dpi);

  if (existingPhysStart >= 0 && existingPhysEnd >= 0) {
    const out = new Uint8Array(png.length - (existingPhysEnd - existingPhysStart) + phys.length);
    out.set(png.subarray(0, existingPhysStart), 0);
    out.set(phys, existingPhysStart);
    out.set(png.subarray(existingPhysEnd), existingPhysStart + phys.length);
    return out;
  }

  const out = new Uint8Array(png.length + phys.length);
  out.set(png.subarray(0, ihdrEnd), 0);
  out.set(phys, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + phys.length);
  return out;
};
