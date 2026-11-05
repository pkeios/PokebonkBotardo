// Vuelca posiciones de instancias (sprites) para identificar jugador/enemigos/recogibles.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'dumps', 'probe3');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '..', 'profile'), { headless: false, viewport: { width: 1280, height: 720 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.addInitScript(() => {
    (window.__THREE_DEVTOOLS__ = new EventTarget()).addEventListener('observe', e => {
      const o = e.detail;
      if (o.render && o.domElement) { const r = o.render; o.render = function (s, c) { if (c?.isPerspectiveCamera) { window.__scene = s; window.__cam = c; } return r.apply(this, arguments); }; }
    });
  });
  await p.goto('https://pokebonk.com/');
  await p.getByRole('button', { name: /^Jugar/ }).first().click({ timeout: 300000 });
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(2500); await p.keyboard.press('Enter'); }
  for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(2500);
    if (i === 3) { await p.keyboard.down('KeyD'); await p.waitForTimeout(1500); await p.keyboard.up('KeyD'); } // moverse para ver qué sigue a la cámara
    const d = await p.evaluate(() => {
      const c = window.__cam, out = [];
      const dir = c.getWorldDirection(c.position.clone());
      window.__scene.traverse(o => {
        if (!o.isInstancedMesh || !o.visible || !o.count || o.count > 500) return;
        const m = o.instanceMatrix.array, pos = [];
        for (let k = 0; k < Math.min(o.count, 6); k++) pos.push([m[k * 16 + 12], m[k * 16 + 13], m[k * 16 + 14]].map(v => +v.toFixed(1)));
        const u = o.material.uniforms || {};
        const tex = Object.entries(u).map(([k, v]) => v?.value?.image?.src ? k + '=' + v.value.image.src.split('/').pop() : v?.value?.image ? k + '=' + v.value.image.width + 'x' + v.value.image.height : null).filter(Boolean);
        out.push({ id: o.id, count: o.count, geo: o.geometry.type, uni: Object.keys(u).join(','), tex, attrs: Object.keys(o.geometry.attributes).join(','), pos });
      });
      return { cam: c.position.toArray().map(v => +v.toFixed(1)), dir: dir.toArray().map(v => +v.toFixed(2)), out };
    });
    fs.writeFileSync(path.join(OUT, `q${i}.json`), JSON.stringify(d, null, 1));
    console.log('q', i, d.cam.join(','), d.out.length);
  }
  await ctx.close();
})();
