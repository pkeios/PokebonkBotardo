// Abre la app de escritorio de PokéBonk controlada por Playwright y espera a la ventana del juego (la primera es la pantalla de carga).
const { _electron } = require('playwright');
const path = require('path');

async function openApp() {
  delete process.env.ELECTRON_RUN_AS_NODE; // VS Code la hereda: con ella, cualquier app Electron arranca como Node y se cierra
  const exe = process.env.BOT_APP || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'PokeBonk', 'PokeBonk.exe');
  const app = await _electron.launch({ executablePath: exe, timeout: 60000 });
  // fuera de la pantalla, no con hide(): oculta, la partida va unas 15 veces más lenta. show() la puede recolocar, por eso se repite
  if (process.env.BOT_HIDE) await app.evaluate(({ app: a, BrowserWindow }) => {
    const away = w => { w.setSkipTaskbar(true); w.setPosition(-20000, 0); };
    const track = w => { away(w); w.on('show', () => away(w)); };
    BrowserWindow.getAllWindows().forEach(track);
    a.on('browser-window-created', (_, w) => track(w));
  });
  return app;
}

async function gameWindow(app) {
  for (let i = 0; i < 120; i++) {
    const page = app.windows().find(w => !w.isClosed() && !/splash/.test(w.url()) && /^https?:/.test(w.url()));
    if (page) return page;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('la app no abrió la ventana del juego');
}

module.exports = { openApp, gameWindow };
