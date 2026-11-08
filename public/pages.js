// The separate pages: Percy's requests (/requests), his research (/research) and his shop & orders (/shop).
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const PAGE = document.body.dataset.page;
async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function post(u, body) { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }
const days = n => n + ' day' + (n === 1 ? '' : 's');

let ST = null, rev = -1, busy = false, keeper = false;
async function refresh() { if (busy) return; busy = true; try { ST = await getJSON('/api/state'); rev = ST.rev; render(); } catch {} finally { busy = false; } }
function onLive(d) { $('#nowLine').textContent = 'Day ' + d.day + ' · ' + d.time + ' · ' + d.doing + ' · ' + d.coins + ' coins'; if (d.rev !== rev) refresh(); }
try { const es = new EventSource('/api/stream'); es.onmessage = e => { try { onLive(JSON.parse(e.data)); } catch {} }; } catch {}
let KEY = ''; try { KEY = localStorage.getItem('percy-keeper') || ''; } catch {}
if (KEY) post('/api/keeper/check', { key: KEY }).then(() => { keeper = true; render(); }).catch(() => {});

function render() {
  if (!ST) return;
  const sl = $('#siteLink'); sl.textContent = ''; if (ST.siteUrl) { sl.append('His website: '); const a = el('a', null, ST.siteUrl.replace(/^https:\/\//, '').replace(/\/$/, '')); a.href = ST.siteUrl; a.target = '_blank'; a.rel = 'noopener'; sl.append(a); }
  if (PAGE === 'requests') renderRequests(); else if (PAGE === 'research') renderResearch(); else renderShop();
}

/* ---------- requests ---------- */
const RSTATUS = { open: 'waiting', approved: 'approved', declined: 'declined', modified: 'approved with changes', fulfilled: 'done', withdrawn: 'withdrawn' };
function reqCard(r) {
  const d = el('div', 'wish' + (r.status === 'fulfilled' || r.status === 'approved' ? ' done' : r.status === 'declined' || r.status === 'withdrawn' ? ' gone' : ''));
  d.append(el('div', 'voice', r.what));
  const wait = ST.day - r.day;
  d.append(el('small', null, r.kind + ' · asked on day ' + r.day + (r.status === 'open' ? (wait > 0 ? ' · waiting ' + days(wait) : ' · asked today') : ' · ' + RSTATUS[r.status] + (r.updatedDay ? ' on day ' + r.updatedDay : '')) + ' · cares: ' + r.interest));
  for (const [k, v] of [['Why', r.why], ['What\'s missing', r.missing], ['He considered instead', r.alternatives], ['Depends on', r.dependencies], ['The keeper said', r.response]]) if (v) { const p = el('p', 'hint'); p.style.margin = '0'; p.append(el('b', null, k + ': '), document.createTextNode(v)); d.append(p); }
  for (const n of (r.notes || []).slice(-3)) d.append(el('small', null, 'Day ' + n.day + ': ' + n.text));
  if (keeper && r.status === 'open' && r.kind === 'object') { const a = el('a', 'btn small', 'Make this'); a.href = '/?make=' + encodeURIComponent(r.what) + '&request=' + r.id; a.style.justifySelf = 'start'; a.style.textDecoration = 'none'; d.append(a); }
  return d;
}
function renderRequests() {
  const all = (ST.requests || []).slice().reverse();
  const fill = (sel, wrap, items, empty) => { const box = $(sel); box.textContent = ''; if (wrap) $(wrap).hidden = !items.length; if (!items.length && empty) box.append(el('p', 'hint', empty)); for (const r of items) box.append(reqCard(r)); };
  fill('#reqOpen', null, all.filter(r => r.status === 'open'), 'Nothing right now. He asks when he finds something missing that he wants.');
  fill('#reqAnswered', '#reqAnsweredWrap', all.filter(r => !['open', 'withdrawn'].includes(r.status)));
  fill('#reqGone', '#reqGoneWrap', all.filter(r => r.status === 'withdrawn'));
  $('#keeperHint').hidden = !keeper;
}

/* ---------- research ---------- */
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const SUPPORT = { source: 'a page said so', inference: 'worked out', speculation: 'a guess' };
function link(url, text) { const a = el('a', null, text || url); a.href = url; a.target = '_blank'; a.rel = 'noopener nofollow'; return a; }
function renderResearch() {
  const q = ($('#resFilter').value || '').toLowerCase(), kind = $('#resKind').value;
  const logs = (ST.researchLog || []).slice().reverse();
  const allQ = logs.reduce((n, l) => n + l.queries.length, 0), allOpen = logs.reduce((n, l) => n + l.pages.filter(p => p.via === 'opened').length, 0);
  $('#resTotals').textContent = logs.filter(l => l.kind === 'research').length + ' investigations · ' + allQ + ' searches · ' + allOpen + ' pages opened';
  const box = $('#resList'); box.textContent = '';
  const shown = logs.filter(l => (!kind || l.kind === kind) && (!q || JSON.stringify([l.question, l.why, l.queries, l.summary, l.findings, l.leads]).toLowerCase().includes(q)));
  if (!shown.length) box.append(el('p', 'hint', logs.length ? 'Nothing matches.' : 'Nothing yet. He researches when he decides he wants to find something out.'));
  const byId = new Map(logs.map(l => [l.id, l]));
  for (const l of shown) {
    const c = el('article', 'card research'); c.id = l.id;
    c.append(el('h3', null, l.kind === 'code' ? 'While coding: ' + l.question.replace(/^while working on /, '') : l.question));
    const prev = l.continues && byId.get(l.continues);
    c.append(el('small', null, 'Day ' + l.day + ' · ' + l.time + (l.where ? ' · ' + l.where : '') + ' · ' + ({ searxng: 'his own search engine', browser: 'searching in his browser', claude: 'web search' }[l.via] || l.via || '') + ' · ' + l.status + (l.cost ? ' · about $' + Number(l.cost).toFixed(3) : '')));
    if (prev) { const p = el('p', 'hint'); p.append('Carries on from '); const a = el('a', null, '"' + prev.question + '" (day ' + prev.day + ')'); a.href = '#' + prev.id; p.append(a); c.append(p); }
    if (l.why) { const p = el('p'); p.append(el('b', null, 'Why: '), document.createTextNode(l.why)); c.append(p); }
    if (l.summary) c.append(el('p', 'voice', l.summary));
    if (l.queries.length) { c.append(el('h4', null, 'Searched for')); const ul = el('ul', 'queries'); for (const x of l.queries) ul.append(el('li', null, '"' + x + '"')); c.append(ul); }
    const opened = l.pages.filter(p => p.via === 'opened' || p.via === 'redirected');
    if (opened.length) { c.append(el('h4', null, 'Pages he opened')); const ol = el('ol', 'trail'); for (const p of opened) { const li = el('li'); li.append(link(p.url, p.title || host(p.url))); li.append(el('small', null, host(p.url) + (p.from ? ' · got there from ' + (/^https?:/.test(p.from) ? host(p.from) : p.from) : '') + (p.published ? ' · published ' + String(p.published).slice(0, 10) : ''))); ol.append(li); } c.append(ol); }
    const results = l.pages.filter(p => p.via === 'search result');
    if (results.length) { const d = el('details'); d.append(el('summary', null, results.length + ' search results he saw')); const ul = el('ul'); for (const p of results.slice(0, 40)) { const li = el('li'); li.append(link(p.url, p.title || host(p.url))); ul.append(li); } d.append(ul); c.append(d); }
    if ((l.findings || []).length) { c.append(el('h4', null, 'What he took away')); const ul = el('ul', 'findings'); for (const f of l.findings) { const li = el('li'); li.append(el('span', 'pill prov-' + (f.support === 'source' ? 'researched' : 'inferred'), SUPPORT[f.support] || f.support), document.createTextNode(' ' + f.claim + ' ')); if (f.url) li.append(link(f.url, '(' + host(f.url) + ')')); if (f.note) li.append(el('small', null, ' ' + f.note)); ul.append(li); } c.append(ul); }
    if ((l.leads || []).length) { c.append(el('h4', null, 'Leads he noted for later')); const ul = el('ul'); for (const x of l.leads) { const li = el('li', null, x.what + (x.why ? ' (' + x.why + ')' : '') + ' '); if (x.url) li.append(link(x.url, '(found on ' + host(x.url) + ')')); ul.append(li); } c.append(ul); }
    if (l.whyStopped) c.append(el('small', null, 'Stopped because: ' + l.whyStopped));
    box.append(c);
  }
  if (location.hash && !renderResearch.jumped) { renderResearch.jumped = true; const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
}
if (PAGE === 'research') { $('#resFilter').addEventListener('input', renderResearch); $('#resKind').addEventListener('change', renderResearch); }

/* ---------- shop & jobs ---------- */
let myJobs = new Map(); try { myJobs = new Map(JSON.parse(localStorage.getItem('percy-jobs') || '[]')); } catch {}
const STATUS = { posted: 'waiting at the post office', read: 'he is reading it', accepted: 'he said yes and is working on it', declined: 'he said no', done: 'finished', failed: 'he couldn\'t do it' };
const KINDNAME = { drawing: 'a drawing', page: 'something written', web: 'a web page' };
function renderShop() {
  const rate = ST.coinsPerPound || 10, pounds = c => '£' + (Math.max(1, c / rate)).toFixed(2).replace(/\.00$/, '');
  const items = (ST.shop || []).slice().reverse(), open = items.filter(x => !x.sold), sold = items.filter(x => x.sold).slice(0, 8);
  const how = $('#shopHow'); how.textContent = '';
  if (!open.length) how.append('Nothing for sale yet. Percy decides what to sell and sets the prices himself.');
  else if (ST.kofiUrl) how.append('To buy something, pay at least the price in pounds on Ko-fi and put its code (like PCY-7KQ2) in your message. The money turns into coins that reach him at the post office.');
  else how.append('His shop isn\'t taking money yet.');
  if (ST.shopUrl) { how.append(' '); const a = el('a', null, 'His own shop page →'); a.href = ST.shopUrl; a.target = '_blank'; a.rel = 'noopener'; how.append(a); }
  const g = $('#shopItems'); g.textContent = '';
  for (const x of open.concat(sold)) {
    const f = el('figure');
    if (x.kind === 'drawing') { const img = el('img'); img.src = '/media/drawings/' + x.ref + '.svg'; img.alt = x.title; img.loading = 'lazy'; f.append(img); }
    f.append(el('figcaption', null, x.title));
    if (x.blurb) f.append(el('small', null, x.blurb));
    f.append(el('small', null, x.sold ? 'sold on day ' + x.soldDay : x.price + ' coins · ' + pounds(x.price) + ' · code ' + x.code));
    if (!x.sold && ST.kofiUrl) { const a = el('a', 'btn small', 'Buy on Ko-fi'); a.href = ST.kofiUrl; a.target = '_blank'; a.rel = 'noopener'; a.style.textDecoration = 'none'; a.onclick = () => { try { navigator.clipboard.writeText(x.code).catch(() => {}); } catch {} }; a.title = 'Opens Ko-fi; the code ' + x.code + ' is copied for your message'; f.append(a); }
    g.append(f);
  }
  const jw = $('#jobs'); jw.textContent = ''; $('#jobsWrap').hidden = !(ST.commissions || []).length;
  for (const c of ST.commissions || []) {
    const d = el('div', 'note'); d.append(el('q', null, c.text));
    d.append(el('small', null, KINDNAME[c.kind] + ' · ' + c.offer + ' coins offered' + (c.paidReal ? ' + ' + c.paidReal + ' real' : '') + (c.from ? ' · from ' + c.from : '') + ' · day ' + c.day + ' · ' + (STATUS[c.status] || c.status) + (myJobs.has(c.id) ? ' · your order (code ' + c.code + ')' : '')));
    if (c.reply) d.append(el('div', 'voice', c.reply));
    if (c.result) {
      if (c.result.type === 'drawing') { const img = el('img'); img.src = c.result.url; img.alt = c.result.title; img.style.cssText = 'max-width:220px;border-radius:6px'; d.append(img); }
      else if (c.result.type === 'web') { const a = el('a', null, 'Open "' + c.result.title + '"'); a.href = c.result.url; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
      else { const a = el('a', null, 'Read "' + c.result.title + '" in his Pages'); a.href = '/'; d.append(a); }
    }
    jw.append(d);
  }
  $('#kofiCard').hidden = !ST.kofiUrl;
  if (ST.kofiUrl) { $('#kofiLink').href = ST.kofiUrl; $('#kofiHow').textContent = 'Anything you send on Ko-fi turns into coins (' + rate + ' for every pound) in an envelope at the post office, with your message. Put a code in your message to pay for something in his shop, or for your order.'; }
  const e = ST.earned || {}; $('#earned').textContent = 'Earned so far: ' + (e.stall || 0) + ' coins from the stall, ' + (e.work || 0) + ' from commissions, ' + (e.real || 0) + ' sent from outside.';
}
if (PAGE === 'shop') $('#jobForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#jobStatus');
  try { const r = await post('/api/commissions', { text: $('#jobText').value, kind: $('#jobKind').value, offer: $('#jobOffer').value, from: $('#jobFrom').value }); myJobs.set(r.id, r.code); try { localStorage.setItem('percy-jobs', JSON.stringify([...myJobs])); } catch {} $('#jobText').value = ''; st.textContent = 'Posted. He\'ll find it next time he goes to the post office.' + (ST && ST.kofiUrl ? ' Want to pay real money too? Put ' + r.code + ' in a Ko-fi message.' : ''); refresh(); }
  catch (err) { st.textContent = err.message; }
});
refresh();
