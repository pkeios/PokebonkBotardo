// Lee de la pantalla de Liga los Pokémon disponibles en la cuenta y los vuelca en dumps/roster.json (más captura e HTML para revisar).
const { openApp, gameWindow } = require('../app');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'dumps');

(async () => {
  const app = await openApp();
  const page = await gameWindow(app);
  const jugar = page.getByRole('button', { name: /^Jugar/ }).first();
  await jugar.waitFor({ timeout: 60000 });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1500);
    const ok = page.getByRole('button', { name: /^(Entendido|Aceptar|Vale)/ }).or(page.locator('[class*=modal]').getByRole('button', { name: /^Cerrar$/ })).first();
    if (await ok.isVisible().catch(() => false)) await ok.click().catch(() => {});
    if (await jugar.click({ timeout: 3000 }).then(() => true, () => false)) break;
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'roster-1.png') });
  const names = sel => page.$$eval(sel, es => es.map(e => e.innerText.trim()));
  const liga = await names('.ls-tile:not(.locked)'), listos = await names('.ls-tile.locked.ready');
  fs.writeFileSync(path.join(OUT, 'roster.txt'), liga.map(n => n.replace(/^\d+\s+/, '')).join('\n') + '\n');
  console.log('liga', liga.length, liga.join(', '));
  console.log('listos', listos.length, listos.join(', '));
  // Solo mira qué ofrece un Pokémon "listo": no pulsa ningún botón de confirmar.
  await page.locator('.ls-tile.locked.ready').first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'roster-2.png') });
  console.log('botones', await page.$$eval('button', bs => bs.filter(b => b.offsetParent).map(b => b.innerText.trim().replace(/\s+/g, ' ')).filter(t => t && t.length < 50).join(' | ')));
  await app.close();
})();
