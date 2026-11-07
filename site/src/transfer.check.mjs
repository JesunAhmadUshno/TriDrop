// Known-answer check, run by `npm test` and before every `npm run build`.
// Reproduces the dashboard's computations in Node from the repo's own files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { planTransfer, sliceChunks, reassemble, sha256Hex, randomBytes, KiB, MiB } from './transfer.js';
import { scan, extractFunction } from './scan.js';

// 1. Planner arithmetic, worked by hand: 10 MiB in 16 KiB chunks = 640 chunks.
const p = planTransfer({ fileBytes: 10 * MiB, chunkBytes: 16 * KiB, mbps: 100, overheadBytes: 28, rttMs: 20, ackPerChunk: true });
assert.equal(p.chunks, 640);
assert.equal(p.wireBytes, 10 * MiB + 640 * 28);
assert.ok(Math.abs(p.sendSec - (10485760 + 17920) * 8 / 1e8) < 1e-12);
assert.equal(p.waitSec, 12.8);
assert.equal(planTransfer({ fileBytes: 1, chunkBytes: 16 * KiB, mbps: 1 }).chunks, 1);
assert.equal(planTransfer({ fileBytes: 16 * KiB + 1, chunkBytes: 16 * KiB, mbps: 1 }).chunks, 2);

// 2. SHA-256 known answer (FIPS 180-2 test vector "abc"), via the same WebCrypto path the browser uses.
assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// 3. Slice / reassemble round trip on an odd-sized random buffer keeps every byte and the digest.
const buf = randomBytes(3 * MiB + 12345);
const chunks = sliceChunks(buf, 64 * KiB);
assert.equal(chunks.length, Math.ceil(buf.byteLength / (64 * KiB)));
const back = reassemble(chunks.map((c) => c.slice().buffer)); // as ArrayBuffers, like DataChannel messages
assert.equal(await sha256Hex(back), createHash('sha256').update(buf).digest('hex'));

// 4. Static scan of the app and README: the facts the dashboard shows.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const s = scan(html, readme);
assert.equal(s.lineCount, html.split('\n').length - (html.endsWith('\n') ? 1 : 0));
assert.equal(s.cdn.length, (html.match(/<script src="https:/g) || []).length);
assert.equal(s.peerjs, html.match(/peerjs@([\d.]+)/)[1]);
for (const f of s.features) {
  const k = { sha: 'crypto.subtle.digest', turn: 'iceServers', pwa: 'serviceWorker', p2p: 'new Peer(', qr: 'new QRCode(' }[f.key];
  if (k) assert.equal(f.implemented, html.includes(k), `${f.key} verdict disagrees with a plain substring search`);
  if (f.line) assert.match(html.split('\n')[f.line - 1], new RegExp(f.key === 'drop' ? "'drop'" : '.'), `${f.key} line`);
}
if (s.security.filenameInnerHTML) assert.match(html.split('\n')[s.security.filenameInnerHTML - 1], /\$\{name\}/);
for (const n of ['createRoom', 'initPeer', 'joinRoom', 'handleConn', 'handleFiles', 'addFileUI']) {
  const f = extractFunction(html, n);
  assert.ok(f && f.code.endsWith('}'), `extract ${n}`);
  assert.match(html.split('\n')[f.from - 1], new RegExp(`function ${n}\\(`));
}
assert.ok(s.roadmap.length > 0, 'README roadmap parsed');
console.log('transfer + scan ok', { lines: s.lineCount, cdn: s.cdn.length, peerjs: s.peerjs, claims: `${s.implementedClaims}/${s.claimed}` });
