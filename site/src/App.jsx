import { useState, useEffect, useId } from 'react';
import appHtml from '../../index.html?raw';
import readme from '../../README.md?raw';
import { scan, extractFunction, FEATURES } from './scan.js';
import { planTransfer, sliceChunks, reassemble, sha256Hex, randomBytes, fmtBytes, fmtSec, KiB, MiB } from './transfer.js';

const REPO = 'https://github.com/JesunAhmadUshno/TriDrop';
const APP_URL = 'https://jesunahmadushno.github.io/TriDrop/';
const blob = (p, line) => `${REPO}/blob/main/${p}${line ? `#L${line}` : ''}`;
const S = scan(appHtml, readme);
const FEATURE_RE = Object.fromEntries(FEATURES.map((f) => [f.key, f.code]));
const L = (line) => (line ? <a className="mono" href={blob('index.html', line)}>L{line}</a> : <span className="hint">not found</span>);

const SECTIONS = [['top', 'Overview', '◎'], ['loopback', 'Loopback', '⇄'], ['pairing', 'Pairing', '▦'], ['planner', 'Planner', '∑'], ['audit', 'Claims', '✓'], ['security', 'Security', '⚿'], ['roadmap', 'Roadmap', '❯_']];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

function MenuBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  return (
    <div className="menubar" role="banner">
      <span className="apple" aria-hidden="true">◆</span>
      <a className="app" href="#top">TriDrop Lab</a>
      <a className="m" href={APP_URL}>Open the app</a>
      <a className="m" href={blob('index.html')}>index.html</a>
      <a className="m" href={blob('docs/research-review.md')}>Research review</a>
      <span className="spacer" />
      <span className="status"><i /> Scanned at build time</span>
      <a href={REPO}>GitHub ↗</a>
      <span className="clock">{now.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
    </div>
  );
}

function Dock() {
  const [active, setActive] = useState('top');
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' });
    SECTIONS.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return (
    <nav className="dock" aria-label="Sections">
      {SECTIONS.map(([id, label, icon]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'on' : ''} aria-current={active === id ? 'true' : undefined}>
          <span className="ico" aria-hidden="true">{icon}</span><span className="lbl">{label}</span>
        </a>
      ))}
    </nav>
  );
}

function Range({ label, value, min, max, step, onChange, show }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label} <span>{show}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

export default function App() {
  useReveal();
  return (
    <div className="wrap">
      <MenuBar />
      <div className="glow" aria-hidden="true" />
      <Hero />
      <Loopback />
      <Pairing />
      <Planner />
      <Audit />
      <Security />
      <Roadmap />
      <Dock />
      <footer>
        Every count, verdict and line number on this page is computed from <code>index.html</code> and <code>README.md</code> at build time.
        Loopback results are measured live in your browser and never leave it. MIT licence.
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <header className="card hero window" id="top" data-title="TriDrop — README.md">
      <div className="head">
        <p className="eyebrow">Product audit · static scan + live lab</p>
        <span className="pill warn">● {S.implementedClaims} of {S.claimed} README features found in code</span>
      </div>
      <h1>Phone to PC, <em>straight through the browser</em>.</h1>
      <p className="sub">
        TriDrop sends files from a phone to a PC over a WebRTC DataChannel, paired by QR code, with no install.
        This page checks what the {S.lineCount}-line app actually does against what its README promises, and lets you run a real DataChannel transfer inside your own browser.
      </p>
      <div className="actions">
        <a className="btn primary" href={APP_URL}>Open TriDrop</a>
        <a className="btn ghost" href="#loopback">Run the loopback lab</a>
        <span className="hint">Self-checks run with <code>cd site && npm test</code></span>
      </div>
      <div className="tiles">
        <div className="tile"><div className="num">{S.lineCount}</div><div className="cap">lines in the single-file app, <span className="mono">index.html</span></div></div>
        <div className="tile"><div className="num">{S.cdn.length}</div><div className="cap">CDN scripts loaded at runtime ({S.cdn.filter((c) => !c.version).length} unpinned)</div></div>
        <div className="tile"><div className="num">{S.peerjs}</div><div className="cap">pinned PeerJS version (WebRTC + cloud signaling)</div></div>
        <div className="tile"><div className="num">{S.implementedClaims}/{S.claimed}</div><div className="cap">README features with a matching code marker</div></div>
      </div>
    </header>
  );
}

