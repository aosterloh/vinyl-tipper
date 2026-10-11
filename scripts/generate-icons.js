const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// 1. Generate SVG Icon
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="discShine" cx="50%" cy="50%" r="50%" fx="30%" fy="30%">
      <stop offset="0%" stop-color="#2a2a38"/>
      <stop offset="45%" stop-color="#14141d"/>
      <stop offset="75%" stop-color="#242432"/>
      <stop offset="100%" stop-color="#0e0e14"/>
    </radialGradient>
    <radialGradient id="labelGold" cx="45%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#f6d365"/>
      <stop offset="60%" stop-color="#fda085"/>
      <stop offset="100%" stop-color="#d4af37"/>
    </radialGradient>
    <linearGradient id="needleArm" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0e0e8"/>
      <stop offset="100%" stop-color="#8c8c9e"/>
    </linearGradient>
    <filter id="vinylShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background Squircle -->
  <rect width="512" height="512" rx="112" fill="#0f0f13"/>

  <!-- Turntable Platter Outer Ring -->
  <circle cx="256" cy="256" r="222" fill="#181822" stroke="#2a2a3a" stroke-width="2" filter="url(#vinylShadow)"/>

  <!-- Vinyl Record Body -->
  <circle cx="256" cy="256" r="214" fill="url(#discShine)" stroke="#111118" stroke-width="4"/>

  <!-- Sound Grooves (Concentric Circles) -->
  <circle cx="256" cy="256" r="195" fill="none" stroke="#252535" stroke-width="1.5" opacity="0.6"/>
  <circle cx="256" cy="256" r="182" fill="none" stroke="#2d2d3e" stroke-width="1.2" opacity="0.7"/>
  <circle cx="256" cy="256" r="168" fill="none" stroke="#252535" stroke-width="1.8" opacity="0.6"/>
  <circle cx="256" cy="256" r="154" fill="none" stroke="#2c2c3d" stroke-width="1.2" opacity="0.8"/>
  <circle cx="256" cy="256" r="140" fill="none" stroke="#252535" stroke-width="1.5" opacity="0.6"/>
  <circle cx="256" cy="256" r="126" fill="none" stroke="#2c2c3d" stroke-width="1.2" opacity="0.8"/>
  <circle cx="256" cy="256" r="112" fill="none" stroke="#252535" stroke-width="1.5" opacity="0.6"/>

  <!-- Run-out Groove -->
  <circle cx="256" cy="256" r="94" fill="none" stroke="#1f1f2b" stroke-width="2.5"/>

  <!-- Center Centerpiece Label (Gold / Amber) -->
  <circle cx="256" cy="256" r="76" fill="url(#labelGold)" stroke="#d4af37" stroke-width="3"/>

  <!-- Center Label Typography Ring & Accents -->
  <circle cx="256" cy="256" r="66" fill="none" stroke="#683d06" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
  
  <!-- Stylized "VT" Micro Brand on Center Label -->
  <path d="M 238 238 L 246 256 L 254 238" fill="none" stroke="#4a2600" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 260 238 L 274 238 M 267 238 L 267 256" fill="none" stroke="#4a2600" stroke-width="3.5" stroke-linecap="round"/>

  <!-- Center Spindle Hole -->
  <circle cx="256" cy="256" r="16" fill="#0f0f13" stroke="#e0e0e8" stroke-width="2.5"/>

  <!-- Sleek Modern Tonearm / Cartridge Needle Overlay -->
  <g transform="rotate(-30 420 80)">
    <circle cx="420" cy="80" r="24" fill="#20202c" stroke="#8c8c9e" stroke-width="3"/>
    <path d="M 420 80 L 320 220" fill="none" stroke="url(#needleArm)" stroke-width="6" stroke-linecap="round"/>
    <rect x="306" y="214" width="28" height="14" rx="3" transform="rotate(35 320 220)" fill="#e53e3e"/>
    <circle cx="320" cy="220" r="3" fill="#ffffff"/>
  </g>
</svg>`;

// 2. Pure Node.js PNG encoder
function createPng(width, height, pixelFn) {
  const rowStride = width * 4;
  const rawData = Buffer.alloc((rowStride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowStride + 1);
    rawData[rowOffset] = 0; // Filter type 0: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'binary');
    const toCrc = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(toCrc), 0);
    return Buffer.concat([len, toCrc, crcBuf]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// Pixel function drawing a high fidelity vinyl turntable icon
function renderVinylPixel(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const normDist = dist / (w / 2);

  // Background squircle check
  const cornerR = w * 0.22;
  const qx = Math.max(0, Math.abs(dx) - (w / 2 - cornerR));
  const qy = Math.max(0, Math.abs(dy) - (h / 2 - cornerR));
  const squircleDist = Math.sqrt(qx * qx + qy * qy);
  if (squircleDist > cornerR) {
    return [0, 0, 0, 0]; // Transparent outside squircle
  }

  // Base background dark slate
  let r = 15, g = 15, b = 19, a = 255;

  // Turntable Platter Outer Ring
  if (normDist <= 0.88) {
    r = 24; g = 24; b = 34;
  }

  // Vinyl Record Body
  if (normDist <= 0.84) {
    // Subtle vinyl sheen based on angle
    const angle = Math.atan2(dy, dx);
    const sheen = 0.5 + 0.5 * Math.sin(angle * 2.0);
    const baseTone = Math.round(18 + sheen * 12);
    r = baseTone; g = baseTone; b = baseTone + 8;

    // Concentric grooves
    const grooveFreq = Math.sin(normDist * 50);
    if (normDist > 0.32 && grooveFreq > 0.6) {
      r = Math.min(255, r + 14);
      g = Math.min(255, g + 14);
      b = Math.min(255, b + 18);
    }
  }

  // Run-out groove band
  if (normDist < 0.36 && normDist >= 0.30) {
    r = 28; g = 28; b = 38;
  }

  // Center Gold / Amber Record Label
  if (normDist < 0.30) {
    // Warm radiant gold label
    const labelGrad = 1.0 - (normDist / 0.30) * 0.3;
    r = Math.round(245 * labelGrad);
    g = Math.round(185 * labelGrad);
    b = Math.round(55 * labelGrad);

    // Decorative ring on label
    if (Math.abs(normDist - 0.24) < 0.008) {
      r = 160; g = 100; b = 20;
    }
  }

  // Center Spindle Hole
  if (normDist < 0.065) {
    if (normDist > 0.05) {
      // Silver rim
      r = 210; g = 210; b = 225;
    } else {
      // Hole
      r = 15; g = 15; b = 19;
    }
  }

  return [r, g, b, a];
}

console.log('Generating PWA icons in', PUBLIC_DIR);

// Save SVG icon
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), svgIcon, 'utf8');
console.log('✓ Created public/icon.svg');

// Save 192x192 PNG
const png192 = createPng(192, 192, renderVinylPixel);
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-192.png'), png192);
console.log('✓ Created public/icon-192.png (192x192)');

// Save 512x512 PNG
const png512 = createPng(512, 512, renderVinylPixel);
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon-512.png'), png512);
console.log('✓ Created public/icon-512.png (512x512)');

// Save 180x180 Apple Touch Icon PNG
const png180 = createPng(180, 180, renderVinylPixel);
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), png180);
console.log('✓ Created public/apple-touch-icon.png (180x180)');

console.log('All icons generated successfully!');
