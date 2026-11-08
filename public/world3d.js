// Mossbrook in 3D. Everything is built from code: no downloaded models.
// Static parts of the town are merged by material so phones can draw it quickly.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =========================================================
   Textures, painted on canvases
   ========================================================= */
function canvasTex(w, h, draw, { repeat = [1, 1], color = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function noise(x, w, h, r, amt, n = 4000) { for (let i = 0; i < n; i++) { const v = Math.floor(200 + r() * 55 - amt * r()); x.fillStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.12})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); } }
const TEX = {};
function makeTextures() {
  const r = rng(7);
  TEX.grass = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#d9e6c8'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const g = 170 + r() * 80; x.strokeStyle = `rgba(${g - 60},${g},${g - 90},0.55)`; x.lineWidth = 1; const px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - .5) * 3, py - 3 - r() * 4); x.stroke(); } noise(x, w, h, r, 40, 1500); });
  TEX.cobble = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#6d665c'; x.fillRect(0, 0, w, h);
    const rows = 8, cs = h / rows;
    for (let row = 0; row < rows; row++) { const off = row % 2 ? cs / 2 : 0; for (let c = -1; c < w / cs + 1; c++) {
      const v = 120 + r() * 60, tint = r() * 18; const px = c * cs + off + 2, py = row * cs + 2, s = cs - 4;
      x.fillStyle = `rgb(${v + tint},${v + tint * 0.6},${v - 4})`; x.beginPath(); x.roundRect(px + r() * 2, py + r() * 2, s - r() * 3, s - r() * 3, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.roundRect(px + 3, py + 2, s - 9, 5, 3); x.fill();
    } }
  });
  TEX.cobbleBump = TEX.cobble.clone(); TEX.cobbleBump.colorSpace = THREE.NoColorSpace;
  TEX.plaster = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#f2efe8'; x.fillRect(0, 0, w, h); noise(x, w, h, r, 60, 5000); for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(120,110,90,${0.03 + r() * 0.04})`; x.beginPath(); x.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, 7); x.fill(); } });
  TEX.brick = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#d8d0c4'; x.fillRect(0, 0, w, h); const bh = 16, bw = 40; for (let row = 0; row < h / bh; row++) { const off = row % 2 ? bw / 2 : 0; for (let c = -1; c < w / bw + 1; c++) { const v = 0.82 + r() * 0.18; x.fillStyle = `rgb(${Math.floor(230 * v)},${Math.floor(225 * v)},${Math.floor(220 * v)})`; x.fillRect(c * bw + off + 1, row * bh + 1, bw - 2, bh - 2); } } noise(x, w, h, r, 40, 2000); });
  TEX.stone = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#bdbab2'; x.fillRect(0, 0, w, h); let y = 0; while (y < h) { const rh = 22 + r() * 18; let xx = -r() * 30; while (xx < w) { const bw = 30 + r() * 50, v = 205 + r() * 40; x.fillStyle = `rgb(${v},${v - 2},${v - 8})`; x.fillRect(xx + 2, y + 2, bw - 4, rh - 4); xx += bw; } y += rh; } noise(x, w, h, r, 50, 3000); });
  TEX.tiles = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#c9c4bd'; x.fillRect(0, 0, w, h); const th = 22, tw = 28; for (let row = 0; row < h / th + 1; row++) { const off = row % 2 ? tw / 2 : 0; for (let c = -1; c < w / tw + 1; c++) { const v = 0.78 + r() * 0.22; x.fillStyle = `rgb(${Math.floor(255 * v)},${Math.floor(250 * v)},${Math.floor(244 * v)})`; x.beginPath(); x.roundRect(c * tw + off + 1, row * th, tw - 2, th + 4, [0, 0, 8, 8]); x.fill(); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(c * tw + off + 1, row * th + th, tw - 2, 3); } } });
  TEX.wood = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#e8ddcc'; x.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(80,60,40,0.25)'; x.fillRect(0, i * (h / 6), w, 2); } for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(90,70,50,${r() * 0.12})`; x.fillRect(r() * w, r() * h, 12 + r() * 30, 1); } });
  TEX.hedge = canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#4c7a35'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const g = 80 + r() * 90; x.fillStyle = `rgba(${g * 0.6},${g},${g * 0.4},0.7)`; x.beginPath(); x.ellipse(r() * w, r() * h, 2 + r() * 3, 1.5 + r() * 2, r() * 3, 0, 7); x.fill(); } });
  TEX.water = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const v = 100 + r() * 100; x.strokeStyle = `rgba(${v},${v},${v},0.6)`; x.lineWidth = 2 + r() * 3; x.beginPath(); x.ellipse(r() * w, r() * h, 10 + r() * 30, 3 + r() * 6, 0, 0, 7); x.stroke(); } }, { color: false });
  TEX.fog = canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  TEX.puff = canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  TEX.glow = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 1, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,240,200,0.6)'); g.addColorStop(1, 'rgba(255,220,150,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
}
function stripes(a, b) { return canvasTex(64, 64, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * w / 8, 0, w / 8, h); } }); }
function signTex(text, { bg = '#2c3e33', fg = '#f3e6c4', font = 'Georgia, serif', w = 512, h = 128 } = {}) {
  return canvasTex(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20);
    let size = 56; x.font = `bold ${size}px ${font}`; while (x.measureText(text).width > w - 60 && size > 18) { size -= 2; x.font = `bold ${size}px ${font}`; }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 3);
  });
}

/* =========================================================
   Materials (shared, so the town can be merged per material)
   ========================================================= */
const matCache = new Map();
function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
const std = (color, opts = {}) => mat('s:' + color + JSON.stringify(Object.keys(opts).sort().map(k => [k, opts[k] && opts[k].uuid || opts[k]])), () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));
let MAT;
function makeMaterials() {
  MAT = {
    grass: new THREE.MeshStandardMaterial({ color: 0x7fae5a, map: TEX.grass, roughness: 1 }),
    hill: new THREE.MeshStandardMaterial({ color: 0x7fae5a, map: TEX.grass, roughness: 1, side: THREE.DoubleSide }),
    cobble: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TEX.cobble, bumpMap: TEX.cobbleBump, bumpScale: 1.5, roughness: 0.95 }),
    path: new THREE.MeshStandardMaterial({ color: 0xc9b38c, map: TEX.grass, roughness: 1 }),
    kerb: std(0x9b958a),
    glass: new THREE.MeshStandardMaterial({ color: 0x3a4a55, roughness: 0.15, metalness: 0.2, emissive: 0xffc46b, emissiveIntensity: 0 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd28a, emissiveIntensity: 0.2, roughness: 0.4 }),
    iron: std(0x2b2e30, { roughness: 0.6, metalness: 0.5 }),
    trunk: std(0x6b4f37),
    hedge: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TEX.hedge, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2c6670, roughness: 0.06, metalness: 0.1, bumpMap: TEX.water, bumpScale: 0.6 }),
    stoneDark: std(0x8c8a84, { map: TEX.stone }),
    wood: std(0x8a6a4a, { map: TEX.wood }),
    woodDark: std(0x4a3626, { map: TEX.wood }),
    rail: std(0x5d5a56, { roughness: 0.4, metalness: 0.7 }),
    white: std(0xf4f1ea),
    gold: std(0xc9a14a, { roughness: 0.35, metalness: 0.8 }),
  };
}
const plaster = c => std(c, { map: TEX.plaster });
const brickM = c => std(c, { map: TEX.brick });
const stoneM = c => std(c, { map: TEX.stone });
const roofM = c => std(c, { map: TEX.tiles });

/* =========================================================
   Batching: many parts become one mesh per material
   ========================================================= */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
function M4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { _e.set(rx, ry, rz); _q.setFromEuler(_e); return new THREE.Matrix4().compose(V(x, y, z), _q, _s.set(sx, sy, sz)); }
class Batch {
  constructor() { this.lists = new Map(); }
  add(geo, material, matrix, uvScale) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (uvScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]); }
    g.clearGroups(); g.applyMatrix4(matrix);
    if (!this.lists.has(material)) this.lists.set(material, []);
    this.lists.get(material).push(g);
  }
  build(group, { cast = true, receive = true } = {}) {
    const meshes = [];
    for (const [material, list] of this.lists) {
      const merged = mergeGeometries(list, false); list.forEach(g => g.dispose());
      if (!merged) continue;
      const m = new THREE.Mesh(merged, material); m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false;
      group.add(m); meshes.push(m);
    }
    this.lists.clear();
    return meshes;
  }
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sphere: new THREE.SphereGeometry(0.5, 14, 10), ico: new THREE.IcosahedronGeometry(0.5, 1), cone: new THREE.ConeGeometry(0.5, 1, 10), cone4: new THREE.ConeGeometry(0.5, 1, 4),
  plane: new THREE.PlaneGeometry(1, 1), dodec: new THREE.DodecahedronGeometry(0.5, 0),
};
// helper: put a box of size (w,h,d) at local (x,y,z) with rotation, inside building matrix B
function box(batch, B, material, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0, uv) { batch.add(G.box, material, B.clone().multiply(M4(x, y, z, rx, ry, rz, w, h, d)), uv); }
function prim(batch, B, geo, material, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) { batch.add(geo, material, B.clone().multiply(M4(x, y, z, rx, ry, rz, sx, sy, sz))); }

/* =========================================================
   Building pieces
   ========================================================= */
const WALLS = [0xf2e8d2, 0xe9d6b0, 0xf0d4c8, 0xd7e0cf, 0xd5dfe4, 0xf4f1ea, 0xe8cfa0, 0xcfd8c0];
const TRIMS = [0x3d5a40, 0x2f4e6b, 0x7b2d26, 0x5b4a3a, 0x3a3a3a, 0x8a5a2b, 0x2e6e6a];
const ROOFS = [0x9a4a32, 0x6f7377, 0x7c3b2c, 0x55626b, 0x8b5a3c, 0x5f6e4a];
const FLOWERS = [0xe0475b, 0xf2c94c, 0xf08fb5, 0x9b6bd6, 0xffffff, 0xff8a3d];

