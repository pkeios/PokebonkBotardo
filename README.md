# PokéBonk Bot

Bot que juega solo a [PokéBonk](https://pokebonk.com), un survivor 3D de navegador. Abre la app de escritorio del juego con Playwright, lee el estado de la partida desde la página y responde con teclado: esquiva, junta objetos, sube de nivel, fusiona ataques, captura Pokémon, pelea con los guardianes y cruza portales. Cada partida queda registrada en un CSV para comparar Pokémon y builds.

Ganó en los 8 mapas disponibles (Kanto y Johto) en modo Clásico. En Ciudad Iris también ganó en Difícil y Pesadilla con Raikou. Solo se probó en Windows.

> **Antes de usarlo:** las partidas cuentan en el ranking de la cuenta con la que juegues. Revisá las reglas del juego y usá una cuenta propia. El bot no resuelve captchas: si aparece uno, lo tiene que marcar una persona.

## Instalación

Necesitás:

- Windows con la app de escritorio de PokéBonk instalada. El bot la busca en `%LOCALAPPDATA%\Programs\PokeBonk\PokeBonk.exe`.
- [Node.js](https://nodejs.org) 20.12 o superior.
- [Git for Windows](https://git-scm.com/download/win), que trae Git Bash. Hace falta para los scripts `.sh` y para los ejemplos de este README.

En una terminal:

```sh
git clone https://github.com/pkeios/PokebonkBotardo.git
cd PokebonkBotardo
npm install
mkdir dumps
```

## Primer arranque

1. Abrí la app de PokéBonk a mano, e iniciá sesión. El bot usa la sesión que guarda la app.
2. **Cerrá la app.** Solo admite una ventana: con la app abierta, el bot no arranca.
3. Probá con una partida:

   ```sh
   node bot.js
   ```

   El bot abre la app, elige Bosque Verde en Normal con el Pokémon que tengas seleccionado, juega y cierra la app al terminar. En la consola se ve el resultado de cada partida.

Si la sesión caduca, el bot puede volver a entrar solo. Para eso creá un archivo `.env` en la raíz del repo:

```
PB_USER=tu_usuario
PB_PASS=tu_contraseña
```

Si sale un captcha, el bot muestra la ventana y espera a que lo marques vos.

`.env`, `profile/` (cookies y sesión), `dumps/` y `runs.csv` están en `.gitignore`. **No los subas nunca:** los dos primeros dan acceso a tu cuenta.

## Uso

```sh
node bot.js            # una partida
node bot.js 5          # cinco partidas seguidas
node bot.test.js       # tests de la lógica, sin abrir el juego
```

Para elegir mapa, Pokémon, etc., usá variables de entorno. Cómo se escriben depende de la terminal:

```sh
# Git Bash
BOT_REGION="Costa Tormenta" BOT_POKEMON=Zapdos node bot.js 3
```

```powershell
# PowerShell (las variables quedan puestas hasta cerrar la ventana)
$env:BOT_REGION = "Costa Tormenta"; $env:BOT_POKEMON = "Zapdos"; node bot.js 3
```

**Para frenarlo**, apretá `Ctrl+C` en la terminal y cerrá la app si quedó abierta (`taskkill /F /IM PokeBonk.exe`). Si corrías con `BOT_HIDE=1` y lo cortaste a mitad de partida, la app puede volver a abrirse fuera de la pantalla. En ese caso, con la app cerrada, abrí `%APPDATA%\PokéBonk\window.json` y cambiá `"x":-20000,"y":0` por una posición en pantalla, p. ej. `"x":100,"y":100`.

Variables:

| Variable | Valores | Qué hace |
|---|---|---|
| `BOT_POKEMON` | Nombre exacto, p. ej. `Onix` | Lo elige en la Liga. Si no logra seleccionarlo, no juega y termina con error. |
| `BOT_REGION` | `Bosque Verde` (por defecto), `Desierto Rocoso`, `Costa Tormenta`, `Glaciar Celeste`, `Isla Canela`, `Cueva Celeste`, `Bosque Encina`, `Ciudad Iris` | Mapa, si ya está desbloqueado. |
| `BOT_MODE` | `Clásico` (por defecto), `Supervivencia` | Modo de juego. |
| `BOT_DIFF` | `Normal` (por defecto), `Difícil`, `Pesadilla` | Dificultad, si ya está desbloqueada. |
| `BOT_BUILD` | `dmg`, `area`, `crit`, `rango`, `exp` | Qué mejoras priorizar en las cartas (`rango`: daño, alcance y velocidad de ataque; `exp`: experiencia antes que mejorar ataques). Vacío: equilibrado. |
| `BOT_PROFILE` | `normal`, `tanque`, `frágil` | Fuerza el estilo de juego en vez de deducirlo de las estadísticas. |
| `DEBUG` | `1` | Muestra el detalle por consola. Las pausas desconocidas guardan siempre una captura en `dumps/`. |
| `BOT_APP` | Ruta a `PokeBonk.exe` | Solo si la app no está en `%LOCALAPPDATA%\Programs\PokeBonk`. |
| `BOT_HIDE` | `1` | Juega con la ventana fuera de la pantalla y sin icono en la barra de tareas. Puede verse un instante al abrir. |

Ejemplo:

```sh
BOT_POKEMON=Onix BOT_BUILD=crit DEBUG=1 node bot.js 3
```

### La ventana de la app

El bot abre PokéBonk y lo cierra al terminar, sin modificar sus archivos. **Cerrá la app antes de lanzarlo:** solo admite una ventana abierta. Puede quedar detrás de otras ventanas sin frenarse.

La sesión es la de la app. `tools/login.js` y `tools/record.js` todavía usan un Chromium aparte con `profile/`.

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
- Calcula la salida según la distancia al altar y lo despierta cuando faltan 60, 70 u 80 segundos en las Zonas 1, 2 y 3. Su vida se calcula para durar unos 40, 50 y 60 segundos con tu daño.
- Con menos de 60% de vida espera, salvo que falten 10 segundos o menos.
- Una vez despierto, gira a unas 14 unidades del guardián deslizándose, esquiva y se cura hasta que aparece el portal. No se aleja: a más de 18 unidades durante 2,5 segundos, el guardián salta encima.
- Con el guardián muerto, da vueltas alrededor del portal para aguantar las hordas. Entra de inmediato si baja del 60% de vida, si 120 o más enemigos siguen encima durante 4 segundos, o tras 60 segundos.
- En el Santuario el reloj cuenta hacia arriba: va directo a tocar el altar central y luego sale por su portal. Si el legendario es variocolor y queda debilitado, le tira la Poké Ball antes de salir. Si el portal no responde tras 5 intentos, vuelve a pelear pegado al jefe 45 segundos y reintenta. Contra Articuno (Lago Celeste) lee los sectores seguros de Frío Absoluto y corre al más cercano.

**Subida de nivel.** Concentra mejoras en los ataques más avanzados para llegar a dos al máximo y poder fusionar. Usa "Refrescar" si no hay ninguna mejora útil.

**Estilo según el Pokémon.** Lee las estadísticas de la Liga y elige un perfil:

| Perfil | Cuándo | Comportamiento |
|---|---|---|
| `tanque` | Rol defensor, tanque o coloso, armadura ≥ 40 o vida ≥ 150 | Permite enemigos más cerca |
| `frágil` | Rol de asalto o atacante, vida < 90 y armadura < 20 | Mantiene más distancia y huye antes |
| `normal` | El resto | Intermedio |

**Menús y pantallas.** Cierra o resuelve los modales conocidos. Si el reloj se detiene por algo desconocido, va probando teclas y guarda una captura. Ignora a propósito los elementos malditos, la tienda, los desafíos, el Dojo Karate y a Hypno y Ditto.

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

Estos scripts se corren desde Git Bash:

```sh
node tools/roster.js   # guarda en dumps/roster.txt los Pokémon de tu Liga
sh tools/todos.sh 3    # 3 rondas con cada uno
sh tools/todos.sh 1 mi-lista.txt prueba-   # 1 ronda con otra lista y otra etiqueta de logs
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
| `app.js` | Abre la app de escritorio y encuentra la ventana del juego |
| `bot.test.js` | Tests de las funciones puras: movimiento, objetivos, cartas y perfiles |
| `tools/login.js` | Inicio de sesión manual con `PB_USER` y `PB_PASS` |
| `tools/roster.js` | Lista los Pokémon disponibles |
| `tools/todos.sh`, `tools/siguiente.sh`, `tools/ab.sh` | Tandas de comparación |
| `tools/record.js` | Graba una sesión jugada por una persona en `dumps/humano/` |
| `tools/explore.js`, `tools/probe*.js` | Scripts usados para investigar el juego |

## Limitaciones

- Las especies neutrales (Ditto, Magnemite, Hypno, Unown, Snorlax, Porygon) se observaron sobre todo en Bosque Verde, y Meowth solo es neutral ahí; en otros mapas alguna puede ser enemiga.
- En tiempo extra aparecen cientos de enemigos; si el guardián sigue vivo a esa altura, la partida suele terminar ahí.
- No usa la Grieta (tecla `C`) por su cuenta, aunque sí entra y sale si aparece su portal.
- Detecta al guardián por tamaño: en tiempo extra puede confundirlo con otro enemigo grande.
