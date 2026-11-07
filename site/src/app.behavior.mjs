// Behaviour tests for the TriDrop app (../index.html): runs its inline script in a vm with a tiny fake DOM
// and a fake PeerJS, then drives the real functions (createRoom, joinRoom, handleFiles, ...).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class El {
  constructor(tag, id) {
    Object.assign(this, { tagName: tag, id, children: [], style: {}, listeners: {}, attrs: {}, rawHtml: '', textContent: '', innerText: '' });
    const set = new Set();
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  }
  set innerHTML(v) { this.rawHtml = v; this.children = []; }
  get innerHTML() { return this.rawHtml; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.children.push(typeof c === 'string' ? Object.assign(new El('#text'), { textContent: c }) : c)); }
  prepend(c) { this.children.unshift(c); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  click() {}
  getContext() { return new Proxy({}, { get: () => () => {} }); }
}
const tree = (el) => [el, ...el.children.flatMap(tree)];
const text = (el) => tree(el).map((e) => e.textContent || e.innerText || '').join(' ');

class Emitter {
  constructor() { this.handlers = {}; }
  on(ev, f) { (this.handlers[ev] ||= []).push(f); }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach((f) => f(...a)); }
}

export function boot({ hash = '', clipboardFails = false } = {}) {
  const els = {};
  const byId = (id) => (els[id] ||= new El('div', id));
  const copyBtn = Object.assign(new El('button'), { innerText: '[ COPY SECURE LINK ]' });
  const clipboard = [];
  const blobs = [];
  const timers = [];
  const peers = [];
  class Conn extends Emitter {
    constructor(peerId) { super(); Object.assign(this, { peer: peerId, open: false, sent: [] }); }
    // Mirrors PeerJS 1.5.2: send() on a connection that is not open emits 'not-open-yet' and drops the data.
    send(d) { if (!this.open) return this.emit('error', Object.assign(new Error('not open'), { type: 'not-open-yet' })); this.sent.push(d); }
    close() { this.open = false; this.emit('close'); }
  }
  class Peer extends Emitter {
    constructor(id) { super(); this.id = id; peers.push(this); }
    connect(id) { const c = new Conn(id); this.outgoing = c; return c; }
    destroy() {}
  }
  const tl = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : () => tl) });
  const location = { href: `https://example.test/TriDrop/${hash}`, hash };
  const ctx = {
    document: {
      getElementById: byId,
      createElement: (tag) => new El(tag),
      createTextNode: (t) => Object.assign(new El('#text'), { textContent: t }),
      querySelector: (sel) => (sel.includes('copyLink') ? copyBtn : new El('div')),
      querySelectorAll: () => [],
      addEventListener() {},
      body: new El('body'),
    },
    window: { location, addEventListener() {}, innerWidth: 800, innerHeight: 600 },
    history: { replaceState() {} },
    navigator: { clipboard: { writeText: (t) => (clipboardFails ? Promise.reject(new Error('denied')) : (clipboard.push(t), Promise.resolve())) } },
    gsap: tl, QRCode: class { constructor(el, o) { el.qrText = o.text; } }, Peer,
    Blob, URL: { createObjectURL: (b) => (blobs.push(b), `blob:${blobs.length}`) },
    setTimeout: (f) => timers.push(f), requestAnimationFrame() {}, console,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  return { ctx, els: byId, copyBtn, clipboard, blobs, timers, peers, run: (code) => vm.runInContext(code, ctx), text };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('TD-1: a peer-supplied file name is shown as text, never parsed as HTML', () => {
  const app = boot();
  app.run('createRoom()');
  const host = app.peers[0];
  host.emit('open', 'host-1');
  const conn = Object.assign(new Emitter(), { open: true, send() {} });
  host.emit('connection', conn);
  const evil = '<img src=x onerror=alert(1)>" onclick="alert(2)';
  conn.emit('data', { file: new ArrayBuffer(1), name: evil, type: '' });
  const list = app.els('fileList');
  for (const el of tree(list)) assert.ok(!el.rawHtml.includes('<img'), `name reached innerHTML: ${el.rawHtml.trim()}`);
  assert.ok(text(list).includes(evil), 'name shown as text');
  const link = tree(list).find((e) => e.tagName === 'a');
  assert.equal(link.download, evil, 'download name set as a property');
});

test('TD-2: received data is saved as an opaque download, never with the peer-chosen MIME type', () => {
  const app = boot();
  app.run('createRoom()');
  const host = app.peers[0];
  host.emit('open', 'host-1');
  const conn = Object.assign(new Emitter(), { open: true, send() {} });
  host.emit('connection', conn);
  conn.emit('data', { file: new TextEncoder().encode('<script>alert(1)</script>'), name: 'a.txt', type: 'text/html' });
  assert.equal(app.blobs.length, 1);
  assert.equal(app.blobs[0].type, 'application/octet-stream');
});

test('TD-3: COPY SECURE LINK on the host copies the room link the QR encodes', async () => {
  const app = boot();
  app.run('createRoom()');
  app.peers[0].emit('open', 'host-1');
  await app.run('copyLink()');
  assert.deepEqual(app.clipboard, ['https://example.test/TriDrop/#host-1']);
  assert.equal(app.els('qrcode').qrText, app.clipboard[0]);
});

test('TD-3: a failed clipboard write is not reported as COPIED', async () => {
  const app = boot({ clipboardFails: true });
  app.run('createRoom()');
  app.peers[0].emit('open', 'host-1');
  await app.run('copyLink()');
  assert.notEqual(app.copyBtn.innerText, '[ COPIED ]');
});

const lastRowStatus = (app) => app.text(app.els('fileList').children[0]);
const file = (name) => ({ name, type: 'text/plain' });

test('TD-4: a file dropped before anyone joins is not shown as SENT', () => {
  const app = boot();
  app.run('createRoom()');
  app.peers[0].emit('open', 'host-1');
  app.ctx.handleFiles([file('a.txt')]);
  assert.doesNotMatch(lastRowStatus(app), /(?<!NOT )\bSENT\b/);
});

test('TD-4: a file dropped before the connection opens is not shown as SENT', () => {
  const app = boot();
  app.run('createRoom()');
  const host = app.peers[0];
  host.emit('open', 'host-1');
  const conn = host.connect('guest'); // fake Conn, open === false until 'open'
  host.emit('connection', conn);
  app.ctx.handleFiles([file('a.txt')]);
  assert.equal(conn.sent.length, 0);
  assert.doesNotMatch(lastRowStatus(app), /(?<!NOT )\bSENT\b/);
  conn.open = true; conn.emit('open');
  app.ctx.handleFiles([file('b.txt')]);
  assert.equal(conn.sent.length, 1);
  assert.match(lastRowStatus(app), /(?<!NOT )\bSENT\b/);
});

test('TD-4: a closed connection is dropped, so later files are not shown as SENT', () => {
  const app = boot();
  app.run('createRoom()');
  const host = app.peers[0];
  host.emit('open', 'host-1');
  const conn = host.connect('guest');
  host.emit('connection', conn);
  conn.open = true; conn.emit('open');
  conn.close();
  assert.equal(app.run('connections.length'), 0);
  app.ctx.handleFiles([file('a.txt')]);
  assert.doesNotMatch(lastRowStatus(app), /(?<!NOT )\bSENT\b/);
});

test('TD-5: joining a room ID that does not exist shows PEER NOT FOUND and a way back', () => {
  const app = boot({ hash: '#doesnotexist123' });
  app.run("joinRoom('doesnotexist123')");
  const guest = app.peers[0];
  guest.emit('open', 'guest-1');
  assert.equal(guest.outgoing.peer, 'doesnotexist123');
  assert.equal(app.els('qrcode').qrText, undefined, 'a guest does not show its own QR');
  app.els('backLink').classList.add('hidden'); // as in the markup
  guest.emit('error', Object.assign(new Error('Could not connect to peer doesnotexist123'), { type: 'peer-unavailable' }));
  assert.match(app.els('status-text').innerText, /PEER NOT FOUND/);
  assert.ok(!app.els('backLink').classList.contains('hidden'), 'back link shown');
  assert.match(html, /id="backLink"[^>]*href="\.\/"/, 'back link returns to the landing page');
});

test('TD-5: a connection error is reported and the connection dropped', () => {
  const app = boot();
  app.run('createRoom()');
  const host = app.peers[0];
  host.emit('open', 'host-1');
  const conn = host.connect('guest');
  host.emit('connection', conn);
  conn.open = true; conn.emit('open');
  conn.emit('error', Object.assign(new Error('boom'), { type: 'connection' }));
  assert.match(app.els('status-text').innerText, /ERROR/);
  assert.equal(app.run('connections.length'), 0);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
if (failed) { console.log(`${failed} failing`); process.exit(1); }
console.log('app behaviour ok');