function gableRoof(batch, B, w, d, wallH, roofH, roofMat, wallMat, over = 0.45) {
  const half = d / 2 + over, slope = Math.hypot(half, roofH), ang = Math.atan2(roofH, half);
  for (const s of [1, -1]) box(batch, B, roofMat, w + over * 2, 0.16, slope, 0, wallH + roofH / 2 + 0.06, s * half / 2, 0, s * ang, 0, [w / 2.2, slope / 2.2]);
  box(batch, B, MAT.woodDark, w + over * 2, 0.14, 0.14, 0, wallH + roofH + 0.1, 0); // ridge
  // gable triangles
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -d / 2, 0, 0, d / 2, 0, roofH, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d / 2, 0, d / 4, roofH / 2], 2)); tri.computeVertexNormals();
  const triR = tri.clone(); triR.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, d / 2, 0, 0, -d / 2, 0, roofH, 0], 3)); triR.computeVertexNormals();
  batch.add(tri, wallMat, B.clone().multiply(M4(w / 2, wallH, 0)));
  batch.add(triR, wallMat, B.clone().multiply(M4(-w / 2, wallH, 0)));
}
// a window on the front face (z = d/2) of a building frame F
function windowAt(batch, F, x, y, ww, wh, trim, r, opts = {}) {
  const trimM = std(trim);
  box(batch, F, trimM, ww + 0.2, wh + 0.2, 0.1, x, y, 0.03);
  box(batch, F, MAT.glass, ww, wh, 0.06, x, y, 0.07);
  box(batch, F, trimM, 0.06, wh, 0.1, x, y, 0.09); box(batch, F, trimM, ww, 0.06, 0.1, x, y + wh * 0.1, 0.09);
  box(batch, F, MAT.white, ww + 0.36, 0.08, 0.2, x, y - wh / 2 - 0.12, 0.12);
  if (opts.shutters) for (const s of [-1, 1]) box(batch, F, std(opts.shutters, { map: TEX.wood }), ww * 0.48, wh + 0.1, 0.05, x + s * (ww * 0.74 + 0.08), y, 0.06);
  if (opts.flowers) {
    box(batch, F, MAT.wood, ww + 0.15, 0.22, 0.26, x, y - wh / 2 - 0.3, 0.2);
    for (let i = 0; i < 6; i++) prim(batch, F, G.ico, std(FLOWERS[Math.floor(r() * FLOWERS.length)]), x - ww / 2 + 0.1 + i * (ww - 0.2) / 5, y - wh / 2 - 0.12, 0.2 + (r() - 0.5) * 0.1, 0.16, 0.14, 0.16);
    for (let i = 0; i < 4; i++) prim(batch, F, G.ico, std(0x4f8a3a), x - ww / 2 + 0.15 + i * (ww - 0.3) / 3, y - wh / 2 - 0.16, 0.26, 0.2, 0.12, 0.14);
  }
}
function doorAt(batch, F, x, w, h, color, trim) {
  box(batch, F, std(trim), w + 0.24, h + 0.14, 0.1, x, h / 2, 0.03);
  box(batch, F, std(color, { map: TEX.wood }), w, h, 0.08, x, h / 2, 0.07);
  prim(batch, F, G.sphere, MAT.gold, x + w * 0.32, h * 0.48, 0.14, 0.08, 0.08, 0.08);
  box(batch, F, MAT.stoneDark, w + 0.5, 0.14, 0.5, x, 0.07, 0.3);
}
// frame for a face of a w×d building: front (+z), back, left (-x), right (+x)
function face(B, w, d, which) {
  if (which === 'front') return B.clone().multiply(M4(0, 0, d / 2));
  if (which === 'back') return B.clone().multiply(M4(0, 0, -d / 2, 0, Math.PI));
  if (which === 'left') return B.clone().multiply(M4(-w / 2, 0, 0, 0, -Math.PI / 2));
  return B.clone().multiply(M4(w / 2, 0, 0, 0, Math.PI / 2));
}
function timber(batch, F, w, h) {
  const tm = MAT.woodDark;
  box(batch, F, tm, w, 0.16, 0.08, 0, 0.08, 0.04); box(batch, F, tm, w, 0.14, 0.08, 0, h - 0.07, 0.04); box(batch, F, tm, w, 0.12, 0.08, 0, h * 0.5, 0.04);
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) box(batch, F, tm, 0.14, h, 0.08, x, h / 2, 0.04);
}

/* a cottage or house (also used for shops etc.) */
function house(batch, signs, p, opts = {}) {
  const r = rng(p.seed || 1); const w = p.w, d = p.d, h = p.h;
  const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), _q.setFromEuler(_e.set(0, p.rot, 0)).clone(), V(1, 1, 1));
  const wallC = opts.wall ?? WALLS[Math.floor(r() * WALLS.length)], trim = opts.trim ?? TRIMS[Math.floor(r() * TRIMS.length)], roofC = opts.roof ?? ROOFS[Math.floor(r() * ROOFS.length)];
  const wallMat = opts.brick ? brickM(wallC) : opts.stone ? stoneM(wallC) : plaster(wallC);
  box(batch, B, MAT.stoneDark, w + 0.2, 0.35, d + 0.2, 0, 0.17, 0, 0, 0, 0, [w / 2, 0.3]); // plinth
  box(batch, B, wallMat, w, h, d, 0, h / 2, 0, 0, 0, 0, [w / 2.5, h / 2.5]);
  const roofH = opts.roofH ?? (1.5 + r() * 0.9);
  gableRoof(batch, B, w, d, h, roofH, roofM(roofC), wallMat);
  if (!opts.noChimney) { const cx = (r() < 0.5 ? -1 : 1) * (w / 2 - 0.8); box(batch, B, brickM(0xa0614a), 0.7, roofH + 1.2, 0.7, cx, h + roofH / 2 + 0.5, -d / 6, 0, 0, 0, [0.6, 1]); box(batch, B, MAT.stoneDark, 0.85, 0.12, 0.85, cx, h + roofH + 1.12, -d / 6); for (const o of [-0.15, 0.15]) prim(batch, B, G.cyl, std(0x8a5a3c), cx + o, h + roofH + 1.3, -d / 6, 0.18, 0.3, 0.18); }
  const half = !opts.noTimber && (opts.timber ?? r() < 0.55);
  const front = face(B, w, d, 'front');
  if (half) { timber(batch, front, w, h); for (const s of ['left', 'right']) timber(batch, face(B, w, d, s), d, h); }
  const doorX = opts.doorX ?? (opts.shopfront ? -w * 0.28 : (r() - 0.5) * (w - 2.2));
  doorAt(batch, front, doorX, 0.95, 1.9, opts.door ?? trim, half ? 0x3b2a1e : 0xf4f1ea);
  const flowers = opts.flowers ?? r() < 0.6, shutters = r() < 0.4 ? TRIMS[Math.floor(r() * TRIMS.length)] : null;
  if (opts.shopfront) {
    // big display window + striped awning + name sign
    const sx = w * 0.18, sw = w * 0.5;
    windowAt(batch, front, sx, 1.35, sw, 1.35, trim, r, {});
    const aw = stripes(opts.awning?.[0] || '#2f6e6a', opts.awning?.[1] || '#f4f1ea');
    const awM = new THREE.MeshStandardMaterial({ map: aw, roughness: 0.8, side: THREE.DoubleSide });
    batch.add(G.box, awM, front.clone().multiply(M4(0, h * 0.78, 0.55, 0.45, 0, 0, w * 0.92, 0.06, 1.25)), [w / 1.5, 1]);
    signs.push({ text: p.name, F: front, x: 0, y: h * 0.93 + 0.05, w: Math.min(w * 0.85, 4.6), h: 0.62, bg: opts.signBg || '#2c3e33' });
  } else {
    const n = Math.max(1, Math.floor((w - 1.6) / 1.9));
    for (let i = 0; i < n; i++) { const x = -w / 2 + (i + 0.5) * (w / n); if (Math.abs(x - doorX) < 1.1) continue; windowAt(batch, front, x, h * 0.42 + 0.3, 0.9, 1.0, trim, r, { flowers, shutters }); }
  }
  if (h > 3.3 && !opts.shopfront) { const n = Math.max(1, Math.floor((w - 1.4) / 1.9)); for (let i = 0; i < n; i++) windowAt(batch, front, -w / 2 + (i + 0.5) * (w / n), h * 0.82, 0.8, 0.7, trim, r, { shutters }); }
  for (const s of ['left', 'right']) windowAt(batch, face(B, w, d, s), (r() - 0.5) * (d - 2), h * 0.5, 0.8, 0.9, trim, r, {});
  windowAt(batch, face(B, w, d, 'back'), 0, h * 0.5, 0.9, 0.9, trim, r, {});
  // little front garden for houses: picket fence or hedge
  if (opts.garden !== false && !opts.shopfront && r() < 0.7) {
    const fz = d / 2 + 1.7, useHedge = r() < 0.4;
    for (const side of [-1, 1]) {
      const len = (w / 2 - 0.9), cx = side * (w / 2 - len / 2 + 0.1);
      if (useHedge) box(batch, B, MAT.hedge, len, 0.8, 0.5, cx, 0.4, fz);
      else { box(batch, B, MAT.white, len, 0.08, 0.06, cx, 0.6, fz); box(batch, B, MAT.white, len, 0.08, 0.06, cx, 0.3, fz); for (let k = 0; k <= len / 0.28; k++) box(batch, B, MAT.white, 0.1, 0.9, 0.05, cx - len / 2 + k * 0.28, 0.45, fz); }
      for (let k = 0; k < 4; k++) prim(batch, B, G.ico, std(FLOWERS[Math.floor(r() * FLOWERS.length)]), cx + (r() - 0.5) * len, 0.2, d / 2 + 0.9 + r() * 0.5, 0.3, 0.25, 0.3);
    }
  }
  return { B, front };
}

