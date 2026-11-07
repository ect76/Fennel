import fs from 'node:fs';
import path from 'node:path';

export function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Write to a temp file first, then rename, so a power cut can't leave a half-written save.
export function saveJSON(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

// One backup per real day, keeping the last 14.
export function dailyBackup(dir, obj) {
  const bdir = path.join(dir, 'backups');
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(bdir, `world-${day}.json`);
  if (fs.existsSync(file)) return;
  fs.mkdirSync(bdir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
  const all = fs.readdirSync(bdir).filter(f => f.startsWith('world-')).sort();
  while (all.length > 14) fs.rmSync(path.join(bdir, all.shift()));
}
