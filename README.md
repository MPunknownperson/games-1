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
- Shift: run, including while striking or blocking. Space: jump. Left click or J: strike. Right click or C: roll. Hold Q to block frontal attacks.
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

The title and intro use a still captured from the meadow without starting WebGL. After Begin or Continue, the loading view paints first while the full-detail exterior, current interior and textures are prepared over several frames. A scissored warm-up render uploads their geometry and textures before the first complete 3D frame; the image fades away after several visible game frames. Returning to the title stops GPU rendering, and Begin anew reuses the existing WebGL context. Adaptive pixel-density changes and window resizes are applied immediately before a draw, rather than clearing the canvas between frames. Actual frame rate depends on GPU and browser capabilities; software-only WebGL may run slower.

Character poses blend by actual movement speed, wrap joint angles without snapping, and give captives a restrained pose. Crowd-aware steering reduces shoulder-checking around moving actors. Items retain their detailed procedural meshes and surface maps at every distance. Each character's complete rig is combined into a skinned mesh to reduce draw calls without removing body parts or animation.

## Skeletal Animation

The named `@needle-tools/ozz-animation` package is not published on npm. Instead, `src/world/ozz/ozz-runtime.js` contains a custom WebAssembly build of upstream MIT-licensed ozz-animation 0.17.0. The bridge in `src/world/ozz/ozz_bridge.cc` runs `BlendingJob`, `LocalToModelJob` and `IKTwoBoneJob`; the resulting model matrices are combined with inverse bind matrices and consumed by the existing Three.js GPU-skinned mesh. The current source poses are procedural, not imported `.ozz` animation clips.

Running or walking is the base layer while a swing, block pose, wind-up or strike can be masked onto the upper body. Breathing and Theatre-keyframed hit recoil are additive. Grounded feet keep world-space stance anchors, use two-bone IK for hip and knee correction, and align ankles to sampled support normals; foot anchors release during jumps and other airborne actions. The runtime accepts a ground-height callback and is tested against synthetic steps and slopes. The current playable meadow and interiors have flat collision floors, so the game does not yet contain real sloped or stair collision surfaces to validate in play. If WebAssembly fails, the rig falls back to JavaScript quaternion blending without native foot IK.

The generated runtime is self-contained. To rebuild it, install Emscripten and run `bash scripts/build-ozz-wasm.sh`; the script downloads and verifies the pinned upstream release and preserves its MIT license in `src/world/ozz/LICENSE.md`.

## Worldspaces and References

`src/world/cells.ts` partitions the exterior into 4,096-unit cells, represented as 57.6 world meters in the renderer. `uGridsToLoad` defaults to 5: the 5x5 cells around the guardian have active collision and physics. `uExteriorCellBuffer` defaults to 36, retaining a directional 6x6 sliding cache. `src/world/preloader.ts` prepares collision synchronously and reference manifests in a browser worker. Rendering is independent of the physics grid: this small exterior is prewarmed in full detail, including cells outside the buffer, so turns and cell crossings do not introduce placeholder meshes.

`src/world/renderBatches.ts` identifies fixed buildings, architectural pieces and immovable stone. The renderer precombines each occupied exterior cell into a vertex-colored body mesh and, where needed, one emissive-window mesh. Changed batches are replaced only after the new geometry is built. Trees use full-detail, per-cell instancing with conservative bounds and reusable instance slots. Movable items and destructible defenses stay separate. A conservative object BVH selects potentially visible cells and tree pools before Three.js performs its normal frustum and depth testing; the approximate CPU occlusion planes are not used for rendering.

`src/world/terrainLod.ts` builds fixed 32-subdivision terrain tiles, grouped into spatial batches for frustum culling. Matching heights and edge skirts conceal seams. Tiles no longer change resolution when the camera moves.

`src/world/waterLod.ts` keeps the Hollowroot pool's high-detail surface and scrolling wave-normal texture at every distance, without overlapping or fading between two meshes.

## Model Optimization

The current world uses procedural geometry and the archive contains no GLB or glTF models to compress. For future models, gltfpack is installed as a development dependency. Optimize a source model into a separate, web-accessible GLB with:

```sh
node scripts/optimize-model.mjs art/source.glb public/models/optimized.glb
```

