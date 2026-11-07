# TriDrop: research and engineering review

Scope: the repo as of branch `site/live-dashboard` (app = `index.html`, 573 lines; `wc -l` prints 572 because the last line has no trailing newline). TriDrop is a product app, not a study, so it is graded on a PhD-level product-engineering rubric: is the problem clear, are the claims backed by code and measurement, is it tested, reproducible, secure and honest about its limits.

Every fact below can be re-derived with `cd site && npm test`, which scans `index.html` and `README.md` (see `site/src/scan.js`) and prints the summary the dashboard uses.

## Overall grade: C (was C-, before this branch)

The idea is clear and the core path works: two browsers pair through PeerJS and send files over a WebRTC DataChannel. Most of the original README described a target design rather than the app, and there was no testing, measurement or CI at all. This branch adds an honest feature split, a static claims scanner, a known-answer check, an app smoke test, CI, and a live dashboard. It does not change the app.

| Criterion | Grade | Evidence | What moves it up |
|---|---|---|---|
| Problem / question | B | README states a concrete pain (iPhone to Windows, large files, no install). | A measurable target, e.g. "a 2 GB file iPhone Safari to Windows Chrome on one LAN in under N minutes, 95% of attempts". |
| Hypotheses / claims | D to C | 11 feature claims found in the README; the scan finds code for 3 (P2P, QR pairing, drag-and-drop). README now splits implemented from planned. | Ship the planned features or keep them under Planned. |
| Method / design | C | Simple single-file design; PeerJS for signaling and transport. | Own chunking with backpressure, per-chunk hashing, resume, a short-lived high-entropy session code. |
| Baselines | F | No comparison with AirDrop alternatives (Snapdrop/PairDrop, LocalSend, cloud upload, USB). | Time the same files with 2 to 3 alternatives on the same devices and network (data/compute needed below). |
| Statistics / uncertainty | F | No measurements exist. The dashboard's loopback lab measures one same-device run live in the visitor's browser; it is labelled as such and is not a TriDrop benchmark. | Repeated timed transfers with medians and intervals per device pair and file size. |
| Reproducibility | C | Static app with no build step. Dashboard checks run with one command and in CI. External dependencies: unpinned Tailwind dev CDN and the public PeerJS cloud server. | Pin or self-host CSS; optionally self-host a PeerJS server. |
| Testing | D (was F) | New: `site/src/app.smoke.mjs` (inline script parses, key functions and elements exist, libraries pinned) and `site/src/transfer.check.mjs` (planner maths, SHA-256 known answer, slice and reassemble round trip, scan facts). | A headless two-page test that pairs two peers against a local PeerJS server and transfers a file end to end. |
| Threats to validity | C | Listed on the dashboard and below. | Cross-device matrix and NAT-traversal success rates. |
| Related work | F | None cited. | Compare with PairDrop/Snapdrop (WebRTC, local discovery), LocalSend (native, LAN), Wormhole-style tools (PAKE codes). |
| Security | D | DTLS transport is real. Open: filename XSS, open joins, overstated "E2E" badge. | Fixes listed below. |
| Accessibility / UX | D | `cursor: none`, zoom disabled (`user-scalable=no`, fails WCAG 1.4.4), inline `onclick` on 4 elements. | Restore the cursor and zoom; use buttons with listeners. |

## Claims vs code (from the build-time scan)

| README feature | In code? | Marker searched in the app script |
|---|---|---|
| Peer-to-peer WebRTC data path | Yes | `new Peer(` |
| QR / code pairing | Yes | `new QRCode(` |
| Drag-and-drop multi-file send | Yes | `addEventListener('drop'` |
| App-level chunking | No | `.slice(`, `.stream()`, `ReadableStream` |
| SHA-256 integrity per chunk | No | `crypto.subtle.digest` |
| Resume | No | `resume`, `byteOffset`, `bytesReceived` |
| Progress, cancel / retry | No | `progress`, `bufferedAmount` |
| TURN / relay fallback | No | `iceServers`, `turn:` |
| App-layer E2E encryption | No | `crypto.subtle.encrypt/generateKey/importKey` |
| PWA / service worker | No | `serviceWorker`, `rel="manifest"` |
| Session / link expiry | No | `expir`, `peer.destroy(` |

