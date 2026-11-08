// Percy's server: runs his world nonstop, serves the 3D town page, and takes visitors' notes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { loadJSON, saveJSON, dailyBackup } from './store.js';
import { canCall } from './claude.js';
import * as W from './world.js';
import * as M from './mind.js';
import { drawingSVG, graffitiSVG, keyFor } from './doodle.js';
import * as Pub from './publish.js';
W.setWebEnabled(Pub.enabled());

const { str, pick, plainName } = W;
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const SAVE = path.join(config.dataDir, 'world.json');
const MEDIA = path.join(config.dataDir, 'media');
for (const d of ['drawings', 'graffiti', 'uploads', 'web']) fs.mkdirSync(path.join(MEDIA, d), { recursive: true });
function writeMedia(rel, data) { try { fs.writeFileSync(path.join(MEDIA, rel), data); } catch (e) { console.warn('[percy] could not save ' + rel + ':', e.message); } }
function readImage(rel) {
  try { const buf = fs.readFileSync(path.join(MEDIA, rel)); const ext = path.extname(rel).slice(1); const mt = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext]; return mt ? { mediaType: mt, data: buf.toString('base64') } : null; } catch { return null; }
}
function parseDataURL(u) {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || ''));
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64'); if (buf.length > 4 * 1024 * 1024) return null;
  return { mediaType: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2], buf, data: m[3] };
}
// his website: re-render the index whenever something new goes up
function siteUpdate(files, message) { if (!Pub.enabled()) return; for (const [p, c] of files) Pub.queueFile(p, c, message); Pub.queueFile('index.html', Pub.indexHTML(S), 'percy updated his index'); shopUpdate(); }
// his shop page: he designs it (mind.makeShopPage); the server keeps its stock list current
const SHOP_TEMPLATE = path.join(MEDIA, 'web', '_shop.html');
function shopData() {
  const items = S.shop.filter(x => !x.withdrawn && (!x.sold || W.dayOf(S.t) - (x.soldDay || 0) < 30)).slice(-60).map(x => {
    const w = x.kind === 'web' ? (S.webPages || []).find(p => p.id === x.ref) : null, pg = x.kind === 'page' ? S.pages.find(p => p.id === x.ref) : null;
    return { code: x.code, title: x.title, blurb: x.blurb || '', price: x.price, pounds: W.pounds(x.price), kind: x.kind, img: x.kind === 'drawing' ? 'drawings/' + x.ref + '.svg' : '', link: w ? 'made/' + w.slug + '.html' : pg ? 'pages/' + Pub.slug(pg.title) + '.html' : '', sold: !!x.sold, day: x.day };
  });
  return { items, sign: S.advert || '', kofi: config.kofiUrl, townUrl: config.publicUrl, coinsPerPound: config.coinsPerPound, updated: 'day ' + W.dayOf(S.t) };
}
function shopUpdate() {
  if (!Pub.enabled() || !S.shopPage) return;
  let html; try { html = fs.readFileSync(SHOP_TEMPLATE, 'utf8'); } catch { return; }
  const json = JSON.stringify(shopData()).replace(/</g, '\\u003c');
  Pub.queueFile('shop.html', html.replace(M.SHOP_SLOT, () => '<script type="application/json" id="' + M.SHOP_MARK + '">' + json + '</script>'), 'percy\'s shop');
}

/* ---------- load or create the world ---------- */
let S = loadJSON(SAVE);
if (S && S.v === 1) {
  // the first version (Fennel the frog, on an island): keep it safe and start Percy's village, with Fennel's notebook in the cottage
  const old = S;
  try { saveJSON(path.join(config.dataDir, 'world-fennel-archive.json'), old); } catch (e) { console.error('[percy] could not archive the old world:', e.message); }
  S = W.newWorld(); W.setState(S);
  W.addDiary('event', 'day 1. woke up in the cottage. the stone was humming before the birds started.');
  W.leaveNotebook(old);
  console.log('[percy] archived Fennel\'s world to world-fennel-archive.json; Percy\'s village begins');
} else if (!S) {
  S = W.newWorld(); W.setState(S);
  W.addDiary('event', 'day 1. woke up in the cottage. the stone was humming before the birds started.');
  console.log('[percy] a new world begins');
} else {
  // every later version keeps everything: just add whatever is new
  W.migrate(S); W.setState(S);
  S.deciding = false;
  const gapMin = (Date.now() - (S.lastSeenReal || Date.now())) / 60000;
  if (gapMin > 10) { W.addDiary('event', 'the world went quiet for a while. i don\'t remember any of it. the clock says it\'s still ' + W.hhmm(S.t) + '.'); W.log('the world paused'); }
  console.log('[percy] world loaded: day ' + W.dayOf(S.t) + ', ' + W.hhmm(S.t));
}
function save() { S.lastSeenReal = Date.now(); try { saveJSON(SAVE, S); dailyBackup(config.dataDir, S); } catch (e) { console.error('[percy] save failed:', e.message); } }