/* special buildings */
function library(batch, signs, p, o = {}) {
  const r = rng(p.seed); const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
  const w = p.w, d = p.d, h = p.h, wm = stoneM(o.wall || 0xd9d2c3);
  box(batch, B, MAT.stoneDark, w + 0.4, 0.5, d + 0.4, 0, 0.25, 0);
  box(batch, B, wm, w, h, d, 0, h / 2 + 0.5, 0, 0, 0, 0, [w / 3, h / 3]);
  box(batch, B, stoneM(0xc8c0b0), w + 0.6, 0.4, d + 0.6, 0, h + 0.7, 0);
  gableRoof(batch, B, w, d, h + 0.9, 1.4, roofM(o.roof || 0x5f6a72), wm, 0.3);
  const F = face(B, w, d, 'front');
  for (let i = 0; i < 3; i++) box(batch, F, MAT.stoneDark, w * 0.6 - i * 0.4, 0.18, 0.5 + (2 - i) * 0.4, 0, 0.09 + i * 0.18, 0.25 + (2 - i) * 0.2);
  for (let i = 0; i < 4; i++) { const x = -w * 0.33 + i * w * 0.22; prim(batch, F, G.cyl, MAT.white, x, h / 2 + 0.5, 1.0, 0.45, h, 0.45); box(batch, F, MAT.white, 0.7, 0.2, 0.7, x, h + 0.42, 1.0); }
  box(batch, F, stoneM(0xd9d2c3), w * 0.8, 0.5, 1.4, 0, h + 0.75, 0.75);
  doorAt(batch, F, 0, 1.4, 2.6, 0x4a2e1e, 0xd9d2c3);
  for (const x of [-w * 0.35, w * 0.35]) windowAt(batch, F, x, h * 0.55 + 0.5, 1.0, 1.8, 0x3a3a3a, r);
  for (const s of ['left', 'right']) for (const x of [-1.5, 1.5]) windowAt(batch, face(B, w, d, s), x, h * 0.55 + 0.5, 0.9, 1.6, 0x3a3a3a, r);
  signs.push({ text: o.sign || p.name.replace(/^the /i, '').toUpperCase(), F, x: 0, y: h + 0.75, z: 1.46, w: w * 0.6, h: 0.42, bg: '#d9d2c3', fg: '#3a3530' });
}
const placeB = p => new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
function schoolhouse(batch, signs, p) {
  const r = rng(p.seed), B = placeB(p), w = p.w, d = p.d, h = 4.2, wm = brickM(0xb76e52), trim = 0xf4f1ea;
  box(batch, B, MAT.stoneDark, w + 0.3, 0.4, d + 0.3, 0, 0.2, 0);
  box(batch, B, wm, w, h, d, 0, h / 2, 0, 0, 0, 0, [w / 2.5, h / 2.5]);
  gableRoof(batch, B, w, d, h, 2.0, roofM(0x55626b), wm, 0.4);
  // bell cupola on the ridge
  box(batch, B, MAT.white, 1.1, 1.0, 1.1, 0, h + 2.4, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(batch, B, MAT.white, 0.14, 0.9, 0.14, x * 0.5, h + 3.3, z * 0.5);
  prim(batch, B, G.cone4, roofM(0x55626b), 0, h + 4.1, 0, 1.7, 0.9, 1.7, Math.PI / 4); prim(batch, B, G.sphere, MAT.gold, 0, h + 3.25, 0, 0.42, 0.5, 0.42);
  const F = face(B, w, d, 'front');
  // tall school windows either side of a double door
  for (const x of [-w * 0.33, w * 0.33]) windowAt(batch, F, x, h * 0.5, 1.1, 2.0, trim, r);
  doorAt(batch, F, -0.5, 0.95, 2.2, 0x2f4e6b, trim); doorAt(batch, F, 0.5, 0.95, 2.2, 0x2f4e6b, trim);
  for (const s of ['left', 'right']) for (const x of [-d * 0.25, d * 0.25]) windowAt(batch, face(B, w, d, s), x, h * 0.5, 1.0, 2.0, trim, r);
  signs.push({ text: p.name.replace(/^the /i, '').toUpperCase(), F, x: 0, y: h - 0.55, w: Math.min(w * 0.7, 4.6), h: 0.5, bg: '#f4f1ea', fg: '#7b2d26' });
  // railings and a little yard
  for (let k = -5; k <= 5; k++) box(batch, B, MAT.iron, 0.05, 1.0, 0.05, k * w / 11, 0.5, d / 2 + 1.6);
  box(batch, B, MAT.iron, w, 0.06, 0.06, 0, 0.95, d / 2 + 1.6);
}
function workshop(batch, signs, p) {
  const B = placeB(p), w = p.w, d = p.d, h = 4, wm = brickM(0x9a8f84), tin = std(0x7d8a8f, { metalness: 0.5, roughness: 0.45 });
  box(batch, B, wm, w, h, d, 0, h / 2, 0, 0, 0, 0, [w / 2.5, h / 2.5]);
  gableRoof(batch, B, w, d, h, 1.4, tin, wm, 0.35);
  const F = face(B, w, d, 'front');
  for (const s of [-1, 1]) { box(batch, F, std(0x3d5a40, { map: TEX.wood }), 1.3, 2.9, 0.1, s * 0.66, 1.45, 0.06); box(batch, F, MAT.woodDark, 0.08, 2.9, 0.12, s * 0.66, 1.45, 0.1, 0, 0, s * 0.42); }
  for (const x of [-w * 0.36, w * 0.36]) windowAt(batch, F, x, 2.4, 0.9, 0.9, 0x3a3a3a, rng(p.seed));
  for (const x of [-w * 0.25, w * 0.25]) box(batch, B, MAT.glass, 1.0, 0.06, 1.2, x, h + 0.75, d * 0.18, 0, -0.5);
  box(batch, B, MAT.wood, 1.2, 0.5, 0.8, w / 2 + 0.9, 0.25, d / 4); for (let i = 0; i < 3; i++) prim(batch, B, G.cyl, std(0x6b4f37), w / 2 + 0.6 + i * 0.3, 0.7, d / 4, 0.25, 0.4, 0.25);
  signs.push({ text: p.name.replace(/^(a|the) /i, ''), F, x: 0, y: h - 0.4, w: Math.min(w * 0.8, 4.6), h: 0.5, bg: '#3a3a3a', fg: '#f2c94c' });
}
function windmill(batch, signs, p) {
  const B = placeB(p);
  prim(batch, B, new THREE.CylinderGeometry(1.5, 2.4, 9, 12), plaster(0xf2ede2), 0, 4.5, 0, 1, 1, 1);
  prim(batch, B, G.cone, roofM(0x5f4a3a), 0, 10, 0, 3.4, 2.2, 3.4);
  const S = B.clone().multiply(M4(0, 8.4, 1.7, 0, 0, Math.PI / 8));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; box(batch, S, MAT.wood, 0.5, 4.2, 0.08, Math.sin(a) * 2.2, Math.cos(a) * 2.2, 0, 0, 0, -a); }
  prim(batch, B, G.cyl, MAT.woodDark, 0, 8.4, 1.5, 0.3, 0.6, 0.3, 0, Math.PI / 2);
  doorAt(batch, face(B, 4, 4.4, 'front'), 0, 0.9, 1.9, 0x5f4a3a, 0xf2ede2);
}
function waterTower(batch, signs, p) {
  const B = placeB(p);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prim(batch, B, G.cyl6, MAT.iron, x * 1.4, 4, z * 1.4, 0.22, 8, 0.22);
  prim(batch, B, new THREE.CylinderGeometry(2.3, 2.3, 3, 20), std(0x8a5a3c, { map: TEX.wood }), 0, 9.5, 0, 1, 1, 1);
  prim(batch, B, G.cone, std(0x55626b, { metalness: 0.4 }), 0, 11.6, 0, 5, 1.2, 5);
  for (const y of [8.5, 10.5]) prim(batch, B, new THREE.TorusGeometry(2.32, 0.06, 6, 30), MAT.iron, 0, y, 0, 1, 1, 1, 0, Math.PI / 2);
}
function tower(batch, signs, p, clocks) {
  const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
  const w = 3.6, h = p.h, sm = stoneM(0xcfc6b4);
  box(batch, B, MAT.stoneDark, w + 0.6, 0.6, w + 0.6, 0, 0.3, 0);
  box(batch, B, sm, w, h, w, 0, h / 2, 0, 0, 0, 0, [1.5, h / 2.5]);
  for (let i = 1; i < 4; i++) box(batch, B, stoneM(0xb8ae9a), w + 0.2, 0.2, w + 0.2, 0, h * i / 4, 0);
  box(batch, B, sm, w + 0.4, 0.4, w + 0.4, 0, h + 0.2, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(batch, B, sm, 0.5, 2.2, 0.5, x * (w / 2 - 0.25), h + 1.5, z * (w / 2 - 0.25));
  prim(batch, B, G.cone4, roofM(0x55626b), 0, h + 3.8, 0, w * 1.45, 2.8, w * 1.45, Math.PI / 4);
  prim(batch, B, G.cyl, MAT.gold, 0, h + 5.6, 0, 0.06, 1.2, 0.06);
  box(batch, B, MAT.gold, 0.9, 0.3, 0.04, 0.25, h + 6.0, 0);
  const F = face(B, w, w, 'front'); doorAt(batch, F, 0, 1.1, 2.3, 0x4a2e1e, 0xcfc6b4);
  for (const s of ['front', 'back', 'left', 'right']) clocks.push({ F: face(B, w, w, s), y: h * 0.82 });
}
function station(batch, signs, p) {
  const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
  const w = p.w, d = p.d;
  box(batch, B, stoneM(0xc9c2b5), w, 0.8, d, 0, 0.4, 0, 0, 0, 0, [w / 2, 1]);
  box(batch, B, std(0xf2e6a0), w, 0.05, 0.4, 0, 0.82, -d / 2 + 0.2); // yellow line
  const bw = 5, bd = 2.6, bh = 3;
  box(batch, B, brickM(0xb5634b), bw, bh, bd, 1.5, 0.8 + bh / 2, d / 2 - bd / 2 - 0.1, 0, 0, 0, [2, 1.2]);
  gableRoof(batch, B.clone().multiply(M4(1.5, 0.8, d / 2 - bd / 2 - 0.1)), bw, bd, bh, 1.1, roofM(0x55626b), brickM(0xb5634b), 0.3);
  const F = B.clone().multiply(M4(1.5, 0.8, d / 2 - 0.1));
  doorAt(batch, F, -1, 0.95, 2.0, 0x2f4e6b, 0xf4f1ea); windowAt(batch, F, 1, 1.5, 1.1, 1.0, 0x2f4e6b, rng(3));
  // canopy over the platform
  for (let i = 0; i < 4; i++) prim(batch, B, G.cyl, MAT.iron, -w / 2 + 1.2 + i * 2.2, 2.3, -0.4, 0.14, 3, 0.14);
  box(batch, B, std(0x2f4e6b), 8, 0.14, 2.6, -w / 2 + 4.5, 3.85, -0.4, 0, 0.12);
  box(batch, B, MAT.wood, 1.8, 0.1, 0.5, -3, 1.3, -0.8); for (const x of [-3.7, -2.3]) box(batch, B, MAT.iron, 0.1, 0.5, 0.4, x, 1.05, -0.8);
  signs.push({ text: 'MOSSBROOK', F: B.clone().multiply(M4(-w / 2 + 4.5, 0, -0.4)), x: 0, y: 3.35, z: 0, w: 3.4, h: 0.55, bg: '#2f4e6b', fg: '#f4f1ea', both: true });
  // the railway, running off into the fog both ways
  // which way along the platform leads out of town?
  const ax = Math.cos(p.rot), az = -Math.sin(p.rot); const out = (p.x * ax + p.z * az) >= 0 ? 1 : -1;
  const T = B.clone().multiply(M4(0, 0, -d / 2 - 1.8));
  const start = -out * (w / 2 + 1), len = 70, mid = start + out * len / 2;
  for (const s of [-0.72, 0.72]) box(batch, T, MAT.rail, len, 0.14, 0.1, mid, 0.22, s);
  for (let i = 0; i <= len; i += 1.05) box(batch, T, MAT.woodDark, 0.3, 0.12, 2.1, start + out * i, 0.08, 0);
  box(batch, T, std(0x9c8f7a), len, 0.1, 3.0, mid, 0.03, 0);
  box(batch, T, std(0x7b2d26), 0.4, 0.9, 2.2, start - out * 0.2, 0.45, 0); // buffer stop
}
function green(batch, p, extras) {
  const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
  const r = rng(p.seed);
  const pr = Math.min(p.w, p.d) * 0.32;
  extras.pond = { x: p.x, z: p.z, r: pr };
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; prim(batch, B, G.dodec, MAT.stoneDark, Math.cos(a) * (pr + 0.2), 0.08, Math.sin(a) * (pr + 0.2), 0.5 + r() * 0.3, 0.3, 0.45 + r() * 0.3, r() * 3); }
  for (let i = 0; i < 14; i++) { const a = Math.PI * 0.8 + i * 0.09; prim(batch, B, G.cyl6, std(0x6c8f3a), Math.cos(a) * (pr - 0.2), 0.6, Math.sin(a) * (pr - 0.2), 0.05, 1.2 + r() * 0.6, 0.05); }
  for (let i = 0; i < 5; i++) { const a = r() * 6.28, rr = r() * pr * 0.7; prim(batch, B, G.cyl, std(0x5d9a4a), Math.cos(a) * rr, 0.06, Math.sin(a) * rr, 0.6, 0.03, 0.6); }
  const bz = pr + 1.6; box(batch, B, MAT.wood, 1.8, 0.1, 0.5, 0, 0.5, bz); box(batch, B, MAT.wood, 1.8, 0.5, 0.08, 0, 0.8, bz + 0.25); for (const x of [-0.75, 0.75]) box(batch, B, MAT.iron, 0.08, 0.5, 0.45, x, 0.25, bz);
  for (let i = 0; i < 40; i++) { const a = r() * 6.28, rr = pr + 1.2 + r() * 2.5; prim(batch, B, G.ico, std(FLOWERS[Math.floor(r() * FLOWERS.length)]), Math.cos(a) * rr, 0.12, Math.sin(a) * rr, 0.22, 0.2, 0.22); }
}
function lookout(batch, p) {
  const prof = []; for (let i = 0; i <= 16; i++) { const t = i / 16; prof.push(new THREE.Vector2(6.5 * (1 - t) + 0.01, 3 * Math.pow(Math.sin(t * Math.PI / 2), 1.4))); }
  const hill = new THREE.LatheGeometry(prof, 28);
  batch.add(hill, MAT.hill, M4(p.x, 0, p.z), [6, 6]);
  box(batch, M4(p.x, 3, p.z), MAT.wood, 1.8, 0.1, 0.5, 0, 0.45, 0.6); box(batch, M4(p.x, 3, p.z), MAT.wood, 1.8, 0.5, 0.08, 0, 0.75, 0.9);
  const r = rng(p.seed); for (let i = 0; i < 6; i++) { const a = r() * 6.28, rr = 3 + r() * 3; prim(batch, M4(p.x, 0, p.z), G.dodec, MAT.stoneDark, Math.cos(a) * rr, 3 * (1 - rr / 6.5) * 0.9, Math.sin(a) * rr, 0.6 + r() * 0.5, 0.4, 0.5); }
}
function stone(batch, p, extras) {
  const B = M4(p.x, 0, p.z);
  const g = new THREE.DodecahedronGeometry(1, 1); const pos = g.attributes.position, r = rng(p.seed);
  for (let i = 0; i < pos.count; i++) { const f = 0.85 + r() * 0.3; pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f); }
  g.computeVertexNormals();
  batch.add(g, stoneM(0x8f938f), B.clone().multiply(M4(0, 2.1, 0, 0.05, 0.4, 0.04, 0.85, 2.3, 0.6)));
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; prim(batch, B, G.dodec, MAT.stoneDark, Math.cos(a) * 2.4, 0.2, Math.sin(a) * 2.4, 0.6, 0.5, 0.6, a); }
  extras.stone = { x: p.x, z: p.z };
}
function market(batch, signs, p) {
  const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
  const r = rng(p.seed);
  for (const [x, z] of [[-1.7, -1], [1.7, -1], [-1.7, 1], [1.7, 1]]) box(batch, B, MAT.wood, 0.14, 2.6, 0.14, x, 1.3, z);
  const awM = new THREE.MeshStandardMaterial({ map: stripes('#c0392b', '#f4f1ea'), roughness: 0.8 });
  box(batch, B, awM, 3.8, 0.08, 2.6, 0, 2.65, 0, 0, -0.12, 0, [3, 1]);
  box(batch, B, MAT.wood, 3.4, 0.9, 1.1, 0, 0.45, 0.6, 0, 0, 0, [2, 1]);
  box(batch, B, MAT.wood, 3.6, 0.08, 1.3, 0, 0.92, 0.6);
  for (let i = 0; i < 3; i++) { box(batch, B, MAT.wood, 0.8, 0.35, 0.6, -1.1 + i * 1.1, 1.13, 0.4); }
  prim(batch, B, G.cyl, std(0x8a8f94, { metalness: 0.7, roughness: 0.35 }), 1.45, 1.04, 0.95, 0.24, 0.24, 0.24); // the honesty tin
  signs.push({ text: 'honesty tin', F: B, x: 0, y: 2.1, z: 1.25, w: 1.8, h: 0.4, bg: '#f4f1ea', fg: '#7b2d26', font: 'cursive' });
}
function garden(batch, p) {
  const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1));
  const r = rng(p.seed), w = p.w, d = p.d;
  box(batch, B, MAT.hedge, w, 1.1, 0.6, 0, 0.55, -d / 2); for (const s of [-1, 1]) box(batch, B, MAT.hedge, 0.6, 1.1, d, s * w / 2, 0.55, 0);
  for (const s of [-1, 1]) box(batch, B, MAT.hedge, w / 2 - 1, 1.1, 0.6, s * (w / 4 + 0.5), 0.55, d / 2);
  for (let i = 0; i < 4; i++) { const bx = (i % 2 ? 1 : -1) * w * 0.22, bz = (i < 2 ? 1 : -1) * d * 0.2; box(batch, B, std(0x6b4f37), w * 0.3, 0.25, d * 0.25, bx, 0.12, bz); for (let k = 0; k < 14; k++) prim(batch, B, G.ico, std(FLOWERS[Math.floor(r() * FLOWERS.length)]), bx + (r() - 0.5) * w * 0.28, 0.35, bz + (r() - 0.5) * d * 0.22, 0.25, 0.22, 0.25); }
  prim(batch, B, G.cyl, MAT.stoneDark, 0, 0.5, 0, 0.5, 1, 0.5); box(batch, B, MAT.gold, 0.05, 0.4, 0.5, 0, 1.15, 0);
}

