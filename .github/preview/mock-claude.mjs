// A stand-in for the Claude API, used only by the screenshot preview job.
import http from 'node:http';
const acts = ['draw', 'explore', 'pond', 'visit', 'wander', 'read'];
let n = 0;
const cat = { name: 'cat statue', parts: [
  { shape: 'box', size: [1.6, 0.5, 1.2], pos: [0, 0.25, 0], color: '#9a9a92' },
  { shape: 'sphere', size: [0.55], pos: [0, 1.05, 0], scale: [1, 1.15, 0.9], color: '#d08a3a', finish: 'shiny' },
  { shape: 'sphere', size: [0.38], pos: [0, 1.85, 0.12], color: '#d08a3a', finish: 'shiny' },
  { shape: 'cone', size: [0.13, 0.32], pos: [-0.2, 2.2, 0.1], color: '#d08a3a' }, { shape: 'cone', size: [0.13, 0.32], pos: [0.2, 2.2, 0.1], color: '#d08a3a' },
  { shape: 'sphere', size: [0.06], pos: [-0.13, 1.9, 0.46], color: '#1b1b1b' }, { shape: 'sphere', size: [0.06], pos: [0.13, 1.9, 0.46], color: '#1b1b1b' },
  { shape: 'capsule', size: [0.09, 0.9], pos: [0.55, 0.9, -0.3], rot: [30, 0, -40], color: '#d08a3a' } ] };
http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  const body = JSON.parse(b); const c0 = body.messages[0].content; const p = typeof c0 === 'string' ? c0 : c0.filter(x => x.type === 'text').map(x => x.text).join(' ');
  n++; let text;
  if (p.includes('Design a charming low-poly')) text = JSON.stringify(cat);
  else if (p.includes('Paint it as an SVG illustration') || p.includes('Paint it as an SVG: a real spray')) text = '<svg viewBox="0 0 800 800"><rect width="800" height="800" fill="#f3ead8"/><circle cx="400" cy="380" r="160" fill="#2c6670" opacity=".5"/><path d="M180 600 Q400 500 620 600" stroke="#333" stroke-width="6" fill="none"/><text x="740" y="770" font-size="28">P.</text></svg>';
  else if (p.includes('choosing what to do next')) { const a = acts[n % acts.length]; text = JSON.stringify({ thought: 'the fog looks thick down mill lane today. i wonder if it is thicker on purpose.', action: a, target: '', doing: 'doing something quietly', subject: a === 'draw' ? 'the clock tower in the rain' : '', title: '', remember: '', diary: '' }); }
  else text = JSON.stringify({ thought: 'a small thought.', reaction: 'a reaction.', first_sight: 'something new.', diary: 'a reflection.', facts: ['a fact.'], topic: 'fog', title: 'a page', body: 'some words.' });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }));
}); }).listen(3099, () => console.log('mock claude on 3099'));