The script uses meshopt compression, vertex-cache optimization and compatible mesh merging, preserves named nodes and extras, and disables optional mesh simplification (`-si 1`). Positions, normals and UVs are quantized; textures are not converted. Compression savings depend on the source asset and are not guaranteed. gltfpack produces one output per invocation; it does not automatically create a multi-level LOD chain. No simplified model is used by the current renderer.

`src/world/modelLoader.ts` provides `createOptimizedModelLoader()` with the embedded meshopt decoder configured for the resulting `EXT_meshopt_compression` files. A future asset must still be explicitly loaded and added to the scene; running the optimizer alone does not replace the procedural world.

## Texture Optimization

The meadow's procedural grass, paving, item textures and water normal map are captured as source PNGs and converted to 29 mipmapped KTX2 textures. Their encoded data and the meadow backdrop are embedded in `src/world/textureAssets.ts` and `src/world/previewAsset.ts`, so a deployment does not depend on separate binary files. Color maps use Basis Universal ETC1S with sRGB metadata; the normal map uses UASTC with linear data. The capture and conversion can be repeated with:

```sh
# With the development server running and Playwright Chromium installed:
node scripts/capture-procedural-textures.cjs
node scripts/optimize-textures.mjs
node scripts/embed-world-assets.mjs
# Optional validation using the Khronos KTX-Software tools:
ktx validate public/textures/grass.ktx2
```

The converter uses the portable Basis Universal WASM encoder, flips source images to match the original CanvasTexture UV orientation, and generates mipmaps. Three.js `KTX2Loader` uses the locally bundled Basis transcoder, detects supported GPU formats, and prepares textures before the world is shown. The production build embeds the transcoder rather than downloading a second copy; Vite serves it from the installed Three.js package during development. If a texture, transcoder or network request fails or takes too long, the original procedural CanvasTexture remains in place; late results are not swapped into a visible scene. The JPEG title backdrop remains a regular image because CSS cannot display KTX2.

When the GPU supports a block-compressed target, the transcoded textures can use substantially less GPU memory. In the Chromium software-rendering test, their mip levels occupied 748,976 bytes versus 2,992,772 bytes for equivalent RGBA mip levels, approximately 75% less. Other devices may choose different formats or fall back to uncompressed RGBA, so the savings are not guaranteed and compression cannot prevent every out-of-memory or context-loss event. The diagnostics panel reports the number of textures actually transcoded to a GPU-compressed format. `createOptimizedModelLoader(ktx2Loader)` also supports future glTF assets using `KHR_texture_basisu`.

If the browser loses its WebGL context, the simulation pauses and the meadow backdrop shows a restoration notice instead of a blank canvas. When the browser restores the context, the existing scene resources are warmed and redrawn before gameplay resumes. Recovery still depends on the browser and GPU being able to restore the context.

## Physics And Rollback

`src/world/physics.ts` uses Rapier at a fixed 60 Hz for swing sensor overlap checks, knockback impulses and temporary jointed ragdolls. The existing world simulation remains authoritative for ordinary movement, interaction and item physics. Up to eight ragdolls are retained for eight seconds, and physics gracefully falls back to the previous gameplay behavior if initialization fails.

The default backend is the SIMD build when supported; `?physics=deterministic` selects Rapier's separate deterministic build. `GamePhysics.capture()` and `restore()` retain Rapier world bytes, handles and physics metadata. `PhysicsRollbackBuffer` and `RollbackTimeline` provide bounded checkpoints and recorded-input replay; replay requires the deterministic backend and caller-supplied game-state capture and restoration. The project has no multiplayer transport or complete network rollback system, and its AI, navigation, random state and ordinary saves are not automatically rolled back by these physics snapshots. Do not mix SIMD and deterministic snapshots or assume cross-platform determinism for the rest of the game.

## Choreography Editor

`src/world/choreography.json` is a Theatre.js project state consumed by the game. Attack wind-up and recovery, swing effects, additive recoil, camera shake and the wave cinematic use its timeline values. Run the development server and open `?theatre=1` or select **Open timeline editor** in the diagnostics panel. Edit the sheets in Studio, export the project to JSON from Studio or the diagnostics panel, and replace `src/world/choreography.json` with the exported file. Studio stores in-progress edits locally and is excluded from the production build. `@theatre/studio` is an AGPL-3.0-only development dependency.

## Spatial Queries And Navigation

