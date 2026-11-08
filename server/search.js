// Finding things on the web without paying per search: SearXNG (self-hosted) first, then his own browser (Bing),
// then, only if the keeper chooses it, Claude's paid web search tool (handled inside the sitting as a server tool).
import { config } from './config.js';
import * as B from './browser.js';
import { str } from './util.js';

export const local = { day: '', searches: 0, pages: 0, lastError: '' };
function roll() { const d = new Date().toISOString().slice(0, 10); if (local.day !== d) Object.assign(local, { day: d, searches: 0, pages: 0 }); }
// which way he searches: 'searxng' | 'browser' | 'claude' | 'none'
export function via(setting = 'auto') {
  if (setting === 'claude') return 'claude';
  if (setting === 'searxng' && config.searxngUrl) return 'searxng';
  if (setting === 'browser' && B.available()) return 'browser';
  if (config.searxngUrl) return 'searxng';
  if (B.available()) return 'browser';
  return 'claude';
}
export function canLocal() { roll(); return local.searches < config.maxLocalSearches; }
export async function search(q, how) {
  roll(); if (!canLocal()) throw new Error('no more searches today');
  q = str(q, 200); if (!q) throw new Error('empty search');
  local.searches++;
  try {
    if (how === 'searxng') {
      const u = config.searxngUrl.replace(/\/$/, '') + '/search?format=json&safesearch=1&q=' + encodeURIComponent(q);
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(u, { signal: ctl.signal, headers: { accept: 'application/json' } }).finally(() => clearTimeout(t));
      if (res.status === 403) throw new Error('SearXNG refused JSON: turn on the json format in its settings.yml');
      if (!res.ok) throw new Error('SearXNG answered ' + res.status);
      const j = await res.json();
      return (j.results || []).slice(0, 8).map(r => ({ title: str(r.title, 160), url: r.url, snippet: str(r.content, 300), source: (r.engines || [r.engine]).filter(Boolean).join(', '), date: r.publishedDate || '' }));
    }
    if (how === 'browser') return await B.searchBing(q);
    throw new Error('no free search available');
  } catch (e) { local.lastError = e.message; throw e; }
}
export async function open(url) { roll(); local.pages++; return B.read(url); }
