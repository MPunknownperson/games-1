import assert from 'node:assert/strict';
import { SandboxWorld, type Actor } from '../src/world/simulation';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const tick = (w: SandboxWorld, seconds: number) => { for (let i = 0; i < seconds * 20; i++) w.update(0.05); };
/** Stand the guardian just in front of an actor, facing it. */
const face = (w: SandboxWorld, a: Actor, gap = 0.25) => {
  const p = w.player;
  p.x = a.x; p.z = a.z + a.radius + p.radius + gap; p.facing = Math.PI; p.vx = p.vz = 0; p.action = undefined;
};
const save = (w: SandboxWorld) => new SandboxWorld(w.seed, JSON.parse(JSON.stringify(w.snapshot())));

test('the valley is large, seeded and populated with physical objects', () => {
  const a = new SandboxWorld(123), b = new SandboxWorld(123);
  assert.deepEqual(a.actors.map((x) => [x.kind, x.x, x.z]), b.actors.map((x) => [x.kind, x.x, x.z]));
  assert.ok(a.actors.length > 250, `only ${a.actors.length} actors`);
  assert.equal(a.actors.filter((x) => x.kind === 'villager').length, 14);
  assert.ok(a.actors.filter((x) => x.kind === 'item').length >= 60);
  assert.ok(a.actors.some((x) => Math.abs(x.x) > 60));
});

test('the main quest runs through dialogue, gathering, building, the stones and a defence', () => {
  const w = new SandboxWorld(9);
  face(w, w.npc('Mara')!);
  assert.equal(w.interact(), true);
  w.choose('light-meet');
  w.closeDialogue();
  assert.equal(w.questStage('light'), 'supply');
  const tree = w.actors.find((a) => a.kind === 'tree' && Math.hypot(a.x, a.z) < 25)!;
  const logsBefore = w.actors.filter((a) => a.itemType === 'log').length;
  face(w, tree);
  w.interact();
  tick(w, 1.5);
  assert.equal(w.actors.filter((a) => a.itemType === 'log').length, logsBefore + 1, 'chopping drops a log');
  const log = w.actors.find((a) => a.itemType === 'log')!;
  tick(w, 2);
  face(w, log, 0.05);
  w.interact();
  assert.equal(w.stock.wood, 2);
  w.stock.wood = 6; w.stock.stone = 4;
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'build');
  assert.equal(w.build('archer', { x: 6, z: -10 }), true);
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'stones');
  for (const rune of w.actors.filter((a) => a.kind === 'rune')) {
    face(w, rune);
    for (let i = 0; i < 3 && rune.currentRune !== rune.targetRune; i++) w.interact();
  }
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'defend');
  assert.equal(w.stock.essence, 1);
  face(w, w.actors.find((a) => a.kind === 'bell')!);
  w.interact();
  assert.equal(w.waveActive, true);
  w.spawnQueue = 0;
  for (const f of w.actors) if (f.intent === 'raid') f.alive = false;
  tick(w, 0.6);
  assert.equal(w.questStage('light'), 'report');
  face(w, w.npc('Mara')!);
  w.interact();
  const gold = w.stock.gold;
  w.choose('light-report');
  assert.equal(w.quests.light.status, 'done');
  assert.equal(w.stock.gold, gold + 75);
});

test('objects carried elsewhere stay exactly where they were left, across saves', () => {
  const w = new SandboxWorld(5);
  const crate = w.actors.find((a) => a.itemType === 'crate' && a.x === 4)!;
  face(w, crate);
  w.secondary();
  tick(w, 0.4);
  assert.equal(crate.carriedBy, w.player.id);
  w.input = { x: 1, z: 0, sprint: false };
  tick(w, 2.5);
  w.input = { x: 0, z: 0, sprint: false };
  tick(w, 0.3);
  w.secondary();
  tick(w, 3);
  assert.equal(crate.carriedBy, undefined);
  assert.equal(crate.sleeping, true);
  const left = { x: crate.x, y: crate.y, z: crate.z };
  const again = save(w);
  const restored = again.byId(crate.id)!;
  assert.deepEqual({ x: restored.x, y: restored.y, z: restored.z }, left);
  tick(again, 5);
  assert.deepEqual({ x: restored.x, y: restored.y, z: restored.z }, left);
});

