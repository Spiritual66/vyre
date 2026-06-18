#!/usr/bin/env node
// Generates all VYRE PWA/app icons from pure Node.js (no external deps)
// Run: node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
mkdirSync(publicDir, { recursive: true });

// --- CRC32 ---
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 8; j--;) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const chk = Buffer.allocUnsafe(4); chk.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, chk]);
}

// Distance from point (px,py) to line segment (ax,ay)→(bx,by)
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function getPixel(x, y, s) {
  const r = Math.round(s * 0.24); // rounded corner radius

  // Transparent corners (rounded-square app icon)
  if (x < r && y < r && (r-x)**2 + (r-y)**2 > r*r) return [0,0,0,0];
  if (x > s-1-r && y < r && (x-(s-1-r))**2 + (r-y)**2 > r*r) return [0,0,0,0];
  if (x < r && y > s-1-r && (r-x)**2 + (y-(s-1-r))**2 > r*r) return [0,0,0,0];
  if (x > s-1-r && y > s-1-r && (x-(s-1-r))**2 + (y-(s-1-r))**2 > r*r) return [0,0,0,0];

  // VYRE mark geometry (normalized to icon size)
  const lx = s * 0.23, ly = s * 0.36;   // left circle center
  const rx2 = s * 0.77, ry2 = s * 0.36; // right circle center
  const vx = s * 0.50, vy = s * 0.70;   // V vertex
  const cr = s * 0.095;                  // person dot radius
  const sw = s * 0.065;                  // V stroke half-width

  // Left person dot
  if ((x - lx) ** 2 + (y - ly) ** 2 <= cr * cr) return [255, 255, 255, 255];
  // Right person dot
  if ((x - rx2) ** 2 + (y - ry2) ** 2 <= cr * cr) return [255, 255, 255, 255];
  // Left arm of V
  if (distToSegment(x, y, lx, ly, vx, vy) <= sw) return [255, 255, 255, 255];
  // Right arm of V
  if (distToSegment(x, y, rx2, ry2, vx, vy) <= sw) return [255, 255, 255, 255];

  // Gradient green background: #2EDF72 → #0F9E4A (top-left to bottom-right)
  const t = (x + y) / (2 * s);
  const bg_r = Math.round(46  + (15  - 46)  * t); // #2E → #0F
  const bg_g = Math.round(223 + (158 - 223) * t); // #DF → #9E
  const bg_b = Math.round(114 + (74  - 114) * t); // #72 → #4A
  return [bg_r, bg_g, bg_b, 255];
}

function makePNG(size) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = getPixel(x, y, size);
      row[1 + x*4] = r; row[2 + x*4] = g; row[3 + x*4] = b; row[4 + x*4] = a;
    }
    rows.push(row);
  }

  const idat = deflateSync(Buffer.concat(rows), { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512];
for (const size of SIZES) {
  process.stdout.write(`Generating ${size}×${size}...`);
  const data = makePNG(size);
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(join(publicDir, name), data);
  console.log(` ✓ ${name} (${data.length} bytes)`);
}
console.log('All VYRE icons generated in client/public/');
