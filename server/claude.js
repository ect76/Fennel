// The connection to Claude (no packages: Node's built-in fetch). The model provider is replaceable infrastructure:
// everything else talks to chat() and gets back plain content blocks, real usage, and the sources actually retrieved.
import { config, PRICES, SEARCH_PRICE } from './config.js';

// Today's spending (real calendar day, UTC). Shown on the Budget panel; never shown to Percy as a score.
export const usage = { day: '', calls: 0, searches: 0, fetches: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0, cost: 0, errors: 0, lastError: '', byPurpose: {}, costBy: {} };
function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (usage.day !== d) Object.assign(usage, { day: d, calls: 0, searches: 0, fetches: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0, cost: 0, byPurpose: {}, costBy: {} });
}

// Live limits from the Keeper → Budget panel (saved with the world). index.js hands us a getter.
let getBudget = () => ({});
export const setBudgetSource = fn => { getBudget = fn; };
export function budget() {
  const b = getBudget() || {};
  return {
    callsPerDay: Number.isFinite(b.callsPerDay) ? b.callsPerDay : config.maxCallsPerDay,
    searchesPerDay: Number.isFinite(b.searchesPerDay) ? b.searchesPerDay : config.maxSearchesPerDay,
    spendPerDay: Number.isFinite(b.spendPerDay) ? b.spendPerDay : config.maxSpendPerDay,
    paused: !!b.paused, quality: ['better', 'mixed'].includes(b.quality) ? b.quality : 'economy',
    sessionSteps: Number.isFinite(b.sessionSteps) ? b.sessionSteps : config.sessionSteps,
    betterPerDay: Number.isFinite(b.betterPerDay) ? b.betterPerDay : 8,
  };
}
export function modelFor(kind) {
  const q = budget().quality;
  if (kind === 'world') return config.modelWorld;
  if (q === 'better') return config.modelBetter;
  return kind === 'decide' ? config.modelDecide : config.modelWork;
}
export function canCall(reserve = 0) {
  rollDay(); const b = budget();
  if (!config.apiKey || b.paused) return false;
  if (usage.calls + reserve >= b.callsPerDay) return false;
  if (b.spendPerDay > 0 && usage.cost >= b.spendPerDay) return false;
  return true;
}
export function canSearch() { rollDay(); return config.webResearch && canCall() && usage.searches < budget().searchesPerDay; }
export function searchesLeft() { rollDay(); return Math.max(0, budget().searchesPerDay - usage.searches); }
export function callsLeft() { rollDay(); return Math.max(0, budget().callsPerDay - usage.calls); }
// How the day is going against the limits: 'plenty' | 'limited' | 'scarce' | 'none'. Used to pace, not to motivate.
export function pace() {
  rollDay(); const b = budget(); if (!canCall()) return 'none';
  const frac = (Date.now() % 86400000) / 86400000; // how much of the real day has gone
  const callShare = usage.calls / Math.max(1, b.callsPerDay), spendShare = b.spendPerDay > 0 ? usage.cost / b.spendPerDay : 0;
  const used = Math.max(callShare, spendShare);
  // he thinks freely until most of the day's allowance is gone; only then does he ration what is left
  if (used < 0.7 || used < frac + 0.2) return 'plenty';
  return used > 0.9 && used > frac + 0.3 ? 'scarce' : 'limited';
}
function costOf(model, u) {
  const [pi, po] = PRICES[model] || PRICES.default;
  const inp = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1;
  return (inp * pi + (u.output_tokens || 0) * po) / 1e6;
}
function account(model, purpose, u = {}) {
  usage.inTok += u.input_tokens || 0; usage.outTok += u.output_tokens || 0;
  usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0;
  const st = u.server_tool_use || {}, s = st.web_search_requests || 0, f = st.web_fetch_requests || 0;
  usage.searches += s; usage.fetches += f;
  const c = costOf(model, u) + s * SEARCH_PRICE; usage.cost += c;
  usage.byPurpose[purpose] = (usage.byPurpose[purpose] || 0) + 1;
  const key = purpose + (/sonnet|opus/i.test(model) ? ' (Sonnet)' : ''); usage.costBy = usage.costBy || {}; usage.costBy[key] = (usage.costBy[key] || 0) + c;
  return c;
}

// Server-side tools Claude runs itself. Results come back as content blocks we can check.
export function webTools({ searches = 0, fetches = 0 } = {}) {
  const t = [];
  if (searches > 0) t.push({ type: 'web_search_20250305', name: 'web_search', max_uses: searches });
  if (fetches > 0) t.push({ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: fetches, max_content_tokens: config.fetchTokens, citations: { enabled: false } });
  return t;
}
// What was actually searched and read in some content blocks (for provenance: a claim can only cite these)
export function retrieved(content) {
  const out = { searches: [], pages: [] };
  for (const b of content || []) {
    if (b.type === 'server_tool_use' && b.name === 'web_search') out.searches.push(String((b.input || {}).query || ''));
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) out.pages.push({ url: r.url, title: r.title || '', age: r.page_age || '', via: 'search result' });
    if (b.type === 'web_fetch_tool_result' && b.content && b.content.type === 'web_fetch_result') {
      const doc = b.content.content || {};
      out.pages.push({ url: b.content.url, title: doc.title || '', retrieved: b.content.retrieved_at || '', via: 'opened' });
    }
  }
  return out;
}

