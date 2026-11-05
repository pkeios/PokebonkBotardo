// Graba una sesión jugada por una persona: una línea JSON por segundo y una captura cada 5 s en dumps/humano/.
// Uso: node tools/record.js   (se abre visible; se termina cerrando la ventana)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'dumps', 'humano');
fs.mkdirSync(OUT, { recursive: true });
const log = fs.createWriteStream(path.join(OUT, `sesion-${Date.now()}.jsonl`));

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '..', 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--disable-features=CalculateNativeWinOcclusion'] });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.addInitScript(() => {
    window.__keys = {};
    addEventListener('keydown', e => { window.__keys[e.code] = (window.__keys[e.code] || 0) + 1; }, true);
  });
  await page.goto('https://pokebonk.com/');
  console.log('Juega normalmente. Cierra la ventana para terminar.');
  let closed = false, i = 0;
  ctx.on('close', () => { closed = true; });
  while (!closed) {
    await new Promise(r => setTimeout(r, 1000));
    const row = await page.evaluate(() => {
      const txt = s => document.querySelector(s)?.textContent.trim() || '';
      const keys = window.__keys; window.__keys = {};
      const cards = [...document.querySelectorAll('.card')].filter(e => e.offsetParent).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 90));
      return { timer: txt('.timer'), zona: txt('.ht-zone'), nivel: txt('.tl-lvl b'), oro: txt('.wl-gold b'), hp: document.querySelector('.hpbar i')?.style.transform || '',
        aviso: [...document.querySelectorAll('.prompt')].find(e => e.offsetParent)?.dataset.t || '', flecha: [...document.querySelectorAll('.compass:not(.mktag)')].find(e => e.offsetParent)?.dataset.k || '', keys, cards };
    }).catch(() => null);
    if (row) log.write(JSON.stringify({ t: Date.now(), ...row }) + '\n');
    if (++i % 5 === 0) await page.screenshot({ path: path.join(OUT, `s${i}.png`) }).catch(() => {});
  }
  log.end();
})();
