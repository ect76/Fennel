// The separate pages: Percy's requests (/requests) and his shop & jobs (/shop).
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const PAGE = document.body.dataset.page;
async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function post(u, body) { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; }
const days = n => n + ' day' + (n === 1 ? '' : 's');

let ST = null, rev = -1, busy = false, keeper = false;
async function refresh() { if (busy) return; busy = true; try { ST = await getJSON('/api/state'); rev = ST.rev; render(); } catch {} finally { busy = false; } }
function onLive(d) { $('#nowLine').textContent = 'Day ' + d.day + ' · ' + d.time + ' · feeling ' + d.mood + ' · ' + d.coins + ' coins'; if (d.rev !== rev) refresh(); }
try { const es = new EventSource('/api/stream'); es.onmessage = e => { try { onLive(JSON.parse(e.data)); } catch {} }; } catch {}
let KEY = ''; try { KEY = localStorage.getItem('percy-keeper') || ''; } catch {}
if (KEY) post('/api/keeper/check', { key: KEY }).then(() => { keeper = true; render(); }).catch(() => {});

function render() {
  if (!ST) return;
  const sl = $('#siteLink'); sl.textContent = ''; if (ST.siteUrl) { sl.append('His website: '); const a = el('a', null, ST.siteUrl.replace(/^https:\/\//, '').replace(/\/$/, '')); a.href = ST.siteUrl; a.target = '_blank'; a.rel = 'noopener'; sl.append(a); }
  if (PAGE === 'requests') renderRequests(); else renderShop();
}

/* ---------- requests ---------- */
function renderRequests() {
  const open = (ST.wishes || []).filter(w => !w.granted), log = ST.wishLog || [];
  const done = (ST.wishes || []).filter(w => w.granted).concat(log.filter(w => w.granted)).sort((a, b) => (b.grantedDay || 0) - (a.grantedDay || 0));
  const gone = log.filter(w => !w.granted).slice().reverse();
  $('#savingWrap').hidden = !(ST.saving && ST.saving.what);
  if (ST.saving && ST.saving.what) $('#saving').textContent = ST.saving.what + (ST.saving.coins ? ' · he has ' + Math.min(ST.coins, ST.saving.coins) + ' of ' + ST.saving.coins + ' coins' : '');
  const ro = $('#reqOpen'); ro.textContent = '';
  if (!open.length) ro.append(el('p', 'hint', 'Nothing right now. He thinks about what he wants at bedtime, so check back after a night or two.'));
  for (const w of open) {
    const d = el('div', 'wish'); d.append(el('div', 'voice', w.text));
    const wait = ST.day - w.day;
    d.append(el('small', null, 'asked on day ' + w.day + (wait > 0 ? ' · waiting ' + days(wait) : ' · asked today') + (w.asked > 1 ? ' · asked ' + w.asked + ' times' : '')));
    if (keeper) { const a = el('a', 'btn small', 'Make this'); a.href = '/?make=' + encodeURIComponent(w.text); a.style.justifySelf = 'start'; a.style.textDecoration = 'none'; d.append(a); }
    ro.append(d);
  }
  $('#reqDoneWrap').hidden = !done.length; const rd = $('#reqDone'); rd.textContent = '';
  for (const w of done) { const d = el('div', 'wish done'); d.append(el('div', 'voice', w.text), el('small', null, 'asked on day ' + w.day + ' · came true on day ' + w.grantedDay + (w.grantedDay > w.day ? ', after ' + days(w.grantedDay - w.day) : ''))); rd.append(d); }
  $('#reqGoneWrap').hidden = !gone.length; const rg = $('#reqGone'); rg.textContent = '';
  for (const w of gone) { const d = el('div', 'wish gone'); d.append(el('div', 'voice', w.text), el('small', null, 'asked on day ' + w.day + ' · stopped hoping on day ' + w.gaveUp)); rg.append(d); }
  $('#keeperHint').hidden = !keeper || !open.length;
}

/* ---------- shop & jobs ---------- */
let myJobs = new Map(); try { myJobs = new Map(JSON.parse(localStorage.getItem('percy-jobs') || '[]')); } catch {}
const STATUS = { posted: 'waiting at the post office', read: 'he is reading it', accepted: 'he said yes and is working on it', declined: 'he said no', done: 'finished', failed: 'he couldn\'t do it' };
const KINDNAME = { drawing: 'a drawing', page: 'something written', web: 'a web page' };
function renderShop() {
  const rate = ST.coinsPerPound || 10, pounds = c => '£' + (Math.max(1, c / rate)).toFixed(2).replace(/\.00$/, '');
  const sign = $('#shopSign'); sign.hidden = !ST.advert; sign.textContent = ST.advert || '';
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
