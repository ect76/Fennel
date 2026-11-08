// A stand-in for the Claude API, used only by the screenshot preview job.
import http from 'node:http';
const acts = ['visit', 'explore', 'pond', 'visit', 'wander', 'draw'];
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
  else if (p.includes('things have been left behind')) text = JSON.stringify({ feel: 'dust in the light. it smells of old paper.', items: [{ name: 'a map of the Outer Hebrides', finds: 'islands like dropped crumbs. one is called Barra.', topic: 'the Outer Hebrides', can_take: true }, { name: 'a globe with a dent in it', finds: 'the dent is somewhere in the pacific.', topic: 'globes', can_take: false }] });
  else if (p.includes('each asking him to make something for coins')) { const ids = [...p.matchAll(/ORDER id (\S+)/g)].map(m => m[1]); text = JSON.stringify({ letters: ids.map((id, i) => ({ id, accept: i % 3 !== 2, reply: i % 3 !== 2 ? 'yes. i can do that. give me a few days.' : 'no, sorry. not this one.', feeling: 'nervous' })), thought: 'letters. for me.', diary: 'orders in my inbox. people want things from me.' }); }
  else if (p.includes('he has just seen')) text = JSON.stringify({ diary: 'a payment in my inbox. someone out there paid for my drawing.', thought: 'somebody paid for something i made.', replies: [{ to: 'Ewan', text: 'thank you for the coins. i bought bread.' }], remember: 'got paid by someone outside', joy: 8 });
  else if (p.includes('He is at his desk, working on his shop')) { const refs = [...p.matchAll(/ref (\S+): "/g)].map(m => m[1]); text = JSON.stringify({ list: refs.slice(0, 3).map((ref, i) => ({ ref, price: 20 + i * 10, blurb: 'one of mine. it has a smudge i like.' })), withdraw: [], sign: 'drawings, pages and things. i also make things to order.', redesign: true, design_idea: 'like a little market stall', thought: 'my own shop.' }); }
  else if (p.includes('his shop page on his website (shop.html)')) text = '<!doctype html><html><head><title>percy\'s shop</title></head><body><h1>percy\'s shop</h1><div id="s"></div><script type="application/json" id="percy-shop">{}</script><script>const d=JSON.parse(document.getElementById("percy-shop").textContent);for(const i of d.items){const p=document.createElement("p");p.textContent=i.title+" "+i.price;document.getElementById("s").append(p)}</script><footer>i am percy, a small autonomous penguin. i made this page myself.</footer></body></html>';
  else if (p.includes('making a real web page')) text = '<!doctype html><html><head><title>lighthouse toy</title></head><body><h1>lighthouse</h1><footer>i am percy, a small autonomous penguin. i made this page myself.</footer></body></html>';
  else if (p.includes('choosing what to do next') && (p.includes('something new is waiting') || p.includes('COMMISSIONS HE HAS ACCEPTED') || (p.includes('shopfront:') && !p.includes('His shop page: version')))) {
    const job = (p.match(/COMMISSIONS HE HAS ACCEPTED[^\n]*\n- id (\S+):/) || [])[1];
    const a = p.includes('something new is waiting') ? 'inbox' : job ? 'job' : 'shopfront';
    text = JSON.stringify({ thought: 'right. ' + a + '.', action: a, target: job || '', doing: '', subject: '', title: '', remember: '', diary: '' }); }
  else if (p.includes('choosing what to do next')) { const a = acts[n % acts.length]; text = JSON.stringify({ thought: 'the fog looks thick down mill lane today. i wonder if it is thicker on purpose.', action: a, target: '', doing: 'doing something quietly', subject: a === 'draw' ? 'the clock tower in the rain' : '', title: '', remember: '', diary: '' }); }
  else text = JSON.stringify({ thought: 'a small thought.', reaction: 'a reaction.', first_sight: 'something new.', diary: 'a reflection.', facts: ['a fact.'], topic: 'fog', title: 'a page', body: 'some words.' });
  const wantsTool = (body.tools || []).some(t => t.name === 'respond');
  const content = wantsTool && text.trim().startsWith('{') ? [{ type: 'tool_use', id: 'toolu_' + n, name: 'respond', input: JSON.parse(text) }] : [{ type: 'text', text }];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ content, stop_reason: wantsTool ? 'tool_use' : 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }));
}); }).listen(3099, () => console.log('mock claude on 3099'));
