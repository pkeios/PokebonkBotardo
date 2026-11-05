// Inicia sesión con una cuenta en el perfil del bot (una vez; la sesión queda guardada en profile/).
// Uso: PB_USER=... PB_PASS=... node tools/login.js   (las credenciales no se guardan en ningún archivo)
const { chromium } = require('playwright');
const path = require('path');
const { PB_USER, PB_PASS } = process.env;
if (!PB_USER || !PB_PASS) throw new Error('faltan PB_USER / PB_PASS');
const shot = (p, n) => p.screenshot({ path: path.join(__dirname, '..', 'dumps', `login-${n}.png`) });

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, '..', 'profile'), { headless: false, viewport: { width: 1280, height: 720 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.goto('https://pokebonk.com/');
  await p.waitForTimeout(6000);
  await shot(p, 1);
  // sesión de invitado abierta: salir primero
  const salir = p.getByRole('button', { name: /^Salir$/ }).first();
  if (await salir.isVisible().catch(() => false)) {
    await salir.click();
    await p.waitForTimeout(1500);
    await shot(p, 2);
    const ok = p.getByRole('button', { name: /^(Salir|Sí|Confirmar|Aceptar|Cerrar sesión)/ }).last();
    if (await ok.isVisible().catch(() => false)) await ok.click();
    await p.waitForTimeout(3000);
  }
  await p.getByText('Entrar', { exact: true }).first().click({ timeout: 60000 });
  await p.waitForTimeout(1000);
  await p.locator('input:not([type=password]):visible').first().fill(PB_USER);
  await p.locator('input[type=password]:visible').first().fill(PB_PASS);
  await shot(p, 3);
  await p.locator('input[type=password]:visible').first().press('Enter');
  console.log('enviado; si sale el captcha, márcalo en la ventana');
  await p.getByRole('button', { name: /^Jugar/ }).first().waitFor({ timeout: 180000 }).catch(() => {});
  await p.waitForTimeout(3000);
  await shot(p, 4);
  const who = await p.evaluate(u => [...document.querySelectorAll('button, b, span')].filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(t => t.toLowerCase().includes(u) || /invitado/i.test(t)).slice(0, 3), PB_USER.toLowerCase());
  console.log('sesión:', who.join(' | ') || '(no encuentro el nombre, mira dumps/login-4.png)');
  await ctx.close();
})();
