// Transfer maths and integrity helpers shared by the dashboard and its Node known-answer check.

export const KiB = 1024, MiB = 1024 * 1024;

// Pure arithmetic on the user's inputs: no measured claims.
// overheadBytes: bytes added per message (assumption, user-set). rttMs counts only when waiting for an ACK per chunk.
export function planTransfer({ fileBytes, chunkBytes, mbps, overheadBytes = 0, rttMs = 0, ackPerChunk = false }) {
  const chunks = Math.max(1, Math.ceil(fileBytes / chunkBytes));
  const wireBytes = fileBytes + chunks * overheadBytes;
  const sendSec = (wireBytes * 8) / (mbps * 1e6);
  const waitSec = ackPerChunk ? (chunks * rttMs) / 1000 : 0;
  return { chunks, wireBytes, overheadShare: (chunks * overheadBytes) / wireBytes, sendSec, waitSec, totalSec: sendSec + waitSec };
}

// Split an ArrayBuffer/Uint8Array into views of at most chunkBytes.
export function sliceChunks(buf, chunkBytes) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const out = [];
  for (let o = 0; o < u8.byteLength; o += chunkBytes) out.push(u8.subarray(o, Math.min(o + chunkBytes, u8.byteLength)));
  return out;
}

export function reassemble(chunks) {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(new Uint8Array(c.buffer ?? c, c.byteOffset ?? 0, c.byteLength), o); o += c.byteLength; }
  return out;
}

export async function sha256Hex(data) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Random test buffer (getRandomValues is capped at 65,536 bytes per call).
export function randomBytes(n) {
  const u8 = new Uint8Array(n);
  for (let o = 0; o < n; o += 65536) globalThis.crypto.getRandomValues(u8.subarray(o, Math.min(o + 65536, n)));
  return u8;
}

export function fmtBytes(b) {
  if (b < KiB) return `${b} B`;
  if (b < MiB) return `${(b / KiB).toFixed(b < 10 * KiB ? 1 : 0)} KiB`;
  if (b < 1024 * MiB) return `${(b / MiB).toFixed(b < 10 * MiB ? 1 : 0)} MiB`;
  return `${(b / 1024 / MiB).toFixed(2)} GiB`;
}

export function fmtSec(s) {
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 120) return `${s.toFixed(1)} s`;
  if (s < 7200) return `${(s / 60).toFixed(1)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}
