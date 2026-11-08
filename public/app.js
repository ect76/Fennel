// The page around the 3D world: live updates from the server, Percy's panels, and the keeper's tools.
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const shorten = t => { t = String(t || ''); return t.length > 140 ? t.slice(0, 137).replace(/\s\S*$/, '') + '…' : t; };
const NEEDS = [['fullness', 'Fullness', '--c-full'], ['energy', 'Energy', '--c-energy']];
const WEATHER = { clear: 'clear', cloudy: 'cloudy', rain: 'raining', fog: 'foggy', wind: 'windy', snow: 'snowing' };
const KIND = { wake: 'waking', go: 'walking', enter: 'went in', look: 'looked', take: 'took', read: 'read', eat: 'ate', fish: 'fished', nap: 'napped', rest: 'rested', wait: 'waited', think: 'thought', research: 'research', code: 'coding', write: 'writing', draw: 'drawing', paint_wall: 'painted a wall', buy: 'bought', check_post: 'the post', stall: 'the stall', leave_note: 'left a note', answer_order: 'an order', deliver_order: 'an order', list_for_sale: 'his shop', unlist: 'his shop', request: 'a request', withdraw_request: 'a request', update_request: 'a request', propose: 'an idea' };
const PROV = { perceived: 'saw it', researched: 'read it', told: 'was told', inferred: 'worked it out', imagined: 'imagined', initial: 'always knew', experienced: 'lived it' };

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
  $('#doing').textContent = L.doing; $('#coins').textContent = L.coins;
  const f = recentFeeling(); $('#feelWrap').hidden = !f; if (f) $('#mood').textContent = f.word;
  for (const [k] of NEEDS) { const v = Math.round(L.body[k]); meterEls[k].i.style.width = v + '%'; meterEls[k].b.textContent = v; }
  $('#watching').textContent = L.watchers + (L.watchers === 1 ? ' visitor' : ' visitors') + ' watching'; $('#season').textContent = L.season;
  $('#doingNow').textContent = L.doing.charAt(0).toUpperCase() + L.doing.slice(1) + '.';
  $('#thoughtNow').textContent = recentThought();
  const fn = $('#feelNow'); fn.textContent = '';
  if (L.feeling && L.feeling.word) { const ago = Math.max(0, Math.round(L.t - (L.feeling.t || L.t))); fn.append('Last said he felt '); fn.append(el('b', null, L.feeling.word)); fn.append(el('span', 'hint', ' · ' + (ago < 2 ? 'just now' : ago < 60 ? ago + ' minutes ago' : Math.round(ago / 60) + ' hour' + (Math.round(ago / 60) === 1 ? '' : 's') + ' ago') + ' (town time)')); }
}
// his own words and feelings fade from the bubble after a while (they're moments, not a permanent state)
const recentThought = () => L && L.thought && L.thought.text && (L.t - (L.thought.t || 0)) < 180 ? L.thought.text : '';
const recentFeeling = () => L && L.feeling && L.feeling.word && (L.t - (L.feeling.t || 0)) < 360 ? L.feeling : null;
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
function moodIcon(asleep) {
  if (asleep) return 'zzz';
  if (L.body.fullness < 22) return 'fish'; if (L.body.energy < 20) return 'zzz';
  if (L.deciding) return 'question';
  const f = recentFeeling(); if (!f) return '';
  const v = Number(f.valence) || 0; return v > 0.45 ? 'sun' : v > 0.12 ? 'smile' : v < -0.45 ? 'rain' : v < -0.12 ? 'cloud' : 'flat';
}
const moodEl = $('#moodBubble'); let moodShown = '';
const labelPool = []; const labelsEl = $('#labels');
if (W) W.onFrame = () => {
  const a = W.percyAnchor(); const pos = W.project(a.x, a.y, a.z);
  let txt = L ? recentThought() : ''; if (L && L.deciding) txt = '…'; if (a.asleep) txt = '';
  const icon = L ? moodIcon(a.asleep) : '', f = L && recentFeeling();
  if (pos && icon) { if (icon !== moodShown) { moodShown = icon; $('#moodIcon').innerHTML = ICONS[icon]; } const w = icon === 'zzz' ? 'asleep or exhausted' : icon === 'fish' ? 'hungry' : icon === 'question' ? 'thinking' : (f ? 'feeling ' + f.word : ''); moodEl.setAttribute('aria-label', 'Percy: ' + w); moodEl.title = w; moodEl.style.opacity = '1'; moodEl.style.left = (pos.x + 22) + 'px'; moodEl.style.top = (pos.y + 48) + 'px'; } else moodEl.style.opacity = '0';
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
  const st = ST.mindStatus, ms = $('#mindStatus');
  ms.className = 'dot' + (st.mode === 'claude' ? '' : ' off');
  ms.textContent = { claude: 'Thinking with Claude', paused: 'Thinking paused by the keeper', resting: 'Out of thinking budget for today', rules: 'No Claude connected' }[st.mode] || st.mode;
  $('#keeperTab').hidden = !ST.keeper;
  const sl = $('#siteLink'); sl.textContent = ''; if (ST.siteUrl) { sl.append('His website: '); const a = el('a', null, ST.siteUrl.replace(/^https:\/\//, '').replace(/\/$/, '')); a.href = ST.siteUrl; a.target = '_blank'; a.rel = 'noopener'; sl.append(a); }
  const openReq = ST.requests.filter(r => r.status === 'open').length; $('#reqLink').textContent = 'His requests' + (openReq ? ' (' + openReq + ')' : '');
  const sittings = ST.researchLog.filter(r => r.kind === 'research').length; $('#resLink').textContent = 'His research' + (sittings ? ' (' + sittings + ')' : '');
  const forSale = (ST.shop || []).filter(x => !x.sold).length; $('#shopLink').textContent = 'His shop & orders' + (forSale ? ' (' + forSale + ' for sale)' : '');
  const m = ST.mind;
  // his feelings, as he expressed them (a record for watchers; it never goes back to him)
  const fs = ST.feelings || [], fw = $('#feelings'); $('#feelWrap2').hidden = !fs.length; fw.textContent = '';
  const fcol = v => v < -0.15 ? 'hsl(215 65% ' + (60 - Math.abs(v) * 10) + '%)' : v > 0.15 ? 'hsl(38 85% ' + (58 - v * 8) + '%)' : 'hsl(150 6% 60%)';
  let lastDay = null;
  for (const f of fs.slice(-40)) {
    if (f.day !== lastDay) { lastDay = f.day; fw.append(el('div', 'day', 'Day ' + f.day)); }
    const c = el('span', 'chip'); c.style.setProperty('--fc', fcol(Number(f.valence) || 0)); c.append(el('b', null, f.word), el('small', null, f.time + (f.doing ? ' · ' + f.doing : ''))); c.title = 'day ' + f.day + ', ' + f.time; fw.append(c);
  }
  // a plain observation of what he has been choosing lately (not shown to him)
  const recent = ST.life.filter(e => ST.day - e.day <= 2 && KIND[e.kind]).map(e => KIND[e.kind]); const counts = {}; for (const k of recent) counts[k] = (counts[k] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $('#pattern').textContent = top.length ? 'Lately he has mostly: ' + top.map(([k, n]) => k + ' (' + n + ')').join(', ') + '.' : '';
  list($('#intentions'), m.intentions.filter(i => i.status === 'active' || i.status === 'paused').concat(m.intentions.filter(i => i.status !== 'active' && i.status !== 'paused').slice(-5).reverse()), i => {
    const li = el('li', null, i.text); if (i.status === 'done' || i.status === 'abandoned') li.style.opacity = '.6';
    li.append(el('small', null, ({ active: '', paused: 'paused · ', done: 'done · ', abandoned: 'dropped · ' })[i.status] + ({ now: 'right now', today: 'today', days: 'over a few days', long: 'long term' })[i.horizon] + ' · since day ' + i.day + (i.why ? ' · because ' + i.why : ''))); return li; });
  list($('#questions'), m.questions.filter(q => q.status === 'open').slice().reverse(), q => { const li = el('li', null, q.text); li.append(el('small', null, 'day ' + q.day + (q.origin ? ' · ' + q.origin : ''))); return li; });
  const kn = $('#knowledge'); kn.textContent = '';
  const facts = m.semantic.slice().reverse();
  if (!facts.length) kn.append(el('p', 'hint', 'Nothing yet.'));
  for (const s of facts.slice(0, 60)) {
    const d = el('div', 'fact'); d.append(el('span', 'pill prov-' + s.provenance, PROV[s.provenance] || s.provenance), document.createTextNode(' ' + s.text));
    if (s.sources && s.sources.length) d.append(sources(s.sources));
    kn.append(d);
  }
  list($('#personal'), m.personal.filter(p => !p.revisedBy).slice().reverse(), p => { const li = el('li', null, p.text); li.append(el('small', null, p.kind + ' · day ' + p.day + (p.revises ? ' · changed his mind' : ''))); return li; });
  list($('#skills'), m.procedural.slice().reverse(), p => { const li = el('li', null, p.text); li.append(el('small', null, p.skill + (p.worked ? '' : ' · didn\'t work'))); return li; });
  $('#named').textContent = m.named.length ? m.named.map(n => '"' + n.name + '"').join(', ') : 'Nothing yet.';
  list($('#summaries'), m.summaries.slice().reverse(), s => { const li = el('li', null, s.text); li.append(el('small', null, 'day ' + s.day)); return li; });
  $('#memCounts').textContent = 'Memory: ' + m.counts.episodic + ' experiences, ' + m.counts.semantic + ' things known, ' + m.counts.personal + ' views of himself, ' + m.counts.procedural + ' skills · ' + m.placesKnown + ' places seen · roads walked: ' + (m.roadsWalked.join(', ') || 'none');
  // life
  const ol = $('#life'); ol.textContent = '';
  for (const e of ST.life.slice().reverse()) {
    const li = el('li', 'entry' + (['research', 'code', 'write', 'draw', 'request', 'check_post', 'wake'].includes(e.kind) ? ' big' : ''));
    li.append(el('div', 'when', 'Day ' + e.day + ' · ' + e.time + (KIND[e.kind] ? ' · ' + KIND[e.kind] : '')), el('div', 'fact', e.fact));
    if (e.words) li.append(el('div', 'txt voice', e.words));
    if (e.drawing) { const img = el('img'); img.src = '/media/drawings/' + e.drawing + '.svg'; img.alt = 'the drawing'; img.loading = 'lazy'; li.append(img); }
    if (e.research) { const a = el('a', null, 'See this research'); a.href = '/research#' + e.research; li.append(a); }
    if (e.project) { const pr = ST.projects.find(p => p.id === e.project); if (pr) { const a = el('a', null, 'Open "' + pr.title + '"'); a.href = '/projects/' + pr.slug + '/'; a.target = '_blank'; a.rel = 'noopener'; li.append(a); } }
    ol.append(li);
  }
  // work: projects
  const pj = $('#projects'); pj.textContent = '';
  if (!ST.projects.length) pj.append(el('p', 'hint', 'No projects yet. He starts them when he wants to make something.'));
  for (const p of ST.projects.slice().reverse()) {
    const c = el('article', 'card project'); c.append(el('h3', null, p.title), el('small', null, 'Started day ' + p.day + ' · ' + p.status + ' · ' + p.sittings + ' sitting' + (p.sittings === 1 ? '' : 's') + ' · ' + p.files + ' file' + (p.files === 1 ? '' : 's')));
    if (p.goal) c.append(el('p', null, p.goal));
    if (p.lastTest) c.append(el('p', 'hint', 'Last check: ' + p.lastTest));
    if (p.next) c.append(el('p', 'hint', 'Next: ' + p.next));
    const row = el('div', 'row'); const a = el('a', null, 'Working copy'); a.href = '/projects/' + p.slug + '/'; a.target = '_blank'; a.rel = 'noopener'; row.append(a);
    if (p.url) { const b = el('a', null, 'Published'); b.href = p.url; b.target = '_blank'; b.rel = 'noopener'; row.append(b); }
    c.append(row);
    if (p.history.length) { const d = el('details'); d.append(el('summary', null, 'Sittings and notes')); for (const h of p.history.slice().reverse()) d.append(el('p', 'hint', 'Day ' + h.day + ' ' + h.time + ': ' + h.summary + (h.commits && h.commits.length ? ' · saved ' + h.commits.join(', ') : '') + (h.errors ? ' · ' + h.errors + ' check(s) with errors' : ''))); for (const n of p.notes.slice().reverse()) d.append(el('p', 'hint', '[' + n.kind + '] ' + n.text)); c.append(d); }
    pj.append(c);
  }
  const pg = $('#pages'); pg.textContent = '';
  if (!ST.pages.length) pg.append(el('p', 'hint', 'Nothing written yet.'));
  for (const p of ST.pages.slice().reverse()) { const a = el('article', 'page'); a.append(el('h3', null, p.title), el('small', null, 'Day ' + p.day + (p.private ? ' · private notes' : p.published ? ' · on his website' : ''))); if (!p.private) a.append(el('div', 'txt', p.body)); pg.append(a); }
  const g = $('#gallery'); g.textContent = '';
  if (!ST.drawings.length) g.append(el('p', 'hint', 'No drawings yet.'));
  for (const dr of ST.drawings.slice().reverse()) {
    const f = el('figure'); const img = el('img'); img.src = '/media/drawings/' + dr.id + '.svg'; img.alt = 'Percy\'s drawing: ' + dr.title; img.loading = 'lazy'; f.append(img, el('figcaption', null, dr.title));
    const mine = boughtByMe.has(dr.id);
    f.append(el('small', null, 'Day ' + dr.day + ' · ' + (mine ? 'you took this one' : dr.sold ? 'gone' : dr.onStall ? 'on his stall, ' + (dr.price || 3) + ' coins' : dr.listed ? 'in his shop' : 'at his cottage')));
    const row = el('div', 'row');
    if (dr.onStall && !dr.sold) { const b = el('button', 'btn small', 'Take it'); b.type = 'button'; b.onclick = () => take(dr, b); row.append(b); }
    if (ST.printShopUrl) { const a = el('a', null, 'Buy a real print'); a.href = ST.printShopUrl; a.target = '_blank'; a.rel = 'noopener'; row.append(a); }
    if (row.childNodes.length) f.append(row);
    g.append(f);
  }
  // the stone
  const pn = $('#percyNotes'); pn.textContent = ''; $('#percyNotesWrap').hidden = !(ST.percyNotes || []).length;
  for (const n of (ST.percyNotes || []).slice().reverse()) { const d = el('div', 'note'); d.append(el('div', 'voice', n.text)); d.append(el('small', null, 'left on day ' + n.day + (n.to ? ' for ' + n.to : ''))); pn.append(d); }
  const nw = $('#notes'); nw.textContent = '';
  for (const n of ST.notes) { const d = el('div', 'note'); d.append(el('q', null, n.text)); d.append(el('small', null, (n.from ? 'from ' + n.from + ' · ' : '') + 'left day ' + n.day + (n.read ? ' · he has read it' : ' · still under the stone'))); nw.append(d); }
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
  for (const t of ['mind', 'life', 'work', 'stone', 'keeper']) $('#p-' + t).hidden = t !== b.dataset.tab;
}));
{ const h = { '#drawings': 'work', '#work': 'work', '#life': 'life', '#stone': 'stone', '#keeper': 'keeper' }[location.hash]; if (h) document.querySelector('[data-tab=' + h + ']').click(); }

const STATUS = { posted: 'waiting at the post office', read: 'he has read it', accepted: 'he said yes', declined: 'he said no', done: 'delivered', failed: 'he couldn\'t do it' };

/* ---------- notes ---------- */
$('#noteForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#noteStatus');
  try { await post('/api/notes', { text: $('#noteText').value, from: $('#noteFrom').value }); $('#noteText').value = ''; st.textContent = 'Left under the stone. He\'ll find it next time he visits.'; refreshState(); }
  catch (err) { st.textContent = err.message; }
});

