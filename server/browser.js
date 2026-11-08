// Percy's own headless browser (Chromium, driven over the DevTools protocol with Node's built-in WebSocket).
// Two uses: previewing his own pages (real console errors, exceptions, failed requests, a screenshot), and reading
// the web. Every request is checked: nothing on the local network is reachable, except his own preview pages.
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

let exists = null; // checked once: a missing browser means no previews or browser search, not errors
export const available = () => { if (exists === null) exists = !!config.chromiumPath && fs.existsSync(config.chromiumPath); return exists; };
let proc = null, ws = null, nextId = 0, pending = new Map(), listeners = new Set(), idleTimer = null, starting = null, ownPort = config.port;
export const setOwnPort = p => { ownPort = p; };

async function start() {
  if (ws && ws.readyState === 1) return;
  if (starting) return starting;
  starting = (async () => {
    const prof = path.join(config.dataDir, '.browser-profile'); fs.mkdirSync(prof, { recursive: true });
    const proxy = process.env.BROWSER_PROXY || '';
    const args = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--mute-audio', '--disable-extensions', '--disable-background-networking',
      '--remote-debugging-port=0', '--user-data-dir=' + prof, '--window-size=1000,750', ...(proxy ? ['--proxy-server=' + proxy, '--ignore-certificate-errors'] : []), 'about:blank'];
    proc = spawn(config.chromiumPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.on('exit', () => { proc = null; ws = null; });
    const url = await new Promise((res, rej) => { let b = ''; const t = setTimeout(() => rej(new Error('the browser did not start')), 20000); proc.stderr.on('data', d => { b += d; const m = b.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } }); proc.on('exit', () => rej(new Error('the browser exited'))); });
    ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not connect to the browser')); });
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } else for (const l of listeners) l(d); };
  })();
  try { await starting; } finally { starting = null; }
}
function call(method, params = {}, sessionId) { return new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' timed out')); } }, 30000); }); }
function keepAlive() { clearTimeout(idleTimer); idleTimer = setTimeout(stop, 120000); }
export function stop() { try { proc && proc.kill(); } catch {} proc = null; ws = null; }

// is this host somewhere on a private/local network? (checked again after DNS, so names can't sneak in)
function privateIP(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  if (net.isIPv6(ip)) { const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') && privateIP(x.slice(7)); }
  return true;
}
const dnsCache = new Map();
async function hostIsPublic(host) {
  host = host.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home)$/i.test(host)) return false;
  if (net.isIP(host)) return !privateIP(host);
  if (process.env.BROWSER_PROXY) return true; // testing only: behind a proxy the proxy resolves names (and can't reach a LAN)
  if (dnsCache.has(host)) return dnsCache.get(host);
  let ok = false; try { const addrs = await dns.lookup(host, { all: true }); ok = addrs.length > 0 && addrs.every(a => !privateIP(a.address)); } catch { ok = false; }
  dnsCache.set(host, ok); if (dnsCache.size > 500) dnsCache.clear(); return ok;
}
async function allowed(url) {
  let u; try { u = new URL(url); } catch { return false; }
  if (['data:', 'blob:', 'about:'].includes(u.protocol)) return true;
  if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && Number(u.port) === ownPort) return u.pathname.startsWith('/__preview/');
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  return hostIsPublic(u.hostname);
}

