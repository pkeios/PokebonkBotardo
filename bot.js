// Bot para PokéBonk: entra al primer mapa (Bosque Verde, Clásico, Normal), esquiva enemigos y registra cuánto aguanta.
// Uso: node bot.js [partidas]   (por defecto 1). Resultados en runs.csv
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch {} // PB_USER y PB_PASS, opcional
const RUNS = +process.argv[2] || 1;
const REGION = process.env.BOT_REGION || 'Bosque Verde'; // mapa: Bosque Verde, Desierto Rocoso, Costa Tormenta, Glaciar Celeste
const BUILD = process.env.BOT_BUILD || ''; // qué priorizar en las cartas: 'dmg', 'area' o 'crit' (vacío: equilibrado)
const BUILD_RE = { dmg: /daño|velocidad de ataque|recarga|proyectil/i, area: /área|alcance|duración/i, crit: /crítico/i }[BUILD];
// estilo según el Pokémon (ver evaluate()): radio en el que un enemigo empuja, vida para modo supervivencia, enemigos cerca para soltar el objetivo
const PROFILE = { name: 'normal', danger: 9, lowHp: 0.4, busyN: 3 };
let DANGER = PROFILE.danger;
const EDGE = 110; // a partir de aquí tira hacia el centro (el mapa acaba ~165)
// shortcut: listas por nº de Pokédex vistas en Bosque Verde; otros mapas/eventos pueden traer NPC distintos
// shortcut: listas de NPC vistas en Bosque Verde; en otros mapas esas especies pueden ser enemigos (p. ej. Meowth en Costa Tormenta)
const FOREST = REGION === 'Bosque Verde';
const BONUS = new Set(FOREST ? ['143', '137'] : []); // Snorlax, Porygon: bonificaciones a las que ir
const NPC = new Set(FOREST ? ['52', '132', '81', '97', '201', ...BONUS] : []); // Meowth (tienda), Ditto, Magnemite, Hypno, Unown (giran en los altares): no son enemigos

const unit = (x, z) => { const n = Math.hypot(x, z) || 1; return [x / n, z / n]; };

// Estado -> teclas WASD relativas a la cámara. Pura, para poder probarla.
function steer({ player, enemies, fwd, target, walls = [], hp = 1, shots = [], tw = 0.15, boss = null }, t) {
  let x = 0, z = 0;
  const push = ([ex, ez], r, w) => {
    const dx = player[0] - ex, dz = player[1] - ez, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-6) { x += w * dx / d2; z += w * dz / d2; }
  };
  if (hp < PROFILE.lowHp && tw < 0.4) target = null; // poca vida: solo sobrevivir (salvo objetivos fuertes como el portal, que es la salida)
  for (const e of enemies) push(e, hp < PROFILE.lowHp ? DANGER * 1.6 : DANGER, 1);
  for (const w of walls) push(w, 8, 3);
  if (boss) push(boss, 22, 8); // el jefe pega muy fuerte: mucha más distancia
  // shortcut: proyectiles por color; si hay más de 10 suele ser un efecto propio (Danza Lluvia...) y se ignoran
  if (shots.length <= 10) for (const s of shots) push(s, 5, 2.5); // proyectiles: más peso que un enemigo
  const danger = Math.hypot(x, z);
  if (danger > 0.05) [x, z] = [x - 0.6 * z, z + 0.6 * x]; // rodear a la horda en vez de huir recto (solo la parte de esquivar)
  if (target) { const [tx, tz] = unit(target[0] - player[0], target[1] - player[1]); x += tw * tx; z += tw * tz; }
  const r = Math.hypot(...player);
  // empuje hacia el centro cerca del borde (la horda acorrala contra la pared), salvo si el objetivo está también junto al borde;
  // pegado a la pared (>150) empuja fuerte siempre
  const edgePull = (r > EDGE && !(target && Math.hypot(...target) > EDGE - 10) ? 0.03 * (r - EDGE) : 0) + (r > 150 ? 0.1 * (r - 150) : 0);
  if (edgePull) { x -= edgePull * player[0] / r; z -= edgePull * player[1] / r; }
  if (Math.hypot(x, z) < 1e-3) { x = Math.cos(t / 4000); z = Math.sin(t / 4000); } // nada que hacer: pasear en círculo
  const f = unit(...fwd);
  const [along, side] = unit(x * f[0] + z * f[1], x * -f[1] + z * f[0]);
  const keys = [];
  if (along > 0.38) keys.push('KeyW'); if (along < -0.38) keys.push('KeyS');
  if (side > 0.38) keys.push('KeyD'); if (side < -0.38) keys.push('KeyA');
  return keys;
}

// Elige objetivo: fusionador (con 2+ habilidades MAX) > Poké Ball azul gratis > altar > NPC de bonificación > Poké Ball de pago si alcanza el oro.
// Cada nivel de prioridad "vale" 30 unidades de distancia.
function pickTarget(targets, player, { maxCount = 0, gold = 0, ballPrice = Infinity, level = 99, hp = 1, healBelow = 0.6, healRange = 80 } = {}) {
  // con 2 MAX el fusionador gana siempre; con 1 MAX se acerca hasta 30 unidades para tenerlo a mano cuando llegue la segunda
  const prio = { portal: -300, guardian: -200, heal: hp < healBelow ? (healBelow > 0.6 ? -250 : -150) : null, // antes del guardián, curarse va primero // con poca vida, a curarse con bayas
    fusion: maxCount >= 1 ? -100 : null,
    free: 1, altar: level >= 5 && hp >= 0.5 ? 2 : null, npc: 1, // altar con poca vida = quedarse quieto en la horda // Snorlax/Porygon dan buenas opciones: como una Poké Ball gratis
    capture: hp >= 0.4 ? -120 : null, // Pokémon marcado para capturar: dura poco, va antes que el fusionador
    paid: gold >= ballPrice * 3 ? 1 : gold >= ballPrice ? 4 : null }; // con oro de sobra, como una gratis
  const rich = gold >= ballPrice * 3;
  let best = null, bestScore = Infinity;
  for (const t of targets) {
    const p = prio[t.kind];
    if (p == null) continue;
    if (p > 0 && Math.hypot(t.x - player[0], t.z - player[1]) > (t.kind === 'paid' && rich ? 120 : 60)) continue;
    if (t.kind === 'capture' && Math.hypot(t.x - player[0], t.z - player[1]) > 80) continue; // no da tiempo a llegar
    if (t.kind === 'heal' && Math.hypot(t.x - player[0], t.z - player[1]) > healRange) continue; // bayas solo si están razonablemente cerca // objetivos normales solo cerca: cruzar el mapa deja atrás la pelea (y la experiencia)
    if (t.kind === 'fusion' && maxCount === 1 && Math.hypot(t.x - player[0], t.z - player[1]) < 30) continue; // ya está cerca: hacer otras cosas por la zona
    const s = p * 30 + Math.hypot(t.x - player[0], t.z - player[1]);
    if (s < bestScore) best = t, bestScore = s;
  }
  return best;
}

