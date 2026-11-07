// Static scan of the TriDrop app (../index.html) and its README.
// Runs in the browser on the raw file text bundled at build time, and in Node for the known-answer check,
// so every verdict, count and line number on the dashboard is derived from the repo, never typed in.

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Find the first regex match inside the app's inline <script>; returns its 1-based line in index.html or null.
function findLine(html, scriptStart, re) {
  const m = re.exec(html.slice(scriptStart));
  return m ? lineOf(html, scriptStart + m.index) : null;
}

// Extract `function name(...) { ... }` from the script by brace counting, with its line range.
export function extractFunction(html, name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let depth = 0, i = html.indexOf('{', start);
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  const code = html.slice(start, i + 1);
  const from = lineOf(html, start);
  return { name, code: dedent(code, html, start), from, to: from + code.split('\n').length - 1 };
}

function dedent(code, html, start) {
  const indent = start - html.lastIndexOf('\n', start) - 1;
  return code.split('\n').map((l, k) => (k === 0 ? l : l.slice(Math.min(indent, l.length - l.trimStart().length)))).join('\n');
}

// Feature claims the README makes, the README wording that makes them, and the code marker that would implement them.
export const FEATURES = [
  { key: 'p2p', label: 'Peer-to-peer WebRTC data path', readme: /WebRTC DataChannels/, code: /new Peer\(/ },
  { key: 'qr', label: 'QR / code pairing', readme: /QR/, code: /new QRCode\(/ },
  { key: 'drop', label: 'Drag-and-drop multi-file send', readme: /select(s)? files|drag/i, code: /addEventListener\('drop'/ },
  { key: 'chunk', label: 'App-level chunking (file slicing)', readme: /chunk/i, code: /\.slice\(|\.stream\(\)|ReadableStream/ },
  { key: 'sha', label: 'SHA-256 integrity per chunk', readme: /SHA.?256/, code: /crypto\.subtle\.digest/ },
  { key: 'resume', label: 'Resume interrupted transfers', readme: /resume/i, code: /resume|byteOffset|bytesReceived/i },
  { key: 'progress', label: 'Transfer progress, cancel / retry', readme: /progress/i, code: /progress|bufferedAmount/i },
  { key: 'turn', label: 'TURN / relay fallback', readme: /TURN/, code: /iceServers|turn:/ },
  { key: 'e2e', label: 'App-layer end-to-end encryption', readme: /E2E|end.to.end/i, code: /crypto\.subtle\.(encrypt|generateKey|importKey)/ },
  { key: 'pwa', label: 'PWA / service worker', readme: /PWA|Service Worker/i, code: /serviceWorker|rel="manifest"/ },
  { key: 'expiry', label: 'Session / link expiry', readme: /expir/i, code: /expir|peer\.destroy\(/i },
];

// Roadmap bullets mapped to the feature they depend on (by keyword); 'ui' means the basic flow.
const ROADMAP_MAP = [[/signaling/i, 'signaling'], [/sender\/receiver UI/i, 'p2p'], [/chunk/i, 'chunk'], [/QR/i, 'qr'], [/TURN/i, 'turn'], [/encryption/i, 'e2e'], [/PWA/i, 'pwa']];

export function scan(html, readme) {
  const scriptStart = html.indexOf('<script>');
  const lines = html.split('\n');
  const cdn = [...html.matchAll(/<script src="(https:\/\/[^"]+)"/g)].map((m) => {
    const url = m[1];
    const v = url.match(/@(\d+\.\d+\.\d+)|\/(\d+\.\d+\.\d+)\//);
    return { url, host: new URL(url).host, version: v ? v[1] || v[2] : null, line: lineOf(html, m.index) };
  });
  const features = FEATURES.map((f) => {
    const line = findLine(html, scriptStart, new RegExp(f.code.source, f.code.flags));
    const rm = f.readme.exec(readme);
    return { key: f.key, label: f.label, claimed: !!rm, readmeLine: rm ? lineOf(readme, rm.index) : null, implemented: line != null, line };
  });
  const byKey = Object.fromEntries(features.map((f) => [f.key, f]));
  const functions = [...html.slice(scriptStart).matchAll(/function (\w+)\(/g)].map((m) => m[1]);

  // Security observations, each located in the file.
  const at = (re) => findLine(html, 0, re);
  const nameInHtml = at(/innerHTML = `[\s\S]*?\$\{name\}/) && at(/\$\{name\}/);
  const security = {
    filenameInnerHTML: nameInHtml, // remote peer's file name interpolated into innerHTML
    downloadAttr: at(/download="\$\{name\}"/),
    peerDefaultCloud: at(/new Peer\(id, \{ debug: 1 \}\)/), // no host/key option: PeerJS public cloud signaling
    acceptsAll: at(/peer\.on\('connection'/),
    wholeBlob: at(/new Blob\(\[data\.file\]/),
    sendWhole: at(/c\.send\(\{ file: f/),
    e2eBadge: at(/SECURE \/\/ P2P \/\/ E2E/),
    cursorNone: at(/cursor: none/),
    noZoom: at(/user-scalable=no/),
    tailwindCdn: at(/cdn\.tailwindcss\.com/),
    inlineOnclick: (html.match(/onclick="/g) || []).length,
    autoJoinHash: at(/if\(window\.location\.hash\)/),
  };

  const roadmapBlock = (readme.split(/^## Roadmap\s*$/m)[1] || '').split(/^## /m)[0];
  const roadmap = [...roadmapBlock.matchAll(/^- (.+)$/gm)].map((m) => {
    const hit = ROADMAP_MAP.find(([re]) => re.test(m[1]));
    const key = hit ? hit[1] : null;
    let status = 'unknown';
    if (key === 'signaling') status = byKey.p2p.implemented ? 'replaced' : 'open';
    else if (key) status = byKey[key].implemented ? 'done' : 'open';
    return { item: m[1].trim(), key, status };
  });

  return {
    lineCount: html.endsWith('\n') ? lines.length - 1 : lines.length,
    scriptLines: [lineOf(html, scriptStart), lineOf(html, html.indexOf('</script>', scriptStart))],
    cdn,
    peerjs: cdn.find((c) => /peerjs/.test(c.url))?.version ?? null,
    functions,
    features,
    claimed: features.filter((f) => f.claimed).length,
    implementedClaims: features.filter((f) => f.claimed && f.implemented).length,
    security,
    roadmap,
  };
}
