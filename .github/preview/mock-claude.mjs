// A stand-in for the Claude API, for tests and preview screenshots. It plays along with every tool Percy uses,
// including multi-step research and coding sittings, so the whole loop can be exercised without real calls.
import http from 'node:http';
const port = Number(process.env.MOCK_PORT || 3099);
let n = 0, plan = 0;
const ids = (text, re) => [...String(text).matchAll(re)].map(m => m[1]);
const textOf = c => typeof c === 'string' ? c : (c || []).map(b => b.text || (b.type === 'tool_result' ? (typeof b.content === 'string' ? b.content : (b.content || []).map(x => x.text || '').join(' ')) : '')).join('\n');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#f3ead8"/><circle cx="400" cy="420" r="210" fill="#7aa6c2" stroke="#223" stroke-width="10"/><rect x="330" y="200" width="140" height="120" fill="#c94" stroke="#223" stroke-width="8"/><text x="720" y="770" font-size="36">P.</text></svg>';
const PLAN = ['look', 'go', 'enter', 'look', 'research', 'code', 'write', 'draw', 'request', 'code', 'research', 'wait', 'eat', 'think'];

function decide(prompt) {
  const tr = String(prompt).split('\n').find(l => l.startsWith('How his recent efforts')); if (tr) console.log('[mock] saw: ' + tr);
  if (process.env.MOCK_LOG) for (const l of String(prompt).split('\n')) if (/^A passing whim|^intention |^Recent investigations|^Buildings in view|^PERCEPTION|card on the doormat/.test(l) || /door (open|locked)|post waiting/.test(l)) console.log('[mock] ' + l.slice(0, 400));
  const places = ids(prompt, /place (\w+): /g), things = ids(prompt, /thing (\w+): /g), projects = ids(prompt, /project (pr\w+) /g), inv = ids(prompt, /(R\w+) "/g);
  const step = PLAN[plan++ % PLAN.length];
  const FEEL = [['curious', 0.4], ['tired', -0.3], ['pleased', 0.6], ['uneasy', -0.5], ['calm', 0.1]][plan % 5];
  const base = { feeling: { word: FEEL[0], valence: FEEL[1] }, intention: { op: 'new', text: 'see what this place is', why: 'everything is unfamiliar', horizon: 'today' }, expectation: 'something will happen', thought: 'a small thought.', caption: '' };
  const a = { look: { type: 'look', args: { at: things[0] || 'around' } }, go: { type: 'go', args: { to: places[0] || 'home' } }, enter: { type: 'enter', args: { place: places[0] || 'x' } },
    research: { type: 'research', args: inv[0] && plan > 12 ? { continue: inv[0], question: '' } : { question: 'how does a clock keep time', why: 'the tower clock', where: 'home' } },
    code: { type: 'code', args: projects[0] ? { project: projects[0], goal: 'fix what is broken' } : { project: 'new', title: 'Clock face', goal: 'a page that shows a ticking clock', where: 'home' } },
    write: { type: 'write', args: { kind: 'page', about: 'the clock', title: 'Notes on the clock', publish: true } }, draw: { type: 'draw', args: { subject: 'the clock tower in fog', offer_at_stall: true } },
    request: { type: 'request', args: { kind: 'object', what: 'a small brass telescope', why: 'to see the clock face from home', missing: 'nothing to see far with', alternatives: 'walking there', dependencies: 'none', interest: 'medium' } },
    wait: { type: 'wait', args: { minutes: 30 } }, eat: { type: 'eat', args: { where: 'home' } }, think: { type: 'think', args: { about: 'the clock', minutes: 15 } } }[step];
  if (process.env.MOCK_SEQ) { const seq = JSON.parse(process.env.MOCK_SEQ); return { ...base, action: seq[Math.min(plan - 1, seq.length - 1)], notes: [] }; }
  if (process.env.MOCK_NAMES) { // refer to things by name, the way Claude often does
    const seq = [{ type: 'look', args: { at: 'around' } }, { type: 'go', args: { to: 'the village green' } }, { type: 'look', args: { at: 'around' } }, { type: 'go', args: { to: 'the bakery' } }, { type: 'enter', args: { place: "Crumb's Bakery" } }, { type: 'look', args: { at: 'around' } }, { type: 'read', args: { what: 'the railway timetable' } }, { type: 'take', args: { item: 'mantel clock' } }, { type: 'eat', args: { where: 'the bakery' } }, { type: 'go', args: { to: 'my cottage' } }];
    return { ...base, action: seq[(plan - 1) % seq.length], notes: [] };
  }
  return { ...base, action: a, notes: n % 5 === 0 ? [{ kind: 'question', text: 'why does the clock strike?' }] : [] };
}
function sittingTurn(body) {
  const names = body.tools.map(t => t.name), turn = body.messages.filter(m => m.role === 'assistant').length;
  const last = textOf(body.messages[body.messages.length - 1].content);
  const use = (name, input) => ({ type: 'tool_use', id: 'tu' + (++n), name, input });
  if (names.includes('record_finding')) {
    if (turn === 0) return [use('search', { query: 'how does a pendulum clock keep time' })];
    if (turn === 1) { const u = (last.match(/"url":"(https?:[^"]+)"/) || [])[1] || 'https://en.wikipedia.org/wiki/Pendulum_clock'; return [use('open_page', { url: u })]; }
    if (turn === 2) { const u = (last.match(/"url":"(https?:[^"]+)"/) || [])[1] || ''; return [use('record_finding', { claim: 'A pendulum swings at a steady rate, which is what keeps the clock regular.', support: 'source', url: u, confidence: 0.8 }), use('record_finding', { claim: 'The tower clock probably has a pendulum.', support: 'speculation' }), use('note_lead', { what: 'what is a railway timetable?', url: u, why: 'mentioned on the clock page' })]; }
    return [use('finish', { summary: 'Pendulums keep clocks regular.', status: 'partly answered', why_stopped: 'end of sitting', new_questions: ['how are railway clocks kept in time?'] })];
  }
  if (names.includes('write_file') && process.env.MOCK_SITE) {
    const steps = [
      [use('add_drawing', { drawing: (textOf(body.messages[0].content).match(/\b(d[a-z0-9]{6,})\b "/) || [])[1] || 'none', path: 'images/art.svg' }), use('write_file', { path: 'index.html', content: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Shop</title></head><body><h1>Shop</h1><img src="images/art.svg" alt="art"><img src="images/missing.png"><a href="about.html">About</a><script type="application/json" id="percy-shop"></script></body></html>' })],
      [use('check_page', { path: 'index.html' }), use('preview', { path: 'index.html', device: 'phone', full_page: true })],
      [use('shop', { action: 'list' }), use('make_graphic', { description: 'a small round blue logo', path: 'images/logo.svg', width: 64, height: 64 })],
      [use('publish', { as_front_page: true })],
    ];
    if (turn < steps.length) return steps[turn];
    return [use('finish', { summary: 'site tools test', status: 'continuing' })];
  }
  if (names.includes('write_file')) {
    if (turn === 0) return [use('write_file', { path: 'index.html', content: '<!doctype html><title>Clock</title><h1>Clock</h1><p id="t"></p><script>setInterval(()=>{ document.getElementById("t").textContent = new Date().toLocaleTimeString(); tick(); }, 500)</script>' }), use('write_file', { path: 'check.js', content: 'console.log("2+2 =", 2 + 2);' })];
    if (turn === 1) return [use('run_script', { path: 'check.js' }), ...(names.includes('preview') ? [use('preview', { path: 'index.html' })] : [])];
    if (turn === 2) return [use('edit_file', { path: 'index.html', old_text: ' tick();', new_text: '' }), use('note', { kind: 'bug', text: 'tick() was not defined; removed it' })];
    if (turn === 3) return [...(names.includes('preview') ? [use('preview', { path: 'index.html' })] : []), use('commit', { message: 'clock page works' })];
    if (turn === 4 && names.includes('publish')) return [use('publish', {})];
    return [use('finish', { summary: 'Made a clock page and fixed an error the browser showed.', status: 'continuing', next_step: 'add a second hand', learned: 'preview shows errors that are easy to miss' })];
  }
  return [{ type: 'text', text: 'done' }];
}
function respond(body) {
  const sys = JSON.stringify(body.system), p = textOf(body.messages[0].content);
  if (/SVG graphics for websites/.test(sys)) return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#3a6fd8"/><circle cx="32" cy="32" r="14" fill="#ffffff"/><path d="M10 32h44" stroke="#123" stroke-width="3"/></svg>' };
  if (/3D toy designer/.test(sys)) return { name: 'cat statue', look: 'a grey four-legged figure sitting upright on a stone block, with pointed ears and a red band at its neck, about twice your height', label: '', parts: [{ shape: 'box', size: [1, 0.3, 1], pos: [0, 0.15, 0], color: '#888888' }, { shape: 'sphere', size: [0.6], pos: [0, 1, 0], color: '#bbbbbb' }] };
  if (/You populate a simulated village/.test(sys)) { const ids = [...p.matchAll(/^(\w{6,10}): /gm)].map(m => m[1]); return { people: ids.map((id, i) => ({ id, name: 'Person ' + i, who: 'a cheerful person in a woolly hat', role: 'the one who keeps this place', knows: 'bees' })) }; }
  if (/You play one person/.test(sys)) { const q = (p.match(/^(\w{6,12}): /m) || [])[1]; return { reply: 'Hello, love! Yes, I am only minding the place today. That brass box is the till; you press the keys to add up a sale.', answered: q ? [q] : [] }; }
  if (/would sell that he might want/.test(p)) return { items: [{ name: 'tin whistle', look: 'a thin metal tube with six holes along it and a flat mouthpiece', price: 2, use: 'Blowing into it makes a thin reedy note; covering the holes changes it, and after a while he can nearly play a tune.', food: 0, uses: 0, restock: true }, { name: 'iced bun', look: 'a soft round roll with white sugar on top', price: 1, use: 'Sweet and squashy.', food: 15, uses: 0, restock: true }] };
  if (/tries out a thing/.test(p)) return { use: 'It clicks and whirrs, then a tiny paper bird pops out of the top.' };
  if (/describe things/.test(sys)) return { detail: 'Inside, behind the glass, a small brass key on a hook and a folded slip reading "Wound Mondays".' };
  if (/describe places/.test(sys)) return { feel: 'Dim and quiet, with dust in the light.', items: [{ name: 'a mantel clock', look: 'a wooden box with a round glass face and two thin hands', text: 'Hattersley & Sons', can_take: true }, { name: 'a railway timetable', look: 'a folded sheet of thin paper printed with columns of numbers', text: 'Mossbrook 08:12, 09:40, 11:05', can_take: true }, { name: 'a chair', look: 'a wooden seat with four legs and a back', text: '', can_take: false }] };
  if (/write as Percy/.test(sys)) return { title: 'Notes on the clock', body: 'The tower has a face with two hands. I do not know yet how it keeps going.' };
  if (/help Percy read/.test(sys)) return { points: ['clocks were once set by the sun'], questions: ['who sets the tower clock?'], gist: 'a short book about clocks' };
  if (/consolidate memories/.test(sys)) return { summary: 'He looked around, went out, and read about clocks.', views: [], lessons: [] };
  if (/Do not name it/.test(p)) return { look: 'a small object' };
  return {};
}
http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = JSON.parse(b || '{}'); const names = (body.tools || []).map(t => t.name);
    let content;
    if (names.includes('decide')) content = [{ type: 'tool_use', id: 'd' + (++n), name: 'decide', input: decide(textOf(body.messages[0].content)) }];
    else if (names.includes('finish')) content = sittingTurn(body);
    else if (names.includes('respond')) content = [{ type: 'tool_use', id: 'r' + (++n), name: 'respond', input: respond(body) }];
    else content = [{ type: 'text', text: SVG }];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'm' + n, type: 'message', role: 'assistant', content, stop_reason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: { input_tokens: 3000, output_tokens: 300, cache_read_input_tokens: 1000 } }));
  });
}).listen(port, () => console.log('mock claude on ' + port));
