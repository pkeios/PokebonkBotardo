// Entra al mapa 1 sin moverse y vuelca objetos de la escena con posición para identificar jugador/enemigos.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'dumps', 'probe2');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '..', 'profile'), { headless: false, viewport: { width: 1280, height: 720 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.addInitScript(() => {
    window.__obs = [];
    (window.__THREE_DEVTOOLS__ = new EventTarget()).addEventListener('observe', e => {
      const o = e.detail; window.__obs.push(o);
      if (o.render && o.domElement) { const r = o.render; o.render = function (s, c) { if (c?.isPerspectiveCamera) { window.__scene = s; window.__cam = c; } return r.apply(this, arguments); }; }
    });
  });
  await p.goto('https://pokebonk.com/');
  console.log('esperando menú principal (pasa el captcha si sale)...');
  await p.getByRole('button', { name: /^Jugar/ }).first().click({ timeout: 300000 });
  for (let i = 0; i < 3; i++) { await p.waitForTimeout(2500); await p.keyboard.press('Enter'); }
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press("1"); // elige carta si hay subida de nivel
    await p.waitForTimeout(2000);
    const d = await p.evaluate(() => {
      const s = window.__scene, c = window.__cam;
      const objs = [];
      s?.traverse(o => {
        if (!o.isMesh && !o.isSprite && !o.isPoints) return;
        const g = o.geometry?.type;
        if (o.isInstancedMesh || o.isSprite || g === 'PlaneGeometry') {
          const w = o.getWorldPosition(o.position.clone());
          objs.push({ cls: o.constructor.name, name: o.name, pname: o.parent?.name, pcls: o.parent?.constructor.name, g, vis: o.visible, inst: o.isInstancedMesh ? o.count : undefined,
            w: w.toArray().map(v => +v.toFixed(1)), sc: o.scale.toArray().map(v => +v.toFixed(2)), mat: o.material?.type, map: o.material?.map?.name || o.material?.map?.image?.src?.split('/').pop()?.slice(0, 40), ud: JSON.stringify(o.userData).slice(0, 80), pud: JSON.stringify(o.parent?.userData || {}).slice(0, 80) });
        }
      });
      const hud = [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.children.length === 0 && e.innerText?.trim()).map(e => (e.className || e.tagName) + ': ' + e.innerText.trim().slice(0, 40));
      const top = s ? s.children.map(o => { const w = o.getWorldPosition(o.position.clone()); return [o.constructor.name, o.type, o.name, o.children.length, o.visible, w.toArray().map(v => +v.toFixed(1)).join(",")].join("|"); }) : [];
      return { cam: c && { pos: c.position.toArray().map(v => +v.toFixed(1)), type: c.type }, n: objs.length, top, objs, hud };
    });
    fs.writeFileSync(path.join(OUT, `p${i}.json`), JSON.stringify(d, null, 1));
    await p.screenshot({ path: path.join(OUT, `p${i}.png`) });
    console.log('probe', i, d.n, d.hud.slice(0, 3).join(' / '));
  }
  await ctx.close();
})();
