const assert = require('assert');
const { steer } = require('./bot');

const fwd = [0, -1]; // cámara mirando a -Z: W = -Z, D = +X
assert.ok(steer({ player: [0, 0], enemies: [[0, -3]], fwd }, 0).includes('KeyS')); // enemigo delante -> atrás (rodeándolo)
assert.deepStrictEqual(steer({ player: [0, 0], enemies: [[3, 0]], fwd }, 0).includes('KeyA'), true); // enemigo a la derecha -> izquierda
assert.ok(steer({ player: [0, 0], enemies: [[100, 100]], fwd }, 0).length > 0); // sin peligro sigue paseando
console.log('ok');
assert.deepStrictEqual(steer({ player: [0, 0], enemies: [], fwd, target: [0, -20] }, 0), ['KeyW']); // va hacia el objetivo
assert.ok(steer({ player: [0, 150], enemies: [], fwd }, 0).includes('KeyW')); // cerca del borde vuelve al centro
console.log('ok2');
const { scoreCard } = require('./bot');
assert.ok(scoreCard('Común\nMEJORA\nPistola Agua\nNivel 1 → 2\n+1 proyectil') > scoreCard('Común\nNUEVA\nIncienso Maldito\nNueva vitamina\n+12% dificultad'));
assert.ok(scoreCard('Común\nNUEVA\nCuerda Huida\nNueva vitamina\n+1.2 rango de recogida') > scoreCard('Común\nNUEVA\nIncienso Maldito\nNueva vitamina\n+12% dificultad'));
console.log('ok3');
assert.ok(scoreCard('Común\nNUEVA\nMordisco\nNuevo movimiento Siniestro') > scoreCard('Común\nNUEVA\nX\nNueva vitamina +0.05 sobrecuración'));
console.log('ok4');
assert.ok(!steer({ player: [0, 0], enemies: [[0, 12]], fwd, target: [0, 20], hp: 0.2 }, 0).includes('KeyS')); // poca vida: no va al objetivo hacia el enemigo
console.log('ok5');
const { pickTarget } = require('./bot');
const T = [{ kind: 'paid', x: 2, z: 0 }, { kind: 'free', x: 30, z: 0 }, { kind: 'altar', x: 10, z: 0 }, { kind: 'fusion', x: 100, z: 0 }];
assert.strictEqual(pickTarget(T, [0, 0], { gold: 0, ballPrice: 18 }).kind, 'free'); // gratis antes que altar cercano
assert.strictEqual(pickTarget(T, [0, 0], { maxCount: 2 }).kind, 'fusion'); // con 2 MAX, al fusionador
assert.strictEqual(pickTarget([T[0]], [0, 0], { gold: 10, ballPrice: 18 }), null); // de pago sin oro: nada
assert.strictEqual(pickTarget([T[0]], [0, 0], { gold: 20, ballPrice: 18 }).kind, 'paid');
console.log('ok6');
assert.ok(steer({ player: [0, 0], enemies: [], fwd, shots: [[0, -2]] }, 0).includes('KeyS')); // proyectil delante -> se aparta
console.log('ok7');
assert.notStrictEqual(pickTarget([{ kind: 'altar', x: 1, z: 0 }], [0, 0], { level: 1 })?.kind, 'altar'); // nivel bajo: nada de altares
assert.strictEqual(pickTarget([{ kind: 'altar', x: 1, z: 0 }], [0, 0], { level: 6 }).kind, 'altar');
console.log('ok8');
assert.ok(scoreCard('MEJORA\nBurbuja\nNivel 7 → 8 (máx. 8)') > scoreCard('MEJORA\nPistola Agua\nNivel 1 → 2 (máx. 8)')); // concentra y remata a MAX
console.log('ok9');
assert.strictEqual(pickTarget([{ kind: 'free', x: 5, z: 0 }, { kind: 'fusion', x: 300, z: 0 }], [0, 0], { maxCount: 2 }).kind, 'fusion'); // fusionador lejano gana igual
console.log('ok10');
assert.ok(steer({ player: [0, 140], enemies: [], fwd, target: [0, 160] }, 0).includes('KeyS')); // objetivo junto al borde: va igual
console.log('ok11');
assert.ok(steer({ player: [0, 0], enemies: [[0, -4], [1, -4], [-1, -4]], fwd, target: [0, -20], tw: 1.2 }, 0).includes('KeyW')); // fusión: atraviesa la horda
console.log('ok12');
// con enemigos a los lados, el objetivo fuerte sigue marcando la dirección (el giro no lo desvía)
assert.ok(steer({ player: [0, 0], enemies: [[6, 0]], fwd, target: [0, -50], tw: 1.2 }, 0).includes('KeyW'));
console.log('ok13');
assert.strictEqual(pickTarget([{ kind: 'free', x: 5, z: 0 }, { kind: 'fusion', x: 200, z: 0 }], [0, 0], { maxCount: 1 }).kind, 'fusion'); // 1 MAX y lejos: acercarse
assert.strictEqual(pickTarget([{ kind: 'free', x: 5, z: 0 }, { kind: 'fusion', x: 20, z: 0 }], [0, 0], { maxCount: 1 }).kind, 'free'); // 1 MAX y cerca: lo demás
console.log('ok14');
assert.strictEqual(pickTarget([{ kind: 'fusion', x: 5, z: 0 }, { kind: 'portal', x: 200, z: 0 }], [0, 0], { maxCount: 2 }).kind, 'portal'); // portal ante todo
assert.strictEqual(pickTarget([{ kind: 'fusion', x: 5, z: 0 }, { kind: 'guardian', x: 150, z: 0 }], [0, 0], { maxCount: 2 }).kind, 'guardian'); // últimos 40 s: al guardián
console.log('ok15');
const { compassPoint } = require('./bot');
const cpt = compassPoint([0, 0], [0, -1], { dx: 0, dy: -200, d: '40 m' }); // flecha arriba en pantalla, cámara mirando a -Z
assert.ok(Math.abs(cpt.x) < 1e-6 && Math.abs(cpt.z + 40) < 1e-6);
const cpr = compassPoint([0, 0], [0, -1], { dx: 300, dy: 0, d: '10 m' }); // flecha a la derecha -> +X
assert.ok(Math.abs(cpr.x - 10) < 1e-6);
console.log('ok16');
assert.ok(steer({ player: [0, 0], enemies: [], fwd, target: [0, -30], tw: 1.2, hp: 0.2 }, 0).includes('KeyW')); // poca vida: sigue yendo al portal
console.log('ok17');
const { evaluate } = require('./bot');
const sq = evaluate('La Liga\n#007 · DEFENSOR\nComún\nSquirtle\nAñadir a Favoritos\nEN PARTIDA\nPS máx.\n108\nArmadura\n26\n');
assert.strictEqual(sq.name, 'tanque'); assert.strictEqual(sq.pokemon, 'Squirtle'); assert.strictEqual(sq.hpMax, 108);
assert.strictEqual(evaluate('#004 · ASALTO ÍGNEO\nCharmander\nPS máx.\n90\nArmadura\n10\n').name, 'frágil');
assert.strictEqual(evaluate('#001 · SANADOR\nBulbasaur\nPS máx.\n110\nArmadura\n25\n').name, 'normal');
console.log('ok18');
assert.ok(steer({ player: [0, 0], enemies: [], fwd, boss: [0, -10] }, 0).includes('KeyS')); // jefe a 10: alejarse
console.log('ok19');
assert.strictEqual(evaluate('#072 · MEDUSA\nTentacool\nPS máx.\n102\nArmadura\n19\n').name, 'frágil'); // poca armadura
console.log('ok20');
assert.strictEqual(pickTarget([{ kind: 'free', x: 5, z: 0 }, { kind: 'heal', x: 50, z: 0 }], [0, 0], { hp: 0.3 }).kind, 'heal'); // poca vida: bayas
assert.strictEqual(pickTarget([{ kind: 'free', x: 5, z: 0 }, { kind: 'heal', x: 50, z: 0 }], [0, 0], { hp: 0.9 }).kind, 'free'); // vida llena: no
console.log('ok21');
assert.strictEqual(pickTarget([{ kind: 'altar', x: 2, z: 0 }], [0, 0], { level: 9, hp: 0.3 }), null); // poca vida: nada de altares
console.log('ok22');
assert.strictEqual(pickTarget([{ kind: 'guardian', x: 5, z: 0 }, { kind: 'heal', x: 40, z: 0 }], [0, 0], { hp: 0.7, healBelow: 0.85 }).kind, 'heal'); // curarse antes del guardián
console.log('ok23');
const near = { kind: 'free', x: 5, z: 0 }, cap = { kind: 'capture', x: 40, z: 0 };
assert.strictEqual(pickTarget([near, cap], [0, 0], { hp: 1 }).kind, 'capture'); // capturar antes que una gratis cercana
assert.strictEqual(pickTarget([near, cap], [0, 0], { hp: 0.2 }).kind, 'free'); // con poca vida, no
assert.strictEqual(pickTarget([{ kind: 'capture', x: 100, z: 0 }], [0, 0], {}), null); // demasiado lejos
const paid = { kind: 'paid', x: 100, z: 0 };
assert.strictEqual(pickTarget([paid], [0, 0], { gold: 60, ballPrice: 18 }).kind, 'paid'); // con oro de sobra va lejos
assert.strictEqual(pickTarget([paid], [0, 0], { gold: 20, ballPrice: 18 }), null); // con justo el precio, solo cerca
console.log('ok24');
