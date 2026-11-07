# Preserve Everything: First Meadow

A playable 3D sandbox slice of Preserve Everything. Explore the meadow as a guardian, gather resources, trade with the village, build defenses and outposts, solve environmental puzzles, and defend the Citadel.

## Run

```sh
npm install
npm run dev
npm run build
```

Progress is saved locally under `preserve-everything-world-v1`. The former 2.5D defense-board save is not imported into the new world.

## Controls

- WASD or a click on the ground: move.
- Q / R or right-drag: rotate the camera. Scroll: zoom.
- E: interact. F: lift a stone. G: throw a carried object.
- Space: strike a nearby foe. Shift + Space can strike a villager and alert witnesses.
- B: construction. I: inventory. L: journal. M: map. 1: use a healing draught.
- Escape: pause. Backtick: open the engine diagnostics panel.

## Vivid AI

Villagers are not scripted. Each is generated with a temperament (courage, honesty, greed, kindness, temper, sociability, ambition), hidden attributes and skills, a wallet, and a personal routine — then left to weigh its own needs against the world. Hunger can mean eating from a pack, walking home, buying from Tobin, or, for the right temperament, stealing — and stealing only works if nobody with eyes on the spot sees it. Wardens collect fines from villagers as readily as from the guardian. People sit when there is a free stool and find something else to do when there is not. The guardian shares the same attribute, skill, spell and equipment rules: skills grow with use, spells are learned from books and cast from a common focus pool, and crouching (V) genuinely changes what witnesses and foes can see. Casting keys are 1 and 2 once the spells are learned.

Three technologies keep the frame rate up without cutting content. Simulation is tiered: minds near the guardian think every tick, distant ones think and travel in longer strides while still living their whole day. Decisions are staggered rather than simultaneous. And repeated world geometry — every tree and stone outcrop — is drawn through instanced meshes, one draw call per shape instead of one per object.

## Systems

`src/world/simulation.ts` is the renderer-independent authority for actors, collision, schedules, memories, resources, combat, quests and persistence. `src/world/renderer.ts` renders those actors with Three.js and controls the opening and in-game focus shots. The engine's rule-based verifier and auto-repair live in `src/engine/verifier.ts` and are available from the diagnostics panel.

The world is a deliberately scoped prototype: collision uses simple circular bodies and ballistic object motion, not a general-purpose rigid-body solver. The village, enemy economy, quest branches and environmental puzzles are a small playable set, not a complete large-scale RPG campaign.

## Verification

```sh
npx tsc --noEmit -p tsconfig.json
npx esbuild tests/world.spec.ts --bundle --platform=node --format=cjs --outfile=/tmp/preserve-world-test.cjs
node /tmp/preserve-world-test.cjs
```

With the development server running on port 5173 and Playwright Chromium installed, `node tests/browser-smoke.cjs` exercises the opening, movement, interaction, construction, waves, saving and mobile layout.