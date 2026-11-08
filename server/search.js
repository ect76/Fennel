// Finding things on the web without paying per search: SearXNG (self-hosted) first, then his own browser (Bing),
// then, only if the keeper chooses it, Claude's paid web search tool (handled inside the sitting as a server tool).
import { config } from './config.js';
import * as B from './browser.js';
import { str } from './util.js';

export const local = { day: '', searches: 0, pages: 0, lastError: '' };
function roll() { const d = new Date().toISOString().slice(0, 10); if (local.day !== d) Object.assign(local, { day: d, searches: 0, pages: 0 }); }
// which way he searches: 'searxng' | 'browser' | 'claude' | 'none'
// "auto" prefers free search, and steps down when a method keeps failing: SearXNG, then his browser, then
// Claude's paid search (still capped by the keeper's paid-searches limit). A method is retried after 30 minutes.
const health = { searxng: { fails: 0, since: 0 }, browser: { fails: 0, since: 0 } };
const down = m => health[m].fails >= 2 && Date.now() - health[m].since < 30 * 60000;
const failed = m => { const h = health[m]; if (!h.fails) h.since = Date.now(); h.fails++; if (h.fails === 2) console.warn('[percy] ' + m + ' search is failing; falling back for 30 minutes'); };
const worked = m => { health[m].fails = 0; };
export function via(setting = 'auto') {
  if (setting === 'claude') return 'claude';
  if (setting === 'searxng' && config.searxngUrl) return 'searxng';
  if (setting === 'browser' && B.available()) return 'browser';
  if (config.searxngUrl && !down('searxng')) return 'searxng';
  if (B.available() && !down('browser')) return 'browser';
  return 'claude';
}
export const searchHealth = () => ({ searxng: config.searxngUrl ? (down('searxng') ? 'failing' : 'ok') : 'not set up', browser: B.available() ? (down('browser') ? 'failing' : 'ok') : 'not available' });
export function canLocal() { roll(); return local.searches < config.maxLocalSearches; }
export async function search(q, how) {
  roll(); if (!canLocal()) throw new Error('no more searches today');
  q = str(q, 200); if (!q) throw new Error('empty search');
  local.searches++;
  // try the chosen method; if it fails, fall back to the next free one within the same search
  const order = how === 'searxng' ? ['searxng', 'browser'] : how === 'browser' ? ['browser'] : [];
  if (!order.length) throw new Error('no free search available');
  let lastErr = null;
  for (const m of order) {
    if (m === 'browser' && !B.available()) continue;
    if (m !== how && down(m)) continue;
    try {
      let r;
      if (m === 'searxng') r = await searxng(q);
      else { const b = await B.searchBing(q); if (b.blocked) throw new Error('the search page did not show results (' + b.blocked + '); it may be blocking automated browsers'); r = b.list; }
      worked(m); if (m === how) local.lastError = ''; else local.lastError = how + ' failed (' + (lastErr && lastErr.message) + '), used ' + m + ' instead'; return r;
    } catch (e) { failed(m); lastErr = e; local.lastError = m + ': ' + e.message; }
  }
  throw lastErr || new Error('search failed');
}
// SearXNG: the JSON API when it's switched on, otherwise its ordinary results page (always available).
const HEADERS = { 'accept-language': 'en-GB,en;q=0.8', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Percy/1.0' };
let jsonRefused = false;
async function get(u, accept) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try { return await fetch(u, { signal: ctl.signal, headers: { ...HEADERS, accept } }); } finally { clearTimeout(t); }
}
async function searxng(q) {
  const base = config.searxngUrl.replace(/\/$/, '') + '/search?safesearch=1&q=' + encodeURIComponent(q);
  if (!jsonRefused) {
    const res = await get(base + '&format=json', 'application/json');
    if (res.ok) { const j = await res.json(); return (j.results || []).slice(0, 8).map(r => ({ title: str(r.title, 160), url: r.url, snippet: str(r.content, 300), source: (r.engines || [r.engine]).filter(Boolean).join(', '), date: r.publishedDate || '' })); }
    if (res.status !== 403) throw new Error('SearXNG answered ' + res.status);
    jsonRefused = true; // json isn't enabled in its settings.yml: read the normal results page instead
  }
  const res = await get(base, 'text/html');
  if (res.status === 429 || res.status === 403) throw new Error('SearXNG refused the search (' + res.status + '): its bot limiter may be on');
  if (!res.ok) throw new Error('SearXNG answered ' + res.status);
  return parseSearxHTML(await res.text());
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
const unhtml = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : m)).replace(/\s+/g, ' ').trim();
export function parseSearxHTML(html) {
  const out = [];
  for (const chunk of String(html).split(/<article\b[^>]*class="[^"]*\bresult\b/i).slice(1)) {
    const body = chunk.split(/<\/article>/i)[0];
    const h = body.match(/<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) || body.match(/<a[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!h) continue;
    const url = unhtml(h[1]); if (!/^https?:/i.test(url)) continue;
    const c = body.match(/<p[^>]*class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ title: str(unhtml(h[2]), 160), url, snippet: str(unhtml(c && c[1]), 300), source: 'searxng', date: '' });
    if (out.length >= 8) break;
  }
  return out;
}
export async function open(url) { roll(); local.pages++; return B.read(url); }
