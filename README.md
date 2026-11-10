# Preserve Everything: First Meadow

A playable 3D sandbox slice of Preserve Everything. Explore the meadow as a guardian, gather resources, trade with the village, build defenses and outposts, solve environmental puzzles, and defend the Citadel.

## Run

```sh
npm install
npm run dev
npm run build
```

Progress is saved locally under `preserve-everything-world-v2`. Existing v2 world saves gain the new quest and AI fields when loaded; the former 2.5D defense-board save is not imported.

## Controls

- WASD: move. Click the world to capture the mouse and look around; arrow keys turn the camera.
- Shift: run. Space: jump. Left click or J: strike. Right click or C: roll.
- E: interact. F: lift or inspect an object. G: throw a carried object. V: crouch.
- B: construction. Tab: journal and pack. 1 / 2: cast learned spells.
- Escape: pause and open engine diagnostics.

## Vivid AI

Villagers are not scripted. Each is generated with a temperament (courage, honesty, greed, kindness, temper, sociability, ambition, curiosity, patience and loyalty), hidden attributes and skills, a wallet, and a personal routine — then left to weigh its needs against the world. Goals are utility-scored and reconsidered as conditions change, so urgent hunger or danger can interrupt work without making routine meaningless. Food choices are resource-aware: people eat from a pack or home, buy from Tobin, scavenge, or, for the right temperament, risk stealing. Empty bags and pantries no longer satisfy hunger for free.

AI Packages sit over that planner as time-bounded behavioral modules. Each package has an active window, a priority and a preference target (`work`, `home`, `social`, `tavern`, `patrol`), but it never dictates a fixed route. The smith forges through the morning, takes a paid midday meal at the Kettle & Crown, returns to the forge, and goes home to a barred door at night. Packages compete with needs and danger rather than overriding them; urgent hunger still interrupts the forge.

Every person also has hidden **responsibility, aggression and confidence** drives, plus their visible crown purse. A hungry person with no food and no coin resolves it differently: high responsibility seeks honest work for a meal or endures; low responsibility and higher aggression consider theft. Wealth and food remain real world state rather than abstract fiction.

Homes belong to named residents and lock on their household schedule. Trying a barred door at night wakes the owners: they confront the intruder, call for the wardens, and keep the pressure on until the guardian leaves. This is a warning and an alarm, not a silent teleport or an execution.

Perception is shared across witnesses, guards and foes. Facing, distance, time of day, crouching and stealth skill all affect what an actor can notice; wardens and scouts investigate sounds while civilians usually keep their distance. Seat goals reserve their target while approached, and every interaction is revalidated on arrival, so crowds resolve conflicts instead of getting stuck. Mages can choose Spark bolt as well as Mending, while directly attacked defenders may fight back. Both behaviors use the same focus, attributes, equipment, defense, damage and skill-growth rules as the guardian. Skills improve for NPCs as well as the player, and spells are learned and cast from a common focus pool. Casting keys are 1 and 2 once learned.

`src/world/brains.ts` defines independent threat, routine, work and melee styles for all 13 professions. `src/world/roles.ts` enforces who may retaliate. Witnesses do not acquire the right to attack the guardian: merchants report trouble, foragers hide, farmers shelter, medics tend wounds, scouts flank and wardens intervene. The damage system rejects unauthorized attacks even if an old goal points at the player, and save repair removes enemy or tower behavior fields accidentally attached to villagers. Bakers create physical bread, farmers grow food, smiths use stored stone to train guards, and apprentices study magic. Wild creatures differ too: slimes swarm, brutes gather and break defenses, wisps screen and heal, and stalkers patrol for ambushes. Equipment and geometry distinguish their silhouettes.

The narrative layer records places explored and people encountered. Once an explored dungeon, cave, or wild camp has been cleared, villagers can offer repeatable rescue, retrieval, and hunt quests. At acceptance, the alias matcher selects a currently cleared or reset site, reserves it, and binds a friend, physical item, or enemy captain to that location. Quest stages, location occupancy, rewards, and generated objectives persist in saves. A completed site can be selected again after it recovers and its remaining threats are cleared. Strong bonds also let the guardian take low-value goods from a friend's home without committing theft.

Combat decisions use precondition- and utility-scored tactical operators: threatened squads share short-lived sightings, stalkers and capable wardens flank, wounded fighters withdraw, and spellcasters support injured allies or keep their distance. Threats, quests, NPC routines, items, camp building, and vendettas all continue to update in the same world simulation rather than switching to a separate loading scene.

World state tracking now records persistent **deeds** with their location and witnesses. Killing a civilian logs the murder, transfers their crown and item estate to next of kin, and schedules reactions: a first show of hired force, then a delayed wilderness ambush that triggers only when the guardian is far from the village. Mercenary writs remain as physical evidence. Deeds and vendettas survive save/load, and the journal surfaces what the village remembers.