test('a looted room keeps its scattered contents when you return', () => {
  const w = new SandboxWorld(5);
  w.flags.test = 1;
  const shelf = w.actors.find((a) => a.name === 'Storehouse shelf')!;
  w.player.x = shelf.x; w.player.z = shelf.z + 1.5;
  for (const v of w.actors.filter((a) => a.kind === 'villager')) { v.x = 40; v.z = -40; v.goal = undefined; }
  const onShelf = w.actors.filter((a) => a.kind === 'item' && Math.hypot(a.x - shelf.x, a.z - shelf.z) < 0.8 && a.y > 0.5);
  assert.ok(onShelf.length >= 4);
  for (const it of onShelf) { it.vx = (it.x - shelf.x) * 6; it.vz = 4; it.vy = 1; it.sleeping = false; }
  tick(w, 4);
  assert.ok(onShelf.every((it) => it.sleeping), 'objects settle');
  assert.ok(onShelf.some((it) => it.y === 0), 'some fell to the floor');
  const layout = onShelf.map((it) => [it.id, it.x, it.y, it.z]);
  w.player.x = 70; w.player.z = 70;
  tick(w, 30);
  const back = save(w);
  assert.deepEqual(onShelf.map((it) => { const r = back.byId(it.id)!; return [r.id, r.x, r.y, r.z]; }), layout);
  w.dropFromPack('apple');
  assert.ok(w.actors.some((a) => a.itemType === 'apple' && Math.hypot(a.x - 70, a.z - 70) < 2), 'dropped pack items become world objects');
});

test('thrown objects fly, strike foes and shove other objects', () => {
  const w = new SandboxWorld(5);
  const p = w.player;
  p.x = 30; p.z = 30; p.facing = 0;
  const stone = w.spawnItem('stoneChunk', 30, 30.8);
  w.secondary();
  tick(w, 0.4);
  assert.equal(stone.carriedBy, p.id);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = 30; foe.z = 33; foe.intent = 'forage';
  const hp = foe.hp;
  w.throwHeld();
  tick(w, 0.6);
  assert.ok(foe.hp < hp, 'the stone hurt the foe');
  const barrel = w.spawnItem('barrel', 30, 25);
  p.x = 30; p.z = 26.5; p.facing = Math.PI;
  w.input = { x: 0, z: -1, sprint: false };
  tick(w, 1);
  assert.ok(barrel.z < 25, 'walking into a barrel pushes it');
});

test('theft is a crime only when someone sees it', () => {
  const w = new SandboxWorld(5);
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  const apple = w.actors.find((a) => a.itemType === 'apple' && a.owner === 'Tobin')!;
  w.player.x = apple.x; w.player.z = stall.z + 1.3; w.player.facing = Math.PI;
  face(w, apple, 0.02);
  w.interact();
  assert.ok(w.bounty > 0, 'Tobin saw the theft');
  assert.ok(w.npc('Tobin')!.memory!.rumors.includes('crime'));
  const w2 = new SandboxWorld(5);
  const ledger = w2.actors.find((a) => a.itemType === 'ledger')!;
  face(w2, ledger, 0.02);
  w2.interact();
  assert.equal(w2.bounty, 0);
  assert.equal(w2.pack.ledger, 1);
});

test("Tobin's ledger branches on what you do with it", () => {
  const start = () => {
    const w = new SandboxWorld(5);
    face(w, w.npc('Tobin')!);
    w.interact(); w.choose('ledger-start'); w.closeDialogue();
    w.addToPack('ledger');
    tick(w, 0.6);
    assert.equal(w.questStage('ledger'), 'decide');
    return w;
  };
  const exposed = start();
  face(exposed, exposed.npc('Vela')!);
  exposed.interact(); exposed.choose('ledger-expose');
  assert.equal(exposed.flags.ledger, 'exposed');
  assert.ok(exposed.npc('Tobin')!.memory!.opinion < 0);
  const secret = start();
  secret.usePack('ledger');
  assert.equal(secret.flags.ledgerRead, true);
  face(secret, secret.npc('Tobin')!);
  secret.interact();
  assert.ok(secret.dialogueView()!.options.some((o) => o.id === 'ledger-confront'));
  secret.choose('ledger-confront'); secret.choose('ledger-secret');
  assert.equal(secret.flags.discount, true);
  assert.equal(secret.quests.ledger.status, 'done');
});