/* ---------- things that need Claude and finish later ---------- */
// Results are attached to the activity; whichever comes last (the activity ending or Claude answering) publishes it.
function later(a, kind, promise) {
  a.job = { kind, done: false, ended: false };
  promise.then(r => { a.job.result = r; }).catch(e => { a.job.error = String(e.message || e); console.warn('[percy] ' + kind + ' failed:', a.job.error); })
    .finally(() => { a.job.done = true; if (a.job.ended) publish(a); });
}
function publish(a) {
  const j = a.job; if (!j || j.published) return; j.published = true;
  if (j.kind === 'research') {
    const r = j.result;
    if (r) {
      S.knowledge.push({ topic: r.topic, facts: r.facts, sources: r.sources, day: W.dayOf(S.t), src: 'claude', web: r.web });
      if (S.knowledge.length > 60) S.knowledge.shift();
      S.researchQueue = S.researchQueue.filter(q => q.topic.toLowerCase() !== String(a.subject || '').toLowerCase() && q.topic.toLowerCase() !== r.topic.toLowerCase());
      if (r.newQuestion) { S.questions.unshift(r.newQuestion); S.questions = S.questions.slice(0, 6); }
      W.addDiary('learn', 'read about ' + r.topic + '.\n' + r.facts.map(f => '· ' + f).join('\n') + (r.feeling ? '\n' + r.feeling : ''), 'claude', { sources: r.sources });
      W.remember('learned about ' + r.topic + ': ' + r.facts[0], 3);
      { const words = t => String(t).toLowerCase().match(/[a-z]{4,}/g) || [];
        const rw = new Set(words(r.topic + ' ' + (a.subject || '')));
        const it = S.interests.find(i => words(i.topic).some(w => rw.has(w))) || (S.interests[0] && S.interests[0].strength > 50 ? S.interests[0] : null);
        if (it) { it.sessions++; it.strength = Math.min(100, it.strength + 8); }
        W.emo('curiosity', 6); W.emo('contentment', 6);
        // down the rabbit hole: while he's hooked, each session suggests the next thing to look up
        if (r.nextTopic && (!it || it.strength > 35) && !S.researchQueue.some(q => q.topic.toLowerCase() === r.nextTopic.toLowerCase()) && !S.knowledge.some(k => k.topic.toLowerCase() === r.nextTopic.toLowerCase())) S.researchQueue.unshift({ topic: r.nextTopic, question: 'going deeper' + (it ? ' into ' + it.topic : '') });
        if (S.researchQueue.length > 8) S.researchQueue.length = 8; }
      W.log('researched ' + r.topic);
    } else bookFallback();
  } else if (j.kind === 'drawing') { finishDrawing(a, j.result);
  } else if (j.kind === 'graffiti') { if (a.made) finishGraffiti(a, j.result);
  } else if (j.kind === 'web') {
    const r = j.result;
    if (r) {
      const prev = r.improves ? S.webPages.find(p => p.id === r.improves) : null;
      let sl = prev ? prev.slug : Pub.slug(r.title); if (!prev && (S.webPages || []).some(p => p.slug === sl)) sl += '-' + W.dayOf(S.t);
      const page = prev || { id: W.uid(), slug: sl, title: r.title, subject: a.subject || '', day: W.dayOf(S.t), versions: 0 };
      page.versions = (page.versions || 1) + (prev ? 1 : 0) || 1; page.lastDay = W.dayOf(S.t);
      if (!prev) { S.webPages.push(page); if (S.webPages.length > 80) S.webPages.shift(); }
      writeMedia('web/' + sl + '.html', r.html);
      W.addDiary('page', prev ? 'worked on "' + r.title + '" again. version ' + page.versions + ' now.' : 'made a web page: "' + r.title + '". ' + (Pub.enabled() ? 'it\'s up on my site now.' : 'it\'s sitting on my desk. nowhere to put it.'), 'claude', { web: sl });
      W.remember('made a web page called "' + r.title + '"', 3); W.log('made a web page: ' + r.title);
      siteUpdate([['made/' + sl + '.html', r.html]], 'percy made a page: ' + r.title);
    } else W.log('tried to make a web page but it wouldn\'t come together');
  } else if (j.kind === 'job') { deliverCommission(a, j.result);
  } else if (j.kind === 'shop') { openShop(a, j.result);
  } else if (j.kind === 'page') {
    const r = j.result;
    if (r) {
      const page = { id: W.uid(), day: W.dayOf(S.t), title: r.title, body: r.body };
      S.pages.push(page);
      if (S.pages.length > 60) S.pages.shift();
      siteUpdate([['pages/' + Pub.slug(page.title) + '.html', Pub.pageHTML(page)]], 'percy wrote a page: ' + page.title);
      W.addDiary('page', 'wrote a page called "' + r.title + '" and pinned it up.', 'claude');
      W.log('wrote a page: ' + r.title); W.remember('wrote a page called "' + r.title + '"', 2);
    } else W.log('tried to write but nothing came');
  }
  W.bump();
}
function finishDrawing(a, art) {
  const dr = M.makeDrawing(a.subject, a.title, a.scrap);
  if (art) dr.art = 'claude';
  const svg = art || drawingSVG(dr); writeMedia('drawings/' + dr.id + '.svg', svg);
  W.addDiary('drawing', 'drew "' + dr.title + '"' + (a.scrap ? ' on the back of an old envelope. no money for paper.' : '. ' + pick(['pinned it on the board on the high street.', 'it came out wobbly. i like it anyway.', 'not sure about the left side.', 'it looks like how it felt.'])), 'rules', { drawing: dr.id });
  W.log('drew "' + dr.title + '"');
  siteUpdate([['drawings/' + dr.id + '.svg', svg]], 'percy drew ' + dr.title);
}
// a finished commission: file the work where it belongs, then he gets paid
function deliverCommission(a, r) {
  const c = S.commissions.find(x => x.id === a.job.commission); if (!c) return;
  if (!r) { c.tries = (c.tries || 0) + 1; W.log('worked on a commission but it didn\'t come right'); W.emo('frustration', 10); if (c.tries >= 3) { c.status = 'failed'; c.reply = (c.reply ? c.reply + ' ' : '') + '(he tried three times and couldn\'t get it right.)'; W.addDiary('job', 'gave up on the commission: "' + c.text.slice(0, 80) + '". tried three times. it wouldn\'t come.'); } return; }
  let result;
  if (c.kind === 'drawing') {
    const dr = M.makeDrawing(str(c.text, 80), a.title || str(c.text.replace(/^(please\s+)?(can you\s+)?(draw|make|paint)\s+(me\s+)?/i, ''), 48), false); dr.art = 'claude'; dr.commission = c.id; dr.forWho = c.from || ''; dr.sold = true; dr.soldDay = W.dayOf(S.t);
    writeMedia('drawings/' + dr.id + '.svg', r); siteUpdate([['drawings/' + dr.id + '.svg', r]], 'percy drew a commission: ' + dr.title);
    result = { type: 'drawing', id: dr.id, title: dr.title, url: '/media/drawings/' + dr.id + '.svg' };
  } else if (c.kind === 'page') {
    const page = { id: W.uid(), day: W.dayOf(S.t), title: r.title, body: r.body, forWho: c.from || '', commission: c.id };
    S.pages.push(page); if (S.pages.length > 60) S.pages.shift();
    siteUpdate([['pages/' + Pub.slug(page.title) + '.html', Pub.pageHTML(page)]], 'percy wrote a commission: ' + page.title);
    result = { type: 'page', id: page.id, title: page.title };
  } else {
    let sl = Pub.slug(r.title); if ((S.webPages || []).some(p => p.slug === sl)) sl += '-' + W.dayOf(S.t);
    const page = { id: W.uid(), slug: sl, title: r.title, subject: c.text.slice(0, 80), day: W.dayOf(S.t), versions: 1, lastDay: W.dayOf(S.t), forWho: c.from || '', commission: c.id };
    S.webPages.push(page); if (S.webPages.length > 80) S.webPages.shift();
    writeMedia('web/' + sl + '.html', r.html); siteUpdate([['made/' + sl + '.html', r.html]], 'percy made a commission: ' + r.title);
    result = { type: 'web', id: page.id, title: r.title, slug: sl, url: Pub.enabled() ? Pub.siteUrl() + 'made/' + sl + '.html' : '/media/web/' + sl + '.html' };
  }
  const pay = W.finishCommission(c, result);
  W.addDiary('job', 'finished the commission for ' + (c.from || 'whoever ordered it') + ': "' + result.title + '". sent it off. ' + pay + ' coins came back. ' + pick(['i hope they like it.', 'i keep thinking about them opening it.', 'my own money, from my own work.', 'i checked it four times before i let it go.']), 'claude', result.type === 'drawing' ? { drawing: result.id } : {});
}
// a shop session: listings, his sign, and maybe a new design for his shop page
function openShop(a, r) {
  if (!r || !r.plan) { W.log('sat down to sort out the shop but couldn\'t decide anything'); return; }
  const p = r.plan, listed = [];
  if (Array.isArray(p.withdraw)) for (const ref of p.withdraw.slice(0, 10)) W.withdrawListing(String(ref));
  if (Array.isArray(p.list)) for (const it of p.list.slice(0, 8)) { const l = it && W.setListing({ ref: String(it.ref || ''), price: it.price, blurb: it.blurb }); if (l) listed.push(l); }
  if (str(p.sign, 300)) S.advert = str(p.sign, 300);
  if (r.html) { writeMedia('web/_shop.html', r.html); S.shopPage = { versions: ((S.shopPage && S.shopPage.versions) || 0) + 1, day: W.dayOf(S.t), idea: str(p.design_idea, 200) }; }
  if (str(p.thought, 400)) W.setThought(str(p.thought, 400), 'claude');
  W.addDiary('shop', (listed.length ? 'put ' + listed.map(l => '"' + l.title + '" (' + l.price + ')').join(', ') + ' in the shop. ' : 'looked at everything and didn\'t put anything new in the shop. ') + (r.html ? (S.shopPage.versions === 1 ? 'made a proper shop page on my website. ' + (Pub.enabled() ? 'it\'s open.' : '') : 'redid the shop page.') : '') + (p.sign ? '\nthe sign says: "' + str(p.sign, 300) + '"' : ''), 'claude');
  siteUpdate([], 'percy worked on his shop');
}
function finishGraffiti(a, art) {
  const g = a.made; const svg = art || graffitiSVG({ key: keyFor(g.subject), seed: g.seed, tag: g.tag });
  writeMedia('graffiti/' + g.id + '.svg', svg); g.img = '/media/graffiti/' + g.id + '.svg'; if (art) { g.h = g.w * 840 / 800; }
  W.addDiary('graffiti', 'painted ' + (g.subject || 'something') + ' ' + g.where + (g.tag ? '. it says "' + g.tag + '".' : '.'), a.src === 'claude' ? 'claude' : 'rules');
  siteUpdate([['graffiti/' + g.id + '.svg', svg]], 'percy painted on a wall'); W.bump();
}
// something grabbed him: line up several things to look up, and let it absorb him for a while
function takeInterests(r, about) {
  const topics = Array.isArray(r && r.interests) ? r.interests.map(t => str(t, 60)).filter(Boolean).slice(0, 3) : [];
  topics.forEach((t, i) => { W.interest(t, 70 - i * 15); if (!S.researchQueue.some(q => q.topic.toLowerCase() === t.toLowerCase())) S.researchQueue.push({ topic: t, question: about ? 'because of ' + about : '' }); });
  if (S.researchQueue.length > 8) S.researchQueue.splice(0, S.researchQueue.length - 8);
}
function bookFallback() {
  const b = W.builtinBook();
  if (b) { S.knowledge.push({ topic: b.topic, facts: b.facts, sources: [], day: W.dayOf(S.t), src: 'book' }); W.addDiary('learn', 'read about ' + b.topic + '.\n' + b.facts.map(f => '· ' + f).join('\n')); W.log('read about ' + b.topic); }
  else { W.log('reread an old book'); W.setThought('read the moon book again. still far.'); }
}

