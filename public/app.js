// The page around the 3D world: live updates from the server, Percy's panels, and the keeper's tools.
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const shorten = t => { t = String(t || ''); return t.length > 140 ? t.slice(0, 137).replace(/\s\S*$/, '') + '…' : t; };
const NEEDS = [['fullness', 'Fullness', '--c-full'], ['energy', 'Energy', '--c-energy'], ['wonder', 'Wonder', '--c-wonder'], ['joy', 'Joy', '--c-joy'], ['calm', 'Calm', '--c-calm']];
const WEATHER = { clear: 'clear', cloudy: 'cloudy', rain: 'raining', fog: 'foggy', wind: 'windy', snow: 'snowing' };
const LEAN = { post: 'the post office', job: 'commissions', shopfront: 'his shop', web: 'his website', sleep: 'sleep', nap: 'naps', eat: 'the bakery', fish: 'fishing', draw: 'drawing', write: 'writing', sell: 'the stall', read: 'the library', pond: 'the pond', stargaze: 'stargazing', shrine: 'the Humming Stone', fog: 'the fog', wander: 'wandering', explore: 'exploring', tidy: 'tidying', inspect: 'new things', visit: 'visiting places', buy: 'buying things', graffiti: 'graffiti' };
const KIND = { summary: 'end of day', thought: 'thought', reflection: 'reflection', learn: 'learned', note: 'a note', thing: 'something new', drawing: 'drawing', gone: 'gone', fog: 'the fog', dream: 'dream', page: 'page', found: 'somewhere new', graffiti: 'graffiti', window: 'shop window', bought: 'bought', stall: 'the stall', morning: 'waking up', inside: 'inside', post: 'the post', letters: 'letters', job: 'a commission', shop: 'his shop', event: '' };

let L = null, ST = null, lastRev = -1, lastLiveAt = 0, W = null;

/* ---------- 3D ---------- */
const stage = $('#stage');
try {
  const { createWorld } = await import('./world3d.js');
  W = createWorld({ canvas: $('#world'), stage, onTap });
} catch (e) {
  console.error(e); stage.append(el('div', 'nogl', 'The 3D view couldn\'t load in this browser, but Percy is still living. Follow him below.'));
}

/* ---------- data from the server ---------- */
async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function post(u, body) { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }
let fetching = false;
async function refreshState() { if (fetching) return; fetching = true; try { ST = await getJSON('/api/state'); lastRev = ST.rev; if (W) W.setState(ST); renderAll(); } catch (e) {} finally { fetching = false; } }
function onLive(d) { L = d; lastLiveAt = Date.now(); if (W) W.setLive(d); if (d.rev !== lastRev) refreshState(); renderHUD(); }
try { const es = new EventSource('/api/stream'); es.onmessage = e => { try { onLive(JSON.parse(e.data)); } catch {} }; } catch {}
setInterval(async () => { if (Date.now() - lastLiveAt > 5000) { try { onLive(await getJSON('/api/live')); } catch {} } }, 2500);