test('bread can be delivered by physically carrying it to the watch post', () => {
  const w = new SandboxWorld(5);
  face(w, w.npc('Bran')!);
  w.interact(); w.choose('bread-start'); w.closeDialogue();
  const post = w.actors.find((a) => a.kind === 'post')!;
  const loaves = w.actors.filter((a) => a.itemType === 'bread' && !a.owner);
  assert.equal(loaves.length, 3);
  for (const [i, loaf] of loaves.entries()) {
    w.player.x = post.x + 2; w.player.z = post.z + 1 + i * 0.4; w.player.facing = -Math.PI / 2;
    loaf.carriedBy = w.player.id;
    w.update(0.05);
    w.secondary();
    tick(w, 1);
  }
  tick(w, 1);
  assert.equal(w.questStage('bread'), 'thanks');
});

test('villagers keep schedules: they go home and sleep at night', () => {
  const w = new SandboxWorld(5);
  w.elapsed = (22 - 8) * 30;
  tick(w, 40);
  const asleep = w.actors.filter((a) => a.kind === 'villager' && a.activity === 'Sleeping').length;
  assert.ok(asleep >= 10, `${asleep} asleep`);
});

test('word of a crime spreads through conversation', () => {
  const w = new SandboxWorld(5);
  w.elapsed = (18 - 8) * 30;
  const vs = w.actors.filter((a) => a.kind === 'villager' && a.profession !== 'Warden');
  vs[0].memory!.rumors.push('crime');
  for (const v of vs) { v.needs!.social = 0.9; v.x = 2 + (v.variant % 4); v.z = 2 + Math.floor(v.variant / 4); }
  tick(w, 60);
  const told = vs.filter((v) => v.memory!.rumors.includes('crime')).length;
  assert.ok(told > 1, `rumour reached ${told} villagers`);
});

test('foes call allies when they spot the guardian', () => {
  const w = new SandboxWorld(5);
  const foes = w.actors.filter((a) => a.kind === 'foe');
  foes[1].x = foes[0].x + 3; foes[1].z = foes[0].z;
  w.player.x = foes[0].x - 4; w.player.z = foes[0].z;
  w.update(0.05);
  assert.equal(foes[0].intent, 'chase');
  assert.ok(foes[1].intent === 'search' || foes[1].intent === 'chase');
});

test('attacks chain into combos and rolling avoids a strike', () => {
  const w = new SandboxWorld(5);
  const p = w.player;
  p.x = 30; p.z = -30;
  w.attack();
  tick(w, 0.1);
  w.attack();
  tick(w, 0.5);
  assert.equal(p.action, 'attack2');
  tick(w, 1);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = 30; foe.z = -31.2; foe.facing = 0; foe.targetId = p.id; foe.intent = 'chase';
  foe.action = 'windup'; foe.actionT = 0.95; foe.actionDur = 1;
  p.facing = Math.PI;
  const hp = p.hp;
  w.dodge();
  tick(w, 0.15);
  assert.equal(p.hp, hp, 'no damage while rolling');
});

test('verification finds and auto-repair fixes corrupted state', () => {
  const w = new SandboxWorld(5);
  w.player.x = Number.NaN;
  w.stock.gold = -3;
  const it = w.actors.find((a) => a.kind === 'item')!;
  it.carriedBy = 'nobody';
  it.y = Number.NaN;
  assert.ok(w.verify().length >= 3);
  const report = w.autoRepair();
  assert.ok(report.fixes.length >= 3);
  assert.deepEqual(report.remaining, []);
});

test('simulation stays fast: a minute of world time with everyone active', () => {
  const w = new SandboxWorld(5);
  for (const it of w.actors.filter((a) => a.kind === 'item')) { it.sleeping = false; it.vy = 2; it.y = 0.5; }
  const start = performance.now();
  tick(w, 60);
  const ms = (performance.now() - start) / 1200;
  console.log(`  ${ms.toFixed(3)} ms per simulation step`);
  assert.ok(ms < 4, `${ms.toFixed(2)} ms per step`);
});

