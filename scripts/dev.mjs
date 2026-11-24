#!/usr/bin/env node
// Arranca API (http://localhost:4000) y web (http://localhost:5173) a la vez, con salida coloreada.
import { spawn } from 'node:child_process';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  ['api', '\x1b[36m', ['run', 'dev', '-w', '@kinko/api']],
  ['web', '\x1b[35m', ['run', 'dev', '-w', '@kinko/web']],
].map(([name, color, args]) => {
  const p = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env, shell: process.platform === 'win32' });
  const out = (d) => String(d).split('\n').filter(Boolean).forEach((l) => console.log(`${color}[${name}]\x1b[0m ${l}`));
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', (code) => { console.log(`${color}[${name}]\x1b[0m terminó (${code})`); procs.forEach((x) => x.kill()); process.exit(code ?? 0); });
  return p;
});
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log('\n  Kinkō en desarrollo →  web: http://localhost:5173   ·   API: http://localhost:4000/api/health');
console.log('  Desde el móvil (misma wifi): http://<IP-de-tu-PC>:5173\n');