/* ---------- HUD, bubble, labels ---------- */
const meterEls = {};
for (const [k, label, c] of NEEDS) { const row = el('div', 'meter'); row.append(el('span', null, label)); const bar = el('div', 'bar'); const i = el('i'); i.style.background = 'var(' + c + ')'; bar.append(i); row.append(bar); const b = el('b'); row.append(b); $('#meters').append(row); meterEls[k] = { i, b }; }
function renderHUD() {
  if (!L) return;
  $('#clockDay').textContent = 'Day ' + L.day; $('#clockTime').textContent = L.time; $('#weatherWord').textContent = WEATHER[L.weather] || L.weather;
  $('#doing').textContent = L.doing; $('#mood').textContent = L.mood; $('#coins').textContent = L.coins;
  for (const [k] of NEEDS) { const v = Math.round(L.needs[k]); meterEls[k].i.style.width = v + '%'; meterEls[k].b.textContent = v; }
  $('#watching').textContent = L.watchers + (L.watchers === 1 ? ' visitor' : ' visitors') + ' watching'; $('#season').textContent = L.season;
  $('#thoughtNow').textContent = L.thought ? L.thought.text : '';
}
const bubble = $('#bubble'); let bubbleText = '';
// a little thought cloud showing how he feels
const ICONS = {
  sun: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="6.5" fill="#f5b72a"/><g stroke="#f5b72a" stroke-width="2.4" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8"/></g></svg>',
  smile: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#ffe08a"/><circle cx="12" cy="13" r="1.8" fill="#333"/><circle cx="20" cy="13" r="1.8" fill="#333"/><path d="M10.5 18.5q5.5 5 11 0" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  rain: '<svg viewBox="0 0 32 32"><path d="M9 18a6 6 0 0 1 1-11.9A7 7 0 0 1 23.5 8 5 5 0 0 1 23 18z" fill="#8c98a8"/><g stroke="#4a8fd1" stroke-width="2.2" stroke-linecap="round"><path d="M11 22l-1.5 4M17 22l-1.5 4M23 22l-1.5 4"/></g></svg>',
  cloud: '<svg viewBox="0 0 32 32"><path d="M9 23a6.5 6.5 0 0 1 1-12.9A7.5 7.5 0 0 1 24 12a5.5 5.5 0 0 1-.5 11z" fill="#a7b0bb"/></svg>',
  lonely: '<svg viewBox="0 0 32 32"><path d="M21 6a10 10 0 1 0 5 17A11 11 0 0 1 21 6z" fill="#7d8bb5"/><circle cx="9" cy="9" r="1.2" fill="#c7cde0"/><circle cx="25" cy="10" r="1" fill="#c7cde0"/></svg>',
  question: '<svg viewBox="0 0 32 32"><path d="M11 11a5 5 0 1 1 7.5 4.3c-1.6.9-2.5 2-2.5 3.7v1" stroke="#6f5aa6" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="25.5" r="2" fill="#6f5aa6"/></svg>',
  sparkle: '<svg viewBox="0 0 32 32"><path d="M16 3l3 10 10 3-10 3-3 10-3-10-10-3 10-3z" fill="#f0a830"/><path d="M26 3l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#e8607a"/></svg>',
  zzz: '<svg viewBox="0 0 32 32"><g fill="none" stroke="#5a6f8a" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><path d="M5 14h8l-8 9h8"/><path d="M17 7h6l-6 7h6"/><path d="M25 3h4l-4 4.5h4"/></g></svg>',
  fish: '<svg viewBox="0 0 32 32"><path d="M5 16c4-6 12-7 17-3l5-4v14l-5-4c-5 4-13 3-17-3z" fill="#4a8fd1"/><circle cx="11" cy="15" r="1.5" fill="#fff"/></svg>',
  scribble: '<svg viewBox="0 0 32 32"><path d="M4 18c3-8 5 8 8 0s5 8 8 0 5 8 8 0" stroke="#d1503f" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M8 8l4 3M24 8l-4 3" stroke="#d1503f" stroke-width="2.6" stroke-linecap="round"/></svg>',
  uneasy: '<svg viewBox="0 0 32 32"><g stroke="#c99a2e" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M5 10q3-3 6 0t6 0 6 0 5 0"/><path d="M5 17q3-3 6 0t6 0 6 0 5 0"/><path d="M5 24q3-3 6 0t6 0 6 0 5 0"/></g></svg>',
  flat: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#d7dbe0"/><circle cx="12" cy="13.5" r="1.8" fill="#555"/><circle cx="20" cy="13.5" r="1.8" fill="#555"/><path d="M11 20.5h10" stroke="#555" stroke-width="2" stroke-linecap="round"/></svg>',
};
const MOOD_ICON = { happy: 'sun', cheerful: 'sun', content: 'smile', sad: 'rain', low: 'cloud', flat: 'flat', lonely: 'lonely', curious: 'question', excited: 'sparkle', exhausted: 'zzz', sleepy: 'zzz', hungry: 'fish', frustrated: 'scribble', uneasy: 'uneasy', bored: 'flat', jittery: 'uneasy' };
const moodEl = $('#moodBubble'); let moodShown = '';
const labelPool = []; const labelsEl = $('#labels');
if (W) W.onFrame = () => {
  const a = W.percyAnchor(); const pos = W.project(a.x, a.y, a.z);
  let txt = L && L.thought ? L.thought.text : ''; if (L && L.deciding) txt = '…'; if (a.asleep && !(L && L.thought && L.thought.src === 'claude')) txt = 'zzz…';
  const mw = a.asleep ? 'sleepy' : (L && L.mood) || '';
  if (pos && mw) { if (mw !== moodShown) { moodShown = mw; $('#moodIcon').innerHTML = ICONS[MOOD_ICON[mw] || 'smile']; moodEl.setAttribute('aria-label', 'Percy is feeling ' + mw); moodEl.title = 'feeling ' + mw; } moodEl.style.opacity = '1'; moodEl.style.left = (pos.x + 22) + 'px'; moodEl.style.top = (pos.y + 48) + 'px'; } else moodEl.style.opacity = '0';
  if (pos && txt) { if (txt !== bubbleText) { bubbleText = txt; bubble.textContent = shorten(txt); } bubble.style.opacity = '1'; bubble.style.left = pos.x + 'px'; bubble.style.top = pos.y + 'px'; } else bubble.style.opacity = '0';
  // place names near the camera
  const t = W.cameraTarget(); const near = W.labels().map(l => ({ l, d: Math.hypot(l.x - t.x, l.z - t.z) })).filter(o => o.d < (W.mode === 'overview' ? 200 : 30)).sort((a, b) => a.d - b.d).slice(0, W.mode === 'overview' ? 14 : 8);
  while (labelPool.length < near.length) { const e = el('div', 'label'); labelsEl.append(e); labelPool.push(e); }
  labelPool.forEach((e, i) => { const o = near[i]; if (!o) { e.style.opacity = '0'; return; } const p = W.project(o.l.x, o.l.y, o.l.z); if (!p) { e.style.opacity = '0'; return; } e.textContent = o.l.known ? o.l.name : o.l.name + ' · Percy hasn\'t found this yet'; e.style.opacity = '1'; e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; });
};