`src/world/spatialIndex.ts` builds an object-level `three-mesh-bvh` over instanced collision-body proxies, refitting moved references and rebuilding when membership changes. Melee uses it to find nearby targets and reject strikes through solid bodies. `src/world/meshAcceleration.ts` also builds triangle BVHs for shared tree geometry, precombined static meshes and terrain batches without changing their render indices. The frustum query uses padded bounds so it can skip off-screen cell batches without hiding models at the edge of the view. This project has no Gaussian-splat assets; the index represents its existing meshes and collision bodies.

`src/world/navigation.ts` generates Recast/Detour tile caches from the playable world's flat collision surface during loading. Each worldspace has its own NavMesh, a crowd of up to 256 agents, and up to 512 temporary obstacles. Static collision bodies and stationary heavy items become padded obstacles; moving, carried, raised or destroyed objects update the affected tiles. Detour supplies routes and local avoidance while the existing simulation remains authoritative for positions, interactions and physics. If WASM initialization or a query fails, the original steering remains available. Decorative outer hills are not part of the playable collision surface, so the NavMesh does not claim to navigate their render geometry.

The BVH test casts against a synthetic one-million-triangle mesh and reports a measured average; results vary with hardware and scene composition. The game's actual procedural meadow is much smaller, and no universal sub-0.1 ms guarantee is made.

Taverns and dungeon entrances lead to separate interior worldspaces with their own objects, collision and map. A friendly household can invite the guardian inside during the day; barred doors still trigger the existing alarm at night. The exterior world and its events continue while an interior is open.

`src/world/content.ts` supplies one shared base definition per object type and stable RefIDs for placed objects. The seeded initial world acts as the web equivalent of a master data file. Saves contain only change forms for modified or removed references, plus full records for newly spawned objects. Reconstructing a save first generates the original references from the seed and then applies those changes, including positions, rotations, contents and worldspace. Existing full-actor v2 saves remain readable.

## Systems

`src/world/simulation.ts` is the renderer-independent authority for actors, collision, schedules, memories, resources, combat, quests and persistence. `src/world/renderer.ts` renders the game world with Three.js and controls in-game focus shots. The engine's rule-based verifier and auto-repair live in `src/engine/verifier.ts` and are available from the diagnostics panel.

The world is a deliberately scoped prototype: primary movement uses simple circular bodies and ballistic item motion, with Rapier used for combat effects and ragdolls. The village, enemy economy, quest branches and environmental puzzles are a small playable set, not a complete large-scale RPG campaign.

This archive does not contain TES `.bsa`, `.nif`, `.btr` or `.bto` assets, NavMesh data or Havok physics. The procedural batches and worker stream are browser equivalents; literal support for those formats would require their assets and a different runtime.

## Verification

```sh
npx tsc --noEmit -p tsconfig.json
npx esbuild tests/world.spec.ts --bundle --platform=node --format=cjs --outfile=/tmp/preserve-world-test.cjs
node /tmp/preserve-world-test.cjs
npx esbuild tests/model-pipeline.spec.ts --bundle --platform=node --format=cjs --outfile=/tmp/preserve-model-test.cjs
node /tmp/preserve-model-test.cjs
npx esbuild tests/spatial-navigation.spec.ts --bundle --platform=node --format=esm --outfile=/tmp/preserve-spatial-test.mjs
node /tmp/preserve-spatial-test.mjs
npx esbuild tests/physics.spec.ts --bundle --platform=node --format=esm --outfile=/tmp/preserve-physics-test.mjs
node /tmp/preserve-physics-test.mjs
npx esbuild tests/choreography.spec.ts --bundle --platform=node --format=esm --outfile=/tmp/preserve-choreography-test.mjs
node /tmp/preserve-choreography-test.mjs
npx esbuild tests/ozz.spec.ts --bundle --platform=node --format=esm --outfile=/tmp/preserve-ozz-test.mjs
node /tmp/preserve-ozz-test.mjs
```

With the development server running on port 5173 and Playwright Chromium installed, `node tests/browser-smoke.cjs` exercises gameplay, `node tests/render-regression.cjs` checks full-detail models during rotation and cell transitions, `node tests/navigation-browser.cjs` checks live crowd and obstacle changes, `node tests/physics-theatre-browser.cjs` checks Rapier combat and Studio export, `node tests/ozz-browser.cjs` checks live layered skinning, and `node tests/texture-flicker.cjs` checks texture loading, fallbacks, resize flicker, menus, dialogue and context restoration.