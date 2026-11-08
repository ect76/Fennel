// Loaded before any of Percy's scripts run (node --import): no network, no other programs, no workers.
// The --permission flag already limits files to his project folder.
import { registerHooks } from 'node:module';
const NO = ['net', 'http', 'https', 'http2', 'dgram', 'tls', 'child_process', 'worker_threads', 'cluster', 'dns', 'inspector', 'vm', 'repl'];
const blocked = new Set(NO.flatMap(m => [m, 'node:' + m]));
registerHooks({ resolve(spec, ctx, next) { if (blocked.has(spec)) throw new Error('"' + spec + '" is not available in Percy\'s workshop (no network or other programs)'); return next(spec, ctx); } });
for (const k of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest']) { try { delete globalThis[k]; } catch {} }