/* ---------- view modes, zoom, full screen ---------- */
const coarse = matchMedia('(pointer: coarse)').matches;
function setMode(m) {
  if (W) { if (W.mode !== m) W.setMode(m); }
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'));
  stage.classList.toggle('explore', m === 'explore');
  $('#dpad').hidden = !(m === 'explore' && coarse);
  $('#exploreHint').hidden = !(m === 'explore' && !coarse);
  if (m === 'explore' && !coarse) setTimeout(() => { $('#exploreHint').hidden = true; }, 6000);
}
if (W) W.onMode = m => setMode(m);
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#zoomIn').onclick = () => W && W.zoomBy(0.8); $('#zoomOut').onclick = () => W && W.zoomBy(1.25);
document.querySelectorAll('#dpad button').forEach(b => {
  const k = b.dataset.k; const on = e => { e.preventDefault(); W && W.press(k, true); }, off = () => W && W.press(k, false);
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
$('#fullBtn').onclick = async () => {
  const isFull = document.fullscreenElement === stage || stage.classList.contains('full');
  if (isFull) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); stage.classList.remove('full'); document.body.style.overflow = ''; return; }
  if (stage.requestFullscreen) { try { await stage.requestFullscreen(); return; } catch {} }
  stage.classList.add('full'); document.body.style.overflow = 'hidden'; // iPhone: fill the window instead
};
document.addEventListener('fullscreenchange', () => { $('#fullBtn').textContent = document.fullscreenElement ? '✕' : '⛶'; });