// ---------------------------------------------------------------- Vivid AI
test('vivid: villagers are generated with unique temperaments, routines and capabilities', () => {
  const a = new SandboxWorld(31), b = new SandboxWorld(31);
  const villagers = a.actors.filter((x) => x.kind === 'villager');
  assert.deepEqual(villagers.map((v) => v.persona), b.actors.filter((x) => x.kind === 'villager').map((v) => v.persona));
  assert.ok(new Set(villagers.map((v) => JSON.stringify(v.persona))).size > 8, 'temperaments repeat');
  assert.ok(new Set(villagers.map((v) => v.routine!.bedtime.toFixed(2))).size > 5, 'routines repeat');
  assert.ok(villagers.every((v) => v.attrs && v.skills && v.routine));
  assert.ok((a.npc('Alden')!.skills!.blade) > (a.npc('Lark')!.skills!.blade), 'the warden should out-fight the herbalist');
});

test('vivid: a hungry, penniless, dishonest villager steals when nobody is watching', () => {
  const w = new SandboxWorld(5);
  const ellis = w.npc('Ellis')!;
  ellis.persona!.honesty = 0.05; ellis.crowns = 0; ellis.food = 0; ellis.homeFood = 0;
  ellis.needs!.hunger = 0.95; ellis.needs!.energy = 0.9; ellis.needs!.social = 0; ellis.needs!.fun = 0;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== ellis)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  ellis.x = stall.x - 3; ellis.z = stall.z + 3;
  const breads = () => w.actors.filter((a) => a.itemType === 'bread' && a.owner === 'Bran').length
    + w.actors.filter((a) => a.itemType === 'bread' && Math.hypot(a.x - stall.x, a.z - stall.z) < 1.5).length;
  const before = breads();
  tick(w, 30);
  assert.ok(breads() < before || (ellis.food ?? 0) > 0 || ellis.needs!.hunger < 0.5, 'Ellis never stole');
  assert.equal(ellis.wanted ?? 0, 0, 'nobody saw, so no fine');
});

test('vivid: a witnessed theft brings a fine from the wardens', () => {
  const w = new SandboxWorld(5);
  const ellis = w.npc('Ellis')!;
  ellis.persona!.honesty = 0.05; ellis.crowns = 30; ellis.food = 0; ellis.homeFood = 0;
  ellis.needs!.hunger = 0.95; ellis.needs!.energy = 0.9; ellis.needs!.social = 0; ellis.needs!.fun = 0;
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  const tobin = w.npc('Tobin')!;
  tobin.x = stall.x; tobin.z = stall.z + 2.5; tobin.facing = Math.PI; tobin.utility = { kind: 'idle', until: 1e9 }; tobin.decideIn = 1e6;
  tobin.social = { x: tobin.x, z: tobin.z };
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== ellis && a !== tobin)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  ellis.x = stall.x - 1; ellis.z = stall.z + 2;
  tick(w, 12);
  assert.ok((ellis.wantedUntil ?? 0) > w.elapsed || (ellis.wanted ?? 0) > 0, 'the theft was not witnessed');
  const alden = w.npc('Alden')!;
  alden.x = ellis.x + 3; alden.z = ellis.z; alden.utility = undefined; alden.decideIn = 0;
  let fined = false;
  for (let i = 0; i < 1800 && !fined; i++) { w.update(0.05); fined = (ellis.wanted ?? 0) === 0; }
  assert.ok(fined, 'the fine was never collected');
  assert.ok((ellis.crowns ?? 0) < 30, 'Ellis kept the money');
});

test('vivid: two villagers, one stool — one sits, the other finds something else to do', () => {
  const w = new SandboxWorld(5);
  w.elapsed = (19.8 - 8) * 30;
  const stools = w.actors.filter((a) => a.itemType === 'stool');
  for (const extra of stools.slice(1)) { extra.alive = false; }
  const stool = stools[0];
  const pair = w.actors.filter((a) => a.kind === 'villager').slice(0, 2);
  for (const v of w.actors.filter((a) => a.kind === 'villager')) {
    v.needs!.energy = 0.9; v.needs!.hunger = 0; v.needs!.social = 0; v.needs!.fun = 0; v.decideIn = 1e6;
    v.utility = { kind: 'idle', until: 1e9 }; v.x = 60; v.z = 60;
  }
  for (const [i, v] of pair.entries()) {
    v.needs!.energy = 0.45; v.needs!.social = 0.05; v.decideIn = 0;
    v.x = stool.x + (i === 0 ? -2 : 2); v.z = stool.z + 1;
    v.utility = undefined;
  }
  tick(w, 30);
  const sitting = pair.filter((v) => v.sittingOn === stool.id);
  assert.equal(sitting.length, 1, `expected one seated villager, got ${sitting.length}`);
  const other = pair.find((v) => v !== sitting[0])!;
  assert.notEqual(other.activity, 'Sitting');
  assert.notEqual(other.sittingOn, stool.id);
});

