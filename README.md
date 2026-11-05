# PokéBonk Bot

Bot que juega solo a [PokéBonk](https://pokebonk.com), un survivor 3D de navegador. Abre el juego en Chromium con Playwright, lee el estado de la partida desde la página y responde con teclado: esquiva, junta objetos, sube de nivel, fusiona ataques, captura Pokémon, pelea con los guardianes y cruza portales. Cada partida queda registrada en un CSV para comparar Pokémon y builds.

Se probó sobre todo en **Bosque Verde, modo Clásico, dificultad Normal**. Los demás mapas se pueden elegir, pero están mucho menos probados.

> **Antes de usarlo:** las partidas cuentan en el ranking de la cuenta con la que juegues. Revisá las reglas del juego y usá una cuenta propia. El bot no resuelve captchas: si aparece uno, lo tiene que marcar una persona.

## Instalación

Hace falta Node.js 20.12 o superior.

```sh
git clone <url-del-repo>
cd <carpeta-del-repo>
npm install
npx playwright install chromium
mkdir dumps
```

Para que el bot inicie sesión solo, creá un archivo `.env` en la raíz. Es opcional; sin él, iniciás sesión a mano en la ventana del bot.

```
PB_USER=tu_usuario
PB_PASS=tu_contraseña
```

`.env`, `profile/` (cookies y sesión), `dumps/` y `runs.csv` están en `.gitignore`. **No los subas nunca:** los dos primeros dan acceso a tu cuenta.

## Uso

```sh
node bot.js            # una partida
node bot.js 5          # cinco partidas seguidas
node bot.test.js       # tests de la lógica
```

La configuración se pasa por variables de entorno:

| Variable | Valores | Qué hace |
|---|---|---|
| `BOT_POKEMON` | Nombre exacto, p. ej. `Onix` | Lo elige en la Liga. Si no logra seleccionarlo, no juega y termina con error. |
| `BOT_REGION` | `Bosque Verde` (por defecto), `Desierto Rocoso`, `Costa Tormenta`, `Glaciar Celeste` | Mapa. |
| `BOT_BUILD` | `dmg`, `area`, `crit` | Qué mejoras priorizar en las cartas. Vacío: equilibrado. |
| `BOT_PROFILE` | `normal`, `tanque`, `frágil` | Fuerza el estilo de juego en vez de deducirlo de las estadísticas. |
| `DEBUG` | `1` | Muestra el detalle por consola y guarda capturas en `dumps/`. |
| `BOT_SHOW` | `1` | Muestra la ventana completa en vez de dejarla casi fuera de pantalla. |

Ejemplo:

```sh
BOT_POKEMON=Onix BOT_BUILD=crit DEBUG=1 node bot.js 3
```

### La ventana del navegador

Chrome deja de pintar, y el juego casi se congela, si la ventana queda oculta. Por eso se abre en la posición `-1260,200`, con unos 20 px visibles en el borde izquierdo. **No la minimices.** Si tu monitor tiene otra disposición y no se ve, usá `BOT_SHOW=1`.

Un solo proceso puede usar `profile/` a la vez: no abras dos bots, ni el bot y `tools/record.js`, al mismo tiempo.

## Qué hace durante la partida

**Prioridades**, de mayor a menor:

1. Portal, una vez despierto el guardián.
2. Altar del guardián, cuando llega la hora.
3. Curarse con bayas si la vida baja del 60% (del 40% durante la pelea con el guardián).
4. Capturar Pokémon debilitados, marcados con la flecha celeste.
5. Máquina de Bill, para fusionar.
6. Poké Balls gratis, altares, bonificaciones de Snorlax y Porygon, y Poké Balls de pago si alcanza el oro.

**Movimiento.** Los enemigos, balas y paredes empujan al personaje, y el objetivo lo atrae. Cuando va al portal, o al altar con al menos 50% de vida, ignora a los enemigos y va recto, porque esquivar a cientos de ellos lo alejaba del objetivo. Si se atasca contra una pared, la recuerda y la rodea.

**Guardián.**
- Calcula la salida según la distancia al altar y lo despierta cuando faltan 40 segundos o menos.
- Con menos de 60% de vida espera, salvo que falten 10 segundos o menos.
- Una vez despierto, solo esquiva, se cura y entra al portal en cuanto aparece.
- En el Santuario el reloj cuenta hacia arriba: va directo a tocar el altar central y luego sale por su portal.

**Subida de nivel.** Concentra mejoras en los ataques más avanzados para llegar a dos al máximo y poder fusionar. Usa "Refrescar" si no hay ninguna mejora útil.

**Estilo según el Pokémon.** Lee las estadísticas de la Liga y elige un perfil:

| Perfil | Cuándo | Comportamiento |
|---|---|---|
| `tanque` | Rol defensor, tanque o coloso, armadura ≥ 40 o vida ≥ 150 | Permite enemigos más cerca |
| `frágil` | Rol de asalto o atacante, vida < 90 y armadura < 20 | Mantiene más distancia y huye antes |
| `normal` | El resto | Intermedio |

**Menús y pantallas.** Cierra o resuelve los modales conocidos. Si el reloj se detiene por algo desconocido, va probando teclas y guarda una captura. Ignora a propósito los elementos malditos, la tienda, los desafíos y a Hypno y Ditto.

## Cómo lee el juego

El juego no ofrece una API, así que el bot lee la página:

- **Escena 3D:** captura la escena de Three.js con `__THREE_DEVTOOLS__` y envolviendo `renderer.render`.
- **Sprites:** son `InstancedMesh` con los atributos `iPos`, `iLook` e `iSize`. La textura `N.png` indica el número de Pokédex.
- **Objetos interactivos:** se identifican por `userData.h`, la altura del modelo:

| Altura | Objeto | Altura | Objeto |
|---|---|---|---|
| 6.4 | Portal del santuario | 3.8 | Altar o desafío |
| 6.3 | Santuario | 3.6 | Baya |
| 6.2 | Altar del guardián | 3.4 | Máquina de Bill o tragamonedas |
| 6 | Portal | 2.3 | Hongo |
| 4.8 | Altar maldito | 1.6 | Poké Ball |
| 4.3 | Tótem de Rhydon | | |

- **Interfaz:** `.prompt[data-t]` (avisos), `.timer` (cuenta atrás; `+m:ss` es tiempo extra), `.ht-zone` (zona), `.wl-gold b` (oro), `.hpbar i` (vida) y `.compass` (flechas).

Estos datos salen de observar el juego y **pueden cambiar con cada actualización**. Ya pasó: si el texto de una pantalla cambia, el bot deja de reconocerla y los logs muestran `pausa sin reconocer`.

## Comparar Pokémon y builds

```sh
node tools/roster.js   # guarda en dumps/roster.txt los Pokémon de tu Liga
sh tools/todos.sh 3    # 3 rondas con cada uno
sh tools/ab.sh 10      # 10 rondas comparando builds con Onix
```

Las rondas alternan a los participantes, así que los resultados sirven aunque la tanda se corte a mitad. Con pocas partidas pesa mucho el azar.

Cada partida agrega una fila a `runs.csv`:

| Columna | Contenido |
|---|---|
| `fecha`, `partida` | Cuándo terminó y número de partida |
| `tiempo`, `bajas`, `dano`, `puntos` | Resultado de la pantalla final |
| `segundos_reales` | Duración real; el reloj del juego se detiene en los menús |
| `zona`, `pokemon`, `mapa` | Hasta dónde llegó, con quién y en qué mapa |
| `fase` | `antes-guardian`, `pelea-guardian`, `portal-visto` o `victoria` |
| `capturas`, `aliados`, `build` | Capturas para la Liga, aliados y build usada |

`portal-visto` puede engañar: a veces el portal solo se detecta en el instante final. Antes de sacar conclusiones, mirá el log de esa partida.

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `bot.js` | El bot completo |
| `bot.test.js` | Tests de las funciones puras: movimiento, objetivos, cartas y perfiles |
| `tools/login.js` | Inicio de sesión manual con `PB_USER` y `PB_PASS` |
| `tools/roster.js` | Lista los Pokémon disponibles |
| `tools/todos.sh`, `tools/ab.sh` | Tandas de comparación |
| `tools/record.js` | Graba una sesión jugada por una persona en `dumps/humano/` |
| `tools/explore.js`, `tools/probe*.js` | Scripts usados para investigar el juego |

## Limitaciones

- Las especies neutrales (Meowth, Ditto, Magnemite, Hypno, Unown) y las bonificaciones están definidas para Bosque Verde; en otros mapas esas especies pueden ser enemigos.
- Con poco daño, puede no alcanzar a matar al guardián en los 40 segundos antes del tiempo extra, donde aparecen cientos de enemigos.
- La victoria en el Santuario se implementó leyendo el código del juego, pero todavía no se comprobó en una partida completa.
