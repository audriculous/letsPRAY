// Copies the app's own files into www/ for the iPhone app (Capacitor).
// The web version is served straight from the repository and needs no build.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'www';
const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'fonts', 'icons'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const f of FILES) cpSync(f, `${OUT}/${f}`, { recursive: true });
console.log(`Built ${OUT}/ from ${FILES.join(', ')}`);
