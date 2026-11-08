// Percy's drawings, as SVG files. A shaky hand when he's anxious, brighter colours when he's happy.
import { rng } from './util.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function pen(seed, calm, joy) {
  const r = rng(seed);
  const shake = 0.6 + (100 - calm) / 100 * 3.4;
  const pal = joy > 62 ? ['#22727a', '#df8a26', '#4f8a3a', '#c7466c'] : joy < 36 ? ['#3b4250', '#5b5f78', '#6c7a6e'] : ['#2f5f66', '#8a6f2e', '#4f7a3a', '#7b5a8c'];
  const out = [];
  const api = {
    r, col: () => pal[Math.floor(r() * pal.length)],
    line(pts, c, w = 3, fill = 'none') {
      const d = pts.map((p, i) => (i ? 'L' : 'M') + (p[0] + (r() - 0.5) * shake).toFixed(1) + ' ' + (p[1] + (r() - 0.5) * shake).toFixed(1)).join(' ');
      out.push(`<path d="${d}" fill="${fill}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`);
    },
    ell(cx, cy, rx, ry, c, w = 3, fill = 'none') { const p = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } api.line(p, c, w, fill); },
    star(cx, cy, s, c) { const p = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? s * 0.45 : s; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } api.line(p, c, 2.5); },
    raw(s) { out.push(s); },
    svg: () => out.join(''),
  };
  return api;
}