W.setHooks({
  onArrive(a, p) {
    const claude = canCall();
    if (a.id === 'read') {
      const q = S.researchQueue[0];
      const topic = a.subject || (q && q.topic) || '';
      const book = q && q.topic === topic ? q : null;
      if (claude && topic) { a.subject = topic; later(a, 'research', M.research(topic, book ? book.question : '', book && book.text)); W.setThought(book && book.text ? 'someone left a book about ' + topic + '. reading it.' : 'looking up ' + topic + '.'); }
    }
    if (a.id === 'write' && claude) later(a, 'page', M.writePage(a.subject, a.title));
    if (a.id === 'web' && claude) {
      const prev = (S.webPages || []).find(p => p.id === a.target || (a.subject && p.title.toLowerCase() === a.subject.toLowerCase()));
      let existing = null; if (prev) { try { existing = { page: prev, html: fs.readFileSync(path.join(MEDIA, 'web', prev.slug + '.html'), 'utf8') }; } catch {} }
      later(a, 'web', M.makeWebPage(a.subject, a.title, existing));
    }
    if (a.id === 'draw' && claude) later(a, 'drawing', M.paintDrawing({ subject: a.subject, title: a.title }));
    if (a.id === 'job' && claude) {
      const c = S.commissions.find(x => x.id === a.target && x.status === 'accepted') || S.commissions.filter(x => x.status === 'accepted').slice(-1)[0];
      if (c) {
        a.doing = a.doing || 'working on ' + W.COMMISSION_KINDS[c.kind] + ' for ' + (c.from || 'someone outside');
        const work = c.kind === 'drawing' ? M.paintDrawing({ subject: c.text.slice(0, 120), title: a.title, commission: c }) : c.kind === 'page' ? M.writePage(c.text.slice(0, 120), a.title, c) : W.webEnabled ? M.makeWebPage(c.text.slice(0, 120), a.title, null, c) : M.writePage(c.text.slice(0, 120), a.title, c);
        if (c.kind === 'web' && !W.webEnabled) c.kind = 'page';
        later(a, 'job', work); a.job.commission = c.id;
      }
    }
    if (a.id === 'shopfront' && claude) {
      later(a, 'shop', (async () => {
        const plan = await M.planShop();
        let html = null;
        if (W.webEnabled && (!S.shopPage || plan.redesign)) {
          let current = null; try { if (S.shopPage) current = fs.readFileSync(SHOP_TEMPLATE, 'utf8'); } catch {}
          html = await M.makeShopPage(str(plan.design_idea, 300), current).catch(e => { console.warn('[percy] shop page failed:', e.message); return null; });
        }
        return { plan, html };
      })());
    }
    if (a.id === 'graffiti' && claude && a.wall) later(a, 'graffiti', M.paintGraffiti({ subject: a.subject, tag: a.title }));
    if (a.id === 'shrine') readNotes(claude);
    if (a.id === 'visit' && p && !p.inside && claude && !['home', 'green', 'lookout', 'stone', 'market', 'garden'].includes(p.type)) {
      p.inside = { pending: true };
      M.furnish(p).then(r => { p.inside = r; W.bump(); save(); }).catch(e => { p.inside = null; console.warn('[percy] furnishing failed:', e.message); });
    }
    if (a.id === 'inspect') { const th = W.thingById(a.thing); if (th && !th.seen) firstLook(th, claude); }
    if (claude && a.total >= 60 && Math.random() < 0.65) a.museAt = a.total * (0.35 + Math.random() * 0.3);
    if (claude && a.id === 'sleep') a.museAt = a.total * 0.5;
  },
  onFinish(a) {
    if (a.job) { a.job.ended = true; if (a.job.done) publish(a); }
    else if (a.id === 'read') bookFallback();
    if (a.id === 'draw' && !(a.job && a.job.kind === 'drawing')) finishDrawing(a, null);
    if (a.id === 'graffiti' && a.made && !(a.job && a.job.kind === 'graffiti')) finishGraffiti(a, null);
    if (a.id === 'visit' && a.examined) {
      const p = W.placeById(a.place), it = a.examined;
      W.addDiary('inside', (p && p.inside && p.inside.firstVisitDone ? '' : (p && p.inside && p.inside.feel ? 'inside ' + p.name + ': ' + p.inside.feel + '\n' : '')) + 'found ' + it.name + '. ' + it.finds + (it.taken ? '\ntook it home.' : ''), 'claude');
      if (p && p.inside) p.inside.firstVisitDone = true;
    } else if (a.id === 'visit') { const p = W.placeById(a.place); if (p && p.inside && p.inside.items) W.addDiary('inside', 'went back into ' + p.name + '. ' + pick(['everything just as i left it.', 'sat for a bit in the quiet.', 'the dust has settled again.'])); }
    if (a.id === 'buy' && a.bought) {
      W.addDiary('bought', 'bought ' + a.bought.name + ' for ' + a.bought.price + ' coins. ' + pick(['carried it home very carefully.', 'counted the coins out one at a time.', 'it\'s mine now. that feels strange.']));
    }
    if (a.id === 'fog' && (S.fogTests <= 3 || S.fogTests % 3 === 0)) {
      W.addDiary('fog', pick(['walked to the end of ' + (a.road || 'the road') + ' until my feet stopped. not tired. just stopped.', 'pushed into the fog with one hand. soft, like a wall made of pillows.', 'threw a pebble into the fog. no sound when it landed.', 'stood where ' + (a.road || 'the road') + ' runs out for a long time. nothing out there looked back.']) + ' test #' + S.fogTests + '.');
    }
  },
  onDiscover(p) {
    const plain = { first_sight: 'found ' + p.name + '. nobody there. the door ' + pick(['was open', 'was locked', 'had a bell that didn\'t ring']) + '.', question: 'who built ' + p.name + '?', wonder: 8 };
    const done = (r, src) => { W.applyFeel(r); takeInterests(r, p.name); W.addDiary('found', str(r.first_sight, 700), src); if (str(r.question, 160)) { S.questions.unshift(str(r.question, 160)); S.questions = S.questions.slice(0, 6); } if (str(r.remember, 220)) W.remember(r.remember, 3); W.bump(); };
    if (canCall()) M.reactToPlace(p).then(r => done(r, 'claude')).catch(() => done(plain, 'rules')); else done(plain, 'rules');
  },
  onGraffitiSeen(g) {
    const image = g.by === 'keeper' && g.file ? readImage(g.file) : null;
    const plain = { reaction: 'someone painted on the wall ' + (g.where || '') + '. i stood and looked at it for a long time.', wonder: 8 };
    const done = (r, src) => { W.applyFeel(r); takeInterests(r); W.addDiary('graffiti', str(r.reaction, 700), src); if (str(r.belief, 140)) { S.beliefs.unshift(str(r.belief, 140)); S.beliefs = S.beliefs.slice(0, 8); } if (str(r.remember, 220)) W.remember(r.remember, 3); W.bump(); };
    if (canCall()) M.reactToGraffiti(g, image).then(r => done(r, 'claude')).catch(() => done(plain, 'rules')); else done(plain, 'rules');
  },
  onItemSeen(it, p) {
    W.addDiary('window', 'saw ' + it.name + ' in the window of ' + p.name + '. ' + it.price + ' coins.' + (it.price > S.coins ? ' i have ' + S.coins + '.' : ''));
  },
  onWake(mood) {
    const plain = { 'a low day': 'heavy this morning. didn\'t want to get up.', 'a grey day': 'woke up and lay there a while.', 'an ordinary day': 'morning. legs work.', 'a good day': 'woke up before the clock. felt like getting on with things.', 'a bright day': 'woke up light. like something good is going to happen.' }[mood.label] || 'morning.';
    const done = (t, src) => { W.setThought(t, src); W.addDiary('morning', t, src, { mood: mood.label }); };
    if (canCall()) M.wakeUp(mood).then(t => done(t, 'claude')).catch(() => done(plain, 'rules')); else done(plain, 'rules');
  },
  onGrow(g, by) {
    W.addDiary('event', 'the fog has pulled back' + (g.road ? ' along ' + g.road : '') + '. there\'s more town out there than there was.');
  },
  onInbox(envs, letters, coins) {
    const claude = canCall();
    if (envs.length) {
      const sold = envs.filter(e => e.forTitle).map(e => e.forTitle);
      const plain = { diary: (envs.length === 1 ? 'a payment' : envs.length + ' payments') + ' in my shop inbox. ' + coins + ' coins.' + (sold.length ? ' for ' + sold.join(', ') + '.' : '') + ' ' + pick(['somebody out there paid for something i made.', 'i held them for a long time before i put them in my pocket.', 'just a name and some numbers. i read it three times anyway.']), joy: 8, wonder: 6 };
      const done = (r, src) => {
        W.applyFeel(r); W.addDiary('inbox', str(r.diary, 900), src, { coins });
        if (str(r.thought, 400)) W.setThought(str(r.thought, 400), src);
        if (Array.isArray(r.replies)) for (const n of r.replies.slice(0, 3)) if (n && str(n.text, 400)) { S.percyNotes.push({ text: str(n.text, 400), to: str(n.to, 40), inReplyTo: 'a payment', day: W.dayOf(S.t) }); if (S.percyNotes.length > 60) S.percyNotes.shift(); }
        if (str(r.remember, 220)) W.remember(r.remember, 4);
        W.bump(); save();
      };
      if (claude) M.reactToPost(envs, coins).then(r => done(r, 'claude')).catch(() => done(plain, 'rules')); else done(plain, 'rules');
    }
    if (letters.length) {
      if (!claude) { for (const c of letters) { c.status = 'posted'; c.waitDay = W.dayOf(S.t); } W.log('left the orders for later'); return; } // he'll read them properly another time
      M.considerCommissions(letters).then(r => {
        for (const c of letters) { const ans = r.letters.find(x => x && x.id === c.id); if (ans) W.answerCommission(c, { accept: !!ans.accept, reply: ans.reply }); else c.status = 'posted'; }
        if (str(r.thought, 400)) W.setThought(str(r.thought, 400), 'claude');
        const took = letters.filter(c => c.status === 'accepted').length, no = letters.filter(c => c.status === 'declined').length;
        W.addDiary('orders', (str(r.diary, 700) || 'orders in my inbox.') + (took ? '\ntook on ' + took + '.' : '') + (no ? (took ? ' ' : '\n') + 'said no to ' + no + '.' : ''), 'claude');
        W.bump(); save();
      }).catch(e => { for (const c of letters) c.status = 'posted'; console.warn('[percy] reading orders failed:', e.message); });
    }
  },
  onBedtime(day) {
    if (!canCall()) return;
    M.reflect(day).then(() => { W.bump(); save(); }).catch(e => console.warn('[percy] reflection failed:', e.message));
  },
});