// open a page in a fresh tab, guard every request, collect what happened, then close the tab
async function withPage(url, fn, { width = 1000, height = 750, waitMs = 1200 } = {}) {
  if (!available()) throw new Error('no browser installed');
  await start(); keepAlive();
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const log = { console: [], errors: [], failed: [], blocked: [] };
  let loaded = false;
  const onEv = d => {
    if (d.sessionId !== sessionId) return;
    if (d.method === 'Fetch.requestPaused') {
      allowed(d.params.request.url).then(ok => ok ? call('Fetch.continueRequest', { requestId: d.params.requestId }, sessionId) : (log.blocked.push(d.params.request.url.slice(0, 200)), call('Fetch.failRequest', { requestId: d.params.requestId, errorReason: 'BlockedByClient' }, sessionId))).catch(() => {});
    }
    if (d.method === 'Runtime.consoleAPICalled') log.console.push((d.params.type + ': ' + d.params.args.map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ')).slice(0, 400));
    if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; log.errors.push(((x.exception && x.exception.description) || x.text || 'error').split('\n').slice(0, 3).join(' | ').slice(0, 500) + (x.lineNumber != null ? ' (line ' + (x.lineNumber + 1) + ')' : '')); }
    if (d.method === 'Network.loadingFailed' && !/BlockedByClient/.test(d.params.errorText)) log.failed.push(d.params.errorText);
    if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !/\/favicon\.ico(\?|$)/.test(d.params.response.url)) log.failed.push(d.params.response.status + ' ' + d.params.response.url.slice(0, 160));
    if (d.method === 'Page.loadEventFired') loaded = true;
  };
  listeners.add(onEv);
  try {
    await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
    await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable'].map(m => call(m, {}, sessionId)));
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await call('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' }, sessionId);
    if (!(await allowed(url))) throw new Error('that address is not reachable from here');
    await call('Page.navigate', { url }, sessionId);
    for (let i = 0; i < 40 && !loaded; i++) await new Promise(r => setTimeout(r, 250));
    await new Promise(r => setTimeout(r, waitMs));
    const evalJS = async expr => { const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId); return r.result ? r.result.value : null; };
    return await fn({ evalJS, call: (m, p) => call(m, p, sessionId), log, loaded });
  } finally {
    listeners.delete(onEv);
    call('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// Preview one of his own pages: what really happens when it runs
export async function preview(url) {
  return withPage(url, async ({ evalJS, call, log, loaded }) => {
    const info = await evalJS(`JSON.stringify({ title: document.title, text: (document.body ? document.body.innerText : '').replace(/\\s+\\n/g, '\\n').slice(0, 1500), elements: document.querySelectorAll('*').length, canvas: document.querySelectorAll('canvas').length })`);
    const shot = await call('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
    return { loaded, ...(JSON.parse(info || '{}')), console: log.console.slice(0, 30), errors: log.errors.slice(0, 20), failed: log.failed.slice(0, 15), blocked: log.blocked.slice(0, 10), screenshot: shot.data };
  }, { waitMs: 1500 });
}

// Read a web page: its text (main content first), title, final address, and a few links to follow
export async function read(url, maxChars = config.fetchTokens * 4) {
  return withPage(url, async ({ evalJS, log }) => {
    const out = await evalJS(`(() => { const pick = document.querySelector('main, article, [role=main], #content, #mw-content-text') || document.body; const clone = pick ? pick.cloneNode(true) : null; if (!clone) return JSON.stringify({ title: document.title, text: '' });
      clone.querySelectorAll('script, style, noscript, nav, footer, header, aside, form, svg, iframe').forEach(e => e.remove());
      const text = clone.innerText.replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n+/g, '\\n\\n').trim();
      const links = [...(pick || document).querySelectorAll('a[href]')].map(a => ({ t: a.innerText.trim().slice(0, 80), u: a.href })).filter(l => l.t && /^https?:/.test(l.u)).slice(0, 25);
      return JSON.stringify({ title: document.title, url: location.href, text: text.slice(0, ${Math.round(maxChars)}), truncated: text.length > ${Math.round(maxChars)}, links, published: (document.querySelector('meta[property="article:published_time"], time[datetime]') || {}).content || (document.querySelector('time[datetime]') || {}).dateTime || '' }); })()`);
    const r = JSON.parse(out || '{}'); r.blocked = log.blocked.slice(0, 5); return r;
  }, { waitMs: 900 });
}

// Search through the browser (Bing's results page) when there's no SearXNG
export async function searchBing(q) {
  return withPage('https://www.bing.com/search?q=' + encodeURIComponent(q), async ({ evalJS }) => {
    const out = await evalJS(`JSON.stringify([...document.querySelectorAll('li.b_algo')].slice(0, 8).map(li => { const a = li.querySelector('h2 a'); return a ? { title: (a.innerText || a.textContent || '').trim(), url: a.href, snippet: (li.querySelector('.b_caption p, p') || {}).innerText || '' } : null; }).filter(Boolean))`);
    const list = JSON.parse(out || '[]');
    if (!list.length) { // tell "no results" apart from a consent page or a bot check
      const info = JSON.parse(await evalJS(`JSON.stringify({ title: document.title, text: (document.body && document.body.innerText || '').slice(0, 600), none: !!document.querySelector('.b_no, #b_results .b_no'), url: location.href })`) || '{}');
      const why = /captcha|unusual traffic|verify|robot|challenge/i.test(info.text + info.title) ? 'a check for robots' : /consent|cookies|privacy|accept all/i.test(info.text) && !info.none ? 'a cookie consent page' : !info.none && !/no results/i.test(info.text) ? 'an unexpected page: "' + String(info.title || info.url).slice(0, 80) + '"' : '';
      if (why) return { list, blocked: why };
    }
    for (const r of list) { // Bing wraps links in a redirect; the real address is base64 in "u"
      try { const u = new URL(r.url); const enc = u.searchParams.get('u'); if (u.hostname.endsWith('bing.com') && enc && enc.startsWith('a1')) r.url = Buffer.from(enc.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch {}
    }
    return { list };
  }, { waitMs: 800 });
}