Caveat: PeerJS 1.5.2's binary serializer splits large messages into packets internally, so files do travel in pieces. What is missing is app-level slicing, which per-chunk hashing, progress and resume need. A missing marker is strong evidence, not proof; the regexes are in `site/src/scan.js`.

## Security findings (line numbers in `index.html`)

1. **High: filename XSS (L491, L492).** `addFileUI` interpolates the remote peer's `name` into `innerHTML` and into `download="..."`. A malicious peer can send a file name containing markup. Recommended fix (not applied on this branch because it changes the live product and needs the Owner's approval):
   ```js
   const label = document.createElement('span');
   label.className = 'truncate w-2/3';
   label.textContent = `${isIncoming ? '↓' : '↑'} ${name}`;
   item.append(label);
   if (isIncoming) { const a = document.createElement('a'); a.href = url; a.download = name; a.textContent = 'SAVE'; a.className = 'text-[#CCFF00] hover:underline'; item.append(a); }
   else { const s = document.createElement('span'); s.className = 'opacity-50'; s.textContent = 'SENT'; item.append(s); }
   ```
2. **High: host accepts every connection (L422).** Anyone with the ID or link can join and push files; no confirmation, no expiry.
3. **Caution: public PeerJS cloud signaling with default IDs (L407).** Single point of failure outside the app's control.
4. **Caution: "SECURE // P2P // E2E" badge (L316).** WebRTC's DTLS encrypts transport (RFC 8827); there is no app-layer E2E or key verification. README now says so.
5. **Caution: whole file in memory (L453, L480).** One `conn.send` per file, one `Blob` on receipt, no backpressure or progress. Multi-GB files are likely to stall, especially on iOS Safari (untested).

## Fixed on this branch (cheap gaps)

- README split into "Implemented in v1" and "Planned"; E2E badge explained; live app and dashboard linked.
- Build-time claims scanner so the dashboard cannot drift from the code.
- Known-answer check and app smoke test, run by `npm test`, before every build, and in CI.
- Pages workflow that keeps the app at `/TriDrop/` and adds the dashboard at `/TriDrop/dashboard/`.
- Working sketch of chunked send with backpressure and per-chunk SHA-256 (the dashboard's loopback lab, `site/src/App.jsx`), ready to port into the app.

## Remaining gaps and exactly what each needs

| Gap | What it needs |
|---|---|
| Filename XSS | Owner approval to change `index.html` (patch above, about 10 lines). No compute. |
| Real throughput numbers | Devices: one iPhone (Safari) and one Windows PC (Chrome and Edge) on one Wi-Fi LAN. Data: files of 10 MB, 100 MB, 1 GB, 4 GB, 10 timed runs each, logged to a committed `results/transfers.csv` (device pair, size, seconds, success). About 2 hours of hands-on time. No paid services. |
| Baselines | Same devices and files with PairDrop and LocalSend (both free) and one cloud upload/download, same CSV format. About 2 more hours. |
| NAT traversal success rate | Two devices on different networks (home Wi-Fi and mobile hotspot), 20 pairing attempts each with STUN only; then repeat with a TURN server (a free-tier or self-hosted coturn on a small VM, about $5/month) to measure the gain. |
| End-to-end automated test | A local PeerJS server (`peer` npm package) plus Playwright running two pages that pair and transfer a file. Runs in CI in under 2 minutes. No paid compute. |
| Large-file reliability | Implement app-level chunking with `bufferedAmount` backpressure (port the loopback lab), then test 4 GB on iPhone Safari to Windows. Needs the devices above. |
| Related work | A short written comparison with PairDrop/Snapdrop, LocalSend and Magic Wormhole. Reading only. |

## Threats to validity of this review

- The claims audit is a regex scan. A feature implemented under a name the regex does not expect would be missed; the regexes are published for checking.
- The loopback lab measures one browser talking to itself over local host candidates. It reflects DataChannel and SCTP overhead on that machine, not Wi-Fi, LAN or internet performance, and says so on the page.
- The chunk planner is arithmetic on user inputs. Its default 28-byte overhead (SCTP common header plus one DATA chunk header, RFC 9260) leaves out DTLS, UDP and IP framing.
- No device testing was done for this review.