/* ---------- panels ---------- */
function list(ul, items, fmt) { ul.textContent = ''; if (!items || !items.length) { ul.append(el('li', null, '—')); return; } for (const it of items) ul.append(fmt(it)); }
const tab = () => document.querySelector('.tabs [aria-selected=true]').dataset.tab;
let boughtByMe = new Set(); try { boughtByMe = new Set(JSON.parse(localStorage.getItem('percy-bought') || '[]')); } catch {}
function renderAll() {
  if (!ST) return;
  const m = ST.mind, ms = $('#mindStatus');
  ms.className = 'dot' + (m.mode === 'claude' ? '' : ' off'); ms.textContent = m.mode === 'claude' ? 'Thinking with Claude' : 'Simple rules (' + m.reason + ')';
  $('#keeperTab').hidden = !ST.keeper;
  const sl = $('#siteLink'); sl.textContent = ''; if (ST.siteUrl) { sl.append('His website: '); const a = el('a', null, ST.siteUrl.replace(/^https:\/\//, '').replace(/\/$/, '')); a.href = ST.siteUrl; a.target = '_blank'; a.rel = 'noopener'; sl.append(a); }
  if (ST.dayMood) {
    $('#todayLabel').textContent = ST.dayMood.label.charAt(0).toUpperCase() + ST.dayMood.label.slice(1);
    $('#todayWhy').textContent = ST.dayMood.causes && ST.dayMood.causes.length ? ST.dayMood.causes.join(' · ') : '';
    const em = $('#emos'); em.textContent = '';
    const EC = { loneliness: '#6f7fa6', curiosity: 'var(--c-wonder)', sadness: '#5a6f8a', contentment: 'var(--c-energy)', frustration: 'var(--danger)', anxiety: 'var(--c-full)', excitement: 'var(--c-joy)' };
    for (const k in ST.emotions || {}) { const r = el('div', 'emo'); r.append(el('span', null, k)); const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(ST.emotions[k]) + '%'; i.style.background = EC[k] || 'var(--accent)'; bar.append(i); r.append(bar); em.append(r); }
    $('#absorbed').textContent = ST.interests && ST.interests.length ? 'Absorbed by: ' + ST.interests.map(i => i.topic + ' (' + (i.depth || 'curious') + ')').join(', ') : '';
  }
  $('#selfDesc').textContent = ST.self.description;
  const tr = $('#traits'); tr.textContent = '';
  for (const l of ST.self.likes) tr.append(el('span', 'pill like', 'likes ' + l));
  for (const f of ST.self.fears) tr.append(el('span', 'pill fear', 'afraid of ' + f));
  if (ST.self.obsession) tr.append(el('span', 'pill obs', 'fixated on ' + ST.self.obsession));
  list($('#questions'), ST.questions, q => el('li', null, q));
  list($('#beliefs'), ST.beliefs, b => el('li', null, b));
  list($('#goals'), ST.goals, g => { const li = el('li', null, g.text); if (g.action) li.append(el('small', null, '→ ' + (LEAN[g.action] || g.action))); return li; });
  { const open = (ST.wishes || []).filter(w => !w.granted).length; $('#reqLink').textContent = 'His requests' + (open ? ' (' + open + ')' : ''); const forSale = (ST.shop || []).filter(x => !x.sold).length; $('#shopLink').textContent = 'His shop & jobs' + (forSale ? ' (' + forSale + ' for sale)' : ''); }
  list($('#inventory'), ST.inventory, i => { const li = el('li', null, i.name); li.append(el('small', null, 'bought day ' + i.day + ' for ' + i.price)); return li; });
  list($('#queue'), ST.researchQueue, q => el('li', null, q));
  const seek = [], avoid = []; for (const k in ST.leanings) (ST.leanings[k] > 0 ? seek : avoid).push(LEAN[k] || k);
  $('#leanings').textContent = (seek.length || avoid.length) ? [(seek.length ? 'Seeks out ' + seek.join(', ') + '.' : ''), (avoid.length ? 'Avoids ' + avoid.join(', ') + '.' : '')].filter(Boolean).join(' ') : 'None yet. His nightly reflections shape what he leans toward.';
  const kn = $('#knowledge'); kn.textContent = '';
  if (!ST.knowledge.length) kn.append(el('p', 'hint', 'Nothing yet. He learns at the library.'));
  for (const k of ST.knowledge.slice().reverse()) { const d = el('details', 'know'); d.append(el('summary', null, k.topic + ' · day ' + k.day), el('p', null, k.facts.map(f => '· ' + f).join('\n'))); if (k.sources && k.sources.length) d.append(sources(k.sources)); kn.append(d); }
  if (ST.notebook) { $('#notebookWrap').hidden = false; const nb = $('#notebook'); nb.textContent = ''; for (const e of ST.notebook.entries) nb.append(el('p', null, 'day ' + e.day + ' · ' + e.text)); }
  // diary
  const ol = $('#diary'); ol.textContent = '';
  for (const e of ST.diary.slice().reverse()) {
    const li = el('li', 'entry' + (['reflection', 'note', 'thing', 'found', 'graffiti', 'bought', 'stall', 'morning', 'inside', 'post', 'letters', 'job', 'shop'].includes(e.kind) ? ' big' : ''));
    li.append(el('div', 'when', 'Day ' + e.day + ' · ' + e.time + (KIND[e.kind] ? ' · ' + KIND[e.kind] : '')), el('div', 'txt', e.text));
    if (e.mood) li.firstChild.textContent += ' · ' + e.mood;
    if (e.drawing) { const img = el('img'); img.src = '/media/drawings/' + e.drawing + '.svg'; img.alt = 'the drawing'; img.loading = 'lazy'; li.append(img); }
    if (e.sources && e.sources.length) li.append(sources(e.sources));
    ol.append(li);
  }
  // drawings
  const g = $('#gallery'); g.textContent = '';
  if (!ST.drawings.length) g.append(el('p', 'hint', 'No drawings yet.'));
  for (const dr of ST.drawings.slice().reverse()) {
    const f = el('figure'); const img = el('img'); img.src = '/media/drawings/' + dr.id + '.svg'; img.alt = 'Percy\'s drawing: ' + dr.title; img.loading = 'lazy'; f.append(img, el('figcaption', null, dr.title));
    const mine = boughtByMe.has(dr.id);
    f.append(el('small', null, 'Day ' + dr.day + ' · ' + (mine ? 'you took this one' : dr.sold ? 'taken from the stall' : dr.onStall ? 'on his stall, ' + (dr.price || 3) + ' coins' : 'at his cottage')));
    const row = el('div', 'row');
    if (dr.onStall && !dr.sold) { const b = el('button', 'btn small', 'Take it'); b.type = 'button'; b.onclick = () => take(dr, b); row.append(b); }
    if (dr.commission && dr.forWho) f.lastChild.textContent = 'Day ' + dr.day + ' · made for ' + dr.forWho;
    if (mine) { const a = el('a', null, 'Open'); a.href = '/media/drawings/' + dr.id + '.svg'; a.target = '_blank'; a.rel = 'noopener'; row.append(a); }
    if (ST.printShopUrl) { const a = el('a', null, 'Buy a real print'); a.href = ST.printShopUrl; a.target = '_blank'; a.rel = 'noopener'; row.append(a); }
    if (row.childNodes.length) f.append(row);
    g.append(f);
  }
  // pages
  const pg = $('#pages'); pg.textContent = '';
  if ((ST.webPages || []).length) {
    const box = el('div', 'card'); box.append(el('h2', null, 'Web pages he made'));
    const ul = el('ul', 'plain');
    for (const w of ST.webPages.slice().reverse()) { const li = el('li'); if (ST.siteUrl) { const a = el('a', null, w.title); a.href = ST.siteUrl + 'made/' + w.slug + '.html'; a.target = '_blank'; a.rel = 'noopener'; li.append(a); } else li.append(w.title); li.append(el('small', null, 'day ' + w.day)); ul.append(li); }
    box.append(ul); pg.append(box);
  }
  if (!ST.pages.length && !(ST.webPages || []).length) pg.append(el('p', 'hint', 'He hasn\'t written any pages yet.'));
  for (const p of ST.pages.slice().reverse()) { const a = el('article', 'page'); a.append(el('h3', null, p.title), el('small', null, 'Day ' + p.day + (p.forWho ? ' · written for ' + p.forWho : '')), el('div', 'txt', p.body)); pg.append(a); }
  // notes
  const pn = $('#percyNotes'); pn.textContent = ''; $('#percyNotesWrap').hidden = !(ST.percyNotes || []).length;
  for (const n of (ST.percyNotes || []).slice().reverse()) { const d = el('div', 'note'); d.append(el('div', 'voice', n.text)); d.append(el('small', null, 'left on day ' + n.day + (n.to ? ' for ' + n.to : '') + (n.inReplyTo ? ' · in reply to "' + n.inReplyTo + '"' : ''))); pn.append(d); }
  const nw = $('#notes'); nw.textContent = '';
  for (const n of ST.notes) { const d = el('div', 'note'); d.append(el('q', null, n.text)); d.append(el('small', null, (n.from ? 'from ' + n.from + ' · ' : '') + 'left day ' + n.day + (n.read ? ' · he found it on day ' + n.readDay : ' · still under the stone'))); if (n.reaction) d.append(el('div', 'voice', n.reaction)); nw.append(d); }
  renderKeeper();
}
function sources(list) { const s = el('div', 'srcs'); for (const src of list) { const a = el('a', null, src.title || src.url); a.href = src.url; a.target = '_blank'; a.rel = 'noopener'; s.append(a); } return s; }
async function take(dr, btn) {
  btn.disabled = true;
  try { await post('/api/buy', { id: dr.id }); boughtByMe.add(dr.id); try { localStorage.setItem('percy-bought', JSON.stringify([...boughtByMe])); } catch {} refreshState(); }
  catch (e) { btn.disabled = false; btn.textContent = e.message; }
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
  for (const t of ['mind', 'diary', 'drawings', 'pages', 'stone', 'keeper']) $('#p-' + t).hidden = t !== b.dataset.tab;
}));
if (location.hash === '#work' || location.hash === '#shop') location.replace('/shop'); // old links to the shop tab
{ const h = { '#drawings': 'drawings', '#stone': 'stone', '#keeper': 'keeper' }[location.hash]; if (h) document.querySelector('[data-tab=' + h + ']').click(); }

const STATUS = { posted: 'waiting at the post office', read: 'he is reading it', accepted: 'he said yes and is working on it', declined: 'he said no', done: 'finished', failed: 'he couldn\'t do it' };

/* ---------- notes ---------- */
$('#noteForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#noteStatus');
  try { await post('/api/notes', { text: $('#noteText').value, from: $('#noteFrom').value }); $('#noteText').value = ''; st.textContent = 'Left under the stone. He\'ll find it next time he visits.'; refreshState(); }
  catch (err) { st.textContent = err.message; }
});