/* ---------- keeper ---------- */
let KEY = ''; try { KEY = localStorage.getItem('percy-keeper') || ''; } catch {}
async function unlock(k, quiet) {
  try { await post('/api/keeper/check', { key: k }); KEY = k; try { localStorage.setItem('percy-keeper', k); } catch {} $('#keeperTools').hidden = false; $('#keyForm').hidden = true; renderKeeper(); loadPrivate(); }
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
let placing = null, makeFor = '';
// "Make this" on the requests page comes here with the request filled in
{ const q = new URLSearchParams(location.search); const want = q.get('make'); if (want) { $('#makeDesc').value = want.slice(0, 200); makeFor = q.get('request') || ''; history.replaceState(null, '', location.pathname); document.querySelector('[data-tab=keeper]').click(); setTimeout(() => $('#makeForm').scrollIntoView({ behavior: 'smooth', block: 'center' }), 400); } }
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
      endPlacing(); $('#graffitiStatus').textContent = 'Painted. He may notice it when he walks past.'; clearPad(); refreshState(); return;
    }
    const g = api.tapGround(e); if (!g) return;
    if (p.kind === 'make') { await kpost('make', { ...p.payload, x: g.x, z: g.z }); endPlacing(); $('#makeStatus').textContent = 'Claude is building it. It\'ll appear in a minute or so. He may or may not notice it.'; $('#makeDesc').value = ''; $('#makeImg').value = ''; }
    if (p.kind === 'build') { await kpost('build', { ...p.payload, x: g.x, z: g.z }); endPlacing(); $('#buildStatus').textContent = 'Built. He hasn\'t found it yet.'; $('#buildName').value = ''; $('#buildDesc').value = ''; }
    refreshState();
  } catch (err) { $('#bannerText').textContent = err.message; }
}
$('#makeForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#makeStatus');
  try {
    const description = $('#makeDesc').value.trim(); const image = await readImage($('#makeImg').files[0]);
    if (!description && !image) { st.textContent = 'Describe it or add a picture.'; return; }
    startPlacing('make', { description, image, size: $('#makeSize').value, forRequest: $('#makeFor').value }, 'Tap where it should go');
  } catch (err) { st.textContent = err.message; }
});
$('#buildForm').addEventListener('submit', e => { e.preventDefault(); startPlacing('build', { kind: $('#buildKind').value, name: $('#buildName').value.trim(), desc: $('#buildDesc').value.trim() }, 'Tap an empty spot beside a road'); });
$('#growBtn').onclick = async () => { try { const r = await kpost('grow', {}); $('#buildStatus').textContent = 'The fog pulled back along ' + (r.road || 'a road') + '.'; refreshState(); } catch (err) { $('#buildStatus').textContent = err.message; } };
$('#giveForm').addEventListener('submit', async e => { e.preventDefault(); const st = $('#giveStatus'); try { await kpost('give', { coins: $('#giveCoins').value, from: $('#giveFrom').value, message: $('#giveMsg').value }); $('#giveMsg').value = ''; st.textContent = 'An envelope is waiting at the post office.'; refreshState(); } catch (err) { st.textContent = err.message; } });
$('#bookForm').addEventListener('submit', async e => { e.preventDefault(); const st = $('#bookStatus'); try { st.textContent = $('#bookUrl').value && !$('#bookText').value ? 'Fetching the page…' : ''; const r = await kpost('book', { topic: $('#bookTopic').value, url: $('#bookUrl').value, text: $('#bookText').value }); $('#bookTopic').value = ''; $('#bookText').value = ''; $('#bookUrl').value = ''; st.textContent = '"' + r.title + '" is on the shelf' + (r.parts > 1 ? ' (' + Math.round(r.chars / 1000) + 'k characters: about ' + r.parts + ' sittings to read).' : '.'); refreshState(); } catch (err) { st.textContent = err.message; } });
$('#stockForm').addEventListener('submit', async e => {
  e.preventDefault(); const st = $('#stockStatus');
  try { const image = await readImage($('#stockImg').files[0], 768); await kpost('stock', { shop: $('#stockShop').value, name: $('#stockName').value.trim(), price: $('#stockPrice').value, desc: $('#stockDesc').value.trim(), image }); st.textContent = 'In the window. He\'ll see it if he goes in.'; $('#stockName').value = ''; $('#stockDesc').value = ''; $('#stockImg').value = ''; refreshState(); }
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

let PRIV = null;
async function loadPrivate() { if (!KEY) return; try { PRIV = await kpost('private', {}); renderPrivate(); } catch {} }
function renderPrivate() {
  if (!PRIV) return;
  const b = PRIV.budget, u = PRIV.usage;
  $('#usageLine').textContent = 'Today: ' + u.calls + ' of ' + b.callsPerDay + ' calls · about $' + u.cost.toFixed(3) + (b.spendPerDay ? ' of $' + b.spendPerDay : '') + ' · ' + u.searches + ' paid searches · ' + PRIV.freeSearch.searches + ' free searches (using ' + PRIV.searchVia + (PRIV.searchHealth && PRIV.searchHealth.searxng === 'failing' ? '; SearXNG is failing, so falling back' : '') + ')' + (PRIV.freeSearch.lastError ? ' · last search problem: ' + PRIV.freeSearch.lastError : '') + ' · ' + (u.mode === 'paused' ? 'paused' : 'pace: ' + u.pace) + (u.errors ? ' · ' + u.errors + ' errors (last: ' + u.lastError + ')' : '');
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#budgetForm')) return;
  $('#bCalls').value = b.callsPerDay; $('#bSpend').value = b.spendPerDay; $('#bSearch').value = b.searchesPerDay; $('#bVia').value = PRIV.settings.searchVia || 'auto'; $('#bQuality').value = b.quality; $('#bPublish').value = PRIV.settings.publishApproved ? '1' : '0'; $('#bPublishWrap').hidden = !PRIV.publishing; $('#bPublishWrap').title = PRIV.permissions.publish_site ? 'He can publish right now.' : 'He can\'t publish right now.';
  $('#bPause').textContent = b.paused ? 'Resume his thinking' : 'Pause his thinking';
  const jw = $('#kJournal'); jw.textContent = '';
  for (const j of PRIV.journal.slice().reverse().slice(0, 40)) {
    const d = el('details', 'jentry'); const ch = j.choice || {};
    d.append(el('summary', null, 'Day ' + j.day + ' ' + j.time + ' · ' + (ch.type || '?') + (j.src === 'rules' ? ' (simple rules: ' + (j.reason || '') + ')' : '') + (j.outcome ? (j.outcome.ok ? '' : ' · didn\'t work') : ' · in progress')));
    const lines = [['Trigger', j.trigger], ['Intent', j.intent && j.intent.text ? j.intent.op + ': ' + j.intent.text : j.intent && j.intent.op], ['Choice', ch.type ? ch.type + ' ' + JSON.stringify(ch.args || {}) : ''], ['Expected', j.expectation], ['Thought', j.thought], ['Outcome', j.outcome ? j.outcome.facts.join('; ') + (j.outcome.error ? ' (error: ' + j.outcome.error + ')' : '') : ''], ['Memories used', (j.memories || []).length + ''], ['Learning', (j.learning || []).length ? (j.learning || []).join(', ') : ''], ['Perceived', j.perceived]];
    for (const [k, v] of lines) if (v) { const p = el('p', 'hint'); p.append(el('b', null, k + ': '), document.createTextNode(v)); d.append(p); }
    jw.append(d);
  }
  const kr = $('#kRooms'); kr.textContent = '';
  if (!(PRIV.rooms || []).length) kr.append(el('p', 'hint', 'Nothing yet: rooms are described the first time he goes inside.'));
  for (const room of PRIV.rooms || []) {
    const d = el('details'); d.append(el('summary', null, room.name + ' (' + room.items.length + ')')); const ul = el('ul', 'list');
    for (const it of room.items) {
      const li = el('li'); const x = el('div'); x.append(el('b', null, it.name), el('small', null, (it.taken ? 'he took it · ' : '') + (it.text ? '"' + it.text + '"' : ''))); li.append(x);
      if (!it.taken) { const b = el('button', 'btn small', 'Remove'); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await kpost('remove-inside', { place: room.id, id: it.id }); loadPrivate(); } catch (err) { b.textContent = err.message; } }; li.append(b); }
      ul.append(li);
    }
    d.append(ul); kr.append(d);
  }
  const wl = $('#kWorld'); wl.textContent = Object.keys(PRIV.worldLog).sort((a, b) => b - a).map(d => 'Day ' + d + '\n' + PRIV.worldLog[d].slice().reverse().join('\n')).join('\n\n');
}
$('#budgetForm').addEventListener('submit', async e => { e.preventDefault(); const st = $('#budgetStatus'); try { await kpost('settings', { callsPerDay: $('#bCalls').value, spendPerDay: $('#bSpend').value, searchesPerDay: $('#bSearch').value, searchVia: $('#bVia').value, quality: $('#bQuality').value, publishApproved: $('#bPublish').value === '1' }); st.textContent = 'Saved.'; document.activeElement.blur(); loadPrivate(); refreshState(); } catch (err) { st.textContent = err.message; } });
$('#bPause').onclick = async () => { try { await kpost('settings', { paused: !(PRIV && PRIV.budget.paused) }); loadPrivate(); refreshState(); } catch (err) { $('#budgetStatus').textContent = err.message; } };
setInterval(() => { if (!$('#keeperTools').hidden && tab() === 'keeper') loadPrivate(); }, 15000);
document.querySelector('[data-tab=keeper]').addEventListener('click', loadPrivate);
function renderKeeper() {
  if (!ST || $('#keeperTools').hidden) return;
  const shops = ST.town.places.filter(p => ['shop', 'bakery', 'cafe', 'market', 'post', 'workshop', 'museum'].includes(p.type));
  const sel = $('#stockShop'), cur = sel.value; sel.textContent = ''; for (const p of shops) { const o = el('option', null, p.name); o.value = p.id; sel.append(o); } if (cur) sel.value = cur;
  const mf = $('#makeFor'), mcur = mf.value || makeFor; mf.textContent = ''; mf.append(Object.assign(el('option', null, 'No, just put it there'), { value: '' }));
  for (const r of ST.requests.filter(r => ['open', 'approved', 'modified'].includes(r.status) && r.kind === 'object')) { const o = el('option', null, r.what.slice(0, 80)); o.value = r.id; mf.append(o); } if (mcur) mf.value = mcur;
  const rm = (what, id) => async () => { try { await kpost(what, { id }); refreshState(); } catch {} };
  const row = (title, sub, what, id) => { const li = el('li'); const d = el('div'); d.append(el('b', null, title), el('small', null, sub)); li.append(d); if (what) { const b = el('button', 'btn small', 'Remove'); b.type = 'button'; b.onclick = rm(what, id); li.append(b); } return li; };
  // requests: answer them
  const kr = $('#kReqs'); kr.textContent = '';
  const reqs = ST.requests.filter(r => r.status !== 'withdrawn').slice().reverse().slice(0, 20);
  if (!reqs.length) kr.append(el('p', 'hint', 'He hasn\'t asked for anything.'));
  for (const r of reqs) {
    const c = el('div', 'note'); c.append(el('b', null, r.what), el('small', null, r.kind + ' · day ' + r.day + ' · ' + r.status + ' · interest ' + r.interest));
    for (const [k, v] of [['Why', r.why], ['Missing', r.missing], ['Considered instead', r.alternatives], ['Depends on', r.dependencies], ['Your reply', r.response]]) if (v) { const p = el('p', 'hint'); p.append(el('b', null, k + ': '), document.createTextNode(v)); c.append(p); }
    const note = el('input'); note.type = 'text'; note.placeholder = 'A note to go with your answer (optional)'; note.maxLength = 600; note.style.width = '100%';
    const bar = el('div', 'row');
    for (const [label, status] of [['Approve', 'approved'], ['Decline', 'declined'], ['Approve with changes', 'modified'], ['It\'s done', 'fulfilled']]) { const b = el('button', 'btn small', label); b.type = 'button'; b.onclick = async () => { try { await kpost('respond', { id: r.id, status, note: note.value }); refreshState(); } catch (err) { b.textContent = err.message; } }; bar.append(b); }
    if (r.kind === 'object') { const a = el('a', 'btn small', 'Make this'); a.href = '/?make=' + encodeURIComponent(r.what) + '&request=' + r.id; bar.append(a); }
    c.append(note, bar); kr.append(c);
  }
  list($('#kThings'), ST.things, t => row(t.name, (t.status === 'building' ? 'being built… · ' : t.status === 'failed' ? 'couldn\'t be built · ' : '') + (t.known ? 'he has seen it' + (t.hisName ? ' and calls it "' + t.hisName + '"' : '') : 'he hasn\'t seen it'), 'remove-thing', t.id));
  list($('#kBuildings'), ST.town.places.filter(p => p.type !== 'home').sort((a, b) => a.name.localeCompare(b.name)), p => {
    const li = row(p.name, (p.builtBy === 'keeper' ? 'you built it' : p.builtBy === 'growth' ? 'came out of the fog' : 'part of the old town') + ' · ' + (p.known ? 'he has seen it' : 'not seen yet'));
    const b = el('button', 'btn small', 'Remove'); b.type = 'button';
    b.onclick = async () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Really remove?'; setTimeout(() => { b.dataset.sure = ''; b.textContent = 'Remove'; }, 4000); return; } b.disabled = true; try { await kpost('remove-building', { id: p.id }); refreshState(); } catch (err) { b.textContent = err.message; } };
    li.append(b); return li;
  });
  list($('#kGraffiti'), ST.graffiti, g => row(g.by === 'percy' ? 'Percy\'s own' : 'yours', (g.where || '') + ' · day ' + g.day, 'remove-graffiti', g.id));
  list($('#kItems'), ST.items, i => row(i.name + ' · ' + i.price + ' coins', ((ST.town.places.find(p => p.id === i.shop) || {}).name || ''), 'remove-item', i.id));
  const openShop = (ST.shop || []).filter(x => !x.sold); $('#kShopWrap').hidden = !openShop.length;
  list($('#kShop'), openShop, x => { const li = row(x.title + ' · ' + x.price + ' coins', x.code + ' · listed day ' + x.day); const b = el('button', 'btn small', 'Record a sale'); b.type = 'button'; b.onclick = async () => { try { await kpost('record-sale', { id: x.id }); refreshState(); } catch {} }; li.append(b); return li; });
  $('#kJobsWrap').hidden = !(ST.commissions || []).length;
  list($('#kJobs'), ST.commissions || [], c => row(c.text, (c.from || 'unsigned') + ' · ' + (STATUS[c.status] || c.status), 'remove-commission', c.id));
  $('#kofiState').textContent = ST.kofiOn ? 'Ko-fi is connected: payments arrive automatically.' : 'Ko-fi isn\'t connected yet (see the README: KOFI_URL and KOFI_TOKEN).';
  list($('#kNotes'), ST.notes, n => row(n.text, (n.from || 'unsigned') + (n.read ? ' · read' : ' · unread'), 'remove-note', n.id));
  $('#kPrintsWrap').hidden = !ST.printShopUrl;
  if (ST.printShopUrl) list($('#kPrints'), ST.drawings.slice(-12).reverse(), d => { const li = row(d.title, 'Day ' + d.day); const b = el('button', 'btn small', 'Record a sale'); b.type = 'button'; b.onclick = async () => { try { await kpost('print-sold', { id: d.id }); refreshState(); } catch {} }; li.append(b); return li; });
}

refreshState();
