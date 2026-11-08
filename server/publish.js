// Percy's website on GitHub Pages. When GITHUB_TOKEN and GITHUB_REPO are set (and publishing is permitted),
// his projects, pages and drawings are uploaded. The index is generated plainly; the work on it is his.
import { config } from './config.js';

const queue = new Map(); // path -> { content, message }
export const pubStatus = { enabled: false, pushed: 0, queued: 0, lastPush: 0, lastError: '' };
export const enabled = () => !!(config.githubToken && config.githubRepo);
pubStatus.enabled = enabled();
export function queueFile(path, content, message) { if (enabled()) { queue.set(path, { content, message }); pubStatus.queued = queue.size; } }

async function putFile(path, content, message) {
  const url = `https://api.github.com/repos/${config.githubRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { authorization: 'Bearer ' + config.githubToken, accept: 'application/vnd.github+json', 'user-agent': 'percy-the-penguin', 'x-github-api-version': '2022-11-28' };
  let sha;
  const got = await fetch(url + '?ref=' + encodeURIComponent(config.githubBranch), { headers });
  if (got.ok) { const j = await got.json(); sha = j.sha; if (j.content && Buffer.from(j.content, 'base64').equals(Buffer.from(content))) return; }
  const res = await fetch(url, { method: 'PUT', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch: config.githubBranch, ...(sha ? { sha } : {}) }) });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error('GitHub said ' + res.status + ': ' + (j.message || 'unknown error')); }
}
let busy = false;
export async function flush() {
  if (busy || !enabled() || !queue.size) return;
  busy = true;
  try {
    for (const [path, item] of [...queue]) { await putFile(path, item.content, item.message); queue.delete(path); pubStatus.pushed++; }
    pubStatus.lastPush = Date.now(); pubStatus.lastError = '';
  } catch (e) { pubStatus.lastError = String(e.message || e); console.warn('[percy] publishing failed:', pubStatus.lastError); }
  finally { busy = false; pubStatus.queued = queue.size; }
}
setInterval(flush, 60000).unref();

/* ---------- pages ---------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const siteUrl = () => { const r = config.githubRepo; if (!r) return ''; const [owner, name] = r.split('/'); return name && name.toLowerCase().endsWith('.github.io') ? 'https://' + name.toLowerCase() + '/' : 'https://' + owner.toLowerCase() + '.github.io/' + name + '/'; };
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'page';
const STYLE = `body{margin:0;background:#f6f5f1;color:#1f2328;font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px max(18px,env(safe-area-inset-left))}main{max-width:740px;margin:0 auto}h1{font-size:28px;margin:0 0 4px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#6a6f76;margin:34px 0 10px}a{color:#1d5f8a}ul{padding-left:20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.grid figure{margin:0}.grid img{width:100%;border-radius:4px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15)}.grid figcaption{font-size:14px;color:#555}.body{white-space:pre-line}.meta{color:#6a6f76;font-size:14px}footer{margin-top:44px;border-top:1px solid #ddd;padding-top:14px;color:#6a6f76;font-size:14px}`;
const footer = () => `<footer>Published by Percy, an autonomous agent who lives in a simulated village${config.publicUrl ? ' (<a href="' + esc(config.publicUrl) + '">watch him there</a>)' : ''}. The work linked here is his; this index is generated automatically.</footer>`;
const wrap = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${inner}${footer()}</main></body></html>`;
export function pageHTML(p) {
  return wrap(p.title, `<p><a href="../">← index</a></p><h1>${esc(p.title)}</h1><p class="meta">written on day ${p.day}${p.forWho ? ' · for ' + esc(p.forWho) : ''}</p><div class="body">${esc(p.body)}</div>`);
}
export function indexHTML(S) {
  const projects = S.projects.filter(p => p.url).slice().reverse().map(p => `<li><a href="projects/${p.slug}/">${esc(p.title)}</a> <span class="meta">· started day ${p.day} · ${p.sittings} sitting${p.sittings === 1 ? '' : 's'} · ${esc(p.status)}</span></li>`).join('');
  const pages = S.pages.filter(p => p.published).slice().reverse().map(p => `<li><a href="pages/${slug(p.title)}.html">${esc(p.title)}</a> <span class="meta">· day ${p.day}</span></li>`).join('');
  const drawings = S.drawings.filter(d => d.published).slice().reverse().slice(0, 60).map(d => `<figure><img src="drawings/${d.id}.svg" alt="${esc(d.title)}" loading="lazy"><figcaption>${esc(d.title)} · day ${d.day}</figcaption></figure>`).join('');
  const forSale = (S.shop || []).filter(x => !x.sold && !x.withdrawn).length;
  const links = [config.publicUrl ? `<a href="${esc(config.publicUrl.replace(/\/$/, ''))}/shop">his shop and orders${forSale ? ' (' + forSale + ' for sale)' : ''}</a>` : '', config.kofiUrl ? `<a href="${esc(config.kofiUrl)}">support him on Ko-fi</a>` : ''].filter(Boolean).join(' · ');
  return wrap('Percy', `<h1>Percy</h1>${links ? '<p>' + links + '</p>' : ''}
<h2>Projects</h2>${projects ? '<ul>' + projects + '</ul>' : '<p class="meta">None published yet.</p>'}
<h2>Writing</h2>${pages ? '<ul>' + pages + '</ul>' : '<p class="meta">None published yet.</p>'}
<h2>Drawings</h2>${drawings ? '<div class="grid">' + drawings + '</div>' : '<p class="meta">None published yet.</p>'}`);
}

/* ---------- projects: the files as they are, with his shop stock filled in ---------- */
export const SHOP_MARK = 'percy-shop';
export const SHOP_SLOT = new RegExp('<script[^>]*id=["\']' + SHOP_MARK + '["\'][^>]*>[\\s\\S]*?<\\/script>', 'i');
export function fillShop(html, data) { return SHOP_SLOT.test(html) ? html.replace(SHOP_SLOT, () => '<script type="application/json" id="' + SHOP_MARK + '">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>') : html; }
export function publishFiles(projectSlug, files, shopData, message) {
  let n = 0, bytes = 0;
  for (const f of files) {
    if (n >= 80 || bytes > 3 * 1024 * 1024) break;
    const content = /\.html?$/i.test(f.path) ? fillShop(f.content, shopData) : f.content;
    queueFile('projects/' + projectSlug + '/' + f.path, content, message); n++; bytes += content.length;
  }
  return { files: n, url: siteUrl() + 'projects/' + projectSlug + '/' };
}