/* ---------- keeper ---------- */
let KEY = ''; try { KEY = localStorage.getItem('percy-keeper') || ''; } catch {}
async function unlock(k, quiet) {
  try { await post('/api/keeper/check', { key: k }); KEY = k; try { localStorage.setItem('percy-keeper', k); } catch {} $('#keeperTools').hidden = false; $('#keyForm').hidden = true; }
  catch (err) { if (!quiet) $('#keyStatus').textContent = err.message; }
}
$('#keyForm').addEventListener('submit', e => { e.preventDefault(); unlock($('#keeperKey').value.trim()); });
if (KEY) unlock(KEY, true);
const kpost = (what, body) => post('/api/keeper/' + what, { key: KEY, ...body });

// pictures are shrunk before upload
function readImage(file, max = 1024, type = 'image/jpeg') {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); resolve(c.toDataURL(type, 0.86)); };
    img.onerror = () => reject(new Error('That picture couldn\'t be read.')); img.src = URL.createObjectURL(file);
  });
}

// tap-to-place
let placing = null, makeWish = '';
// "Make this" on the requests page comes here with the request filled in
{ const want = new URLSearchParams(location.search).get('make'); if (want) { $('#makeDesc').value = want.slice(0, 200); makeWish = want.slice(0, 200); history.replaceState(null, '', location.pathname); document.querySelector('[data-tab=keeper]').click(); setTimeout(() => $('#makeForm').scrollIntoView({ behavior: 'smooth', block: 'center' }), 400); } }
function startPlacing(kind, payload, text) { placing = { kind, payload }; stage.classList.add('placing'); $('#bannerText').textContent = text; $('#banner').hidden = false; if (W && kind !== 'graffiti') setMode('overview'); stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function endPlacing() { placing = null; stage.classList.remove('placing'); $('#banner').hidden = true; }
$('#cancelPlace').onclick = endPlacing;
async function onTap(e, api) {
  if (!placing) return;
  const p = placing;
  try {
    if (p.kind === 'graffiti') {
      const w = api.tapWall(e); if (!w) { $('#bannerText').textContent = 'Tap the side of a building.'; return; }
      const size = Number(p.payload.size) || 2.2;
      await kpost('graffiti', { image: p.payload.image, x: w.x, y: Math.max(size / 2 + 0.2, w.y), z: w.z, nx: w.nx, nz: w.nz, w: size, h: size / p.payload.aspect });
      endPlacing(); $('#graffitiStatus').textContent = 'Painted. He\'ll notice it when he walks past.'; clearPad(); refreshState(); return;
    }
    const g = api.tapGround(e); if (!g) return;
    if (p.kind === 'make') { await kpost('make', { ...p.payload, x: g.x, z: g.z }); endPlacing(); $('#makeStatus').textContent = 'Claude is building it. It\'ll appear in a minute or so.'; $('#makeDesc').value = ''; $('#makeImg').value = ''; }
    if (p.kind === 'build') { await kpost('build', { ...p.payload, x: g.x, z: g.z }); endPlacing(); $('#buildStatus').textContent = 'Built. He hasn\'t found it yet.'; $('#buildName').value = ''; $('#buildDesc').value = ''; }
    refreshState();
  } catch (err) { $('#bannerText').textContent = err.message; }
}
$('#makeForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#makeStatus');
  try {
    const description = $('#makeDesc').value.trim(); const image = await readImage($('#makeImg').files[0]);
    if (!description && !image) { st.textContent = 'Describe it or add a picture.'; return; }
    startPlacing('make', { description, image, size: $('#makeSize').value, wish: description === makeWish ? makeWish : '' }, 'Tap where it should go');
  } catch (err) { st.textContent = err.message; }
});
$('#buildForm').addEventListener('submit', e => { e.preventDefault(); startPlacing('build', { kind: $('#buildKind').value, name: $('#buildName').value.trim(), desc: $('#buildDesc').value.trim() }, 'Tap an empty spot beside a road'); });
$('#growBtn').onclick = async () => { try { const r = await kpost('grow', {}); $('#buildStatus').textContent = 'The fog pulled back along ' + (r.road || 'a road') + '.'; refreshState(); } catch (err) { $('#buildStatus').textContent = err.message; } };
$('#giveForm').addEventListener('submit', async e => { e.preventDefault(); const st = $('#giveStatus'); try { await kpost('give', { coins: $('#giveCoins').value, from: $('#giveFrom').value, message: $('#giveMsg').value }); $('#giveMsg').value = ''; st.textContent = 'An envelope is waiting at the post office.'; refreshState(); } catch (err) { st.textContent = err.message; } });
$('#bookForm').addEventListener('submit', async e => { e.preventDefault(); const st = $('#bookStatus'); try { await kpost('book', { topic: $('#bookTopic').value, text: $('#bookText').value }); $('#bookTopic').value = ''; $('#bookText').value = ''; st.textContent = 'On the shelf.'; refreshState(); } catch (err) { st.textContent = err.message; } });
$('#stockForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#stockStatus');
  try { const image = await readImage($('#stockImg').files[0], 768); await kpost('stock', { shop: $('#stockShop').value, name: $('#stockName').value.trim(), price: $('#stockPrice').value, desc: $('#stockDesc').value.trim(), image }); st.textContent = 'In the window. A little 3D version will appear outside the shop.'; $('#stockName').value = ''; $('#stockDesc').value = ''; $('#stockImg').value = ''; refreshState(); }
  catch (err) { st.textContent = err.message; }
});

