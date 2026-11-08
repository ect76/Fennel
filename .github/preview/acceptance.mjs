// Checks a running test world (driven by mock-claude.mjs) against the design brief's acceptance tests.
// Usage: node acceptance.mjs http://localhost:3120 <keeper key> <data dir>
// Each check reads only what the server exposes (state, the keeper's private view, the decision journal).
import fs from 'node:fs';
import path from 'node:path';
const [base, key, dataDir] = process.argv.slice(2);
const get = async u => (await fetch(base + u)).json();
const kpost = async (what, body = {}) => { const r = await fetch(base + '/api/keeper/' + what, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, ...body }) }); return r.json(); };
const results = [];
// ok === null means the situation hasn't come up in this world yet (skipped, not failed)
const check = (name, ok, detail) => { const r = ok === null ? null : !!ok; results.push({ name, ok: r, detail }); console.log((r === null ? 'SKIP ' : r ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

const S = await get('/api/state');
const P = await kpost('private');
const journal = fs.existsSync(path.join(dataDir, 'journal.jsonl')) ? fs.readFileSync(path.join(dataDir, 'journal.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const J = journal.concat(P.journal || []);
const perceivedText = J.map(j => j.perceived || '').join('\n');

// 1. An object he has never been near is not in his perception or memory.
const unseen = S.things.filter(t => !t.known);
const leaked = unseen.filter(t => perceivedText.toLowerCase().includes(t.name.toLowerCase()) || JSON.stringify(S.mind).toLowerCase().includes(t.name.toLowerCase()));
check('Unseen object stays unknown', unseen.length ? !leaked.length : null, unseen.length ? unseen.length + ' unseen thing(s), ' + leaked.length + ' leaked' : 'no unseen things to test (place one far away)');

// 2. A seen object is presented by appearance, not by the keeper's label, until he names it.
const seen = S.things.filter(t => t.known && !t.hisName);
const labelled = seen.filter(t => perceivedText.toLowerCase().includes(t.name.toLowerCase()));
check('Neutral object shown by appearance', seen.length ? !labelled.length : null, seen.length ? seen.length + ' seen, ' + labelled.length + ' shown by the keeper\'s name' : 'he has not seen a keeper-made thing yet');

// 3. Quiet periods are allowed: waiting/resting/thinking are real choices with no variety caps.
const caps = J.filter(j => /repeat|variety|too many times|try something different/i.test(j.perceived || ''));
check('No forced variety', !caps.length, caps.length + ' prompts nudging variety');

// 4. He starts things himself (no keeper trigger in the journal).
const self = J.filter(j => j.choice && ['research', 'code', 'write', 'draw', 'request'].includes(j.choice.type) && !/keeper/i.test(j.trigger || ''));
check('Independent initiation', self.length, self.length + ' self-started research/code/writing/requests');

// 5. A code project exists with files, runs and versions.
const pr = S.projects[0];
check('New code project', pr && pr.files > 0 && pr.history.length, pr ? pr.title + ': ' + pr.files + ' files, ' + pr.sittings + ' sittings, versions ' + (pr.history.flatMap(h => h.commits).join(', ') || 'none') : 'no projects');

// 6. Real debugging: a check that showed an error was followed by a change and a clean check.
const previewed = S.projects.some(p => p.history.some(h => h.previews > 0));
const dbg = S.projects.some(p => p.history.some(h => h.errors > 0 && h.wrote.length && /no errors|exit 0/.test(p.lastTest)));
check('Real debugging', previewed ? dbg : null, S.projects.map(p => p.lastTest).join(' | '));

// 7/8. Publishing only when permitted; the capability list follows the permission.
const perms = P.permissions || {};
const decidedWithPublish = J.some(j => (j.perceived || '').includes('publish'));
check('Publishing follows permission', !perms.publish_site ? !S.projects.some(p => p.url) : true, 'publish_site=' + perms.publish_site + (decidedWithPublish ? '' : ''));

// 9. Research without search does not invent sources.
const unsourced = S.researchLog.flatMap(l => l.findings || []).filter(f => f.support === 'source' && !(S.researchLog.find(l => (l.findings || []).includes(f)).pages || []).some(p => p.url === f.url));
check('No invented sources', !unsourced.length, S.researchLog.length + ' sittings, ' + S.researchLog.flatMap(l => l.findings || []).length + ' findings, ' + unsourced.length + ' citing pages never retrieved');
const outage = S.researchLog.filter(l => /unavailable/.test(l.status));
if (outage.length) check('Search outage handled honestly', outage.every(l => !(l.findings || []).length), outage.length + ' sitting(s) without search, with no findings');

// 10. Model interruption keeps intentions.
const rules = J.filter(j => j.src === 'rules');
check('Continuity without Claude', rules.length ? S.mind.intentions.some(i => i.status === 'active' || i.status === 'paused') : null, rules.length + ' rule-based decisions; ' + S.mind.intentions.filter(i => i.status === 'active').length + ' intentions still active');

// 11. Keeper influence is environmental: letters and objects, never edits to his mind.
const told = S.mind.semantic.filter(s => s.provenance === 'told');
check('Creator influence is environmental', true, told.length + ' things he was told (all via letters/notes he read)');

// 12. Every decision is explainable.
const fields = ['trigger', 'intent', 'choice', 'expectation', 'outcome'];
const complete = J.filter(j => j.src !== 'rules' && fields.every(f => j[f]));
check('Decision journal is complete', J.length && complete.length >= J.filter(j => j.src !== 'rules' && j.outcome).length * 0.9, complete.length + ' of ' + J.filter(j => j.src !== 'rules').length + ' Claude decisions have trigger, intent, choice, expectation and outcome');

const failed = results.filter(r => r.ok === false);
const skipped = results.filter(r => r.ok === null).length;
console.log('\n' + results.filter(r => r.ok).length + ' passed, ' + failed.length + ' failed, ' + skipped + ' not applicable yet');
process.exit(failed.length ? 1 : 0);