function readNotes(claude) {
  const unread = S.notes.filter(n => !n.read);
  if (!unread.length) { W.log('visited the Humming Stone. no notes'); return; }
  for (const n of unread) {
    n.read = true; n.readDay = W.dayOf(S.t); S.stats.notes++; W.log('found a note at the Humming Stone'); W.contact(28); W.emo('contentment', 15); W.emo('excitement', 12);
    const done = (r, src) => {
      n.reaction = { reaction: str(r.reaction, 600) };
      if (str(r.reply, 400)) { S.percyNotes.push({ text: str(r.reply, 400), to: n.from || '', inReplyTo: n.text.slice(0, 80), day: W.dayOf(S.t) }); if (S.percyNotes.length > 60) S.percyNotes.shift(); W.log('left a note under the stone in reply'); }
      W.applyFeel(r);
      if (str(r.belief, 140)) { S.beliefs.unshift(str(r.belief, 140)); S.beliefs = S.beliefs.slice(0, 8); }
      if (str(r.remember, 220)) W.remember(r.remember, 3);
      W.addDiary('note', 'found a note under the stone' + (n.from ? ', signed ' + n.from : '') + ':\n“' + n.text + '”\n' + n.reaction.reaction, src);
    };
    const plain = { reaction: pick(['i read it three times. i don\'t know who wrote it but i\'m keeping it.', 'someone out there knows i\'m here. that\'s a lot to think about.', 'i folded it small and took it home.']), joy: 7, wonder: 8 };
    if (claude) M.reactToNote(n).then(r => done(r, 'claude')).catch(() => done(plain, 'rules'));
    else done(plain, 'rules');
  }
  W.setThought('a note! someone was here.');
}
function firstLook(th, claude) {
  th.seen = true; th.noticed = true; th.seenDay = W.dayOf(S.t); S.lastThing = th.id;
  const nm = plainName(th.name);
  const done = (r, src) => {
    W.applyFeel(r);
    W.addDiary('thing', str(r.first_sight, 600), src);
    if (str(r.question, 160)) { S.questions.unshift(str(r.question, 160)); S.questions = S.questions.slice(0, 6); }
    if (str(r.research_topic, 60)) { S.researchQueue.push({ topic: str(r.research_topic, 60), question: str(r.question, 160) }); if (S.researchQueue.length > 8) S.researchQueue.shift(); }
    takeInterests(r, th.name);
    if (str(r.remember, 220)) W.remember(r.remember, 3);
    W.bump();
  };
  const plain = { first_sight: 'there\'s a ' + nm + ' near ' + W.nearPlace(th.x, th.z) + '. it wasn\'t there before. nobody saw who brought it.', question: 'who put the ' + nm + ' here?', research_topic: nm, wonder: 10 };
  if (claude) M.reactToThing(th, th.file ? readImage(th.file) : null).then(r => done(r, 'claude')).catch(() => done(plain, 'rules'));
  else done(plain, 'rules');
}