// graffiti drawing pad
const pad = $('#pad'), pctx = pad.getContext('2d'); let padColor = '#e2384d', padDirty = false, drawing = null;
const PAINT = ['#e2384d', '#2a9df4', '#f5c518', '#2fbf71', '#a259ff', '#ff7a1a', '#111111', '#ffffff'];
for (const c of PAINT) { const b = el('button'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Paint colour ' + c); b.setAttribute('aria-pressed', c === padColor ? 'true' : 'false'); b.onclick = () => { padColor = c; document.querySelectorAll('#swatches button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); }; $('#swatches').append(b); }
function clearPad() { pctx.clearRect(0, 0, pad.width, pad.height); padDirty = false; }
$('#padClear').onclick = clearPad;
const padPt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * pad.width, (e.clientY - r.top) / r.height * pad.height]; };
pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); drawing = padPt(e); pctx.fillStyle = padColor; pctx.beginPath(); pctx.arc(drawing[0], drawing[1], 9, 0, 7); pctx.fill(); padDirty = true; });
pad.addEventListener('pointermove', e => { if (!drawing) return; const p = padPt(e); pctx.strokeStyle = padColor; pctx.lineWidth = 18; pctx.lineCap = 'round'; pctx.lineJoin = 'round'; pctx.shadowColor = padColor; pctx.shadowBlur = 6; pctx.beginPath(); pctx.moveTo(drawing[0], drawing[1]); pctx.lineTo(p[0], p[1]); pctx.stroke(); pctx.shadowBlur = 0; drawing = p; });
pad.addEventListener('pointerup', () => { drawing = null; }); pad.addEventListener('pointercancel', () => { drawing = null; });
$('#graffitiForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#graffitiStatus');
  try {
    let image, aspect = 2;
    const file = $('#graffitiImg').files[0];
    if (file) { image = await readImage(file, 900, 'image/png'); const im = new Image(); await new Promise(r => { im.onload = r; im.src = image; }); aspect = im.width / im.height; }
    else if (padDirty) { image = pad.toDataURL('image/png'); aspect = pad.width / pad.height; }
    else { st.textContent = 'Draw something first, or pick a picture.'; return; }
    startPlacing('graffiti', { image, aspect, size: $('#graffitiSize').value }, 'Tap a wall to paint on');
  } catch (err) { st.textContent = err.message; }
});

