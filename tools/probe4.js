// Comprueba si iA/iB/iC de los sprites sin iLook (recogibles?) son posiciones del mundo.
const { chromium } = require('playwright');
const path = require('path');
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
  const jugar = p.getByRole('button', { name: /^Jugar/ }).first();
  await jugar.waitFor({ timeout: 300000 });
  for (let i = 0; i < 20; i++) { const ok = p.getByRole('button', { name: /^(Entendido|Cerrar|Aceptar|Vale)/ }).first(); if (!await ok.isVisible()) break; await ok.click(); await p.waitForTimeout(800); }
  await jugar.click();
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(2500); await p.keyboard.press('Enter'); }
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(3000);
    console.log(JSON.stringify(await p.evaluate(() => {
      const out = [];
      window.__scene.traverse(m => {
        const g = m.isInstancedMesh && m.visible && m.count && m.geometry.attributes;
        if (!g || g.iLook || !g.iA) return;
        const r = a => [0, 1].map(k => Array.from({ length: a.itemSize }, (_, j) => +a.array[k * a.itemSize + j].toFixed(1)));
        out.push({ id: m.id, n: m.count, tex: m.material.uniforms?.map?.value?.image?.width, iA: r(g.iA), iB: r(g.iB), iC: r(g.iC) });
      });
      const c = window.__cam.position; return { cam: [c.x, c.z].map(v => +v.toFixed(1)), out };
    })));
  }
  await ctx.close();
})();