test('vivid: the apprentice heals the wounded with the same spell system the guardian uses', () => {
  const w = new SandboxWorld(5);
  const rhea = w.npc('Rhea')!;
  const mara = w.npc('Mara')!;
  mara.hp = mara.maxHp * 0.3;
  rhea.x = mara.x + 4; rhea.z = mara.z; rhea.decideIn = 0; rhea.utility = undefined;
  rhea.needs!.hunger = 0; rhea.needs!.social = 0; rhea.needs!.fun = 0; rhea.needs!.energy = 0.9;
  tick(w, 12);
  assert.ok(mara.hp > mara.maxHp * 0.3, `Mara was not healed (${mara.hp})`);
});

test('vivid: the guardian learns spells from books and casts them with shared rules', () => {
  const w = new SandboxWorld(5);
  w.addToPack('tomeBolt');
  w.usePack('tomeBolt');
  assert.ok(w.player.spells!.includes('bolt'));
  w.addToPack('tomeMend');
  w.usePack('tomeMend');
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = w.player.x + 3; foe.z = w.player.z; foe.intent = 'forage';
  const hp = foe.hp, focus = w.player.focus!;
  w.castSpell('bolt');
  assert.ok(foe.hp < hp, 'the bolt did nothing');
  assert.ok(w.player.focus! < focus, 'casting cost no focus');
  w.player.hp = 40;
  w.castSpell('mending');
  assert.ok(w.player.hp > 40, 'mending did nothing');
  assert.ok((w.player.skills!.magic) > 0, 'casting taught nothing');
});

test('vivid: lockpicks, patience and skill open a strongbox', () => {
  const w = new SandboxWorld(5);
  const box = w.actors.find((a) => a.itemType === 'strongbox')!;
  w.addToPack('lockpicks', 30);
  w.player.skills!.lockpick = 100;
  face(w, box, 0.05);
  for (let i = 0; i < 6 && box.locked; i++) { w.interact(); tick(w, 0.8); face(w, box, 0.05); }
  assert.equal(box.locked, 0, 'the lock never gave');
  w.interact();
  assert.equal(box.loot!.length, 0);
  assert.ok(w.actors.some((a) => a.itemType === 'pouch'), 'nothing came out of the box');
});

test('vivid: crouching changes whether a theft is seen', () => {
  const setup = (sneak: boolean) => {
    const w = new SandboxWorld(5);
    const tobin = w.npc('Tobin')!;
    tobin.x = 20; tobin.z = 20; tobin.facing = Math.PI; tobin.utility = { kind: 'idle', until: 1e9 }; tobin.decideIn = 1e6;
    tobin.social = { x: 20, z: 20 };
    for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== tobin)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
    const bread = w.spawnItem('bread', 20, 23.2, 0, 'Tobin');
    const p = w.player;
    p.x = 20; p.z = 16.5; p.facing = 0; p.sneaking = sneak;
    face(w, bread, 0.02);
    w.player.sneaking = sneak;
    w.interact();
    return w.bounty;
  };
  assert.ok(setup(false) > 0, 'standing in plain sight should be seen');
  assert.equal(setup(true), 0, 'crouching behind him should not');
});

test('vivid: skills grow with use', () => {
  const w = new SandboxWorld(5);
  const foe = w.actors.find((a) => a.kind === 'foe')!;
  foe.x = w.player.x; foe.z = w.player.z + 1.5;
  w.player.facing = 0;
  w.attack();
  tick(w, 0.6);
  assert.ok((w.player.skills!.blade) > 0, 'swinging taught nothing');
  const before = w.player.skills!.speech;
  w.buy('bread');
  assert.ok(w.player.skills!.speech > before, 'trading taught nothing');
});

test('vivid: distant villagers still live their lives (tiered simulation)', () => {
  const w = new SandboxWorld(5);
  w.player.x = -80; w.player.z = -80;
  w.elapsed = (23 - 8) * 30;
  tick(w, 90);
  const asleep = w.actors.filter((a) => a.kind === 'villager' && a.activity === 'Sleeping').length;
  assert.ok(asleep >= 8, `only ${asleep} distant villagers slept`);
});