// Two RTCPeerConnections in one page, SDP and ICE passed directly: no signaling server, no STUN (iceServers: []).
async function runLoopback(data, chunkBytes, onProgress) {
  const a = new RTCPeerConnection({ iceServers: [] });
  const b = new RTCPeerConnection({ iceServers: [] });
  const timeout = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms));
  try {
    a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
    b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
    const ch = a.createDataChannel('tridrop', { ordered: true });
    ch.binaryType = 'arraybuffer';
    const received = [];
    let got = 0;
    const done = new Promise((res) => {
      b.ondatachannel = ({ channel }) => {
        channel.binaryType = 'arraybuffer';
        channel.onmessage = (e) => { received.push(e.data); got += e.data.byteLength; onProgress(got); if (got >= data.byteLength) res(performance.now()); };
      };
    });
    const opened = new Promise((res) => { ch.onopen = res; });
    const offer = await a.createOffer();
    await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    await b.setLocalDescription(answer); await a.setRemoteDescription(answer);
    await Promise.race([opened, timeout(10000, 'Opening the DataChannel')]);

    const chunks = sliceChunks(data, chunkBytes);
    ch.bufferedAmountLowThreshold = 1 * MiB; // backpressure: pause above 4 MiB queued, resume below 1 MiB
    const t0 = performance.now();
    for (const c of chunks) {
      if (ch.bufferedAmount > 4 * MiB) await new Promise((r) => { ch.onbufferedamountlow = () => { ch.onbufferedamountlow = null; r(); }; });
      ch.send(c);
    }
    const t1 = await Promise.race([done, timeout(120000, 'Transfer')]);
    const sec = (t1 - t0) / 1000;
    const [sendHash, recvHash] = await Promise.all([sha256Hex(data), sha256Hex(reassemble(received))]);
    const sendChunk = await Promise.all(chunks.slice(0, 4).map((c) => sha256Hex(c)));
    const recvChunk = await Promise.all(received.slice(0, 4).map((c) => sha256Hex(c)));
    return { bytes: data.byteLength, chunks: chunks.length, messages: received.length, sec, mbps: data.byteLength / 1e6 / sec, sendHash, recvHash, sendChunk, recvChunk };
  } finally { a.close(); b.close(); }
}