function renderKeeper() {
  if (!ST || $('#keeperTools').hidden) return;
  const shops = ST.town.places.filter(p => ['shop', 'bakery', 'cafe', 'market', 'post', 'workshop', 'museum'].includes(p.type));
  const sel = $('#stockShop'), cur = sel.value; sel.textContent = ''; for (const p of shops) { const o = el('option', null, p.name); o.value = p.id; sel.append(o); } if (cur) sel.value = cur;
  const rm = (what, id) => async () => { try { await kpost(what, { id }); refreshState(); } catch {} };
  const row = (title, sub, what, id) => { const li = el('li'); const d = el('div'); d.append(el('b', null, title), el('small', null, sub)); li.append(d); if (what) { const b = el('button', 'btn small', 'Remove'); b.type = 'button'; b.onclick = rm(what, id); li.append(b); } return li; };
  list($('#kThings'), ST.things, t => row(t.name, (t.status === 'building' ? 'being built… · ' : t.status === 'failed' ? 'couldn\'t be built, so it\'s a crate · ' : '') + (t.seen ? 'he\'s looked at it ' + t.inspections + '×' : t.noticed ? 'he\'s noticed it' : 'not noticed yet'), 'remove-thing', t.id));
  list($('#kBuildings'), ST.town.places.filter(p => p.type !== 'home').sort((a, b) => a.name.localeCompare(b.name)), p => {
    const li = row(p.name, (p.builtBy === 'keeper' ? 'you built it' : p.builtBy === 'growth' ? 'came out of the fog' : 'part of the old town') + ' · ' + (p.known ? 'he knows it' : 'not found yet'));
    const b = el('button', 'btn small', 'Remove'); b.type = 'button';
    b.onclick = async () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Really remove?'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Remove'; }, 4000); return; } b.disabled = true; try { await kpost('remove-building', { id: p.id }); refreshState(); } catch (err) { b.textContent = err.message; } };
    li.append(b); return li;
  });
  list($('#kGraffiti'), ST.graffiti, g => row(g.by === 'percy' ? 'Percy\'s own' : 'yours', (g.where || '') + ' · day ' + g.day + (g.by !== 'percy' ? (g.seen ? ' · he\'s seen it' : ' · not seen yet') : ''), 'remove-graffiti', g.id));
  list($('#kItems'), ST.items, i => row(i.name + ' · ' + i.price + ' coins', ((ST.town.places.find(p => p.id === i.shop) || {}).name || '') + ' · ' + (i.sold ? 'he bought it' : i.seen ? 'he\'s seen it' : 'not seen yet'), i.sold ? null : 'remove-item', i.id));
  const openShop = (ST.shop || []).filter(x => !x.sold); $('#kShopWrap').hidden = !openShop.length;
  list($('#kShop'), openShop, x => { const li = row(x.title + ' · ' + x.price + ' coins', x.code + ' · listed day ' + x.day); const b = el('button', 'btn small', 'Record a sale'); b.type = 'button'; b.onclick = async () => { try { await kpost('record-sale', { id: x.id }); refreshState(); } catch {} }; li.append(b); return li; });
  $('#kJobsWrap').hidden = !(ST.commissions || []).length;
  list($('#kJobs'), ST.commissions || [], c => row(c.text, (c.from || 'unsigned') + ' · ' + (STATUS[c.status] || c.status), 'remove-commission', c.id));
  $('#kofiState').textContent = ST.kofiOn ? 'Ko-fi is connected: payments arrive automatically.' : 'Ko-fi isn\'t connected yet (see the README: KOFI_URL and KOFI_TOKEN).';
  list($('#kNotes'), ST.notes, n => row(n.text, (n.from || 'unsigned') + (n.read ? ' · read' : ' · unread'), 'remove-note', n.id));
  $('#kPrintsWrap').hidden = !ST.printShopUrl;
  if (ST.printShopUrl) list($('#kPrints'), ST.drawings.slice(-12).reverse(), d => { const li = row(d.title, 'Day ' + d.day + (d.prints ? ' · ' + d.prints + ' print' + (d.prints > 1 ? 's' : '') + ' sold' : '')); const b = el('button', 'btn small', 'Record a sale'); b.type = 'button'; b.onclick = async () => { try { await kpost('print-sold', { id: d.id }); refreshState(); } catch {} }; li.append(b); return li; });
}

refreshState();
