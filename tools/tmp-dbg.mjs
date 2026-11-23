import { startServer } from './serve.mjs';
const LIBS = '/workspace/work/dorokei-game/.browser-libs/usr/lib/x86_64-linux-gnu';
const pw = await import('/workspace/work/dcd-b17/node_modules/playwright/index.js');
const chromium = pw.chromium ?? pw.default.chromium;
const server = await startServer();
const browser = await chromium.launch({ args: ['--no-sandbox'], env: { ...process.env, LD_LIBRARY_PATH: `${LIBS}:${process.env.LD_LIBRARY_PATH ?? ''}` } });
const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(`${server.url}/?test=1`);
await page.waitForFunction(() => Boolean(window.__flip10));
await page.click('#btn-play');
await page.waitForSelector('#screen-play.is-active');
await page.evaluate(() => window.__flip10.setBoard([3, 2, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
console.log('before', await page.evaluate(() => ({ board: window.__flip10.game.board.map((t) => `${t.front}:${t.side[0]}`), target: window.__flip10.game.target, status: window.__flip10.game.status, busy: window.__flip10.state.busy })));
await page.evaluate(() => document.querySelector('#board .tile[data-i="5"]').click());
let elapsed = 0;
for (const tiks of [100, 250, 400, 550, 700, 900, 1200, 1600]) {
  await page.waitForTimeout(Math.max(0, tiks - elapsed));
  elapsed = tiks;
  const snap = await page.evaluate(() => ({
    clearing: document.querySelectorAll('#board .tile.is-clearing').length,
    score: window.__flip10.game.score,
    shown: document.querySelector('#hud-score').textContent,
    combo: document.querySelector('#combo').textContent,
    busy: window.__flip10.state.busy,
    vals: [...document.querySelectorAll('#board .tile')].map((n) => n.querySelector('.tile__value').textContent).join(','),
  }));
  console.log(tiks, JSON.stringify(snap));
}
await browser.close();
await server.close();
