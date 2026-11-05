// Abre el juego (navegador visible), tú pasas el captcha y entras al mapa 1; vuelca escena + HUD cada 5 s en dumps/.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'dumps');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '..', 'profile'), {
    headless: false, viewport: { width: 1280, height: 720 },
  });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.addInitScript(() => {
    window.__obs = [];
    (window.__THREE_DEVTOOLS__ = new EventTarget()).addEventListener('observe', e => window.__obs.push(e.detail));
  });
  await p.goto('https://pokebonk.com/');
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(5000);
    const d = await p.evaluate(() => {
      const scenes = __obs.filter(o => o.isScene);
      const sc = scenes.map(s => { let n = 0; s.traverse(() => n++); return [s, n]; }).sort((a, b) => b[1] - a[1])[0]?.[0];
      const groups = {};
      sc?.traverse(o => {
        const k = [o.constructor.name, o.type, o.name, o.geometry?.type, o.material?.map?.image?.src?.split('/').pop()].join('|');
        const g = groups[k] ||= { n: 0, vis: 0, samples: [] };
        g.n++; if (o.visible) g.vis++;
        if (g.samples.length < 3) g.samples.push({
          pos: o.position.toArray().map(v => +v.toFixed(1)), parent: o.parent?.name || o.parent?.constructor.name,
          kids: o.children.length, ud: Object.keys(o.userData), own: Object.keys(o).filter(k => !/^(uuid|name|type|parent|children|up|position|rotation|quaternion|scale|matrix|matrixWorld|layers|visible|castShadow|receiveShadow|frustumCulled|renderOrder|animations|userData|geometry|material|matrixAutoUpdate|matrixWorldAutoUpdate|matrixWorldNeedsUpdate|id|_.*)$/.test(k)),
        });
      });
      const hud = [...document.querySelectorAll('body *')].filter(e => e.offsetParent && e.children.length === 0 && e.innerText?.trim())
        .map(e => (e.id || e.className || e.tagName) + ': ' + e.innerText.trim().slice(0, 40)).slice(0, 150);
      return { scenes: scenes.length, groups: Object.entries(groups).sort((a, b) => b[1].n - a[1].n).slice(0, 80), hud };
    });
    fs.writeFileSync(path.join(OUT, `d${i}.json`), JSON.stringify(d, null, 1));
    await p.screenshot({ path: path.join(OUT, `d${i}.png`) });
    console.log('dump', i);
  }
  await ctx.close();
})();