/* ---------- deciding what to do next ---------- */
let decisionToken = 0;
function requestDecision() {
  S.deciding = true; W.bump();
  const token = ++decisionToken;
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('took too long')), 75000));
  Promise.race([M.decide(), timeout])
    .then(dec => { if (token === decisionToken && !S.act) W.startAct(dec); })
    .catch(e => { if (token === decisionToken && !S.act) { if (config.apiKey) console.warn('[percy] decision fell back to rules:', e.message); W.startAct(W.ruleDecision()); } })
    .finally(() => { if (token === decisionToken) S.deciding = false; });
}

/* ---------- the clock ---------- */
let last = Date.now(), lastSave = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = Math.min(5, (now - last) / 1000); last = now;
  W.tick(dt, requestDecision);
  const a = S.act;
  if (a && a.phase === 'do' && a.museAt && !a.mused && a.total - a.left >= a.museAt) { a.mused = true; M.muse().catch(() => {}); }
  if (now - lastSave > 30000) { lastSave = now; save(); }
}, 250);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

/* ---------- web server ---------- */
const TYPES = { '.jpg': 'image/jpeg', '.webp': 'image/webp', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const streams = new Set();
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const lastNoteBy = new Map(), lastBuyBy = new Map(), jobsBy = new Map();
function readRaw(req, limit = 65536) {
  return new Promise((resolve, reject) => { let data = ''; req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => resolve(data)); req.on('error', reject); });
}
function tokenOK(given, expected) { if (!expected || typeof given !== 'string') return false; const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(expected).digest(); return crypto.timingSafeEqual(a, b); }
// money from outside becomes coins, waiting in his shop inbox
function payIn(opts) { const r = W.receivePayment(opts); if (!r.duplicate) { save(); siteUpdate([], r.listing ? 'something sold from percy\'s shop' : 'percy got paid'); } return r; }

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); } });
  });
}
function keeperOK(key) {
  if (!config.keeperKey || typeof key !== 'string') return false;
  const a = crypto.createHash('sha256').update(key).digest(), b = crypto.createHash('sha256').update(config.keeperKey).digest();
  return crypto.timingSafeEqual(a, b);
}
const extra = () => ({ siteUrl: Pub.enabled() ? Pub.siteUrl() : '', mind: M.status(), watchers: streams.size, keeper: !!config.keeperKey, deciding: S.deciding, printShopUrl: config.printShopUrl, publicUrl: config.publicUrl, kofiUrl: config.kofiUrl, kofiOn: !!config.kofiToken, shopUrl: Pub.enabled() && S.shopPage ? Pub.siteUrl() + 'shop.html' : '' });
function live() {
  return { t: S.t, day: W.dayOf(S.t), time: W.hhmm(S.t), pos: S.pos, face: S.face, act: S.act ? { id: S.act.id, phase: S.act.phase, inside: S.act.phase === 'do' ? S.act.inside || null : null } : null,
    doing: W.doingText(), thought: S.thought, needs: S.needs, mood: W.moodWord(), coins: S.coins, weather: S.weather.kind,
    season: W.seasonOf(W.dayOf(S.t)), rev: S.rev, watchers: streams.size, deciding: S.deciding, scale: config.timeScale };
}
setInterval(() => { M.setWatchers(streams.size); W.setWatchers(streams.size); const msg = 'data: ' + JSON.stringify(live()) + '\n\n'; for (const r of streams) r.write(msg); }, 1000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/state') return send(res, 200, W.publicState(extra()));
    if (req.method === 'GET' && p === '/api/live') return send(res, 200, live());
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, day: W.dayOf(S.t), time: W.hhmm(S.t), ...M.status(), website: Pub.pubStatus, kofi: { on: !!config.kofiToken, payments: S.payments.filter(x => x.source === 'kofi').length } });
    if (req.method === 'GET' && p === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write('retry: 3000\n\n'); streams.add(res);
      req.on('close', () => streams.delete(res)); return;
    }
    if (req.method === 'POST' && p === '/api/notes') {
      const b = await readBody(req); const text = str(b.text, 1000), from = str(b.from, 30);
      if (!text) return send(res, 400, { error: 'Write something first.' });
      const ip = ipOf(req), lastAt = lastNoteBy.get(ip) || 0;
      if (Date.now() - lastAt < 90000) return send(res, 429, { error: 'One note at a time. Try again in a minute or two.' });
      if (S.notes.filter(n => !n.read).length >= 15) return send(res, 429, { error: 'The stone is full of unread notes. Try again after he visits.' });
      lastNoteBy.set(ip, Date.now());
      S.notes.unshift({ id: W.uid(), text, from, day: W.dayOf(S.t), read: false });
      if (S.notes.length > 80) S.notes.pop();
      W.bump(); save(); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/buy') {
      const b = await readBody(req); const ip = ipOf(req), lastAt = lastBuyBy.get(ip) || 0;
      if (Date.now() - lastAt < 10 * 60000) return send(res, 429, { error: 'One drawing at a time. Come back in a few minutes.' });
      const r = W.buyDrawing(String(b.id || ''));
      if (r.error) return send(res, 400, { error: r.error });
      lastBuyBy.set(ip, Date.now()); save(); siteUpdate([], 'a drawing was taken from the stall');
      return send(res, 200, { ok: true, img: '/media/drawings/' + b.id + '.svg' });
    }
    if (req.method === 'POST' && p === '/api/commissions') {
      const b = await readBody(req); const ip = ipOf(req), now = Date.now();
      const mine = (jobsBy.get(ip) || []).filter(t => now - t < 24 * 3600000);
      if (mine.length && now - mine[mine.length - 1] < 10 * 60000) return send(res, 429, { error: 'One order at a time. Try again in a few minutes.' });
      if (mine.length >= 3) return send(res, 429, { error: 'That\'s three orders today. Give him a chance to catch up.' });
      const r = W.postCommission({ text: b.text, kind: b.kind, from: b.from, offer: b.offer });
      if (r.error) return send(res, 400, { error: r.error });
      jobsBy.set(ip, mine.concat([now])); save();
      return send(res, 200, { ok: true, id: r.commission.id, code: r.commission.code });
    }
    if (req.method === 'POST' && p === '/api/kofi') {
      // Ko-fi's webhook: form data with a "data" field holding JSON (https://ko-fi.com/manage/webhooks)
      if (!config.kofiToken) return send(res, 404, { error: 'not found' });
      const raw = await readRaw(req); let d = null;
      try { const form = new URLSearchParams(raw); d = JSON.parse(form.get('data') || raw); } catch { try { d = JSON.parse(raw); } catch {} }
      if (!d || !tokenOK(d.verification_token, config.kofiToken)) return send(res, 403, { error: 'bad token' });
      const amount = Number.parseFloat(d.amount) || 0;
      if (amount > 0) {
        const r = payIn({ coins: Math.round(amount * config.coinsPerPound), from: d.from_name, message: d.message, amount: amount.toFixed(2) + ' ' + (d.currency || ''), ref: d.message_id || d.kofi_transaction_id, isPublic: d.is_public !== false, source: 'kofi' });
        console.log('[percy] ko-fi: ' + amount.toFixed(2) + ' ' + (d.currency || '') + (r.duplicate ? ' (already counted)' : ' became ' + Math.round(amount * config.coinsPerPound) + ' coins' + (r.listing ? ' for "' + r.listing.title + '"' : '')));
      }
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p.startsWith('/api/keeper/')) {
      const b = await readBody(req, 7 * 1024 * 1024);
      if (!config.keeperKey) return send(res, 403, { error: 'Keeper tools are off. Set KEEPER_KEY in the container settings to use them.' });
      if (!keeperOK(b.key)) return send(res, 403, { error: 'That keeper key is wrong.' });
      const what = p.slice('/api/keeper/'.length);
      if (what === 'check') return send(res, 200, { ok: true });
      if (what === 'make') {
        const desc = str(b.description, 200), img = b.image ? parseDataURL(b.image) : null;
        if (!desc && !img) return send(res, 400, { error: 'Describe it or add a picture.' });
        if (b.image && !img) return send(res, 400, { error: 'That picture couldn\'t be read. Try a JPEG or PNG under 4 MB.' });
        const size = Math.max(1, Math.min(8, Number(b.size) || 3));
        const x = Number(b.x), z = Number(b.z); const prob = W.spotProblem(x, z, size * 0.7); if (prob) return send(res, 400, { error: prob });
        const th = W.addThing({ name: desc || 'something from a picture', desc, x, z, size, wish: str(b.wish, 120) });
        if (img) { th.file = 'uploads/' + th.id + '.' + img.ext; writeMedia(th.file, img.buf); }
        save(); send(res, 200, { ok: true, id: th.id });
        if (!canCall()) { th.status = 'failed'; W.bump(); return; }
        M.buildModel(desc || 'the thing in this picture', img ? { mediaType: img.mediaType, data: img.data } : null, size)
          .then(m => { th.model = m.parts; if (m.name) th.name = m.name; th.status = 'ready'; })
          .catch(e => { th.status = 'failed'; console.warn('[percy] building a model failed:', e.message); })
          .finally(() => { W.bump(); save(); });
        return;
      }
      if (what === 'graffiti') {
        const img = parseDataURL(b.image); if (!img) return send(res, 400, { error: 'Draw something or add a picture first.' });
        const x = Number(b.x), y = Number(b.y), z = Number(b.z), nx = Number(b.nx), nz = Number(b.nz);
        if (![x, y, z, nx, nz].every(Number.isFinite)) return send(res, 400, { error: 'Tap a wall to paint on.' });
        const w = Math.max(0.6, Math.min(5, Number(b.w) || 2)), h = Math.max(0.4, Math.min(5, Number(b.h) || w));
        const g = { id: W.uid(), by: 'keeper', x, y, z, nx, nz, w, h, text: str(b.text, 80), where: 'near ' + W.nearPlace(x, z), day: W.dayOf(S.t), seen: false };
        g.file = 'graffiti/' + g.id + '.' + img.ext; g.img = '/media/' + g.file; writeMedia(g.file, img.buf);
        S.graffiti.push(g); W.log('new graffiti appeared ' + g.where); W.bump(); save();
        return send(res, 200, { ok: true, id: g.id });
      }
      if (what === 'stock') {
        const img = b.image ? parseDataURL(b.image) : null;
        const r = W.stockItem({ shop: b.shop, name: b.name, price: b.price, desc: b.desc });
        if (r.error) return send(res, 400, { error: r.error });
        const it = r.item;
        if (img) { it.file = 'uploads/' + it.id + '.' + img.ext; it.img = '/media/' + it.file; writeMedia(it.file, img.buf); }
        save(); send(res, 200, { ok: true, id: it.id });
        if (!canCall()) { it.status = 'failed'; return; }
        M.buildModel(it.name + (it.desc ? ', ' + it.desc : '') + ' (an item for sale in a shop window)', img ? { mediaType: img.mediaType, data: img.data } : null, 0.9)
          .then(m => { it.model = m.parts; it.status = 'ready'; })
          .catch(e => { it.status = 'failed'; console.warn('[percy] building an item failed:', e.message); })
          .finally(() => { W.bump(); save(); });
        return;
      }
      if (what === 'print-sold') { const r = W.buyDrawing(String(b.id || ''), { print: true, coins: config.printCoins }); if (r.error) return send(res, 400, { error: r.error }); save(); return send(res, 200, { ok: true }); }
      if (what === 'remove-graffiti') { S.graffiti = S.graffiti.filter(g => g.id !== b.id); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'remove-item') { S.items = S.items.filter(i => i.id !== b.id || i.sold); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'remove-thing') { S.things = S.things.filter(t => t.id !== b.id); W.log('something vanished from town'); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'give') {
        const coins = Math.round(Number(b.coins) || 0); if (coins < 1 || coins > 1000) return send(res, 400, { error: 'Between 1 and 1000 coins.' });
        payIn({ coins, from: str(b.from, 40), message: str(b.message, 500), source: 'keeper', code: str(b.code, 10) });
        return send(res, 200, { ok: true });
      }
      if (what === 'record-sale') {
        const l = S.shop.find(x => x.id === b.id && !x.sold); if (!l) return send(res, 400, { error: 'That isn\'t for sale any more.' });
        payIn({ coins: l.price, from: str(b.from, 40), message: '', code: l.code, source: 'keeper' }); return send(res, 200, { ok: true });
      }
      if (what === 'remove-commission') { S.commissions = S.commissions.filter(c => c.id !== b.id); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'remove-note') { S.notes = S.notes.filter(n => n.id !== b.id); W.bump(); save(); return send(res, 200, { ok: true }); }
      if (what === 'build') {
        const r = W.addBuilding({ kind: b.kind, name: b.name, desc: b.desc, x: Number(b.x), z: Number(b.z) });
        if (r.error) return send(res, 400, { error: r.error });
        save(); return send(res, 200, { ok: true, id: r.place.id });
      }
      if (what === 'grow') { const g = W.growTown('keeper'); save(); return send(res, 200, { ok: true, road: g.road }); }
      if (what === 'book') {
        const topic = str(b.topic, 60); if (!topic) return send(res, 400, { error: 'What is the book about?' });
        const text = String(b.text || '').slice(0, 20000).trim();
        S.researchQueue.unshift({ topic, question: '', text, given: true }); S.researchQueue = S.researchQueue.slice(0, 8);
        W.log('someone left a book about ' + topic + ' at the library'); W.bump(); save(); return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Unknown keeper action.' });
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && p.startsWith('/media/')) {
      const file = path.normalize(path.join(MEDIA, decodeURIComponent(p.slice(7))));
      if (!file.startsWith(MEDIA)) return send(res, 403, 'no', 'text/plain');
      fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'not found', 'text/plain');
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:", 'x-content-type-options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'no', 'text/plain');
      fs.readFile(file, (err, data) => {
        if (err) return send(res, 404, 'not found', 'text/plain');
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : data);
      });
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: e.message === 'too large' ? 'That was too long.' : 'Something about that request was off.' });
  }
});
server.listen(config.port, () => {
  console.log(`[percy] Mossbrook is open on port ${config.port}`);
  console.log('[percy] mind: ' + (config.apiKey ? `Claude (${config.modelThink} / ${config.modelReflect})` : 'simple rules only (no ANTHROPIC_API_KEY set)'));
  console.log('[percy] keeper tools: ' + (config.keeperKey ? 'on' : 'off (set KEEPER_KEY to turn on)'));
  console.log('[percy] website: ' + (Pub.enabled() ? 'publishing to ' + config.githubRepo : 'off (set GITHUB_TOKEN and GITHUB_REPO to turn on)'));
  console.log('[percy] ko-fi: ' + (config.kofiToken ? 'listening at /api/kofi (' + config.coinsPerPound + ' coins per pound)' : 'off (set KOFI_TOKEN to turn on)'));
  if (Pub.enabled()) Pub.queueFile('index.html', Pub.indexHTML(S), 'percy updated his index');
});