/* =========================================================
   Percy the penguin
   ========================================================= */
function makePenguin() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const black = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf29a2e, roughness: 0.45 });
  const mesh = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; body.add(o); return o; };
  mesh(new THREE.SphereGeometry(0.42, 28, 22), black, 0, 0.5, 0, 1, 1.18, 0.92);            // body
  mesh(new THREE.SphereGeometry(0.34, 24, 18), white, 0, 0.45, 0.13, 0.95, 1.2, 0.8);       // belly
  mesh(new THREE.SphereGeometry(0.3, 28, 22), black, 0, 1.05, 0.02);                        // head
  mesh(new THREE.SphereGeometry(0.22, 22, 16), white, 0, 1.02, 0.13, 1.05, 0.95, 0.75);     // white face
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.058, 14, 10), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.15 }), s * 0.1, 1.08, 0.27); eyes.push(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(s * 0.1 + 0.018, 1.105, 0.322); body.add(hl); eyes.push(hl);
    mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf2a1a8, roughness: 0.8 }), s * 0.17, 0.98, 0.24, 1, 0.6, 0.4); // rosy cheeks
  }
  const beak = mesh(new THREE.ConeGeometry(0.065, 0.2, 12), orange, 0, 1.0, 0.36); beak.rotation.x = Math.PI / 2;
  const flippers = [];
  for (const s of [-1, 1]) { const f = new THREE.Group(); f.position.set(s * 0.38, 0.78, 0); const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), black); m.scale.set(0.24, 1.3, 0.6); m.position.y = -0.24; m.castShadow = true; f.add(m); f.rotation.z = s * 0.2; body.add(f); flippers.push(f); }
  const feet = [];
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), orange); f.scale.set(1, 0.32, 1.5); f.position.set(s * 0.14, 0.03, 0.14); f.castShadow = true; g.add(f); feet.push(f); }
  const scarfM = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.9 });
  const scarf = mesh(new THREE.TorusGeometry(0.29, 0.065, 10, 24), scarfM, 0, 0.8, 0.0, 1, 1, 0.92); scarf.rotation.x = Math.PI / 2;
  const tail = mesh(new THREE.BoxGeometry(0.15, 0.3, 0.05), scarfM, 0.17, 0.62, 0.32); tail.rotation.z = -0.25;
  g.userData = { body, flippers, feet, eyes, scarf };
  return g;
}

/* =========================================================
   Things the keeper makes: parts → mesh
   ========================================================= */
const PART_GEOS = {
  box: s => new THREE.BoxGeometry(s[0] || 1, s[1] || 1, s[2] || 1),
  sphere: s => new THREE.SphereGeometry(s[0] || 0.5, 18, 14),
  cylinder: s => new THREE.CylinderGeometry(s[0] ?? 0.5, s[2] ?? s[0] ?? 0.5, s[1] || 1, 18),
  cone: s => new THREE.ConeGeometry(s[0] || 0.5, s[1] || 1, 18),
  torus: s => new THREE.TorusGeometry(s[0] || 0.5, s[1] || 0.15, 10, 24),
  capsule: s => new THREE.CapsuleGeometry(s[0] || 0.3, s[1] || 0.6, 6, 12),
};
function finishMat(color, finish) {
  return mat('part:' + color + finish, () => {
    if (finish === 'metal') return new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.3 });
    if (finish === 'shiny') return new THREE.MeshStandardMaterial({ color, roughness: 0.22 });
    if (finish === 'glass') return new THREE.MeshStandardMaterial({ color, roughness: 0.05, transparent: true, opacity: 0.45 });
    if (finish === 'glow') return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  });
}
function buildModel(parts) {
  const g = new THREE.Group(); const d = Math.PI / 180;
  for (const p of parts) {
    const geo = (PART_GEOS[p.shape] || PART_GEOS.box)(p.size || [1]);
    const m = new THREE.Mesh(geo, finishMat(p.color || '#999999', p.finish));
    m.position.set(...p.pos); m.rotation.set(p.rot[0] * d, p.rot[1] * d, p.rot[2] * d); if (p.scale) m.scale.set(...p.scale);
    m.castShadow = m.receiveShadow = true; g.add(m);
  }
  // sit it on the ground
  const bb = new THREE.Box3().setFromObject(g); if (Number.isFinite(bb.min.y)) g.position.y -= bb.min.y;
  const wrap = new THREE.Group(); wrap.add(g); return wrap;
}
function placeholder(failed) {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: failed ? 0x9a7650 : 0xd8e8ff, map: failed ? TEX.wood : null, transparent: !failed, opacity: failed ? 1 : 0.45, emissive: failed ? 0 : 0x88aaff, emissiveIntensity: failed ? 0 : 0.6 }));
  crate.position.y = 0.55; crate.castShadow = true; g.add(crate); g.userData.spin = !failed ? crate : null; return g;
}

