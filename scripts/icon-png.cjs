// Render the PNG app icons from icons/icon.svg. Usage: node scripts/icon-png.cjs .
const { chromium } = require('playwright');
const fs = require('fs');
const svg = fs.readFileSync(process.argv[2] + '/icons/icon.svg', 'utf8');
// Square, full-bleed version for iOS and maskable icons (the OS applies its own mask).
const square = svg.replace('rx="116"', 'rx="0"');
// Keep the artwork inside the maskable safe zone (centre 80%).
const maskable = square.replace(/(<rect width="512" height="512" rx="0"[^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(51.2 51.2) scale(0.8)">$2</g></svg>');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const shots = [['icon-192.png', svg, 192], ['icon-512.png', svg, 512], ['apple-touch-icon.png', square, 180], ['icon-maskable-512.png', maskable, 512]];
  for (const [name, src, size] of shots) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: `${process.argv[2]}/icons/${name}`, omitBackground: true });
  }
  await b.close();
})();