const noForce = new Set(); // models that refuse a forced tool_choice
let fetchBeta = false;     // set if the API says web fetch needs its beta header

// One request (following pause_turn continuations). Returns { content, stop, usage, cost }.
// cache: put cache breakpoints on the system prompt, the tools, and the newest message, so long sittings stay cheap.
export async function chat({ model, system, messages, tools = [], toolChoice = null, maxTokens = 1500, timeoutMs = 120000, purpose = 'other', cache = true, keeper = false }) {
  rollDay();
  // the keeper's own requests (making things) go ahead even when Percy's daily budget is used up; they still count
  if (!keeper && !canCall()) throw new Error(budget().paused ? 'paused by the keeper' : 'daily budget reached');
  const sys = typeof system === 'string' ? [{ type: 'text', text: system, ...(cache ? { cache_control: { type: 'ephemeral' } } : {}) }] : system;
  const tl = tools.map((t, i) => (cache && i === tools.length - 1 && !t.type ? { ...t, cache_control: { type: 'ephemeral' } } : t));
  let msgs = messages.map(m => ({ ...m }));
  if (cache && msgs.length) { // mark the newest user turn so the next turn of a sitting reads it from cache
    const last = msgs[msgs.length - 1];
    if (last.role === 'user') {
      const c = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content.map(x => ({ ...x }));
      const i = c.length - 1; if (i >= 0 && ['text', 'tool_result', 'image'].includes(c[i].type)) c[i] = { ...c[i], cache_control: { type: 'ephemeral' } };
      msgs[msgs.length - 1] = { ...last, content: c };
    }
  }
  let choice = toolChoice && !noForce.has(model) ? toolChoice : (toolChoice ? { type: 'auto' } : null);
  const all = []; let cost = 0, stop = '', u0 = {};
  for (let round = 0; round < 4; round++) {
    if (round > 0 && !canCall()) break;
    usage.calls++;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res, data;
    try {
      const headers = { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': config.apiVersion };
      if (fetchBeta) headers['anthropic-beta'] = 'web-fetch-2025-09-10';
      res = await fetch(config.apiBase + '/v1/messages', { method: 'POST', signal: ctl.signal, headers,
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: msgs, ...(tl.length ? { tools: tl } : {}), ...(choice ? { tool_choice: choice } : {}) }) });
      data = await res.json().catch(() => null);
    } catch (e) {
      usage.errors++; usage.lastError = e.name === 'AbortError' ? 'timed out' : String(e.message || e);
      throw new Error(usage.lastError);
    } finally { clearTimeout(timer); }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      if (choice && choice.type !== 'auto' && /tool_choice/i.test(msg)) { noForce.add(model); choice = { type: 'auto' }; round--; usage.calls--; continue; }
      if (!fetchBeta && /web_fetch|web-fetch|beta/i.test(msg) && tl.some(t => t.name === 'web_fetch')) { fetchBeta = true; round--; usage.calls--; continue; }
      usage.errors++; usage.lastError = msg; throw new Error(msg);
    }
    cost += account(model, purpose, data.usage); u0 = data.usage || {};
    all.push(...(data.content || [])); stop = data.stop_reason;
    if (stop !== 'pause_turn') break;
    msgs = [...msgs, { role: 'assistant', content: data.content }]; // let it carry on with its searching
  }
  return { content: all, stop, usage: u0, cost };
}

// A one-shot answer as data: Claude fills in a 'respond' tool (or, failing that, writes JSON we can parse).
export async function ask({ model, system, prompt, images = [], maxTokens = 1200, purpose = 'other', schema = null, timeoutMs, keeper = false }) {
  const content = images.length ? [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })), { type: 'text', text: prompt }] : prompt;
  const tool = { name: 'respond', description: 'Give your answer by calling this tool with the JSON the prompt asks for.', input_schema: schema || { type: 'object', additionalProperties: true } };
  const r = await chat({ model, system, messages: [{ role: 'user', content }], tools: [tool], toolChoice: { type: 'tool', name: 'respond' }, maxTokens, purpose, timeoutMs, keeper });
  const use = r.content.find(b => b.type === 'tool_use' && b.name === 'respond');
  if (use) return use.input;
  return parseJSON(r.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
}
// Plain text answer (for SVG drawings and the like)
export async function text({ model, system, prompt, maxTokens = 4000, purpose = 'other', timeoutMs }) {
  const r = await chat({ model, system, messages: [{ role: 'user', content: prompt }], maxTokens, purpose, timeoutMs });
  return r.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

// Lenient JSON reading for when a model writes JSON as text.
export function parseJSON(s) {
  if (!s) return null;
  let t = String(s).replace(/```(?:json)?/gi, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  for (const cand of [t, t.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(cand); } catch {} }
  return null;
}
export function status() {
  rollDay(); const b = budget();
  return { mode: !config.apiKey ? 'rules' : b.paused ? 'paused' : canCall() ? 'claude' : 'resting', calls: usage.calls, maxCalls: b.callsPerDay,
    searches: usage.searches, maxSearches: b.searchesPerDay, fetches: usage.fetches, cost: Math.round(usage.cost * 1000) / 1000, maxSpend: b.spendPerDay,
    quality: b.quality, errors: usage.errors, lastError: usage.lastError, pace: pace(), byPurpose: usage.byPurpose, costBy: usage.costBy || {} };
}
