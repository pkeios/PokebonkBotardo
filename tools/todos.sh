#!/bin/sh
# Juega por rondas con cada Pokémon de dumps/roster.txt (uno por línea), así el ranking sirve aunque se corte a mitad. Uso: sh tools/todos.sh [rondas]
cd "$(dirname "$0")/.." || exit 1
for r in $(seq 1 "${1:-5}"); do
  while read -r p; do
    [ -n "$p" ] || continue
    BOT_POKEMON=$p DEBUG=1 node bot.js 1 > "dumps/todos-$r-$p.log" 2>&1 < /dev/null
    grep -E "partida [0-9]+:|name: 'Error'|ojo" "dumps/todos-$r-$p.log"
  done < dumps/roster.txt
done
