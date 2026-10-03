import { TextFile } from './file-storage';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00: a zip needs a time, and the same files should give the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

/**
 * A zip archive of text files, stored without compression (generated sources are small). Names are
 * UTF-8; the output only depends on the files.
 */
export function zipFiles(files: readonly TextFile[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const header = (size: number, fill: (view: DataView) => void): Uint8Array => {
    const bytes = new Uint8Array(size);
    fill(new DataView(bytes.buffer));
    return bytes;
  };

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true); // version needed
      v.setUint16(6, 0x0800, true); // UTF-8 names
      v.setUint16(10, DOS_TIME, true);
      v.setUint16(12, DOS_DATE, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true);
    });
    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true); // version made by
        v.setUint16(6, 20, true);
        v.setUint16(8, 0x0800, true);
        v.setUint16(12, DOS_TIME, true);
        v.setUint16(14, DOS_DATE, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, data.length, true);
        v.setUint32(24, data.length, true);
        v.setUint16(28, name.length, true);
        v.setUint32(42, offset, true);
      }),
      name,
    );
    parts.push(local, name, data);
    offset += local.length + name.length + data.length;
  }

  const directorySize = central.reduce((n, c) => n + c.length, 0);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, directorySize, true);
    v.setUint32(16, offset, true);
  });

  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