test('vivid: a thief carries the loaf in a real inventory, and wardens confiscate it', () => {
  const w = new SandboxWorld(5);
  const ellis = w.npc('Ellis')!;
  ellis.persona!.honesty = 0.05; ellis.crowns = 30; ellis.items = {}; ellis.homeFood = 0;
  ellis.needs!.hunger = 0.95; ellis.needs!.energy = 0.9; ellis.needs!.social = 0; ellis.needs!.fun = 0;
  const stall = w.actors.find((a) => a.kind === 'stall')!;
  const tobin = w.npc('Tobin')!;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== ellis)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  ellis.x = stall.x - 1; ellis.z = stall.z + 2;
  const stock = () => w.actors.filter((a) => a.owner === 'Tobin' && a.kind === 'item').length;
  const before = stock();
  tick(w, 6);
  assert.ok(Object.values(ellis.stolen ?? {}).some((n) => n > 0), 'nothing marked stolen in his bag');
  assert.ok(stock() < before, 'the stall lost nothing');
  // Word gets out anyway: a witness reports him and the warden collects.
  ellis.wanted = 12; ellis.wantedUntil = w.elapsed + 150;
  const alden = w.npc('Alden')!;
  alden.x = ellis.x + 3; alden.z = ellis.z; alden.utility = undefined; alden.decideIn = 0;
  for (let i = 0; i < 1800 && (ellis.wanted ?? 0) > 0; i++) w.update(0.05);
  assert.deepEqual(ellis.stolen, {}, 'stolen goods were not confiscated');
  assert.equal(stock(), before, 'the goods did not return to the stall');
});

test('vivid: dropped food is scavenged by whoever is inclined to pick it up', () => {
  const w = new SandboxWorld(5);
  const bran = w.npc('Bran')!;
  bran.persona!.greed = 0.95; bran.needs!.hunger = 0.1; bran.needs!.energy = 0.9; bran.needs!.social = 0; bran.needs!.fun = 0;
  bran.utility = undefined; bran.decideIn = 0;
  for (const v of w.actors.filter((a) => a.kind === 'villager' && a !== bran)) { v.x = 70; v.z = -70; v.utility = { kind: 'idle', until: 1e9 }; v.decideIn = 1e6; }
  w.elapsed = (18.5 - 8) * 30;
  const cheese = w.spawnItem('cheese', bran.x + 3, bran.z, 0);
  tick(w, 15);
  assert.ok(!w.actors.includes(cheese), 'the cheese is still on the ground');
  assert.equal(w.bag(bran).cheese, 1);
});

test('vivid: everyone hits with the same formula, and the weapon in hand matters', () => {
  const w = new SandboxWorld(5);
  const alden = w.npc('Alden')!, lark = w.npc('Lark')!;
  assert.equal(alden.weapon, 'staff');
  assert.ok(w.meleeDamage(alden) > w.meleeDamage(lark), 'an armed warden should out-hit an unarmed herbalist');
  const p = w.player;
  const bare = w.meleeDamage(p);
  w.stock.gold = 500; w.buy('blade');
  assert.equal(p.weapon, 'blade');
  assert.ok(w.meleeDamage(p) > bare, 'the iron blade changed nothing');
});

test('vivid: a worker whose spot is occupied works beside it instead of freezing', () => {
  const w = new SandboxWorld(5);
  const iona = w.npc('Iona')!;
  w.player.x = iona.work!.x; w.player.z = iona.work!.z;
  iona.x = iona.work!.x - 6; iona.z = iona.work!.z; iona.utility = undefined; iona.decideIn = 0;
  iona.needs!.hunger = 0; iona.needs!.social = 0; iona.needs!.fun = 0; iona.needs!.energy = 0.9;
  w.elapsed = (10 - 8) * 30;
  tick(w, 20);
  const d = Math.hypot(iona.x - iona.work!.x, iona.z - iona.work!.z);
  assert.ok(d > 0.9 && d < 3, `Iona ended ${d.toFixed(2)} from her spot`);
  assert.equal(iona.activity, 'Masonry');
  assert.ok((iona.stuck ?? 0) < 0.4, 'she is still shoving');
});

let failures = 0;
for (const [name, run] of tests) {
  try { run(); console.log(`PASS ${name}`); } catch (error) { failures++; console.error(`FAIL ${name}\n  ${(error as Error).message}`); }
}
if (failures) process.exitCode = 1; else console.log(`${tests.length} world tests passed.`);
