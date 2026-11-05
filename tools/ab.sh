#!/bin/sh
# Compara builds alternando partidas (para que el azar y los cambios del juego afecten a todas por igual). Uso: sh tools/ab.sh [rondas]
cd "$(dirname "$0")/.." || exit 1
for r in $(seq 1 "${1:-10}"); do
  for b in "" dmg area crit; do
    BOT_POKEMON=Onix BOT_BUILD=$b DEBUG=1 node bot.js 1 > "dumps/ab-$r-${b:-normal}.log" 2>&1
    grep -E "partida [0-9]+:|name: 'Error'" "dumps/ab-$r-${b:-normal}.log"
  done
done
