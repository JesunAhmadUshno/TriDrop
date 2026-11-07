// Smoke test for the TriDrop app itself (../index.html), which has no build step of its own.
// Checks the inline script still parses, the pairing/transfer functions exist, and CDN scripts are version-pinned where possible.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.equal(scripts.length, 1, 'one inline app script');
new vm.Script(scripts[0], { filename: 'index.html#inline' }); // throws on a syntax error

for (const fn of ['createRoom', 'joinRoom', 'initPeer', 'handleConn', 'handleFiles', 'addFileUI', 'copyLink'])
  assert.match(scripts[0], new RegExp(`function ${fn}\\(`), `missing ${fn}`);
for (const id of ['fileInput', 'dropZone', 'fileList', 'qrcode', 'joinInput', 'status-text'])
  assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
for (const lib of ['peerjs@', 'qrcodejs/', 'gsap/'])
  assert.match(html, new RegExp(`${lib.replace('/', '\\/')}\\d+\\.\\d+\\.\\d+`), `${lib} not pinned`);
console.log('app smoke ok');