const SUBJECTS = {
  moon: P => { P.ell(118, 70, 32, 32, P.col(), 3.5); P.ell(132, 62, 26, 26, '#f5f2e7', 7, '#f5f2e7'); for (let i = 0; i < 5; i++) P.star(20 + P.r() * 80, 20 + P.r() * 70, 4 + P.r() * 4, P.col()); },
  star: P => { for (let i = 0; i < 7; i++) P.star(25 + P.r() * 150, 25 + P.r() * 110, 5 + P.r() * 10, P.col()); P.line([[20, 170], [180, 168]], P.col(), 2); },
  pond: P => { P.ell(100, 130, 72, 24, P.col(), 3.5); for (let i = 0; i < 3; i++) { const y = 122 + i * 8; P.line([[60, y], [80, y - 3], [100, y], [120, y - 3], [140, y]], P.col(), 2); } for (let i = 0; i < 4; i++) { const x = 30 + i * 10; P.line([[x, 112], [x + 2, 70 + P.r() * 20]], '#4f7a3a', 2); } },
  fish: P => { for (let i = 0; i < 3; i++) { const x = 50 + P.r() * 100, y = 50 + P.r() * 100; P.line([[x - 22, y], [x - 8, y - 10], [x + 12, y - 8], [x + 22, y], [x + 12, y + 8], [x - 8, y + 10], [x - 22, y], [x - 32, y - 10], [x - 32, y + 10], [x - 22, y]], P.col(), 3); P.ell(x + 12, y - 2, 1.5, 1.5, '#222', 2.5); } },
  bread: P => { const p = []; for (let i = 0; i <= 20; i++) { const a = Math.PI + i / 20 * Math.PI; p.push([100 + Math.cos(a) * 62, 128 + Math.sin(a) * 46]); } p.push([38, 128]); P.line(p, '#a8691e', 4); for (let i = 0; i < 3; i++) P.line([[72 + i * 24, 100], [84 + i * 24, 88]], '#a8691e', 3); P.line([[30, 150], [170, 150]], P.col(), 2); },
  stone: P => { P.line([[80, 170], [70, 110], [82, 52], [100, 36], [118, 52], [128, 110], [120, 170], [80, 170]], '#555b66', 4); for (let i = 1; i <= 3; i++) P.ell(100, 100, 40 + i * 16, 60 + i * 14, P.col(), 1.2); },
  edge: P => { P.line([[10, 120], [70, 118], [100, 110], [190, 112]], '#9a8a6a', 6); for (let i = 0; i < 20; i++) { const x = 110 + P.r() * 80, y = 40 + P.r() * 120; P.ell(x, y, 6 + P.r() * 14, 3 + P.r() * 6, '#b9c0c8', 1.5); } P.ell(55, 104, 7, 10, '#222', 3); },
  book: P => { P.line([[40, 60], [100, 72], [160, 60], [160, 150], [100, 162], [40, 150], [40, 60]], P.col(), 3.5); P.line([[100, 72], [100, 162]], P.col(), 3); for (let i = 0; i < 4; i++) { P.line([[52, 82 + i * 16], [90, 90 + i * 16]], '#777', 1.5); P.line([[110, 90 + i * 16], [148, 82 + i * 16]], '#777', 1.5); } },
  self: P => { P.ell(100, 110, 44, 62, '#222', 4); P.ell(100, 122, 28, 44, '#ddd', 3); P.ell(86, 78, 5, 6, '#222', 4); P.ell(114, 78, 5, 6, '#222', 4); P.line([[92, 92], [108, 92], [100, 104], [92, 92]], '#e0952a', 3); P.line([[78, 172], [92, 176]], '#e0952a', 4); P.line([[108, 176], [122, 172]], '#e0952a', 4); },
  tree: P => { P.line([[100, 175], [100, 110]], '#7a5a3a', 5); P.ell(100, 82, 46, 38, '#4f8a3a', 4); P.line([[30, 176], [170, 176]], P.col(), 2); },
  lamp: P => { P.line([[100, 180], [100, 60]], '#555', 4); P.ell(100, 50, 14, 14, '#d9932a', 4); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P.line([[100 + Math.cos(a) * 22, 50 + Math.sin(a) * 22], [100 + Math.cos(a) * 34, 50 + Math.sin(a) * 34]], '#d9932a', 2); } },
  tower: P => { P.line([[78, 175], [84, 40], [116, 40], [122, 175]], P.col(), 4); P.ell(100, 70, 16, 16, '#333', 3); P.line([[100, 70], [100, 60]], '#333', 2); P.line([[100, 70], [108, 74]], '#333', 2); P.line([[78, 40], [100, 18], [122, 40]], P.col(), 4); },
  house: P => { P.line([[50, 170], [50, 95], [150, 95], [150, 170], [50, 170]], P.col(), 4); P.line([[40, 98], [100, 50], [160, 98]], P.col(), 4); P.line([[88, 170], [88, 130], [112, 130], [112, 170]], '#555', 3); P.line([[60, 110], [80, 110], [80, 125], [60, 125], [60, 110]], '#d9932a', 3); },
  mush: P => { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = 100 + Math.cos(a) * 55, y = 120 + Math.sin(a) * 28; P.line([[x, y], [x, y - 14]], '#ccc0a0', 3); const p = []; for (let j = 0; j <= 10; j++) { const b = Math.PI + j / 10 * Math.PI; p.push([x + Math.cos(b) * 12, y - 14 + Math.sin(b) * 10]); } P.line(p, '#c7466c', 3); } },
  box: P => { P.line([[50, 80], [140, 80], [140, 165], [50, 165], [50, 80]], P.col(), 4); P.line([[50, 80], [75, 55], [165, 55], [140, 80]], P.col(), 3); P.line([[165, 55], [165, 140], [140, 165]], P.col(), 3); },
  train: P => { P.line([[40, 140], [130, 140], [130, 95], [40, 95], [40, 140]], P.col(), 4); P.line([[130, 140], [165, 140], [165, 110], [130, 110]], P.col(), 3.5); P.line([[60, 95], [60, 70], [75, 70], [75, 95]], '#555', 3); P.ell(60, 148, 10, 10, '#333', 3); P.ell(110, 148, 10, 10, '#333', 3); P.ell(150, 148, 10, 10, '#333', 3); P.line([[15, 162], [190, 162]], '#7a5a3a', 2); },
  rain: P => { P.ell(80, 60, 36, 18, P.col(), 3); P.ell(120, 55, 40, 22, P.col(), 3); for (let i = 0; i < 16; i++) { const x = 40 + P.r() * 120, y = 90 + P.r() * 80; P.line([[x, y], [x - 4, y + 12]], '#22727a', 2); } },
  cat: P => { P.ell(100, 120, 40, 34, P.col(), 4); P.ell(100, 72, 24, 22, P.col(), 4); P.line([[80, 60], [84, 40], [94, 54]], P.col(), 3); P.line([[106, 54], [116, 40], [120, 60]], P.col(), 3); P.line([[140, 130], [170, 110], [175, 85]], P.col(), 4); P.ell(92, 70, 2, 3, '#222', 3); P.ell(108, 70, 2, 3, '#222', 3); },
  scribble: P => { for (let k = 0; k < 4; k++) { const p = []; let x = 30 + P.r() * 140, y = 30 + P.r() * 140; for (let i = 0; i < 12; i++) { x += (P.r() - 0.5) * 40; y += (P.r() - 0.5) * 40; p.push([Math.max(10, Math.min(190, x)), Math.max(10, Math.min(190, y))]); } P.line(p, P.col(), 3); } },
};
export const DOODLE_KEYS = Object.keys(SUBJECTS);
export const DOODLE_WORDS = [['moon', /moon/], ['star', /star|sky|telescope|comet|night/], ['fish', /fish|fin|eel/], ['pond', /pond|water|ripple|lily|reed|duck/], ['bread', /bread|loaf|bun|bakery|pretzel|cake/], ['stone', /stone|shrine|statue|rock|hum/], ['edge', /fog|mist|edge|wall|road|end of/], ['book', /book|library|page|read|letter|post/], ['self', /me\b|myself|penguin|self|portrait/], ['tree', /tree|blossom|leaf|forest|garden/], ['lamp', /lamp|light|lantern/], ['tower', /tower|clock|lighthouse/], ['house', /house|cottage|home|shop|street|café|cafe/], ['mush', /mushroom|toadstool/], ['box', /box|crate|parcel|phone/], ['train', /train|rail|engine|station/], ['rain', /rain|storm|cloud|weather|snow/], ['cat', /cat|kitten/]];
export function keyFor(subject) { const s = String(subject || '').toLowerCase(); const m = DOODLE_WORDS.find(([, re]) => re.test(s)); return m ? m[0] : 'scribble'; }

