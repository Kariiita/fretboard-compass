/** 导出指板实际渲染的框与「和弦音白圈」坐标，用于核对重叠框问题 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = 9335;
const profile = join(tmpdir(), `cdp3-${Date.now()}`);
mkdirSync(profile, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1440,1400', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res) => pend.set(i, res));
};
const ev = async (js) => {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { ${js} })()`, returnByValue: true, awaitPromise: true,
  });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);

const shapes = await ev(`
  return [...document.querySelectorAll('.box-item')].map(b => b.innerText.replace(/\\n/g, ' '));
`);
console.log('把位形状:');
for (const s of shapes) console.log('  ' + s);

const dump = await ev(`
  const rects = [...document.querySelectorAll('.box-hit')].map(g => {
    const r = g.querySelector('rect');
    const t = g.querySelector('text');
    return { label: t.textContent, x: +r.getAttribute('x'), y: +r.getAttribute('y'),
             w: +r.getAttribute('width'), h: +r.getAttribute('height'),
             active: !r.getAttribute('stroke-dasharray') };
  });
  const rings = [...document.querySelectorAll('circle[stroke="rgba(248,243,234,0.92)"]')]
    .map(c => ({ cx: +(c.getAttribute('cx')), cy: +(c.getAttribute('cy')) }));
  return { rects, rings };
`);

const NUT_X = 64, SPACING = 62, TOP = 52, GAP = 40;
const fretOfX = (x) => Math.round((x - NUT_X) / SPACING + 0.5);
// 6 弦（低音 E）画在最下面、1 弦在最上面，所以 y 越大弦号越小
const strOfY = (y) => 5 - Math.round((y - TOP) / GAP);

console.log('框数量:', dump.rects.length);
for (const r of dump.rects) {
  console.log(
    `  ${r.label.padEnd(4)} x[${r.x}..${r.x + r.w}] → 品 ${fretOfX(r.x)}..${fretOfX(r.x + r.w)}` +
    `  y[${r.y}..${r.y + r.h}] → 弦 ${strOfY(r.y)}..${strOfY(r.y + r.h)}（上→下）` +
    (r.active ? '  [当前]' : ''),
  );
}
console.log('白圈（和弦音）数量:', dump.rings.length);
console.log(
  dump.rings.map((r) => `${strOfY(r.cy)}弦/${fretOfX(r.cx)}品`).join('  '),
);
const rect = await ev(`
  const b = document.querySelector('.fretboard').getBoundingClientRect();
  return { w: b.width, h: b.height };
`);
console.log('SVG 显示尺寸:', JSON.stringify(rect));

ws.close();
chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch {}