The title and intro use the full-bleed landscape without starting WebGL. After Begin or Continue, the loading view paints first, then initial cells prepare a bounded number of models and LOD cells per frame. The first full 3D frame renders behind the landscape; the image fades away only after several visible game frames. Returning to the title stops GPU rendering, and Begin anew reuses the existing WebGL context. Adaptive pixel density, character LOD and shadow cost target 30 FPS during play. Actual frame rate still depends on GPU and browser capabilities; software-only WebGL may run slower.

Character poses now blend by actual movement speed, wrap joint angles without snapping, and give captives a restrained pose. Crowd-aware steering reduces shoulder-checking around moving actors. Item meshes use procedural surface maps and two detail levels, keeping close-up objects tactile while reducing distant geometry; the Marlowe locket and mercenary writ are new readable world items.

## Worldspaces and References

`src/world/cells.ts` partitions the exterior into 4,096-unit cells, represented as 57.6 world meters in the renderer. `uGridsToLoad` defaults to 5: the 5x5 cells around the guardian have full references, collision and physics. `uExteriorCellBuffer` defaults to 36, retaining a directional 6x6 sliding cache that starts preparing the next cells before the guardian crosses a boundary. `src/world/preloader.ts` synchronously prepares flat terrain heights and static collision bodies first, then uses an inline browser worker to decode low-detail mesh vertices and colors for buffered cells. Full models are prewarmed gradually in buffered cells, and their low-detail proxies use a fixed Bayer screen-door mask instead of temporally noisy alpha hashing. The world keeps safe collision and a ground plane while decorative data is pending.

`src/world/renderBatches.ts` identifies fixed buildings, architectural pieces and immovable stone. The renderer precombines each cell into a vertex-colored body mesh and, where needed, one emissive-window mesh. These batches are prepared inside the 36-cell buffer, culled as a unit, and rebuilt when a mined stone disappears. Movable items and destructible defenses stay separate. The Citadel is marked `neverFade` and remains in full detail even when its cell is outside the active grid.

LOD has three independent layers. `src/world/terrainLod.ts` selects quadtree terrain tiles at 4, 8, 16 and 32 subdivisions, merges each level into one draw call, and uses matching heights plus edge skirts to hide seams. Buffered object silhouettes share a low-detail mesh, while distant trees use two crossed, texture-atlased billboards instead of 3D geometry. Tree cells switch to instanced 3D models only within a smaller high-detail radius, using the existing screen-door fade to mask the change.

`src/world/waterLod.ts` gives the Hollowroot pool a shared water height and one scrolling wave-normal texture for its near and distant surfaces. The two surfaces blend over a short transition, so a cell change does not alter water level or ripple phase. `src/world/occlusion.ts` derives conservative invisible occlusion planes from large structures and outer hills. Frustum and occlusion checks skip fully hidden decorative geometry while keeping NPCs, quest objects, nearby props and `neverFade` landmarks available.

Taverns and dungeon entrances lead to separate interior worldspaces with their own objects, collision and map. A friendly household can invite the guardian inside during the day; barred doors still trigger the existing alarm at night. The exterior world and its events continue while an interior is open.

`src/world/content.ts` supplies one shared base definition per object type and stable RefIDs for placed objects. The seeded initial world acts as the web equivalent of a master data file. Saves contain only change forms for modified or removed references, plus full records for newly spawned objects. Reconstructing a save first generates the original references from the seed and then applies those changes, including positions, rotations, contents and worldspace. Existing full-actor v2 saves remain readable.

## Systems

`src/world/simulation.ts` is the renderer-independent authority for actors, collision, schedules, memories, resources, combat, quests and persistence. `src/world/renderer.ts` renders the game world with Three.js and controls in-game focus shots. The engine's rule-based verifier and auto-repair live in `src/engine/verifier.ts` and are available from the diagnostics panel.

The world is a deliberately scoped prototype: collision uses simple circular bodies and ballistic object motion, not a general-purpose rigid-body solver. The village, enemy economy, quest branches and environmental puzzles are a small playable set, not a complete large-scale RPG campaign.

This archive does not contain TES `.bsa`, `.nif`, `.btr` or `.bto` assets, NavMesh data or Havok physics. The procedural batches and worker stream are browser equivalents; literal support for those formats would require their assets and a different runtime.

## Verification

```sh
npx tsc --noEmit -p tsconfig.json
npx esbuild tests/world.spec.ts --bundle --platform=node --format=cjs --outfile=/tmp/preserve-world-test.cjs
node /tmp/preserve-world-test.cjs
```

With the development server running on port 5173 and Playwright Chromium installed, `node tests/browser-smoke.cjs` exercises the opening, movement, interaction, construction, waves, saving and mobile layout.