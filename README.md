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

Villagers are not scripted. Each is generated with a temperament (courage, honesty, greed, kindness, temper, sociability, ambition, curiosity, patience and loyalty), hidden attributes and skills, a wallet, and a personal routine — then left to weigh its needs against the world. Goals are utility-scored and reconsidered as conditions change, so urgent hunger or danger can interrupt work without making routine meaningless. Food choices are resource-aware: people eat from a pack or home, buy from Tobin, scavenge, or, for the right temperament, risk stealing. Empty bags and pantries no longer satisfy hunger for free.

AI Packages sit over that planner as time-bounded behavioral modules. Each package has an active window, a priority and a preference target (`work`, `home`, `social`, `tavern`, `patrol`), but it never dictates a fixed route. The smith forges through the morning, takes a paid midday meal at the Kettle & Crown, returns to the forge, and goes home to a barred door at night. Packages compete with needs and danger rather than overriding them; urgent hunger still interrupts the forge.

Every person also has hidden **responsibility, aggression and confidence** drives, plus their visible crown purse. A hungry person with no food and no coin resolves it differently: high responsibility seeks honest work for a meal or endures; low responsibility and higher aggression consider theft. Wealth and food remain real world state rather than abstract fiction.

Homes belong to named residents and lock on their household schedule. Trying a barred door at night wakes the owners: they confront the intruder, call for the wardens, and keep the pressure on until the guardian leaves. This is a warning and an alarm, not a silent teleport or an execution.

Perception is shared across witnesses, guards and foes. Facing, distance, time of day, crouching and stealth skill all affect what an actor can notice; sound can still bring curious or courageous villagers to investigate. Seat goals reserve their target while approached, and every interaction is revalidated on arrival, so crowds resolve conflicts instead of getting stuck. Mages can choose Spark bolt as well as Mending, while brave, loyal villagers may defend themselves when attacked. Both behaviors use the same focus, attributes, equipment, defense, damage and skill-growth rules as the guardian. Skills improve for NPCs as well as the player, and spells are learned and cast from a common focus pool. Casting keys are 1 and 2 once learned.

The narrative layer records places explored and people encountered. Friends with a positive history can ask for help; a generated rescue selects one of those trusted people and an unexplored dungeon, with guard pressure and approach hints adapted to the guardian's level, equipment and stealth. The generated target, location and objective persist with the save. Strong bonds also let the guardian take low-value goods from a friend's home without committing theft.

World state tracking now records persistent **deeds** with their location and witnesses. Killing a civilian logs the murder, transfers their crown and item estate to next of kin, and schedules reactions: a first show of hired force, then a delayed wilderness ambush that triggers only when the guardian is far from the village. Mercenary writs remain as physical evidence. Deeds and vendettas survive save/load, and the journal surfaces what the village remembers.

Three technologies keep the frame rate up without cutting content. Simulation is tiered: minds near the guardian think every tick, distant ones think and travel in longer strides while still living their whole day. Decisions are staggered rather than simultaneous, and stable goals avoid unnecessary replanning. Repeated world geometry — every tree and stone outcrop — is drawn through instanced meshes, one draw call per shape instead of one per object.

Character poses now blend by actual movement speed, wrap joint angles without snapping, and give captives a restrained pose. Crowd-aware steering reduces shoulder-checking around moving actors. Item meshes use procedural surface maps and two detail levels, keeping close-up objects tactile while reducing distant geometry; the Marlowe locket and mercenary writ are new readable world items.

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