function Loopback() {
  const [src, setSrc] = useState('generated');
  const [genMiB, setGenMiB] = useState(16);
  const [file, setFile] = useState(null);
  const [chunkKiB, setChunkKiB] = useState(16);
  const [state, setState] = useState({ phase: 'idle' });
  const fileId = useId();
  const MAX = 512 * MiB;
  const run = async () => {
    if (typeof RTCPeerConnection === 'undefined') { setState({ phase: 'error', msg: 'This browser has no WebRTC (RTCPeerConnection) support.' }); return; }
    try {
      let data;
      if (src === 'file') {
        if (!file) { setState({ phase: 'error', msg: 'Choose a file first.' }); return; }
        if (file.size > MAX) { setState({ phase: 'error', msg: `That file is ${fmtBytes(file.size)}; this lab caps at ${fmtBytes(MAX)} because it holds the file in memory twice.` }); return; }
        setState({ phase: 'reading' });
        data = new Uint8Array(await file.arrayBuffer());
      } else data = randomBytes(genMiB * MiB);
      if (!data.byteLength) { setState({ phase: 'error', msg: 'The file is empty.' }); return; }
      setState({ phase: 'running', got: 0, total: data.byteLength });
      let last = 0;
      const r = await runLoopback(data, chunkKiB * KiB, (got) => { const t = performance.now(); if (t - last > 80) { last = t; setState({ phase: 'running', got, total: data.byteLength }); } });
      setState({ phase: 'done', r, label: src === 'file' ? file.name : `${genMiB} MiB of random bytes` });
    } catch (e) {
      setState({ phase: 'error', msg: `The loopback did not complete: ${e.message}. No numbers are shown for a failed run.` });
    }
  };
  const busy = state.phase === 'running' || state.phase === 'reading';
  const r = state.r;
  return (
    <section id="loopback" className="card window reveal" data-title="loopback.webrtc — live, same device">
      <div className="head">
        <div>
          <p className="eyebrow">Live lab · runs only when you click</p>
          <h2>Send a file over a real DataChannel, then prove it arrived intact.</h2>
          <p className="sub">
            Two WebRTC peers live in this page and swap their offer, answer and ICE candidates directly, with no signaling server and no STUN.
            Your file (or random test bytes) is sliced into chunks, sent with backpressure, reassembled, and SHA-256 hashed on both ends with WebCrypto.
            The README's per-chunk integrity check is what this lab adds; the app itself sends each file in one <span className="mono">conn.send</span> call ({L(S.security.sendWhole)}) and never hashes it.
          </p>
        </div>
        <span className="pill info">Same-device loopback</span>
      </div>
      <div className="controls">
        <div className="field"><label htmlFor={`${fileId}-src`}>Payload</label>
          <select id={`${fileId}-src`} value={src} onChange={(e) => setSrc(e.target.value)}>
            <option value="generated">Generated random bytes</option>
            <option value="file">A file from this device</option>
          </select>
        </div>
        {src === 'generated'
          ? <div className="field"><label htmlFor={`${fileId}-size`}>Test size</label>
              <select id={`${fileId}-size`} value={genMiB} onChange={(e) => setGenMiB(+e.target.value)}>{[1, 4, 16, 64, 128].map((n) => <option key={n} value={n}>{n} MiB</option>)}</select></div>
          : <div className="field"><label htmlFor={fileId}>File (stays on this device)</label>
              <input id={fileId} type="file" onChange={(e) => setFile(e.target.files[0] || null)} /></div>}
        <div className="field"><label htmlFor={`${fileId}-chunk`}>Chunk size</label>
          <select id={`${fileId}-chunk`} value={chunkKiB} onChange={(e) => setChunkKiB(+e.target.value)}>{[16, 64, 128].map((n) => <option key={n} value={n}>{n} KiB</option>)}</select>
        </div>
      </div>
      <div className="actions" style={{ marginTop: 0, marginBottom: 16 }}>
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Transferring…' : 'Run loopback transfer'}</button>
        <span className="hint">Measures this browser's DataChannel overhead on one machine. It is not LAN or internet speed, and not a TriDrop benchmark.</span>
      </div>
      <div aria-live="polite">
        {state.phase === 'idle' && <p className="tip">Nothing has run yet. No connection is opened until you press the button.</p>}
        {state.phase === 'reading' && <p className="tip">Reading the file into memory…</p>}
        {state.phase === 'running' && (
          <div className="bar-row"><div className="lab"><span>Received</span><b>{fmtBytes(state.got)} of {fmtBytes(state.total)}</b></div>
            <div className="track"><div className="fill" style={{ width: `${(state.got / state.total) * 100}%`, background: 'var(--primary)' }} /></div></div>
        )}
        {state.phase === 'error' && <p className="tip" style={{ color: 'var(--bad)' }}>{state.msg}</p>}
        {state.phase === 'done' && (
          <>
            <div className="tiles" style={{ marginTop: 0 }}>
              <div className="tile"><div className="num">{r.mbps.toFixed(1)}</div><div className="cap">MB/s measured just now (10⁶ bytes per second)</div></div>
              <div className="tile"><div className="num">{fmtSec(r.sec)}</div><div className="cap">to move {fmtBytes(r.bytes)} ({state.label})</div></div>
              <div className="tile"><div className="num">{r.chunks.toLocaleString()}</div><div className="cap">chunks sent, {r.messages.toLocaleString()} messages received</div></div>
              <div className="tile"><div className="num" style={{ color: r.sendHash === r.recvHash ? 'var(--good)' : 'var(--bad)' }}>{r.sendHash === r.recvHash ? 'Match' : 'Mismatch'}</div><div className="cap">SHA-256, sender vs receiver</div></div>
            </div>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table>
                <thead><tr><th>Digest</th><th>Sender</th><th>Receiver</th></tr></thead>
                <tbody>
                  <tr><td>Whole payload</td><td className="mono">{r.sendHash.slice(0, 24)}…</td><td className={`mono ${r.sendHash === r.recvHash ? 'ok' : 'no'}`}>{r.recvHash.slice(0, 24)}…</td></tr>
                  {r.sendChunk.map((h, i) => <tr key={i}><td>Chunk {i + 1}</td><td className="mono">{h.slice(0, 24)}…</td><td className={`mono ${h === r.recvChunk[i] ? 'ok' : 'no'}`}>{(r.recvChunk[i] || '').slice(0, 24)}…</td></tr>)}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const STEPS = [
  { fn: 'createRoom', t: 'Host clicks Create', d: 'Switches to the room view and starts a peer with no ID, so the PeerJS cloud server assigns one.' },
  { fn: 'initPeer', t: 'Register with PeerJS cloud', d: 'new Peer() opens a WebSocket to the public PeerJS server. On open, the host turns page-url#id into a QR code. On an incoming connection it hands off to handleConn and accepts it without any check.' },
  { fn: 'joinRoom', t: 'Guest scans the QR or types the ID', d: 'Opening url#id auto-joins after one second. The guest registers its own peer, then calls peer.connect(id); PeerJS relays the offer, answer and ICE candidates.' },
  { fn: 'handleConn', t: 'DataChannel opens on both sides', d: 'On open the status reads LINK SECURED. On data, the whole received file becomes one Blob and an object URL for the SAVE link.' },
  { fn: 'handleFiles', t: 'Send each dropped file', d: 'Each file goes to every connection as one {file, name, type} message. PeerJS’s binary serializer splits it into packets internally; the app has no chunking, progress or backpressure of its own.' },
  { fn: 'addFileUI', t: 'List the file', d: 'Adds a row with a SAVE link. The remote peer’s file name is interpolated into innerHTML and the download attribute (see Security).' },
].map((s) => ({ ...s, src: extractFunction(appHtml, s.fn) }));

function Pairing() {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <section id="pairing" className="card window reveal" data-title="pairing.flow — index.html">
      <div className="head">
        <div>
          <p className="eyebrow">Interactive walkthrough · no network calls</p>
          <h2>The real code path, from QR code to saved file.</h2>
          <p className="sub">Each step shows the matching function, pulled out of <span className="mono">index.html</span> at build time with its line numbers. This explainer never contacts PeerJS.</p>
        </div>
        <div className="seg" role="group" aria-label="Pairing steps">
          {STEPS.map((x, k) => <button key={x.fn} aria-pressed={k === i} onClick={() => setI(k)}>{k + 1}</button>)}
        </div>
      </div>
      <div className="grid2">
        <div>
          <ol className="steps">
            {STEPS.map((x, k) => (
              <li key={x.fn} style={{ opacity: k === i ? 1 : 0.45, cursor: 'pointer' }} onClick={() => setI(k)}>
                <span className="n">{k + 1}</span><div><b>{x.t}</b>{k === i && <div className="hint">{x.d}</div>}</div>
              </li>
            ))}
          </ol>
          <div className="actions">
            <button className="btn ghost" onClick={() => setI((k) => Math.max(0, k - 1))} disabled={i === 0}>← Back</button>
            <button className="btn primary" onClick={() => setI((k) => Math.min(STEPS.length - 1, k + 1))} disabled={i === STEPS.length - 1}>Next step →</button>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="hint" style={{ marginBottom: 6 }}><span className="mono">{s.fn}()</span>, index.html lines <a href={blob('index.html', `${s.src.from}-L${s.src.to}`)}>{s.src.from} to {s.src.to}</a></div>
          <pre className="code" tabIndex={0} aria-label={`Source of ${s.fn}`}>{s.src.code.split('\n').map((ln, k) => <span key={k}><i>{s.src.from + k}</i>{ln}{'\n'}</span>)}</pre>
        </div>
      </div>
    </section>
  );
}

function Planner() {
  const [logMiB, setLogMiB] = useState(Math.log10(1024));
  const [chunkKiB, setChunkKiB] = useState(16);
  const [logMbps, setLogMbps] = useState(2);
  const [overhead, setOverhead] = useState(28);
  const [rtt, setRtt] = useState(20);
  const [ack, setAck] = useState(false);
  const fileBytes = Math.round(10 ** logMiB * MiB), mbps = 10 ** logMbps;
  const plan = planTransfer({ fileBytes, chunkBytes: chunkKiB * KiB, mbps, overheadBytes: overhead, rttMs: rtt, ackPerChunk: ack });
  const opts = [4, 16, 64, 256, 1024].map((k) => ({ k, p: planTransfer({ fileBytes, chunkBytes: k * KiB, mbps, overheadBytes: overhead, rttMs: rtt, ackPerChunk: ack }) }));
  const maxT = Math.max(...opts.map((o) => o.p.totalSec));
  const W = 460, rowH = 34, H = opts.length * rowH + 26, l = 70, r = 70;
  const x = (t) => l + (t / maxT) * (W - l - r);
  return (
    <section id="planner" className="card window reveal" data-title="chunk-planner.calc — model">
      <p className="eyebrow">Calculator · a model, not a measurement</p>
      <h2>How chunk size, link speed and per-chunk ACKs change a transfer.</h2>
      <p className="sub">
        Pure arithmetic on what you enter: chunks = ⌈size ÷ chunk⌉, time = (size + chunks × overhead) × 8 ÷ speed, plus one round trip per chunk if the sender waits for an ACK.
        The 28-byte default overhead is an assumption (the SCTP common header plus one DATA chunk header, RFC 9260) and leaves out DTLS, UDP and IP framing. Change it.
      </p>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div>
          <div className="controls" style={{ gridTemplateColumns: '1fr' }}>
            <Range label="File size" value={logMiB} min={0} max={4.31} step={0.01} onChange={setLogMiB} show={fmtBytes(fileBytes)} />
            <Range label="Link speed" value={logMbps} min={0} max={3} step={0.01} onChange={setLogMbps} show={`${mbps < 10 ? mbps.toFixed(1) : Math.round(mbps)} Mbit/s`} />
            <Range label="Round-trip time" value={rtt} min={1} max={300} step={1} onChange={setRtt} show={`${rtt} ms`} />
            <div className="controls" style={{ margin: 0 }}>
              <div className="field"><label htmlFor="chunk">Chunk size</label>
                <select id="chunk" value={chunkKiB} onChange={(e) => setChunkKiB(+e.target.value)}>{opts.map((o) => <option key={o.k} value={o.k}>{o.k} KiB</option>)}</select></div>
              <div className="field"><label htmlFor="ovh">Overhead per chunk (bytes)</label>
                <input id="ovh" type="number" min={0} max={4096} value={overhead} onChange={(e) => setOverhead(Math.max(0, Math.min(4096, +e.target.value || 0)))} /></div>
            </div>
            <div className="seg" role="group" aria-label="Sender strategy">
              <button aria-pressed={!ack} onClick={() => setAck(false)}>Pipelined</button>
              <button aria-pressed={ack} onClick={() => setAck(true)}>Wait for ACK per chunk</button>
            </div>
          </div>
          <div className="tiles" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0 }}>
            <div className="tile"><div className="num">{plan.chunks.toLocaleString()}</div><div className="cap">chunks of {chunkKiB} KiB</div></div>
            <div className="tile"><div className="num">{fmtSec(plan.totalSec)}</div><div className="cap">estimated, {(plan.overheadShare * 100).toFixed(2)}% of bytes are overhead</div></div>
          </div>
        </div>
        <div>
          <h3>Estimated time by chunk size for {fmtBytes(fileBytes)}</h3>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated transfer time for each chunk size, split into sending and ACK waiting">
            {opts.map((o, k) => (
              <g key={o.k} transform={`translate(0 ${k * rowH + 8})`}>
                <text x={l - 8} y={15} textAnchor="end" style={{ fill: o.k === chunkKiB ? 'var(--text)' : undefined, fontWeight: o.k === chunkKiB ? 700 : 400 }}>{o.k} KiB</text>
                <rect x={l} y={4} height={16} rx={4} width={Math.max(1, x(o.p.sendSec) - l)} fill="var(--primary)" opacity={o.k === chunkKiB ? 1 : 0.45} />
                {o.p.waitSec > 0 && <rect x={x(o.p.sendSec)} y={4} height={16} rx={4} width={Math.max(1, x(o.p.totalSec) - x(o.p.sendSec))} fill="var(--warn)" opacity={o.k === chunkKiB ? 1 : 0.45} />}
                <text x={x(o.p.totalSec) + 6} y={15}>{fmtSec(o.p.totalSec)}</text>
              </g>
            ))}
          </svg>
          <div className="legend"><span><i style={{ background: 'var(--primary)' }} />sending bytes</span><span><i style={{ background: 'var(--warn)' }} />waiting for ACKs</span></div>
          <p className="hint">Chunk sizes above 256 KiB exceed what some browsers accept as one DataChannel message; real senders queue many chunks at once.</p>
        </div>
      </div>
    </section>
  );
}

function Audit() {
  const [only, setOnly] = useState('all');
  const rows = S.features.filter((f) => only === 'all' || (only === 'missing' ? !f.implemented : f.implemented));
  return (
    <section id="audit" className="card window reveal" data-title="claims-vs-code.audit — static scan">
      <div className="head">
        <div>
          <p className="eyebrow">Static scan of index.html and README.md</p>
          <h2>{S.implementedClaims} of the {S.claimed} features the README describes have <em>code behind them</em>.</h2>
          <p className="sub">
            For each feature, the build looks for its wording in the README and for the browser API that would implement it inside the app's script (lines {S.scriptLines[0]} to {S.scriptLines[1]}).
            A missing marker is strong evidence but not proof; the regex used is shown so you can check it.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Filter features">
          {[['all', 'All'], ['missing', 'Not in code'], ['done', 'In code']].map(([k, t]) => <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)}>{t}</button>)}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Feature</th><th>README line</th><th className="re">Code marker searched</th><th>Found at</th><th>Verdict</th></tr></thead>
          <tbody>
            {rows.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>{f.readmeLine ? <a className="mono" href={blob('README.md', f.readmeLine)}>L{f.readmeLine}</a> : '—'}</td>
                  <td className="mono re">{FEATURE_RE[f.key].source}</td>
                  <td>{L(f.line)}</td>
                  <td><span className={`pill ${f.implemented ? 'good' : 'bad'}`}>{f.implemented ? 'Implemented' : 'Not implemented'}</span></td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Chunking note: PeerJS {S.peerjs} splits large binary messages into packets internally, so files do travel in pieces. What is missing is app-level slicing, which per-chunk hashing, progress and resume all depend on.
      </p>
    </section>
  );
}