// Flecha del HUD (desplazamiento en pantalla desde el centro + "37 m") -> punto del mundo. Pantalla arriba = adelante de la cámara.
// shortcut: proyección aproximada (ignora la inclinación de la cámara); basta para caminar hacia allí y corregir cada tick
function compassPoint(player, fwd, { dx, dy, d }) {
  const f = unit(...fwd), r = [-f[1], f[0]];
  const [vx, vz] = unit(f[0] * -dy + r[0] * dx, f[1] * -dy + r[1] * dx);
  const dist = parseFloat(d) || 30;
  return { x: player[0] + vx * dist, z: player[1] + vz * dist };
}

// Evalúa al Pokémon con el texto de la pantalla de Liga (rol y estadísticas "EN PARTIDA") y devuelve su perfil de juego.
function evaluate(text) {
  const num = re => +((text.match(re) || [])[1] || 0);
  const role = ((text.match(/#\d+\s*·\s*([A-ZÁÉÍÓÚÑ ]+?)\s*\n/) || [])[1] || '').trim();
  const hpMax = num(/PS máx\.?\s*\n?\s*(\d+)/), armor = num(/Armadura\s*\n?\s*(\d+)/);
  // nombre: primera línea tras el rol que no sea la rareza
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean), ri = lines.findIndex(l => /#\d+\s*·/.test(l));
  const name = lines.slice(ri + 1, ri + 4).find(l => !/^(Común|Poco común|Raro|Rara|Épico|Épica|Legendari[oa]|Singular|Mítico)$/i.test(l)) || '?';
  const tank = /DEFENSOR|TANQUE|COLOSO/.test(role) || armor >= 40 || hpMax >= 150;
  const fragile = !tank && (/ASALTO|ATACANTE/.test(role) || (hpMax && hpMax < 90) || (armor && armor < 20)); // poca armadura = frágil (p. ej. Tentacool)
  const p = tank ? { name: 'tanque', danger: 6.5, lowHp: 0.3, busyN: 5 }
    : fragile ? { name: 'frágil', danger: 11, lowHp: 0.5, busyN: 2 }
    : { name: 'normal', danger: 9, lowHp: 0.4, busyN: 3 };
  return { pokemon: name, role, hpMax, armor, ...p };
}

// Puntúa el texto de una carta de subida de nivel: mejorar ataques (para llegar a MAX y fusionar) > ataques nuevos > vitaminas útiles; evita maldiciones.
function scoreCard(t) {
  let s = /MEJORA|Nivel \d+ → \d+/.test(t) ? 30 : /Nuevo movimiento|NUEVA/.test(t) && !/vitamina/i.test(t) ? 25 : 10;
  // concentrar mejoras en el ataque más avanzado para llegar antes a 2 MAX (fusionador); extra si esta carta lo deja en MAX
  const lv = t.match(/Nivel (\d+) → (\d+) \(máx\. (\d+)\)/);
  if (lv) s += 3 * +lv[1] + (+lv[2] === +lv[3] ? 15 : 0);
  if (/PS|armadura|regeneraci|curaci|escudo|evasi/i.test(t)) s += BUILD_RE ? 2 : 8;
  if (BUILD_RE?.test(t)) s += 14; // build elegida con BOT_BUILD
  if (/daño|crítico|proyectil|recarga/i.test(t)) s += 6;
  if (/recogida|experiencia/i.test(t)) s += 4;
  if (/dificultad|élites|maldi/i.test(t)) s -= 40;
  if (/no volverá a mejorar/i.test(t)) s -= 20;
  return s + (/Legendari/.test(t) ? 15 : /Épic/.test(t) ? 10 : /Rar/.test(t) ? 5 : 0);
}

// Se ejecuta en la página: jugador = sprite más cercano al rayo central de la cámara; el resto de sprites de Pokémon van con su especie
// (Node separa enemigos de NPC quietos). Objetivos: Poké Balls (tipo por textura de la tapa), altares (Crystal) y fusionador (PodA).
function readState() {
  // el juego dibuja varias escenas con perspectiva: usar la que tenga más sprites de Pokémon (recalculado cada 2 s)
  const now = performance.now();
  if (!window.__main || now - window.__mainAt > 2000) {
    let best = null, bestN = -1;
    for (const [sc, v] of window.__scenes || []) {
      if (now - v.t > 3000) continue; // margen amplio: en pausa la escena principal deja de dibujarse
      let n = 0; sc.traverse(m => { if (m.isInstancedMesh && m.geometry.attributes.iLook) n += m.count; });
      if (n > bestN) best = sc, bestN = n;
    }
    window.__main = best; window.__mainAt = now;
  }
  const s = window.__main, c = s && window.__scenes.get(s).c;
  const text = document.body.innerText;
  const won = /¡Victoria!/.test(text) && /Otra vez/.test(text); // misma pantalla final que al morir
  if (won || /¡Te has debilitado!/.test(text)) return { dead: true, won, text };
  // cartas de subida de nivel o de altar: cada una lleva su tecla "[1]", "[2]"... -> subir hasta el contenedor de la carta
  const keys = [...document.querySelectorAll('body *')].filter(e => e.offsetParent && !e.children.length && /^\[\d\]$/.test(e.textContent.trim()));
  const cards = keys.map(k => { let e = k; while (e.parentElement && !keys.some(o => o !== k && e.parentElement.contains(o))) e = e.parentElement; return e.innerText; });
  if (cards.length >= 2 || (cards.length === 1 && /¡Nivel \d+!/.test(text))) return { cards }; // con todo casi al máximo puede salir una sola carta
  // botones: no todos son <button> (p. ej. 'Liberar al nuevo'); vale cualquier elemento visible cuyo texto propio sea exacto
  const btn = re => [...document.querySelectorAll('button, [role=button], [class*=btn], [class*=pill], b, span, div')].some(b => b.offsetParent && b.childElementCount <= 2 && re.test(b.innerText.trim()));
  if (btn(/^Entendido$/)) return { modal: 'click:Entendido' }; // avisos del juego (p. ej. 'partida recuperada') que tapan todo
  if (btn(/^Coger/)) return { modal: 'KeyE' }; // "¡Has encontrado un objeto!"
  if (/ADELANTE, AMIGO BALL/i.test(text)) return { cinematic: true }; // animación: no tocar nada
  if ([...document.querySelectorAll('button')].some(b => b.offsetParent && /^Salir/.test(b.innerText.trim()))) return { modal: 'Escape' }; // tienda u otro menú con "Salir (Esc)"
  if (/Funde dos movimientos al nivel máximo|Elige una pareja de ataques/.test(text)) return { fusionMenu: true }; // Máquina de Bill abierta
  if (btn(/^Continuar$/) && btn(/^Abandonar$/)) return { modal: 'click:Continuar' }; // menú de pausa del juego
  if (btn(/^Liberar al nuevo$/)) return { modal: 'click:Liberar al nuevo' }; // equipo completo: no cambiar el equipo
  if (btn(/^Ahora no$/)) return { modal: 'click:Ahora no' }; // Ditto (copiar objeto): shortcut, se rechaza en vez de elegir
  if (btn(/^Cerrar$/)) return { modal: 'click:Cerrar' }; // ficha de un movimiento u otros paneles
  if (btn(/^Listo$/)) return { modal: 'click:Listo' }; // Hypno u otros menús que se cierran con "Listo"
  if (!s || !c || !document.querySelector('.timer')?.offsetParent) return {}; // sin temporizador = no estamos en partida
  const dir = c.getWorldDirection(c.position.clone()), o = c.position, pts = [];
  s.traverse(m => {
    const a = m.isInstancedMesh && m.visible && m.geometry.attributes.iPos;
    if (!a || !m.geometry.attributes.iLook) return; // iLook solo lo tienen los sprites de Pokémon
    const id = m.material.uniforms?.map?.value?.image?.src?.match(/(\d+)\.png/)?.[1] || '?'; // nº de Pokédex
    const sz = m.geometry.attributes.iSize; // tamaño del sprite: el jefe es mucho más grande
    for (let i = 0; i < m.count; i++) pts.push([a.getX(i), a.getY(i), a.getZ(i), id, sz ? sz.getX(i) : 1]);
  });
  if (!pts.length) return {};
  const rayDist = p => { const v = [p[0] - o.x, p[1] - o.y, p[2] - o.z], t = v[0] * dir.x + v[1] * dir.y + v[2] * dir.z; return Math.hypot(v[0] - t * dir.x, v[1] - t * dir.y, v[2] - t * dir.z); };
  // jugador: el sprite de SU especie (retrato del HUD) más cercano al centro; sin esto, en un enjambre un enemigo centrado se tomaba por el jugador
  const myId = document.querySelector(".tl-portrait")?.dataset.k;
  const mine = pts.some(p => p[3] === myId) ? i => pts[i][3] === myId : () => true;
  const pi = pts.reduce((b, p, i) => mine(i) && (b < 0 || rayDist(p) < rayDist(pts[b])) ? i : b, -1);
  const targets = [], w = o.clone(), hs = []; // hs: alturas de modelo de los objetos interactivos (diagnóstico)
  s.traverse(m => {
    if (!m.visible) return;
    const lid = m.name === 'Lid' && (m.material.map?.name || '');
    // altura del grupo interactivo al que pertenece la malla (altar normal 3.8; el maldito 4.8 quita vida)
    const groupH = o => { for (let a = o; a; a = a.parent) if (a.userData?.h) return a.userData.h; return 0; };
    const kind = lid ? (/cursed/.test(lid) ? null : /blue/.test(lid) ? 'free' : 'paid') : m.name === 'Crystal' && groupH(m) === 3.8 ? 'altar' : m.name === 'PodA' ? 'fusion' : null;
    if (kind) { m.getWorldPosition(w); targets.push({ kind, x: w.x, z: w.z }); }
    // grupos de objetos interactivos: el juego guarda la altura del modelo en userData.h según su tipo (boss 6.2, portal 6)
    const h = m.userData?.h;
    if (h) { m.getWorldPosition(w); hs.push(h + '@' + Math.round(w.x) + ',' + Math.round(w.z)); }
    // 6.3 = santuario (se toca como el altar del guardián), 6.4 = portal del santuario
    if ([6, 6.2, 6.3, 6.4].includes(h)) { m.getWorldPosition(w); targets.push({ kind: h === 6 || h === 6.4 ? 'portal' : 'altarboss', x: w.x, z: w.z }); }
    if (h === 3.6 && !m.userData.used) { m.getWorldPosition(w); targets.push({ kind: 'heal', x: w.x, z: w.z }); } // arbusto de Bayas Aranja: cura
  });
  // proyectiles enemigos: sprites de efecto con tinte rojo (los ataques de agua propios son cian/azul)
  const shots = [], pl = pts[pi];
  s.traverse(m => {
    const g = m.isInstancedMesh && m.visible && m.count && m.count < 600 && m.geometry.attributes;
    if (!g || g.iLook || !g.iA || !g.iB) return;
    for (let i = 0; i < m.count; i++) {
      const x = g.iA.getX(i), z = g.iA.getZ(i);
      if (Math.abs(x - pl[0]) < 8 && Math.abs(z - pl[2]) < 8 && g.iB.getX(i) > 0.7 && g.iB.getY(i) < 0.45 && g.iB.getZ(i) < 0.6) shots.push([x, z]);
    }
  });
  const maxCount =[...document.querySelectorAll('body *')].filter(e => e.offsetParent && !e.children.length && e.textContent.trim() === 'MAX').length;
  const ballPrice = +(document.querySelector('.wl-ball em')?.textContent.replace(/\D/g, '') || Infinity);
  const level = +(document.querySelector('.tl-lvl b')?.textContent || 1);
  const tm = (document.querySelector('.timer')?.textContent || '').match(/(\+?)(\d+):(\d\d)/), timeLeft = tm ? (tm[1] ? -1 : 1) * (+tm[2] * 60 + +tm[3]) : 999; // cuenta atrás de la zona; "+m:ss" = tiempo extra, negativo
  const zone = document.querySelector('.ht-zone')?.textContent || '';
  const dominant = /DOMINANTE/.test(text); // barra de un Pokémon Dominante (jefe intermedio, pega muchísimo)
  const caught = /¡ATRAPADO!/i.test(text) ? (/solo esta partida/i.test(text) ? 'aliado' : 'liga') : ''; // animación de captura
  const hp = +((document.querySelector('.hpbar i')?.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 1])[1]); // fracción de vida
  const clock =(document.querySelector('.hud-top')?.innerText.match(/\d+:\d\d\.\d/) || [''])[0]; // tiempo de partida; si no avanza, el juego está en pausa
  const prompt = [...document.querySelectorAll('.prompt')].find(e => e.offsetParent && e.style.display !== 'none')?.dataset.t || '';
  const gold = +(document.querySelector('.wl-gold b')?.textContent.replace(/\D/g, '') || 0);
  // flecha de objetivo del HUD (.compass): apunta al altar del guardián ('boss') o al portal; posición en pantalla = dirección
  const cp = [...document.querySelectorAll('.compass:not(.mktag)')].find(e => e.offsetParent);
  const cr = cp?.getBoundingClientRect();
  const compass = cp && { k: cp.dataset.k || '', dx: cr.x + cr.width / 2 - innerWidth / 2, dy: cr.y + cr.height / 2 - innerHeight / 2, d: cp.querySelector('.cp-d')?.textContent || '' };
  // mallas con nombre junto a un aviso: sirve para identificar guardián, portal, etc. en el log
  const nearNames = [];
  if (prompt) s.traverse(m => { if (m.name && m.isMesh && !m.isInstancedMesh) { m.getWorldPosition(w); if (Math.hypot(w.x - pl[0], w.z - pl[2]) < 8) nearNames.push(m.name); } });
  return { player: [pts[pi][0], pts[pi][2]], me: pts[pi][3], sprites: pts.filter((_, i) => i !== pi).map(p => [p[0], p[2], p[3], p[4]]), fwd: [dir.x, dir.z], targets, prompt, gold, clock, hp, maxCount, ballPrice, shots, level, timeLeft, zone, dominant, caught, nearNames: [...new Set(nearNames)].slice(0, 12), compass, hs };
}

async function setKeys(page, held, want) {
  for (const k of held) if (!want.includes(k)) await page.keyboard.up(k);
  for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
  return new Set(want);
}

async function playOne(page, n) {
  const t0 = Date.now();
  let held = new Set(), last = null, lastMove = Date.now(), nearSince = 0, lastUlt = 0, lastE = 0, lastClock = '', clockAt = Date.now(), stalls = 0, lastPrompt = "";
  const seen = new Set(); // avisos ya registrados en DEBUG
  const visited = new Map(), walls = []; // objetivo -> hasta cuándo ignorarlo; puntos donde se atascó
  const hornAt = new Map(), hornBad = new Set(), awake = new Set(); let hornNear = 0, hsLogAt = 0; // cabezas con cuernos vistas / descartadas
  let capture = null, captures = 0, allies = 0, lastCaught = '', portalSeen = false; // captura en curso, contadores, ¿se vio el portal?
  let escapeUntil = 0, escapeKeys = [], side = false, prog = {}, cardsAt = 0, fusionSkipUntil = 0, lastReroll = 0, fusionAt = null, guardianAt = null, portalAt = null, guardianWoken = false, wokeAt = 0, wakePos = null, bossSeen = false, zone = '', lastHp = 1, hpAt = 0, lastDash = 0;
  const SKIP = /maldit|tienda|desafío|hypno|olvid|ditto|grito de/i; // "Grito de X": guardián más fuerte, no // avisos que no se aceptan
  while (true) {
    const st = await page.evaluate(readState);
    if (st.dead) {
      held = await setKeys(page, held, []);
      await page.waitForTimeout(1500);
      const txt = await page.evaluate(() => document.body.innerText);
      const stat = l => (txt.match(new RegExp('([\\d:.,]+\\s*[kKM]?)\\s*\\n\\s*' + l)) || [])[1] || '';
      // dónde murió: zona alcanzada y fase (antes del guardián / peleando con él) para medir la tasa de "Zona 1 superada"
      const fase = st.won ? 'victoria' : portalSeen ? 'portal-visto' : guardianWoken ? 'pelea-guardian' : 'antes-guardian'; // portal-visto: mató al jefe y no llegó a entrar
      const row = [new Date().toISOString(), n, stat('TIEMPO'), stat('BAJAS'), stat('DAÑO'), stat('PUNTOS'), ((Date.now() - t0) / 1000).toFixed(0), (zone || 'Zona 1/3').replace(/,/g, ''), PROFILE.pokemon || '', REGION, fase, captures, allies, BUILD || 'normal'];
      console.log(`partida ${n}: aguantó ${row[2]} (bajas ${row[3]}, daño ${row[4]}, puntos ${row[5]}) · ${row[7]} · ${fase} · capturas ${captures} · build ${BUILD || 'normal'}`);
      const f = path.join(__dirname, 'runs.csv'), header = 'fecha,partida,tiempo,bajas,dano,puntos,segundos_reales,zona,pokemon,mapa,fase\n';
      if (!fs.existsSync(f)) fs.writeFileSync(f, header);
      else if (!fs.readFileSync(f, 'utf8').startsWith(header)) fs.writeFileSync(f, header + fs.readFileSync(f, 'utf8').split('\n').slice(1).join('\n')); // cabecera vieja -> nueva
      fs.appendFileSync(f, row.join(',') + '\n');
      return;
    }
    if (st.cards) {
      held = await setKeys(page, held, []);
      const sc = st.cards.map(scoreCard), best = sc.indexOf(Math.max(...sc));
      // sin ninguna mejora de un ataque propio: gastar un "Refrescar (F)" si quedan, para concentrar mejoras y llegar a MAX
      const isLevelUp = st.cards.some(c => /MEJORA|NUEVA|Nuevo movimiento|vitamina/i.test(c));
      const rerolls = +((await page.evaluate(() => document.body.innerText.match(/Refrescar \((\d+)\)/)?.[1]).catch(() => 0)) || 0);
      if (isLevelUp && sc[best] < 30 && rerolls > 0 && Date.now() - lastReroll > 1500) {
        if (process.env.DEBUG) console.log('cartas sin mejora -> refresco (quedan', rerolls, ')');
        await page.keyboard.press('KeyF'); lastReroll = Date.now(); await page.waitForTimeout(600);
        continue;
      }
      if (process.env.DEBUG) console.log('cartas', st.cards.map((c, i) => sc[i] + ':' + c.split('\n').filter(Boolean).slice(1, 3).join(' ')).join(' | '), '->', best + 1);
      await page.keyboard.press('Digit' + (best + 1));
      cardsAt = Date.now();
      await page.waitForTimeout(400);
      continue;
    }
    if (st.fusionMenu) { // cartas .card.fusion; las no disponibles llevan .locked. Preferencia: firma > reacción > tipo > fallo
      held = await setKeys(page, held, []);
      const open = () => page.evaluate(() => /Funde dos movimientos al nivel máximo|Elige una pareja de ataques/.test(document.body.innerText));
      let done = '';
      for (const label of ['Fusión de firma', 'Reacción', 'Fusión de tipo', 'Fallo de la máquina']) {
        const cards = page.locator('.card.fusion:not(.locked)', { hasText: label });
        for (let i = 0; i < await cards.count() && !done; i++) {
          // clic por JS: Playwright no la ve "clicable" (animación / capa encima) y el clic normal caduca
          await cards.nth(i).evaluate(e => e.click()).catch(e => console.log('fusión: clic falló', e.message.split('\n')[0]));
          await page.waitForTimeout(1000);
          await page.screenshot({ path: path.join(__dirname, 'dumps', `fusion-tras-clic-${Date.now() - t0}.png`) });
          // posible segundo paso (confirmar / elegir hueco): pulsar el botón de confirmación si aparece
          const confirm = page.getByRole('button', { name: /^(Fusionar|Fundir|Confirmar|Aceptar|Sí)/ }).first();
          if (await confirm.isVisible().catch(() => false)) { console.log('fusión: confirmo'); await confirm.click().catch(() => {}); await page.waitForTimeout(1000); }
          if (await open()) { await page.keyboard.press('Enter'); await page.waitForTimeout(1000); } // el tablero se confirma con Enter
          if (!await open()) done = label;
          else console.log('fusión: sigue abierto tras clic:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
        }
        if (done) break;
      }
      // Tablero nuevo: la primera pareja lista ya viene elegida y se confirma con Enter o su botón. Sin parejas listas no hay nada que confirmar.
      if (!done && await page.evaluate(() => /Listas para la máquina/i.test(document.body.innerText))) {
        const closes = async () => { for (let i = 0; i < 8; i++) { if (!await open()) return true; await page.waitForTimeout(500); } return false; };
        await page.waitForTimeout(1500); // Enter justo al abrir no fusionaba
        await page.keyboard.press('Enter');
        if (await closes()) done = 'Enter';
        else {
          await page.getByText(/^Fusionar en /).last().evaluate(e => e.click()).catch(() => {});
          if (await closes()) done = 'botón';
          else await page.screenshot({ path: path.join(__dirname, 'dumps', `fusion-fallida-${Date.now() - t0}.png`) });
        }
      }
      if (!done) {
        const labels = await page.locator('.card.fusion').evaluateAll(cs => cs.map(c => (c.classList.contains('locked') ? 'bloqueada:' : 'libre:') + c.innerText.split('\n').slice(0, 2).join(' ')));
        console.log('fusión: cartas vistas', JSON.stringify(labels));
        await page.keyboard.press('Escape'); // el menú de fusión se cierra con Esc ('Ahora no' no es un <button>)
        fusionSkipUntil = Date.now() + 120000; // no reabrir la máquina en bucle
      }
      console.log(done ? `fusión hecha (${done})` : 'fusión: ninguna carta válida, cierro');
      if (fusionAt) visited.set('fusion' + Math.round(fusionAt.x / 10) + ',' + Math.round(fusionAt.z / 10), Date.now() + (done ? 600000 : 120000)); // la máquina solo funde una vez; sin pareja lista, volver a mirar luego
      clockAt = Date.now();
      continue;
    }
    if (st.cinematic) { held = await setKeys(page, held, []); clockAt = Date.now(); await page.waitForTimeout(300); continue; }
    if (st.modal) {
      held = await setKeys(page, held, []);
      if (st.modal.startsWith('click:')) await page.getByText(st.modal.slice(6), { exact: true }).last().click({ timeout: 2000 }).catch(() => {});
      else await page.keyboard.press(st.modal);
      await page.waitForTimeout(400); continue;
    }
    if (st.player) {
      if (st.clock !== lastClock) lastClock = st.clock, clockAt = Date.now();
      else if (Date.now() - clockAt > 3000) { // pausa desconocida: registrar y probar E
        const key = ['KeyE', 'Digit1', 'Enter', 'Space', 'Escape'][stalls++ % 5]; // sin clics: abrían fichas de movimientos // ir probando (Esc no: abre el menú de pausa)
        console.log('pausa sin reconocer en', st.clock, '->', key, '(captura en dumps/)');
        await page.screenshot({ path: path.join(__dirname, 'dumps', `pausa-${Date.now() - t0}.png`) });
        await page.keyboard.press(key);
        clockAt = Date.now();
      }
      // NPC por especie (los enemigos también empiezan quietos, así que no sirve detectarlos por movimiento)
      // NPC despertados (p. ej. Snorlax) pasan a ser enemigos: dejan de ser 'inofensivos'
      st.enemies = st.sprites.filter(s => !NPC.has(s[2]) || awake.has(s[2])); // el propio jugador ya no está en sprites
      // jefe: el enemigo más grande si es claramente mayor que la media (el guardián es enorme)
      const sizes = st.enemies.map(e => e[3] || 1).sort((a, b) => a - b), med = sizes[sizes.length >> 1] || 1;
      const big = st.enemies.reduce((b, e) => (e[3] || 1) > (b?.[3] || 0) ? e : b, null);
      st.boss = big && big[3] > med * 1.4 ? [big[0], big[1]] : null; // 1.4: el guardián del bosque no es tan grande como para 1.8
      if (process.env.DEBUG && guardianWoken && Date.now() % 2000 < 110) console.log('tamaños en la pelea: máx', (big?.[3] || 0).toFixed(2), 'media', med.toFixed(2), st.boss ? 'jefe detectado' : 'sin jefe');
      if (st.boss && !bossSeen) bossSeen = true, console.log('jefe a la vista: tamaño', big[3].toFixed(1), 'media', med.toFixed(1));
      // recién despertado, el guardián sale del altar: alejarse de ahí los primeros 15 s (aunque no se le haya detectado por tamaño)
      if (wakePos && Date.now() - wokeAt < 15000 && !st.boss) st.boss = wakePos;
      const npcs = st.sprites.filter(s => BONUS.has(s[2]) && !awake.has(s[2])).map(([x, z]) => ({ kind: 'npc', x, z }));
      const key = t => t.kind + Math.round(t.x / 10) + ',' + Math.round(t.z / 10); // bloques de 10: un NPC que se balancea sigue siendo el mismo
      // recordar dónde está el fusionador (lejos puede dejar de dibujarse) para volver cuando haya 2 MAX
      // zona nueva (tras el portal): olvidar todo lo memorizado del mapa anterior
      if (st.zone && st.zone !== zone) { if (zone) console.log('zona nueva:', st.zone); zone = st.zone; portalSeen = false; visited.clear(); walls.length = 0; fusionAt = guardianAt = portalAt = null; guardianWoken = false; hornAt.clear(); hornBad.clear(); awake.clear(); }
      // el guardián se localiza por su aviso al pasar cerca; a falta de 40 s se va a despertarlo (y matarlo -> portal)
      if (/guardián/i.test(st.prompt) && !guardianAt) guardianAt = { kind: 'guardian', x: st.player[0], z: st.player[1] }, console.log('guardián en', st.player.map(Math.round).join(','), 'mallas cerca:', st.nearNames.join(' '));
      // flecha del HUD -> punto del mundo (dirección en pantalla + distancia "37 m"); se memoriza por si la flecha desaparece al acercarse
      if (Date.now() - hsLogAt > 60000) hsLogAt = Date.now(), console.log('objetos (altura@x,z):', st.hs.join(' '));
      const c = st.compass;
      // captura: flecha celeste = Pokémon debilitado; a <9 unidades sale "[E] Lanzar Poké Ball". La flecha se oculta si está en pantalla: seguir su sprite
      const cm = c?.k.match(/^m(\d+)#5af0ff/);
      if (cm) capture = { id: cm[1], ...compassPoint(st.player, st.fwd, c), at: Date.now() };
      if (capture && Date.now() - capture.at > 10000) capture = null;
      if (capture && !guardianWoken) {
        const d = s => Math.hypot(s[0] - capture.x, s[1] - capture.z);
        const s = st.sprites.filter(q => q[2] === capture.id).sort((a, b) => d(a) - d(b))[0];
        if (s && d(s) < 25) { capture.x = s[0]; capture.z = s[1]; st.enemies = st.enemies.filter(e => e !== s); } // el marcado no ataca
        st.targets.push({ kind: 'capture', x: capture.x, z: capture.z });
      }
      if (st.caught && st.caught !== lastCaught) { if (st.caught === 'liga') captures++; else allies++; capture = null; console.log('atrapado:', st.caught, '· liga', captures, '· aliados', allies); }
      lastCaught = st.caught;
      if (c && (c.k === 'boss' || c.k === 'portal')) {
        const p = compassPoint(st.player, st.fwd, c);
        if (c.k === 'boss' && !guardianWoken && !guardianAt?.exact) guardianAt = { kind: 'guardian', ...p };
        if (c.k === 'portal') portalAt = { kind: 'portal', ...p };
      }
      // cabezas con cuernos (malla 'Horn'): una es el altar del guardián y otra puede ser el de desafío.
      // Se recuerdan todas; a falta de 40 s se va a la más cercana no descartada y, si su aviso no es del guardián, se descarta
      if (!guardianWoken) st.targets = st.targets.filter(t => t.kind !== 'portal'); // el portal solo tras el guardián
      for (const ab of st.targets.filter(t => t.kind === 'altarboss')) {
        const k = Math.round(ab.x / 10) + ',' + Math.round(ab.z / 10);
        if (!hornAt.has(k)) hornAt.set(k, { kind: 'guardian', x: ab.x, z: ab.z, k }), console.log('altar del guardián en', Math.round(ab.x), Math.round(ab.z));
      }
      if (/Santuario/.test(st.zone)) st.timeLeft = 0; // su reloj cuenta hacia arriba y no hay límite: ir ya a tocar el santuario
      // salir hacia el altar según la distancia (~3.5 u/s andando entre la horda) para llegar antes de los 40 s; despertar solo con <=40 s
      const altarD = Math.min(...[...hornAt.values()].filter(h => !hornBad.has(h.k)).map(h => Math.hypot(h.x - st.player[0], h.z - st.player[1])), 999);
      if (!guardianWoken && st.timeLeft <= 45 + Math.min(altarD, 400) / 2) { // ~2 u/s reales esquivando
        const cands = [...hornAt.values()].filter(h => !hornBad.has(h.k));
        if (cands.length) st.targets.push(...cands);
        else if (guardianAt) st.targets.push(guardianAt); // sin cabezas conocidas: estimación por la flecha
      }
      if (portalAt && guardianWoken) st.targets.push(portalAt); // el portal solo tras el guardián
      const fz = st.targets.find(t => t.kind === 'fusion');
      if (fz && !fusionAt) fusionAt = fz, console.log('fusionador encontrado en', Math.round(fz.x), Math.round(fz.z));
      if (!fz && fusionAt) st.targets.push(fusionAt);
      // tras despertar al guardián y con menos del 60% de vida, solo el portal (salir antes de que la cosa se ponga fea)
      // guardián despierto: nada de recoger cosas (distrae y mata); solo esquivar y, cuando aparezca, el portal
      const pool = guardianWoken ? st.targets.filter(t => t.kind === 'portal' || t.kind === 'heal').concat(portalAt ? [portalAt] : []) : [...st.targets, ...npcs]; // en la pelea: portal o curarse
      st.healBelow = guardianWoken ? 0.4 : 0.6; // (curarse hasta el 85% antes del guardián lo desviaba: 1/5) // antes del guardián, casi a tope; peleando, solo en apuro
      st.healRange = guardianWoken ? 30 : 50; // peleando no alejarse del jefe
      const tgt = pickTarget(pool.filter(t => !(visited.get(key(t)) > Date.now())), st.player, st);
      const dist = tgt && Math.hypot(tgt.x - st.player[0], tgt.z - st.player[1]);
      // con horda encima o poca vida, olvidar el objetivo: pelear y esquivar (cruzar el mapa con enemigos detrás mata)
      const busy = st.enemies.filter(e => Math.hypot(e[0] - st.player[0], e[1] - st.player[1]) < DANGER).length >= PROFILE.busyN || st.hp < PROFILE.lowHp + 0.1;
      st.target = tgt && !(busy && dist > 15 && !(tgt.kind === "portal" || (tgt.kind === "heal" && dist < 25) || (["fusion", "guardian", "capture"].includes(tgt.kind) && st.hp >= 0.5))) ? [tgt.x, tgt.z] : null;
      if (tgt?.kind === 'portal') portalSeen = true; // al fusionador se va aunque haya horda
      st.walls = walls;
      DANGER = PROFILE.danger * (st.dominant ? 1.5 : guardianWoken && Date.now() - wokeAt < 30000 ? 1.4 : 1); // guardián o Dominante: más distancia
      if (st.dominant && !['portal', 'guardian'].includes(tgt?.kind)) st.target = null; // con un Dominante suelto, solo sobrevivir
      st.tw = (tgt?.kind === 'fusion' && st.maxCount >= 2 && st.hp >= 0.5) || (tgt?.kind === 'guardian' && st.hp >= 0.5) || tgt?.kind === 'portal' || (tgt?.kind === 'capture' && st.hp >= 0.5) ? 1.2 : tgt?.kind === 'heal' || tgt?.kind === 'capture' ? 0.4 : tgt?.kind === 'fusion' && st.hp >= 0.6 && PROFILE.name !== 'frágil' ? 0.6 : 0.15; // con 1 MAX se acerca con decisión si hay vida // al fusionador empuja a través de la horda
      const near = r => st.enemies.filter(e => Math.hypot(e[0] - st.player[0], e[1] - st.player[1]) < r).length;
      // en el altar: quieto hasta que salgan las cartas, salvo poca vida o rodeado
      const charging = tgt?.kind === 'altar' && dist < 3 && st.hp >= 0.4 && near(3.5) < 6 && !(st.shots.length && st.shots.length <= 10);
      // al portal, recto: esquivar a 200+ enemigos lo alejaba de 7 a 38 unidades hasta morir (solo se rodean paredes).
      // Al altar del guardián igual si hay vida (con 100% se quedaba a 25 u un minuto); a menos de 12 u espera esquivando hasta poder despertarlo
      const straight = tgt?.kind === 'portal' || (tgt?.kind === 'guardian' && st.hp >= 0.5 && (dist > 12 || st.timeLeft <= 40));
      let want = charging ? [] : steer(straight ? { ...st, enemies: [], shots: [], boss: null } : st, Date.now());
      // golpe fuerte (-6% vida en <0.5 s): dash en perpendicular a la dirección actual para salir de la ráfaga
      if (!straight && st.hp < lastHp - 0.06 && Date.now() - lastDash > 1200) {
        const vertical = want.includes('KeyW') || want.includes('KeyS');
        escapeKeys = [vertical ? (side ? 'KeyA' : 'KeyD') : (side ? 'KeyW' : 'KeyS')]; side = !side;
        escapeUntil = Date.now() + 400; lastDash = Date.now();
        await setKeys(page, held, escapeKeys).then(h => held = h); await page.keyboard.press('ShiftLeft');
      }
      if (Date.now() - hpAt > 500) lastHp = st.hp, hpAt = Date.now();
      if (escapeUntil > Date.now()) want = escapeKeys;
      held = await setKeys(page, held, want);
      if (tgt?.kind === 'portal' && dist > 3 && want.length && Date.now() - lastDash > 1200) await page.keyboard.press('ShiftLeft'), lastDash = Date.now(); // al portal a toda prisa
      const crowd = near(DANGER);
      // especial contra hordas, o si pierde mucha vida rápido aunque no vea la horda (Diglett bajo tierra); en recarga no pasa nada
      // especial: se guarda mientras va al guardián (salvo apuro) y se usa en cuanto esté lista los primeros 30 s de la pelea
      const saving = !guardianWoken && st.timeLeft <= 75 && st.hp >= 0.3, bossFight = (guardianWoken && Date.now() - wokeAt < 30000) || st.dominant;
      if ((bossFight || (!saving && (crowd >= 15 || st.hp < lastHp - 0.1))) && Date.now() - lastUlt > 2000) await page.keyboard.press('KeyR'), lastUlt = Date.now();
      if (process.env.DEBUG && Date.now() % 1000 < 110) { const ids = {}; for (const s of st.sprites) if (Math.hypot(s[0] - st.player[0], s[1] - st.player[1]) < 6) ids[s[2]] = (ids[s[2]] || 0) + 1; console.log('cerca-especies', JSON.stringify(ids)); }
      // aviso "E ..." en pantalla (Poké Ball, Amigo Ball, tótem, máquina): pulsar si es gratis o hay dinero
      const cost = +((st.prompt.match(/(\d+)\s*₽/) || [])[1] || 0);
      // mismo aviso: esperar 3 s antes de repetir (si no, gasta Amigo Balls en serie)
      if (st.prompt && cost <= st.gold && !SKIP.test(st.prompt) && !(/Máquina de Bill/.test(st.prompt) && (st.maxCount < 2 || Date.now() < fusionSkipUntil)) && !(/Despertar al guardián|Invocar al legendario/i.test(st.prompt) && (st.timeLeft > 40 || (st.hp < 0.6 && st.timeLeft > 10))) && Date.now() - lastE > (st.prompt === lastPrompt && !/portal|Lanzar/i.test(st.prompt) ? 3000 : 400)) {
        if (process.env.DEBUG && !seen.has(st.prompt)) seen.add(st.prompt), console.log('aviso', st.prompt, 'dinero', st.gold, 'mallas cerca:', st.nearNames.join(' '));
        await page.keyboard.press('KeyE'); lastE = Date.now(); lastPrompt = st.prompt;
        if (/Despertar a Snorlax/i.test(st.prompt)) awake.add('143'), console.log('Snorlax despierto: ahora es enemigo');
        if (/Despertar al guardián|Invocar al legendario|Tocar el santuario/i.test(st.prompt)) guardianWoken = true, wokeAt = Date.now(), wakePos = st.player.slice(), console.log('guardián despertado a falta de', st.timeLeft, 's con vida', st.hp.toFixed(2));
        if (/portal|Salir del santuario/i.test(st.prompt)) console.log('entrando al portal:', st.prompt);
      }
      // en una cabeza con cuernos: si tras 1,5 s el aviso no es del guardián, no era su altar -> descartarla
      if (tgt?.kind === 'guardian' && tgt.k && dist < 5) {
        hornNear ||= Date.now();
        if (Date.now() - hornNear > 1500 && st.prompt && !/guardián/i.test(st.prompt) && !/Grito de/i.test(st.prompt)) hornBad.add(tgt.k), hornNear = 0, console.log('no era el altar del guardián:', st.prompt || '(sin aviso)');
      } else hornNear = 0;
      if (tgt && dist < (tgt.kind === "npc" ? 5 : 3)) { // NPC: sprite grande, radio mayor // llegó: altar hasta 25 s (las cartas lo cierran antes), resto 2 s; si no puede pagarlo, pasa
        const wait = tgt.kind === 'altar' ? 25000 : tgt.kind === 'fusion' ? 4000 : 2000;
        nearSince ||= Date.now();
        const done = nearSince < Date.now() - wait || cost > st.gold || SKIP.test(st.prompt) || (tgt.kind === 'altar' && cardsAt > nearSince);
        if (done && !['guardian', 'portal', 'capture'].includes(tgt.kind)) visited.set(key(tgt), Date.now() + (cost > st.gold ? 30000 : tgt.kind === 'fusion' ? 120000 : 90000)), nearSince = 0;
      } else nearSince = 0;
      if (process.env.DEBUG && Date.now() % 3000 < 110) await page.screenshot({ path: path.join(__dirname, 'dumps', `bot${Math.floor((Date.now() - t0) / 1000)}.png`) });
      if (process.env.DEBUG && Date.now() % 1000 < 110) console.log(st.player.map(v => v.toFixed(1)).join(','), 'cerca', crowd, 'balas', st.shots.length, 'enem', st.enemies.length, 'vida', st.hp.toFixed(2), 'MAX', st.maxCount, 'quedan', st.timeLeft, 'flecha', st.compass ? st.compass.k + ':' + st.compass.d : '-', 'obj', tgt ? tgt.kind + '@' + dist.toFixed(0) : '-', [...held].join('+'));
      // atascado contra pared/montaña (deslizarse también cuenta): <1.5 unidades en 1.5 s pulsando teclas
      // -> recordar la pared y rodearla en perpendicular (alternando lado) con salto y dash
      if (!last || charging || !held.size) last = st.player, lastMove = Date.now();
      else if (Date.now() - lastMove > 1500) {
        if (Math.hypot(st.player[0] - last[0], st.player[1] - last[1]) < 1.5 && escapeUntil < Date.now()) {
          walls.push(st.player.slice()), walls.length > 40 && walls.shift();
          const vertical = held.has('KeyW') || held.has('KeyS');
          escapeKeys = [vertical ? (side ? 'KeyA' : 'KeyD') : (side ? 'KeyW' : 'KeyS')]; side = !side;
          // acorralado junto al borde: escapar hacia el centro en vez de en perpendicular
          if (Math.hypot(...st.player) > EDGE) escapeKeys = steer({ player: st.player, enemies: [], fwd: st.fwd, target: [0, 0], tw: 1 }, Date.now());
          escapeUntil = Date.now() + 900;
          await page.keyboard.press('Space'); await page.keyboard.press('ShiftLeft');
        }
        last = st.player, lastMove = Date.now();
      }
      // objetivo inalcanzable (detrás de una montaña): si en 5 s no se acerca 1 unidad, descartarlo 60 s
      if (tgt && !charging && !['fusion', 'guardian', 'portal', 'capture'].includes(tgt.kind)) { // fusionador, guardián y portal nunca se descartan por falta de avance
        if (prog.key !== key(tgt) || dist < prog.best - 1) prog = { key: key(tgt), best: dist, at: Date.now() };
        else if (Date.now() - prog.at > 5000 && dist > 5) visited.set(prog.key, Date.now() + 60000), prog = {};
      }
    }
    await page.waitForTimeout(100);
  }
}

if (require.main === module) (async () => {
  // sin esto Windows marca la ventana como tapada y Chrome deja de pintar: el juego (atado a los fotogramas) va a cámara lenta
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--disable-features=CalculateNativeWinOcclusion', ...(process.env.BOT_SHOW ? [] : ['--window-position=-1260,200'])] }); // casi fuera de pantalla: 20 px visibles para que Chrome siga pintando (BOT_SHOW=1 para verla)
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.addInitScript(() => {
    (window.__THREE_DEVTOOLS__ = new EventTarget()).addEventListener('observe', e => {
      const o = e.detail;
      if (o.render && o.domElement) { const r = o.render; o.render = function (s, c) { if (c?.isPerspectiveCamera) (window.__scenes ||= new Map()).set(s, { c, t: performance.now() }); return r.apply(this, arguments); }; }
    });
  });
  await page.goto('https://pokebonk.com/');
  console.log('esperando menú principal (si sale el captcha, márcalo tú)...');
  const jugar = page.getByRole('button', { name: /^Jugar/ }).first();
  // sesión caducada: entrar con las credenciales de .env (PB_USER / PB_PASS). El captcha, si sale, lo marca una persona: se muestra la ventana
  if (!await jugar.waitFor({ timeout: 25000 }).then(() => true, () => false)) {
    await page.screenshot({ path: path.join(__dirname, 'dumps', 'sin-sesion.png') });
    const { PB_USER, PB_PASS } = process.env;
    if (PB_USER && PB_PASS) {
      await page.getByText('Entrar', { exact: true }).first().click({ timeout: 10000 }).catch(() => {});
      await page.locator('input:not([type=password]):visible').first().fill(PB_USER).catch(() => {});
      const pass = page.locator('input[type=password]:visible').first();
      await pass.fill(PB_PASS).catch(() => {});
      await pass.press('Enter').catch(() => {});
      console.log('sesión caducada: entrando con .env como', PB_USER);
    } else console.log('sesión caducada y .env sin PB_USER / PB_PASS');
    if (!await jugar.waitFor({ timeout: 20000 }).then(() => true, () => false)) { // captcha o credenciales: hace falta una persona
      const cdp = await ctx.newCDPSession(page);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 80, top: 40 } });
      console.log('NECESITO AYUDA: ventana visible, completa el login o el captcha (espero 5 min)');
      await jugar.waitFor({ timeout: 300000 });
    }
  }
  const dismiss = async () => { // avisos (temporada, partida recuperada...) que tapan el menú
    for (let i = 0; i < 20; i++) {
      const ok = page.getByRole('button', { name: /^(Entendido|Cerrar|Aceptar|Vale)/ }).first();
      if (!await ok.isVisible()) break;
      await ok.click(); await page.waitForTimeout(800);
    }
  };
  for (let i = 0; ; i++) { // los avisos pueden aparecer tarde: cerrar y reintentar
    await page.waitForTimeout(1500);
    await dismiss();
    if (await jugar.click({ timeout: 3000 }).then(() => true, () => false)) break;
    // la página puede recargarse sola (actualización del juego): no es un error, se reintenta
    const modal = await page.evaluate(() => [...document.querySelectorAll('[class*=modal]')].find(e => e.offsetParent)?.innerText.slice(0, 200)).catch(() => '(página recargándose)');
    console.log('algo tapa el botón Jugar:', modal?.replace(/\s+/g, ' '));
    await page.keyboard.press('Escape');
    if (i >= 10) throw new Error('no puedo pulsar Jugar');
  }
  for (let n = 1; n <= RUNS; n++) {
    // Liga -> región (Bosque Verde) -> preparar partida (Clásico, Normal)
    // la cuenta recuerda la última región/modo: elegirlos a mano en vez de fiarse de Enter
    if (n === 1) {
      await page.waitForTimeout(2500); await dismiss();
      if (process.env.BOT_POKEMON) { // elegir el Pokémon en la Liga con el buscador (BOT_POKEMON=Onix)
        const name = process.env.BOT_POKEMON;
        await page.locator('input[placeholder*="uscar"]').first().fill(name).catch(() => console.log('no encuentro el buscador de la Liga'));
        await page.waitForTimeout(800);
        await page.getByText(name, { exact: true }).last().click({ timeout: 3000 }).catch(() => console.log('no encuentro', name, 'en la Liga'));
        await page.waitForTimeout(1000);
      }
      const ev = evaluate(await page.evaluate(() => document.body.innerText)); // Liga: evaluar al Pokémon seleccionado
      if (process.env.BOT_POKEMON && ev.pokemon !== process.env.BOT_POKEMON) { // jugar con otro falsearía la comparación: mejor perder esta partida
        console.log('ojo: el Pokémon seleccionado es', ev.pokemon, 'y no', process.env.BOT_POKEMON, '· no juego');
        await ctx.close(); process.exit(1);
      }
      const PRESETS = { tanque: { danger: 6.5, lowHp: 0.3, busyN: 5 }, normal: { danger: 9, lowHp: 0.4, busyN: 3 }, 'frágil': { danger: 11, lowHp: 0.5, busyN: 2 } };
      if (PRESETS[process.env.BOT_PROFILE]) Object.assign(ev, PRESETS[process.env.BOT_PROFILE], { name: process.env.BOT_PROFILE + ' (forzado)' }); // BOT_PROFILE=normal|tanque|frágil
      Object.assign(PROFILE, { name: ev.name, danger: ev.danger, lowHp: ev.lowHp, busyN: ev.busyN, pokemon: ev.pokemon }); DANGER = ev.danger;
      console.log(`Pokémon: ${ev.pokemon} · rol ${ev.role || '?'} · PS máx ${ev.hpMax || '?'} · armadura ${ev.armor || '?'} -> perfil ${ev.name} (radio ${ev.danger}, huir <${ev.lowHp * 100}% vida, soltar objetivo con ${ev.busyN} cerca)`);
      await page.keyboard.press('Enter'); // Liga: Pokémon seleccionado
      await page.waitForTimeout(2500); await dismiss();
      for (const t of [REGION, 'Clásico', 'Normal']) await page.getByText(t, { exact: true }).first().click({ timeout: 5000 }).catch(() => console.log('no encuentro', t));
      for (let i = 0; i < 4 && !await page.locator('.timer').isVisible().catch(() => false); i++) { await page.waitForTimeout(1500); await page.keyboard.press('Enter'); await page.waitForTimeout(1500); }
    }
    else { await page.keyboard.press('Enter'); } // "Otra vez" en la pantalla de muerte
    await page.waitForTimeout(3000);
    await playOne(page, n);
  }
  await ctx.close();
})();

module.exports = { steer, scoreCard, pickTarget, compassPoint, evaluate };