/* =========================================================
   The world
   ========================================================= */
export function createWorld({ canvas, stage, onTap }) {
  makeTextures(); makeMaterials();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xcfdde6, 0.006);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);

  // sky, sun and moon
  const sky = new Sky(); sky.scale.setScalar(1200); scene.add(sky);
  const su = sky.material.uniforms; su.turbidity.value = 4; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5b6b45, 1.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3); sun.castShadow = true;
  const SH = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(SH, SH);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 260 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const starsGeo = new THREE.BufferGeometry(); { const v = [], r = rng(11); for (let i = 0; i < 1400; i++) { const u = r() * 6.283, h = 0.08 + r() * 0.92; const rr = Math.sqrt(1 - h * h); v.push(Math.cos(u) * rr * 900, h * 900, Math.sin(u) * rr * 900); } starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); }
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starsGeo, starMat));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf3efdc, fog: false, transparent: true, opacity: 0 })); scene.add(moon);

  // environment reflections from the sky (refreshed every so often)
  const pmrem = new THREE.PMREMGenerator(renderer); const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000); envScene.add(envSky); let envRT = null, envAt = -1;
  function refreshEnv(sunDir) {
    const u = envSky.material.uniforms; for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) u[k].value = su[k].value; u.sunPosition.value.copy(sunDir);
    const rt = pmrem.fromScene(envScene, 0.04); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture;
  }

  // ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), MAT.grass); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; MAT.grass.map.repeat.set(160, 160); scene.add(ground);

  // post-processing (desktop): a soft glow on lamps and windows at night
  let composer = null, bloom = null;
  if (!MOBILE) { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.92); composer.addPass(bloom); composer.addPass(new OutputPass()); }

  // groups that get rebuilt when the town changes
  const townGroup = new THREE.Group(), thingGroup = new THREE.Group(), graffitiGroup = new THREE.Group(), itemGroup = new THREE.Group(), boardGroup = new THREE.Group();
  scene.add(townGroup, thingGroup, graffitiGroup, itemGroup, boardGroup);
  let wallMeshes = [], clockFaces = [], lampSpots = [], fogParts = null, pondMesh = null, stoneFx = null, extras = {}, townR = 50, placesById = {}, labelsData = [];
  const lampLights = []; for (let i = 0; i < (MOBILE ? 3 : 6); i++) { const l = new THREE.PointLight(0xffc77a, 0, 16, 2); scene.add(l); lampLights.push(l); }

  // Percy
  const percy = makePenguin(); percy.scale.setScalar(1.0); scene.add(percy);
  const percyPos = { x: 0, z: 0, init: false }; let percyFace = 0;
  const easel = new THREE.Group(); { const m = std(0x8a6a4a); const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.06), m); l.position.y = 0.75; l.rotation.x = 0.12; easel.add(l); const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.04), MAT.white); c.position.set(0, 1.1, 0.12); easel.add(c); } easel.visible = false; scene.add(easel);
  const spray = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8), std(0xe2384d, { metalness: 0.6 })); spray.visible = false; scene.add(spray);

  // the visitor's wisp (explore mode)
  const wisp = new THREE.Group(); { const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe6ff, emissiveIntensity: 2.5 })); wisp.add(core); const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xbfe6ff, transparent: true, depthWrite: false, opacity: 0.8 })); halo.scale.setScalar(1.6); wisp.add(halo); const wl = new THREE.PointLight(0xbfe6ff, 4, 8, 2); wisp.add(wl); }
  wisp.visible = false; scene.add(wisp);
  const walker = { x: 0, z: 6, bob: 0 };

  // rain & snow
  const PN = MOBILE ? 1200 : 3000, pGeo = new THREE.BufferGeometry(), pArr = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) { pArr[i * 3] = (Math.random() - 0.5) * 70; pArr[i * 3 + 1] = Math.random() * 35; pArr[i * 3 + 2] = (Math.random() - 0.5) * 70; }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xd6e6f5, size: 0.12, transparent: true, opacity: 0, depthWrite: false }); const precip = new THREE.Points(pGeo, pMat); precip.frustumCulled = false; scene.add(precip);
  // fireflies over the green on summer nights
  const FF = 60, ffGeo = new THREE.BufferGeometry(), ffArr = new Float32Array(FF * 3); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffArr, 3));
  const ffMat = new THREE.PointsMaterial({ color: 0xfff0a0, size: 0.25, map: TEX.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); const fireflies = new THREE.Points(ffGeo, ffMat); fireflies.frustumCulled = false; scene.add(fireflies);
  const ffSeed = Array.from({ length: FF }, () => [Math.random() * 6.28, Math.random(), Math.random() * 6.28]);

  /* ---------- building the town from server data ---------- */
  let townVer = -1;
  function buildTown(town, season) {
    townVer = town.ver; townR = town.R;
    for (const c of [...townGroup.children]) { townGroup.remove(c); c.geometry && c.geometry.dispose(); }
    wallMeshes = []; clockFaces = []; lampSpots = []; extras = {}; placesById = {}; labelsData = [];
    const batch = new Batch(), signs = [], clocks = [], nodes = town.nodes;
    // roads
    const roadW = 3.4;
    for (const e of town.edges) {
      const A = nodes[e.a], Bn = nodes[e.b]; const L = Math.hypot(Bn.x - A.x, Bn.z - A.z), ang = Math.atan2(Bn.x - A.x, Bn.z - A.z);
      const w = e.path ? 1.4 : roadW, m = e.path ? MAT.path : MAT.cobble;
      batch.add(G.box, m, M4((A.x + Bn.x) / 2, 0.02, (A.z + Bn.z) / 2, 0, ang, 0, w, 0.06, L + (e.path ? 0 : 0.6)), [w / 2.5, L / 2.5]);
      if (!e.path) for (const s of [-1, 1]) batch.add(G.box, MAT.kerb, M4((A.x + Bn.x) / 2 + Math.cos(ang) * s * (w / 2 + 0.12), 0.06, (A.z + Bn.z) / 2 - Math.sin(ang) * s * (w / 2 + 0.12), 0, ang, 0, 0.24, 0.14, L - 2.6));
      // lamps along the way
      if (!e.path) for (let t = 6; t < L - 3; t += 15) {
        const s = (Math.floor(t / 15) % 2) ? 1 : -1; const lx = A.x + (Bn.x - A.x) * t / L + Math.cos(ang) * s * (w / 2 + 0.7), lz = A.z + (Bn.z - A.z) * t / L - Math.sin(ang) * s * (w / 2 + 0.7);
        lampSpots.push({ x: lx, z: lz });
        batch.add(G.cyl6, MAT.iron, M4(lx, 1.6, lz, 0, 0, 0, 0.14, 3.2, 0.14)); batch.add(G.cyl6, MAT.iron, M4(lx, 0.15, lz, 0, 0, 0, 0.32, 0.3, 0.32));
        batch.add(G.cone4, MAT.iron, M4(lx, 3.65, lz, 0, Math.PI / 4, 0, 0.55, 0.3, 0.55)); batch.add(G.box, MAT.lampGlass, M4(lx, 3.35, lz, 0, 0, 0, 0.32, 0.4, 0.32));
      }
    }
    // roads running into the fog at their ends
    const deg = {}; for (const e of town.edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
    for (const e of town.edges) { if (e.path) continue; for (const [end, other] of [[e.a, e.b], [e.b, e.a]]) { if (deg[end] !== 1) continue; const A = nodes[end], O = nodes[other]; const ang = Math.atan2(A.x - O.x, A.z - O.z); batch.add(G.box, MAT.cobble, M4(A.x + Math.sin(ang) * 20, 0.02, A.z + Math.cos(ang) * 20, 0, ang, 0, roadW, 0.06, 40), [1.3, 16]); } }
    for (const id in nodes) if ((deg[id] || 0) > 1 && !id.startsWith('p')) batch.add(G.cyl, MAT.cobble, M4(nodes[id].x, 0.025, nodes[id].z, 0, 0, 0, roadW * 1.05, 0.06, roadW * 1.05), [1.4, 1.4]);
    // buildings
    for (const p of town.places) {
      placesById[p.id] = p;
      labelsData.push({ id: p.id, name: p.name, x: p.x, z: p.z, y: (p.h || 1) + 2.2, known: p.known, type: p.type });
      const t = p.type;
      if (t === 'home') house(batch, signs, p, { wall: 0xf2e8d2, trim: 0x2e6e6a, roof: 0x5f6e4a, timber: true, flowers: true });
      else if (t === 'house') house(batch, signs, p);
      else if (t === 'bakery') house(batch, signs, p, { shopfront: true, wall: 0xf0d4c8, trim: 0x7b2d26, roof: 0x9a4a32, awning: ['#7b2d26', '#f4f1ea'], signBg: '#7b2d26' });
      else if (t === 'cafe') house(batch, signs, p, { shopfront: true, wall: 0xe9d6b0, trim: 0x2e6e6a, roof: 0x8b5a3c, awning: ['#2e6e6a', '#f4f1ea'], signBg: '#2e6e6a' });
      else if (t === 'post') house(batch, signs, p, { shopfront: true, brick: true, wall: 0xb5634b, trim: 0x7b2d26, roof: 0x55626b, awning: ['#c0392b', '#f4f1ea'], signBg: '#c0392b', noTimber: true });
      else if (t === 'shop') house(batch, signs, p, { shopfront: true, awning: [['#2f4e6b', '#f4f1ea'], ['#5b3a6b', '#f2c94c'], ['#3d5a40', '#f4f1ea']][p.seed % 3] });
      else if (t === 'workshop') workshop(batch, signs, p);
      else if (t === 'hall') schoolhouse(batch, signs, p);
      else if (t === 'museum') library(batch, signs, p, { wall: 0xe6dccb, roof: 0x7b2d26, sign: p.name.replace(/^the /i, '').toUpperCase() });
      else if (t === 'library') library(batch, signs, p);
      else if (t === 'tower') { if (/windmill/i.test(p.name)) windmill(batch, signs, p); else if (/water tower/i.test(p.name)) waterTower(batch, signs, p); else tower(batch, signs, p, clocks); }
      else if (t === 'station') station(batch, signs, p);
      else if (t === 'green') green(batch, p, extras);
      else if (t === 'lookout') lookout(batch, p);
      else if (t === 'stone') stone(batch, p, extras);
      else if (t === 'market') market(batch, signs, p);
      else if (t === 'garden') garden(batch, p);
      if (t === 'cafe') { const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1)); for (const s of [-1, 1]) { const tx = s * 1.6 + 1, tz = p.d / 2 + 1.3; prim(batch, B, G.cyl, MAT.white, tx, 0.75, tz, 0.9, 0.06, 0.9); prim(batch, B, G.cyl6, MAT.iron, tx, 0.37, tz, 0.08, 0.75, 0.08); for (const c of [-0.7, 0.7]) box(batch, B, MAT.iron, 0.4, 0.05, 0.4, tx + c, 0.45, tz); } }
      if (t === 'post') { const B = new THREE.Matrix4().compose(V(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.rot, 0)), V(1, 1, 1)); prim(batch, B, G.cyl, std(0xc0392b, { roughness: 0.4 }), p.w / 2 - 0.3, 0.7, p.d / 2 + 1, 0.55, 1.4, 0.55); prim(batch, B, G.sphere, std(0xc0392b, { roughness: 0.4 }), p.w / 2 - 0.3, 1.4, p.d / 2 + 1, 0.55, 0.3, 0.55); }
    }
    // trees, scattered wherever there's room, deterministic so they don't jump about
    const r = rng(99), trees = { trunk: [], leaf: [], pine: [] };
    const blocked = (x, z, pad) => {
      for (const e of town.edges) { const A = nodes[e.a], Bn = nodes[e.b]; const dx = Bn.x - A.x, dz = Bn.z - A.z, L2 = dx * dx + dz * dz || 1; let t = ((x - A.x) * dx + (z - A.z) * dz) / L2; t = clamp(t, 0, 1); if (Math.hypot(x - (A.x + dx * t), z - (A.z + dz * t)) < 2.6 + pad) return true; }
      for (const p of town.places) if (Math.hypot(p.x - x, p.z - z) < Math.hypot(p.w, p.d) / 2 + 1.5 + pad) return true;
      return false;
    };
    const R = town.R + 14;
    for (let i = 0; i < 2600 && trees.trunk.length < (MOBILE ? 140 : 260); i++) {
      const a = r() * 6.283, rr = Math.sqrt(r()) * R, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (blocked(x, z, 0.8)) continue;
      const s = 0.8 + r() * 0.7, pine = r() < 0.3;
      trees.trunk.push(M4(x, 0.9 * s, z, 0, 0, 0, 0.32 * s, 1.8 * s, 0.32 * s));
      if (pine) for (let k = 0; k < 3; k++) trees.pine.push(M4(x, (2.1 + k * 1.0) * s, z, 0, r() * 3, 0, (2.4 - k * 0.6) * s, 2 * s, (2.4 - k * 0.6) * s));
      else for (let k = 0; k < 4; k++) trees.leaf.push(M4(x + (r() - 0.5) * 1.2 * s, (2.6 + r() * 1.2) * s, z + (r() - 0.5) * 1.2 * s, r() * 3, r() * 3, 0, (1.6 + r() * 0.9) * s, (1.4 + r() * 0.8) * s, (1.6 + r() * 0.9) * s));
    }
    const leafColor = { spring: 0x6fae4b, summer: 0x4f8a3a, autumn: 0xc9772c, winter: 0x8a9a8c }[season] || 0x5d9a4a;
    const inst = (geo, material, list) => { const m = new THREE.InstancedMesh(geo, material, list.length); list.forEach((mx, i) => m.setMatrixAt(i, mx)); m.castShadow = true; m.receiveShadow = true; townGroup.add(m); return m; };
    inst(G.cyl6, MAT.trunk, trees.trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.9, flatShading: true }); townGroup.userData.leafMat = leafMat;
    inst(G.ico, leafMat, trees.leaf); inst(G.cone, new THREE.MeshStandardMaterial({ color: 0x2f5e3a, roughness: 0.9, flatShading: true }), trees.pine);
    // grass tufts and wild flowers
    const tufts = [], blooms = [];
    for (let i = 0; i < (MOBILE ? 1800 : 5000); i++) { const a = r() * 6.283, rr = Math.sqrt(r()) * (town.R + 4), x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (blocked(x, z, -0.6)) continue; (r() < 0.12 ? blooms : tufts).push(M4(x, 0.18, z, 0, r() * 3, 0, 0.18, 0.4 + r() * 0.3, 0.18)); }
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 1 });
    const tm = inst(G.cone, tuftMat, tufts); tm.castShadow = false;
    const bm = new THREE.InstancedMesh(G.ico, new THREE.MeshStandardMaterial({ roughness: 0.8 }), blooms.length); blooms.forEach((mx, i) => { bm.setMatrixAt(i, mx.clone().multiply(M4(0, 0.2, 0, 0, 0, 0, 0.8, 0.4, 0.8))); bm.setColorAt(i, new THREE.Color(FLOWERS[i % FLOWERS.length])); }); townGroup.add(bm);
    // merge everything static
    for (const m of batch.build(townGroup)) wallMeshes.push(m);
    // signs with names (each has its own texture)
    for (const s of signs) {
      const tex = signTex(s.text, { bg: s.bg, fg: s.fg, font: s.font === 'cursive' ? '"Comic Sans MS", cursive' : undefined });
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.08), [MAT.woodDark, MAT.woodDark, MAT.woodDark, MAT.woodDark, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), s.both ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }) : MAT.woodDark]);
      m.applyMatrix4(s.F.clone().multiply(M4(s.x, s.y, s.z ?? 0.14))); m.castShadow = true; townGroup.add(m);
    }
    // clock faces that show town time
    for (const c of clocks) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xfff3d6, emissiveMap: tex, emissiveIntensity: 0 }));
      m.applyMatrix4(c.F.clone().multiply(M4(0, c.y, 0.06))); townGroup.add(m); clockFaces.push({ cv, tex, m });
    }
    // pond water
    if (extras.pond) { pondMesh = new THREE.Mesh(new THREE.CircleGeometry(extras.pond.r, 40), MAT.water); pondMesh.rotation.x = -Math.PI / 2; pondMesh.position.set(extras.pond.x, 0.06, extras.pond.z); pondMesh.receiveShadow = true; townGroup.add(pondMesh); }
    // the humming stone's rings
    if (extras.stone) { const rings = []; for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.03, 6, 48), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.4, depthWrite: false })); t.rotation.x = Math.PI / 2; t.position.set(extras.stone.x, 1.3, extras.stone.z); townGroup.add(t); rings.push(t); } const light = new THREE.PointLight(0x9fd8ff, 0, 14, 2); light.position.set(extras.stone.x, 2.6, extras.stone.z); townGroup.add(light); stoneFx = { rings, light }; }
    // the wall of fog
    const fogG = new THREE.Group(); townGroup.add(fogG);
    const fogMats = [];
    for (let i = 0; i < 4; i++) { const fm = new THREE.MeshBasicMaterial({ map: TEX.fog, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 + i * 0.12, fog: false }); const cyl = new THREE.Mesh(new THREE.CylinderGeometry(townR + i * 3.5, townR + i * 3.5, 30 + i * 6, 72, 1, true), fm); TEX.fog.repeat.set(1, 1); cyl.position.y = 12 + i * 2; cyl.rotation.y = i; fogG.add(cyl); fogMats.push(fm); }
    const puffs = []; for (let i = 0; i < 70; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.puff, transparent: true, depthWrite: false, opacity: 0.7, fog: false })); const a = i / 70 * 6.283 + Math.random() * 0.1, rr = townR - 1 + Math.random() * 6; sp.position.set(Math.cos(a) * rr, 1.5 + Math.random() * 7, Math.sin(a) * rr); sp.scale.setScalar(10 + Math.random() * 10); sp.userData.a = a; sp.userData.r = rr; fogG.add(sp); puffs.push(sp); }
    fogParts = { mats: fogMats, puffs };
  }

  /* ---------- things, graffiti, the noticeboard, shop items ---------- */
  const thingMeshes = new Map();
  function syncThings(list) {
    const ids = new Set(list.map(t => t.id + ':' + t.status));
    for (const [k, m] of thingMeshes) if (!ids.has(k)) { thingGroup.remove(m); thingMeshes.delete(k); }
    for (const t of list) {
      const k = t.id + ':' + t.status; if (thingMeshes.has(k)) continue;
      const m = t.status === 'ready' && t.model ? buildModel(t.model) : placeholder(t.status === 'failed');
      m.position.set(t.x, 0, t.z); m.rotation.y = t.rot || 0; thingGroup.add(m); thingMeshes.set(k, m);
    }
  }
  const texLoader = new THREE.TextureLoader(); const texCache = new Map();
  const loadTex = url => { if (!texCache.has(url)) { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; texCache.set(url, t); } return texCache.get(url); };
  const graffitiMeshes = new Map();
  function syncGraffiti(list) {
    const ids = new Set(list.map(g => g.id));
    for (const [k, m] of graffitiMeshes) if (!ids.has(k)) { graffitiGroup.remove(m); graffitiMeshes.delete(k); }
    for (const g of list) {
      if (graffitiMeshes.has(g.id)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(g.w, g.h), new THREE.MeshStandardMaterial({ map: loadTex(g.img), transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(g.x + g.nx * 0.05, g.y, g.z + g.nz * 0.05); m.rotation.y = Math.atan2(g.nx, g.nz); m.receiveShadow = true;
      graffitiGroup.add(m); graffitiMeshes.set(g.id, m);
    }
  }
  let boardKey = '';
  function syncBoard(drawings, town) {
    const latest = drawings.filter(d => !d.sold).slice(-6).reverse(); const key = latest.map(d => d.id).join(',') + town.ver;
    if (key === boardKey) return; boardKey = key;
    for (const c of [...boardGroup.children]) boardGroup.remove(c);
    // the noticeboard stands beside the High Street, just off the square
    const C = town.nodes.C || { x: 0, z: 0 }, D = town.nodes.D || { x: 17, z: 0 };
    const ang = Math.atan2(D.x - C.x, D.z - C.z); const bx = C.x + Math.sin(ang) * 6 + Math.cos(ang) * 3.2, bz = C.z + Math.cos(ang) * 6 - Math.sin(ang) * 3.2;
    const g = new THREE.Group(); g.position.set(bx, 0, bz); g.rotation.y = ang - Math.PI / 2;
    const wood = MAT.woodDark;
    for (const x of [-1.6, 1.6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), wood); post.position.set(x, 1.3, 0); post.castShadow = true; g.add(post); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 0.1), std(0xa8835a, { map: TEX.wood })); back.position.set(0, 1.55, 0); back.castShadow = true; g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.7), roofM(0x5f6e4a)); roof.position.set(0, 2.55, 0.05); roof.rotation.x = -0.25; g.add(roof);
    latest.forEach((d, i) => { const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshStandardMaterial({ map: loadTex('/media/drawings/' + d.id + '.svg'), roughness: 0.9 })); pm.position.set(-1.05 + (i % 3) * 1.05, 2.0 - Math.floor(i / 3) * 0.85 - 0.04, 0.06); pm.rotation.z = (Math.sin(i * 7.3) * 0.06); g.add(pm); });
    boardGroup.add(g);
  }
  const itemMeshes = new Map();
  function syncItems(items) {
    const shown = items.filter(i => !i.sold);
    const ids = new Set(shown.map(i => i.id + ':' + i.status));
    for (const [k, m] of itemMeshes) if (!ids.has(k)) { itemGroup.remove(m); itemMeshes.delete(k); }
    const perShop = {};
    for (const it of shown) {
      const k = it.id + ':' + it.status; const p = placesById[it.shop]; if (!p) continue;
      const idx = perShop[it.shop] = (perShop[it.shop] || 0) + 1; if (itemMeshes.has(k)) continue;
      // a little display table outside the shop window
      const g = new THREE.Group();
      const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.6), std(0x8a6a4a, { map: TEX.wood })); table.position.y = 0.35; table.castShadow = true; g.add(table);
      const model = it.status === 'ready' && it.model ? buildModel(it.model) : placeholder(it.status === 'failed'); model.scale.setScalar(it.status === 'ready' ? 1 : 0.4); model.position.y = 0.7; g.add(model);
      const fx = Math.sin(p.rot), fz = Math.cos(p.rot), rx = Math.cos(p.rot), rz = -Math.sin(p.rot), off = p.w * 0.3 - (idx - 1) * 1.1;
      g.position.set(p.x + fx * (p.d / 2 + 0.7) + rx * off, 0, p.z + fz * (p.d / 2 + 0.7) + rz * off); g.rotation.y = p.rot;
      itemGroup.add(g); itemMeshes.set(k, g);
    }
  }

  /* ---------- camera and controls ---------- */
  let mode = 'follow', ang = 0.6, tilt = 0.55, zoom = 1, pitch = 0, drag = null; const pointers = new Map(); let pinch0 = null;
  const camT = new THREE.Vector3(), camP = new THREE.Vector3();
  const keys = new Set();
  canvas.addEventListener('pointerdown', e => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; drag = null; } else drag = { x: e.clientX, y: e.clientY, a: ang, t: tilt, p: pitch, moved: 0 }; if (mode === 'explore' && e.pointerType === 'mouse' && !placingNow() && canvas.requestPointerLock && document.pointerLockElement !== canvas) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch {} } });
  // with the pointer locked, the mouse turns your head freely (Esc to let go)
  document.addEventListener('mousemove', e => { if (document.pointerLockElement !== canvas || mode !== 'explore') return; ang -= e.movementX * 0.0025; pitch = clamp(pitch - e.movementY * 0.0025, -1.25, 1.25); });
  const placingNow = () => stage.classList.contains('placing');
  addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch0 && pointers.size === 2) { const [a, b] = [...pointers.values()]; zoom = clamp(pinch0.z * pinch0.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), 0.3, 3.5); return; }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (mode === 'explore') { if (document.pointerLockElement === canvas) return; ang = drag.a - dx * 0.005; pitch = clamp(drag.p - dy * 0.005, -1.25, 1.25); return; }
    ang = drag.a - dx * 0.006; if (e.pointerType !== 'touch') tilt = clamp(drag.t + dy * 0.004, 0.12, 1.35);
  });
  const endPointer = e => { if (drag && drag.moved < 8 && e.type === 'pointerup' && e.target === canvas && onTap) onTap(e, api); pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null; if (!pointers.size) drag = null; };
  addEventListener('pointerup', endPointer); addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom = clamp(zoom * Math.exp(e.deltaY * 0.0012), 0.3, 3.5); }, { passive: false });
  const MOVE = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r', q: 'tl', e: 'tr', shift: 'run' };
  addEventListener('keydown', e => {
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = MOVE[e.key.toLowerCase()]; if (!k) return;
    if (k !== 'run' && mode !== 'explore') { api.setMode('explore'); }
    keys.add(k); if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { const k = MOVE[e.key.toLowerCase()]; if (k) keys.delete(k); });
  addEventListener('blur', () => keys.clear());

  /* ---------- raycasting for the keeper's taps ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), gplane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function setRay(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }

  /* ---------- per-frame ---------- */
  let L = null, ST = null, clientT = null, lastClockMin = -1;
  const sunDir = new THREE.Vector3(), v3 = new THREE.Vector3(), fogCol = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();
  const DAY = new THREE.Color(0xcad9e3), DUSK = new THREE.Color(0xe9b38f), NIGHT = new THREE.Color(0x0e1626), OVER = new THREE.Color(0x9aa4ab);
  function drawClock(cv, h) { const x = cv.getContext('2d'); x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill(); x.strokeStyle = '#2b2b2b'; x.lineWidth = 8; x.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; x.lineWidth = i % 3 ? 4 : 8; x.beginPath(); x.moveTo(128 + Math.sin(a) * 100, 128 - Math.cos(a) * 100); x.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114); x.stroke(); } const hh = (h % 12) / 12 * 6.283, mm = (h % 1) * 6.283; x.lineCap = 'round'; x.lineWidth = 10; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.sin(hh) * 60, 128 - Math.cos(hh) * 60); x.stroke(); x.lineWidth = 6; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.sin(mm) * 92, 128 - Math.cos(mm) * 92); x.stroke(); }
  let lastT = performance.now(), envTimer = 0, lampTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (L && clientT != null) clientT += dt * (L.scale || 4) / 60;
    const t = clientT ?? 7 * 60, h = (t % 1440) / 60, wx = L ? L.weather : 'clear', season = L ? L.season : 'spring';
    // sun path
    const elev = Math.sin((h - 6) / 12 * Math.PI) * (season === 'summer' ? 62 : season === 'winter' ? 30 : 46);
    const azim = (h - 12) / 12 * Math.PI;
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), azim + Math.PI);
    su.sunPosition.value.copy(sunDir);
    const day = smooth(-6, 8, elev), golden = smooth(-4, 3, elev) * (1 - smooth(4, 16, elev));
    const overcast = { rain: 0.75, snow: 0.6, cloudy: 0.5, fog: 0.6, wind: 0.2 }[wx] || 0;
    sky.visible = elev > -10;
    renderer.toneMappingExposure = 0.3 + 0.52 * day;
    if (bloom) { bloom.enabled = day < 0.55; bloom.strength = 0.55 * (1 - day); }
    fogCol.copy(NIGHT).lerp(DAY, day); fogCol.lerp(cA.copy(DUSK), golden * 0.7); fogCol.lerp(cB.copy(OVER).multiplyScalar(0.3 + 0.7 * day), overcast * 0.7);
    scene.fog.color.copy(fogCol); scene.background = sky.visible ? null : fogCol;
    const fogTarget = (wx === 'fog' ? 0.045 : wx === 'rain' || wx === 'snow' ? 0.016 : 0.0065) + (1 - day) * 0.004;
    scene.fog.density += (fogTarget - scene.fog.density) * 0.02;
    // lights: the sun by day, the moon by night (the same light, so shadows carry on)
    const moonUp = elev < -2;
    if (moonUp) { sun.position.set(-60, 90, -70).add(camT); sun.color.setHex(0xaecbff); sun.intensity = 0.35 * (1 - overcast * 0.7); }
    else { sun.position.copy(sunDir).multiplyScalar(120).add(camT); sun.color.setHex(0xfff1dc).lerp(cA.setHex(0xffa36b), golden); sun.intensity = 2.6 * day * (1 - overcast * 0.65); }
    sun.target.position.copy(camT);
    hemi.intensity = 0.25 + 0.55 * day; hemi.color.setHex(moonUp ? 0x6b7fb3 : 0xcfe6ff);
    starMat.opacity = (1 - day) * (1 - overcast); moon.material.opacity = (1 - day) * (1 - overcast * 0.8); moon.position.set(-420, 520, -600);
    MAT.glass.emissiveIntensity = (1 - day) * 1.4; MAT.lampGlass.emissiveIntensity = 0.2 + (1 - day) * 4;
    if ((envTimer -= dt) <= 0 && sky.visible) { envTimer = 20; refreshEnv(sunDir); }
    // town details
    if (townGroup.userData.leafMat) townGroup.userData.leafMat.color.lerp(cA.setHex({ spring: 0x6fae4b, summer: 0x4f8a3a, autumn: 0xc9772c, winter: 0x8a9a8c }[season]), 0.01);
    MAT.hill.color.copy(MAT.grass.color); MAT.grass.color.lerp(cA.setHex({ spring: 0x8bbd62, summer: 0x9ab35a, autumn: 0xa39a58, winter: wx === 'snow' ? 0xe9eef2 : 0xa9b5a8 }[season]), 0.005);
    if (pondMesh) { TEX.water.offset.x += dt * 0.01; TEX.water.offset.y += dt * 0.007; MAT.water.color.setHex(season === 'winter' && wx === 'snow' ? 0xbcd6e0 : 0x2c6670); }
    if (stoneFx) { const w = L ? L.watchers : 0; stoneFx.rings.forEach((rg, i) => { const ph = ((now * (0.00025 + Math.min(0.0006, w * 0.00008))) + i / 3) % 1; rg.scale.setScalar(1 + ph * 2.2); rg.material.opacity = REDUCED ? 0.15 : 0.45 * (1 - ph); }); stoneFx.light.intensity = (1 - day) * 6 + 1 + Math.min(8, w * 1.2); }
    if (fogParts) { fogParts.mats.forEach((m, i) => { m.color.copy(fogCol).lerp(cA.setHex(0xffffff), 0.15 * day); m.opacity = (0.5 + i * 0.13) * (0.8 + 0.2 * Math.sin(now * 0.0003 + i)); }); if (!REDUCED) fogParts.puffs.forEach(p => { p.userData.a += dt * 0.004; p.position.x = Math.cos(p.userData.a) * p.userData.r; p.position.z = Math.sin(p.userData.a) * p.userData.r; p.material.color.copy(fogCol).lerp(cA.setHex(0xffffff), 0.2 * day); }); }
    const cm = Math.floor(t); if (cm !== lastClockMin && clockFaces.length) { lastClockMin = cm; for (const c of clockFaces) { drawClock(c.cv, h); c.tex.needsUpdate = true; c.m.material.emissiveIntensity = (1 - day) * 0.9; } }
    // lamp pools of light near the camera at night
    if ((lampTimer -= dt) <= 0) { lampTimer = 0.5; const near = lampSpots.map(s => ({ s, d: Math.hypot(s.x - camT.x, s.z - camT.z) })).sort((a, b) => a.d - b.d); lampLights.forEach((l, i) => { const n = near[i]; if (n) l.position.set(n.s.x, 3.2, n.s.z); }); }
    lampLights.forEach(l => { l.intensity = (1 - day) * 22; });
    // weather particles follow the camera
    const wet = wx === 'rain' ? 1 : wx === 'snow' ? 1 : 0; pMat.opacity += ((wet ? 0.7 : 0) - pMat.opacity) * 0.04;
    if (pMat.opacity > 0.01) { pMat.size = wx === 'snow' ? 0.22 : 0.09; pMat.color.setHex(wx === 'snow' ? 0xffffff : 0xb9cfe4); const fall = (wx === 'snow' ? 2.5 : 22) * dt; for (let i = 0; i < PN; i++) { pArr[i * 3 + 1] -= fall; if (wx === 'snow') pArr[i * 3] += Math.sin(now * 0.001 + i) * 0.01; else pArr[i * 3] += 0.08 * dt * 30 * (wx === 'wind' ? 2 : 0.3); if (pArr[i * 3 + 1] < 0) pArr[i * 3 + 1] = 35; } pGeo.attributes.position.needsUpdate = true; precip.position.set(camT.x, 0, camT.z); }
    const ffOn = (season === 'summer' || season === 'spring') && day < 0.3 && extras.pond && wx !== 'rain'; ffMat.opacity += ((ffOn ? 0.9 : 0) - ffMat.opacity) * 0.03;
    if (ffMat.opacity > 0.01 && extras.pond) { for (let i = 0; i < FF; i++) { const s = ffSeed[i], a = s[0] + now * 0.0002 * (1 + s[1]); ffArr[i * 3] = extras.pond.x + Math.cos(a) * (2 + s[1] * 6); ffArr[i * 3 + 1] = 0.6 + Math.sin(now * 0.001 + s[2]) * 0.4 + s[1]; ffArr[i * 3 + 2] = extras.pond.z + Math.sin(a * 1.3) * (2 + s[1] * 6); } ffGeo.attributes.position.needsUpdate = true; }
    // Percy follows the server's position smoothly
    const act = L && L.act, walking = act && act.phase === 'walk', asleep = act && act.phase === 'do' && (act.id === 'sleep' || act.id === 'nap');
    if (L) { if (!percyPos.init) { percyPos.x = L.pos.x; percyPos.z = L.pos.z; percyPos.init = true; } const k = 1 - Math.exp(-dt * 3); percyPos.x += (L.pos.x - percyPos.x) * k; percyPos.z += (L.pos.z - percyPos.z) * k; }
    const diff = (((L ? L.face : 0) - percyFace + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; percyFace += diff * 0.12;
    const gy = groundHeight(percyPos.x, percyPos.z);
    const inside = !!(act && act.phase === 'do' && act.inside);
    percy.visible = !asleep && !inside; percy.position.set(percyPos.x, gy, percyPos.z); percy.rotation.y = percyFace;
    const ud = percy.userData, tt = now * 0.001;
    if (walking && !REDUCED) { ud.body.rotation.z = Math.sin(tt * 9) * 0.12; ud.body.position.y = Math.abs(Math.sin(tt * 9)) * 0.05; ud.flippers[0].rotation.z = -0.18 - Math.abs(Math.sin(tt * 9)) * 0.4; ud.flippers[1].rotation.z = 0.18 + Math.abs(Math.sin(tt * 9)) * 0.4; ud.feet[0].position.z = 0.12 + Math.sin(tt * 9) * 0.08; ud.feet[1].position.z = 0.12 - Math.sin(tt * 9) * 0.08; }
    else { ud.body.rotation.z *= 0.9; ud.body.position.y = 0; ud.body.scale.y = 1 + Math.sin(tt * 2) * 0.012; const busy = act && act.phase === 'do' && ['draw', 'graffiti', 'fish'].includes(act.id); ud.flippers[0].rotation.z = -0.18 - (busy ? Math.abs(Math.sin(tt * 5)) * 0.6 : 0); ud.flippers[1].rotation.z = 0.18; }
    const blink = (Math.floor(now / 3400) % 3 === 0 && now % 3400 < 130) ? 0.1 : 1; ud.eyes.forEach((e, i) => { if (i % 2 === 0) e.scale.y = blink; });
    easel.visible = !!(act && act.phase === 'do' && act.id === 'draw' && !asleep && !inside); if (easel.visible) { easel.position.set(percyPos.x + Math.sin(percyFace) * 0.8, gy, percyPos.z + Math.cos(percyFace) * 0.8); easel.rotation.y = percyFace + Math.PI; }
    spray.visible = !!(act && act.phase === 'do' && act.id === 'graffiti'); if (spray.visible) spray.position.set(percyPos.x + Math.sin(percyFace + 0.6) * 0.45, gy + 0.9 + Math.sin(tt * 6) * 0.1, percyPos.z + Math.cos(percyFace + 0.6) * 0.45);
    // made things in progress shimmer
    for (const m of thingMeshes.values()) if (m.userData.spin) m.userData.spin.rotation.y += dt;
    // camera
    if (mode === 'explore') {
      // first person: you are standing in the street at penguin-ish eye height
      const sp = (keys.has('run') ? 9 : 4.2) * dt, fx = -Math.sin(ang), fz = -Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
      let mx = 0, mz = 0; if (keys.has('f')) { mx += fx; mz += fz; } if (keys.has('b')) { mx -= fx; mz -= fz; } if (keys.has('r')) { mx += rx; mz += rz; } if (keys.has('l')) { mx -= rx; mz -= rz; }
      if (keys.has('tl')) ang += dt * 1.6; if (keys.has('tr')) ang -= dt * 1.6;
      const L2 = Math.hypot(mx, mz); if (L2) { let nx = walker.x + mx / L2 * sp, nz = walker.z + mz / L2 * sp; [nx, nz] = collide(nx, nz); walker.x = nx; walker.z = nz; walker.bob += dt * (keys.has('run') ? 14 : 9); }
      wisp.visible = false;
      const eye = groundHeight(walker.x, walker.z) + 1.35 + (L2 && !REDUCED ? Math.sin(walker.bob) * 0.04 : 0);
      camera.position.set(walker.x, eye, walker.z);
      camT.set(walker.x + fx * Math.cos(pitch) * 10, eye + Math.sin(pitch) * 10, walker.z + fz * Math.cos(pitch) * 10);
      const fov = clamp(60 * zoom, 25, 85); if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(camT);
    } else {
      wisp.visible = false; if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
      if (mode === 'overview') camT.lerp(v3.set(0, 0, 0), 0.05); else camT.lerp(v3.set(percyPos.x, gy + 0.6, percyPos.z), 0.08);
      const base = mode === 'overview' ? townR * 1.5 : 11; const dist = base * zoom, tl = mode === 'overview' ? Math.max(tilt, 0.7) : tilt;
      camP.set(camT.x + Math.sin(ang) * Math.cos(tl) * dist, camT.y + Math.sin(tl) * dist + 0.5, camT.z + Math.cos(ang) * Math.cos(tl) * dist);
      camera.position.lerp(camP, 0.1); camera.lookAt(camT);
    }
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (api.onFrame) api.onFrame();
  }
  function groundHeight(x, z) { if (!ST) return 0; for (const p of ST.town.places) if (p.type === 'lookout') { const d = Math.hypot(x - p.x, z - p.z); if (d < 6.5) return 3 * Math.pow(Math.sin((1 - d / 6.5) * Math.PI / 2), 1.4); } return 0; }
  function collide(x, z) {
    if (!ST) return [x, z];
    const lim = townR - 2; const d0 = Math.hypot(x, z); if (d0 > lim) { x *= lim / d0; z *= lim / d0; }
    for (const p of ST.town.places) { if (!p.h) continue; const c = Math.cos(-p.rot), s = Math.sin(-p.rot); const lx = (x - p.x) * c + (z - p.z) * s, lz = -(x - p.x) * s + (z - p.z) * c; const hw = p.w / 2 + 0.4, hd = p.d / 2 + 0.4; if (Math.abs(lx) < hw && Math.abs(lz) < hd) { const px = hw - Math.abs(lx), pz = hd - Math.abs(lz); let nlx = lx, nlz = lz; if (px < pz) nlx = Math.sign(lx) * hw; else nlz = Math.sign(lz) * hd; x = p.x + nlx * c - nlz * s; z = p.z + nlx * s + nlz * c; } }
    return [x, z];
  }
  function resize() { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (composer) { composer.setSize(w, h); bloom.setSize(w, h); } }
  new ResizeObserver(resize).observe(stage); resize();

  const api = {
    onFrame: null,
    setState(st) {
      ST = st;
      if (st.town.ver !== townVer) buildTown(st.town, st.season);
      syncThings(st.things || []); syncGraffiti(st.graffiti || []); syncBoard(st.drawings || [], st.town); syncItems(st.items || []);
    },
    setLive(l) { L = l; clientT = l.t; },
    setMode(m) { mode = m; if (m === 'explore') { const [wx, wz] = collide(percyPos.x + Math.sin(ang) * 4, percyPos.z + Math.cos(ang) * 4); walker.x = wx; walker.z = wz; pitch = -0.08; } else if (document.pointerLockElement === canvas) document.exitPointerLock(); if (m === 'overview') tilt = 0.9; if (m === 'follow') tilt = 0.55; api.onMode && api.onMode(m); },
    get mode() { return mode; },
    zoomBy(f) { zoom = clamp(zoom * f, 0.3, 3.5); },
    press(k, on) { if (on) keys.add(k); else keys.delete(k); },
    // where things are on screen, for the speech bubble and labels
    project(x, y, z) { v3.set(x, y, z).project(camera); if (v3.z > 1 || Math.abs(v3.x) > 1.15 || Math.abs(v3.y) > 1.15) return null; return { x: (v3.x + 1) / 2 * stage.clientWidth, y: (1 - v3.y) / 2 * stage.clientHeight }; },
    percyAnchor() { const act = L && L.act; if (act && act.phase === 'do' && act.inside && placesById[act.inside]) return { x: percyPos.x, y: groundHeight(percyPos.x, percyPos.z) + 2.3, z: percyPos.z, asleep: act.id === 'sleep' || act.id === 'nap' }; const asleep = act && act.phase === 'do' && (act.id === 'sleep' || act.id === 'nap'); if (asleep && ST) { const home = ST.town.places.find(p => p.type === 'home'); if (home) return { x: home.x, y: home.h + 3.4, z: home.z, asleep: true }; } return { x: percyPos.x, y: groundHeight(percyPos.x, percyPos.z) + 1.9, z: percyPos.z, asleep: false }; },
    labels() { return labelsData; },
    cameraTarget() { return camT; },
    tapGround(e) { setRay(e); return ray.ray.intersectPlane(gplane, hit) ? { x: hit.x, z: hit.z } : null; },
    tapWall(e) {
      setRay(e); const hits = ray.intersectObjects(wallMeshes, false);
      for (const h of hits) { if (!h.face) continue; const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (Math.abs(n.y) > 0.3) continue; const L2 = Math.hypot(n.x, n.z) || 1; return { x: h.point.x, y: clamp(h.point.y, 0.8, 6), z: h.point.z, nx: n.x / L2, nz: n.z / L2 }; }
      return null;
    },
  };
  (function loop(now) { frame(now); requestAnimationFrame(loop); })(performance.now());
  return api;
}
