// Quieto en el mapa 1: muestrea vida y sprites sin iLook (proyectiles/efectos) por tipo (iC.x, mesh) cerca del jugador.
// Los tipos más frecuentes justo antes de perder vida = ataques enemigos.
const { chromium } = require('playwright');
const fs = require('fs');
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
  const dismiss = async () => { for (let i = 0; i < 20; i++) { const ok = p.getByRole('button', { name: /^(Entendido|Cerrar(?! sesión)|Aceptar|Vale)/ }).first(); if (!await ok.isVisible()) break; await ok.click(); await p.waitForTimeout(800); } };
  await dismiss(); await jugar.click();
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(2500); await dismiss(); await p.keyboard.press('Enter'); }
  await p.waitForTimeout(3000);
  const samples = [];
  for (let i = 0; i < 200; i++) {
    const s = await p.evaluate(() => {
      const c = window.__cam, dir = c.getWorldDirection(c.position.clone()), o = c.position;
      // jugador: punto del suelo bajo el rayo central (aprox: sprite más cercano al rayo)
      let best = null, bd = 1e9;
      window.__scene.traverse(m => { const g = m.isInstancedMesh && m.visible && m.geometry.attributes; if (!g?.iLook) return; for (let i = 0; i < m.count; i++) { const v = [g.iPos.getX(i) - o.x, g.iPos.getY(i) - o.y, g.iPos.getZ(i) - o.z], t = v[0] * dir.x + v[1] * dir.y + v[2] * dir.z, d = Math.hypot(v[0] - t * dir.x, v[1] - t * dir.y, v[2] - t * dir.z); if (d < bd) bd = d, best = [g.iPos.getX(i), g.iPos.getZ(i)]; } });
      const near = {};
      window.__scene.traverse(m => {
        const g = m.isInstancedMesh && m.visible && m.count && m.geometry.attributes;
        if (!g || g.iLook || !g.iA || m.count > 600) return;
        for (let i = 0; i < m.count; i++) {
          const d = Math.hypot(g.iA.getX(i) - best[0], g.iA.getZ(i) - best[1]);
          if (d < 6) { const k = m.id + ':' + Math.round(g.iC.getX(i)); near[k] = (near[k] || 0) + 1; }
        }
      });
      const hp = +((document.querySelector('.hpbar i')?.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 1])[1]);
      return { hp, near };
    });
    samples.push(s);
    if (s.hp === 0 || await p.evaluate(() => /debilitado/.test(document.body.innerText))) break;
    await p.waitForTimeout(200);
  }
  // por tipo: presencia en muestras previas a un golpe vs presencia media
  const all = {}, hit = {}; let nHit = 0;
  samples.forEach((s, i) => {
    for (const k in s.near) all[k] = (all[k] || 0) + 1;
    if (i + 1 < samples.length && samples[i + 1].hp < s.hp - 0.02) { nHit++; for (const k in s.near) hit[k] = (hit[k] || 0) + 1; }
  });
  const rows = Object.keys(all).map(k => [k, all[k] / samples.length, (hit[k] || 0) / (nHit || 1)]).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]));
  console.log('muestras', samples.length, 'golpes', nHit);
  rows.forEach(r => console.log(r[0].padEnd(10), 'media', r[1].toFixed(2), 'antes de golpe', r[2].toFixed(2)));
  fs.writeFileSync(path.join(__dirname, '..', 'dumps', 'probe7.json'), JSON.stringify(samples));
  await ctx.close();
})();