function Security() {
  const s = S.security;
  const holds = [
    { t: 'Transport is encrypted', d: 'WebRTC requires DTLS on every DataChannel (RFC 8827), so file bytes are encrypted between the two browsers.', line: S.features.find((f) => f.key === 'p2p').line },
    { t: 'Files skip the server', d: 'The PeerJS server only brokers the handshake; the file itself goes over the peer connection in conn.send.', line: s.sendWhole },
    { t: 'Libraries mostly pinned', d: `${S.cdn.filter((c) => c.version).length} of ${S.cdn.length} CDN scripts name an exact version.`, line: S.cdn[1]?.line },
  ];
  const open = [
    s.filenameInnerHTML && { sev: 'bad', t: 'Filename injected as HTML', d: 'The sender’s file name goes straight into innerHTML, so a malicious peer can send a name containing markup or script (XSS). Fix: build the row with createElement and textContent.', line: s.filenameInnerHTML },
    s.downloadAttr && { sev: 'warn', t: 'Filename in download attribute', d: 'The same unescaped name sets download="…", so a quote in the name can break out of the attribute.', line: s.downloadAttr },
    s.acceptsAll && { sev: 'bad', t: 'Host accepts every connection', d: 'Anyone holding the ID or link can join and push files. There is no confirm prompt, code check or expiry.', line: s.acceptsAll },
    s.peerDefaultCloud && { sev: 'warn', t: 'Public PeerJS cloud signaling', d: 'new Peer() uses the free public server with default IDs: a single point of failure the app cannot control.', line: s.peerDefaultCloud },
    s.e2eBadge && { sev: 'warn', t: '“E2E” badge overstates it', d: 'There is no app-layer encryption or key verification; the badge describes DTLS transport encryption at best.', line: s.e2eBadge },
    s.wholeBlob && { sev: 'warn', t: 'Whole file held in memory', d: 'Each file is sent in one message and rebuilt as one Blob, with no progress or backpressure. Multi-GB files may stall, especially on iOS Safari.', line: s.wholeBlob },
    s.noZoom && { sev: 'warn', t: 'Zoom disabled', d: 'user-scalable=no blocks pinch zoom (WCAG 1.4.4).', line: s.noZoom },
    s.tailwindCdn && { sev: 'warn', t: 'Tailwind dev CDN, unpinned', d: 'cdn.tailwindcss.com is the in-browser development build with no version pin.', line: s.tailwindCdn },
  ].filter(Boolean);
  return (
    <section id="security" className="card window reveal" data-title="security.review — line-referenced">
      <p className="eyebrow">Security and reliability review</p>
      <h2>What holds up, and what a hostile peer could exploit.</h2>
      <p className="sub">Every finding links to the line in <span className="mono">index.html</span> it was found at. {open.filter((o) => o.sev === 'bad').length} are serious, {open.filter((o) => o.sev === 'warn').length} are cautions. None has been exploited here; this is code review, not a penetration test.</p>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="bars">
          <h3>Holds up</h3>
          {holds.map((h) => <div className="tile" key={h.t}><div className="head" style={{ marginBottom: 4 }}><b>{h.t}</b><span className="pill good">OK · {L(h.line)}</span></div><p className="hint" style={{ margin: 0 }}>{h.d}</p></div>)}
        </div>
        <div className="bars">
          <h3>Open issues</h3>
          {open.map((o) => <div className="tile" key={o.t}><div className="head" style={{ marginBottom: 4 }}><b>{o.t}</b><span className={`pill ${o.sev}`}>{o.sev === 'bad' ? 'High' : 'Caution'} · {L(o.line)}</span></div><p className="hint" style={{ margin: 0 }}>{o.d}</p></div>)}
        </div>
      </div>
    </section>
  );
}