// A drawing on paper, signed P.
export function drawingSVG({ key, seed, calm = 60, joy = 60 }) {
  const P = pen(seed, calm, joy);
  (SUBJECTS[key] || SUBJECTS.scribble)(P);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400"><rect width="200" height="200" fill="#f5f2e7"/>${P.svg()}<text x="178" y="192" font-family="Comic Sans MS, cursive" font-size="14" fill="#6a6a6a">P.</text></svg>`;
}

// Spray-paint graffiti on a wall: a bold doodle with drips and a short tag.
export function graffitiSVG({ key, seed, tag = '' }) {
  const P = pen(seed, 40, 80);
  const paint = ['#e2384d', '#2a9df4', '#f5c518', '#2fbf71', '#a259ff', '#ff7a1a'][Math.floor(P.r() * 6)];
  const P2 = pen(seed, 40, 80);
  const orig = P2.line; P2.line = (pts, c, w = 3, fill) => orig(pts, paint, w * 2.4, fill === 'none' ? 'none' : fill);
  P2.col = () => paint;
  (SUBJECTS[key] || SUBJECTS.scribble)(P2);
  let drips = '';
  for (let i = 0; i < 6; i++) { const x = 40 + P.r() * 120, y = 120 + P.r() * 50, l = 10 + P.r() * 25; drips += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + l).toFixed(1)}" stroke="${paint}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>`; }
  const t = tag ? `<text x="100" y="196" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="${Math.max(14, 30 - tag.length)}" fill="${paint}" stroke="#111" stroke-width="1.2" transform="rotate(-4 100 190)">${esc(tag.slice(0, 24))}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 210" width="400" height="420"><g opacity="0.95">${P2.svg()}</g>${drips}${t}</svg>`;
}
