// Tipos de objetos del mapa: nombres de mallas con su cadena de padres, color y posición; y especies de sprites que no se mueven.
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
  await p.waitForTimeout(4000);
  console.log(JSON.stringify(await p.evaluate(() => { const out = []; const w = window.__cam.position.clone(); window.__scene.traverse(m => { if (m.name !== "Lid" || !m.visible) return; const g = m.parent; g.getWorldPosition(w); out.push({ at: [w.x, w.z].map(Math.round), mat: m.material.name, map: m.material.map?.name || m.material.map?.image?.src?.split("/").pop(), col: m.material.color.getHexString(), emis: m.material.emissive?.getHexString(), gname: g.name, gud: JSON.stringify(g.userData).slice(0, 80), ggud: JSON.stringify(g.parent?.userData).slice(0, 80), sib: g.children.map(c => c.name + ":" + (c.material?.color?.getHexString() || "") + ":" + (c.material?.map?.image?.src?.split("/").pop() || "")).join(" ") }); }); return out.slice(0, 8); }), null, 1)); await ctx.close(); return;
  const sprites = () => p.evaluate(() => { const r = {}; window.__scene.traverse(m => { const g = m.isInstancedMesh && m.visible && m.geometry.attributes; if (!g?.iLook) return; const id = m.material.uniforms.map.value.image.src.match(/(\d+)\.png/)?.[1]; for (let i = 0; i < m.count; i++) (r[id] ||= []).push([g.iPos.getX(i), g.iPos.getZ(i)].map(v => +v.toFixed(1))); }); return r; });
  const s1 = await sprites(); await p.waitForTimeout(4000); const s2 = await sprites();
  const objs = await p.evaluate(() => {
    const out = {}, w = window.__cam.position.clone();
    window.__scene.traverse(m => {
      if (!m.isMesh || m.isInstancedMesh || !m.name || !m.visible) return;
      const chain = []; for (let a = m.parent; a && !a.isScene; a = a.parent) chain.push(a.name || a.constructor.name);
      const k = m.name + ' < ' + chain.slice(0, 4).join(' < ');
      m.getWorldPosition(w);
      const col = m.material?.color?.getHexString?.();
      (out[k] ||= []).push(col + '@' + w.x.toFixed(0) + ',' + w.z.toFixed(0));
    });
    return out;
  });
  const moved = {};
  for (const id in s1) moved[id] = s1[id].map((q, i) => s2[id]?.[i] ? Math.hypot(q[0] - s2[id][i][0], q[1] - s2[id][i][1]).toFixed(1) : '?');
  fs.writeFileSync(path.join(__dirname, '..', 'dumps', 'probe5.json'), JSON.stringify({ moved, objs }, null, 1));
  console.log('ok');
  await ctx.close();
})();
