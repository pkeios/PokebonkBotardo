#!/bin/sh
# Espera a que termine la partida en curso, suma a la lista lo capturado desde entonces y juega una ronda. Uso: sh tools/siguiente.sh lista etiqueta
cd "$(dirname "$0")/.." || exit 1
vivo() { powershell.exe -NoProfile -Command "if (Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { \$_.CommandLine -match 'bot\.js' }) { exit 0 } else { exit 1 }"; }
while vivo; do sleep 30; done
sleep 5
cp dumps/roster.txt dumps/roster-antes.txt
timeout 110 node tools/roster.js > /dev/null 2>&1
grep -vxFf dumps/roster-antes.txt dumps/roster.txt >> "$1"
sh tools/todos.sh 1 "$1" "$2"