function Roadmap() {
  const pill = { done: ['good', 'Done'], open: ['bad', 'Open'], replaced: ['info', 'Replaced by PeerJS cloud'], unknown: ['warn', 'Not scanned'] };
  const fixes = [
    ['Escape the filename', 'Build the file row with createElement + textContent. A few lines, removes the XSS.'],
    ['Honest feature list', 'README now splits “Implemented in v1” from “Planned”, and explains the E2E badge.'],
    ['Per-chunk SHA-256', 'Slice with File.slice, hash each chunk with crypto.subtle, send hashes ahead of data; the loopback lab above is a working sketch.'],
    ['Progress + backpressure', 'Watch bufferedAmount and bufferedamountlow, as the loopback lab does, and show a progress bar.'],
    ['Confirm incoming peers', 'Ask the host to accept each connection and destroy the peer after the transfer (expiry).'],
    ['Pin and self-host CSS', 'Replace the Tailwind dev CDN with a built stylesheet; re-enable zoom.'],
  ];
  return (
    <section id="roadmap" className="card window reveal" data-title="roadmap.md — status from the scan">
      <p className="eyebrow">Roadmap</p>
      <h2>The README roadmap, with status taken from the code.</h2>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>README roadmap item</th><th>Status</th></tr></thead>
            <tbody>{S.roadmap.map((r) => <tr key={r.item}><td>{r.item}</td><td><span className={`pill ${pill[r.status][0]}`}>{pill[r.status][1]}</span></td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h3>Cheap fixes, in order</h3>
          <ol className="steps" style={{ marginTop: 12 }}>
            {fixes.map(([t, d], k) => <li key={t}><span className="n">{k + 1}</span><div><b>{t}</b><div className="hint">{d}</div></div></li>)}
          </ol>
        </div>
      </div>
      <div className="docs" style={{ marginTop: 20 }}>
        <a href={blob('docs/research-review.md')}><b>Research review</b><small>Graded rubric and what each gap needs</small></a>
        <a href={blob('index.html')}><b>index.html</b><small>The whole app, {S.lineCount} lines</small></a>
        <a href={APP_URL}><b>Live app</b><small>Host, scan, drop, save</small></a>
      </div>
    </section>
  );
}
