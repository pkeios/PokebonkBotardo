#!/bin/sh
# Juega por rondas con cada Pokémon de una lista (uno por línea), así el ranking sirve aunque se corte a mitad.
# Si el bot no llega a jugar (p. ej. un aviso tapa el menú), reintenta hasta 3 veces en vez de saltarse al Pokémon.
# Uso: sh tools/todos.sh [rondas] [lista] [etiqueta de los logs]
cd "$(dirname "$0")/.." || exit 1
lista=${2:-dumps/roster.txt}
for r in $(seq 1 "${1:-5}"); do
  while read -r p; do
    [ -n "$p" ] || continue
    log="dumps/todos-${3:-}$r-$p.log"
    for intento in 1 2 3; do
      BOT_POKEMON=$p DEBUG=1 node bot.js 1 > "$log" 2>&1 < /dev/null
      grep -qE "partida [0-9]+:" "$log" && break
      echo "$p: intento $intento sin jugar"
      [ "$intento" = 3 ] || sleep 120
    done
    grep -E "partida [0-9]+:|name: 'Error'|name: 'TimeoutError'|ojo" "$log"
  done < "$lista"
done
