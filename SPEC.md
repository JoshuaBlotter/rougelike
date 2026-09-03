# Build Spec: Seeded Procedural Roguelike

## The pitch

A browser roguelike where the entire run is a pure function of a seed. Same seed, same
dungeon, same loot, same enemy placements, every time — on any machine. Different seed, a
game neither of us has seen before. Enemies hunt intelligently around corners rather than
walking into walls.

**Deliverable:** a single self-contained HTML file with no build step, no CDN, no external
assets. Double-click, it runs. Sprites are drawn procedurally or use a hand-rolled bitmap
font; audio, if any, is Web Audio synthesis. This is a hard constraint — a game my kid
can't open because npm isn't installed is a failed deliverable.

Build this in the milestones listed at the bottom. Do not skip ahead. Each milestone has
verification gates that must pass before the next one starts.

---

## Implementation status (as of 2026-09-03)

Milestones **1–7 complete**. The whole game lives in one self-contained `roguelike.html`
(~2000 lines). The full simulation runs headless in Node via `test-node.js`, which extracts
the `<script>` and evaluates it with no DOM present — proving the sim/render separation is
literally true. **18/18 tests pass** (`?test=1` in the browser, or `node test-node.js`).
Playable online at <https://joshuablotter.github.io/rougelike/> (GitHub Pages serves the
single static file directly).

| # | Milestone | Status | Gate result |
|---|-----------|--------|-------------|
| 1 | Skeleton (canvas, PRNG, split streams, debug scaffold) | ✅ done | tests 1, 2, 5 pass |
| 2 | Map generation (rooms, MST + loops, corridors, stairs) | ✅ done | tests 3, 4 pass; 1000-floor report clean (p95 ~0.3ms) |
| 3 | FOV (symmetric shadowcasting, 3 visibility states) | ✅ done | no corner leak (headless assertion + ASCII proof) |
| 4 | Enemies + flow-field pathfinding + state machine | ✅ done | test 6 passes; flow overlay verified |
| 5 | Combat, energy system, items, inventory | ✅ done | tests 7, 8 pass |
| 6 | Depth scaling + 6 archetypes + difficulty curve | ✅ done | balance harness report; curve tuned |
| 7 | Polish (death screen, URL seeds, touch, juice, audio) | ✅ done | 18/18 still pass; render-only effects layer |

**Notable decisions / deviations, with rationale:**

- **Extra RNG stream `rng.ai`** added beyond the required five, for enemy runtime decisions
  (wander), so AI never perturbs map/item/spawn generation. Additive — existing streams
  unchanged.
- **FOV uses Albert Ford's symmetric shadowcasting**, not the "standard 8-octant" recursive
  version. Both standard variants actually *leak* through diagonal wall corners; the gate
  ("no light leaking through wall corners") required the restrictive corner rule, implemented
  to match the diagonal-movement rule. Slopes are exact integer fractions (no float drift).
- **`hashRun` is one combined, growing hash** (terrain + enemies + items), so "floor 5
  changed because I sprinted here" is caught across every system at once. It is pinned to a
  literal (`0x4B87EE43` for `hello-world`/depth 1) that must be re-pinned deliberately when a
  generation change is intended.
- **Energy scheduler (M5) replaced M4's synchronized enemy batch** with individually
  interleaved actors. The M4 two-phase swap handling went away; sequential acting with live
  occupancy still prevents stacking/conga lines (swaps only ever mattered for opposing
  movement, i.e. fleeing — added in M6).
- **Spawning uses a threat budget, not a raw count** (§6 "cap enemy count… mosh pit"): each
  archetype costs its `threat`, floors fill to a depth-scaled budget, and a debuting archetype
  appears as a single mini-boss among grunts. This came directly out of the balance harness,
  which first exposed an all-brute wall at depth 3.
- **Added a player growth axis** (passive regen + maxHP growth on descent). The spec scales
  enemies but gives the player only weapon-driven attack growth; without an HP curve, late
  floors mathematically outrun the player. The balance harness made this obvious.
- **Post-playtest balance/UX pass (2026-09-03):** passive regen was topping the bar off for
  free, so potions never mattered — it now recovers chip damage only up to **50% of maxHp**
  (real wounds need a potion). Weapons were redundant clutter (a second Sword did nothing), so
  they became a **progression ladder** (`WEAPON_LADDER`): a weapon drop no longer takes a pack
  slot — it evolves the single weapon you carry one rung (Rusty Axe → … → Pristine Greataxe),
  and a rarer "Fine Weapon" jumps you to at least its `tierMin`. Both are simulation changes but
  touch no generation, so `hashRun` and the pinned determinism hash are unaffected. Also fixed a
  bug: `ENEMY_TYPES` had no `name`, so every combat line read "The undefined hits you" — added
  display names.
- **Pack behavior (§5, "optional") skipped** — the threat budget keeps groups small and the
  boss-escort model covers regrouping; it didn't earn its complexity yet.
- **Locked doors / keys not implemented** — the softlock-avoidance section is written
  conditionally ("if you add locked doors"); none were added, so that check is a documented
  no-op rather than a faked pass.
- **M7 juice is a strictly render-only effects layer.** Movement interpolation, screen shake,
  hit flashes, and the damage vignette are all derived from a before/after *diff* taken around
  each action in `act()` — no new fields are added to the sim, and nothing animation-side is
  ever read back by game logic. Shake jitter is time-driven `sin`/`cos` (not RNG), so it needs
  no cosmetic stream and can't perturb determinism; the `Math.random` grep (test 5) stays clean.
  Interpolation **snaps** instead of sliding when an actor jumps more than ~1.5 tiles (blink,
  descend, teleport), which avoids an entity smearing across the whole map. Audio is
  synthesised Web Audio blips (no assets), unlocked on the input gesture that drives the action,
  and fully guarded so a missing/blocked AudioContext never breaks the game.

The build order below is annotated with the same status.

## 1. Architecture (decide this first, everything else depends on it)

Simulation and rendering are strictly separated. The game state is a plain data object. The
renderer reads it and draws. The renderer never mutates state, and the simulation never
touches the canvas or the DOM. If I can run the full simulation headless in Node with no
canvas present, the separation is correct — and I want that to be literally true, because
the tests depend on it.

Turn-based with an energy system. Not real-time. This is a roguelike; turn-based is the
genre, and more importantly it removes an entire class of bugs (frame-rate-dependent
movement, diagonal wall clipping, collision tunneling). Every actor accumulates energy each
tick; at 100 energy it acts and spends it. A "fast" enemy gains 150/tick and therefore
sometimes acts twice between player turns. This gives speed variety for free without a
real-time loop.

Rendering may still animate — interpolate an actor's on-screen position between its previous
and current grid cell over ~100ms so movement looks smooth. Animation is cosmetic only; the
simulation is already fully resolved before the animation plays. Never let animation state
feed back into game logic.

Grid-based, 4-directional or 8-directional movement — pick 8 and commit. If 8, block diagonal
movement through the corner gap between two walls, or the player will squeeze through walls
and it will look like a bug even though it's a rules question.

Data-driven content. Enemies, items, and floor generation parameters live in tables at the
top of the file, not scattered through logic. Adding a new monster should be adding one
object literal, not editing five functions.

## 2. Determinism — the most important section

The "shock" of this project dies the instant the same seed produces two different dungeons.
Treat determinism as a correctness requirement, not a nice-to-have.

One PRNG implementation. Use mulberry32 or xorshift128 seeded from a 32-bit integer derived
from a user-facing string seed (hash the string with something simple and stable like FNV-1a).
Do not use `Math.random()` anywhere in the file. Add a comment at the top saying so, and I
want a test that greps the source for `Math.random` and fails if it appears.

Split RNG streams by purpose. At minimum: `rng.map`, `rng.items`, `rng.spawns`, `rng.combat`,
`rng.cosmetic`. Each is seeded from the master seed plus a fixed salt plus the floor depth.
This matters more than it sounds: if all systems share one stream, a player attacking one
extra time on floor 2 shifts every subsequent roll, and floor 3's layout changes based on
player actions. That's a real bug that will make seeds feel broken. Separate streams mean the
map for floor 5 is identical whether I sprinted there or cleared every room.

Cosmetic randomness gets its own stream and is never allowed to affect simulation. Particle
jitter, torch flicker, idle animation offsets.

Determinism traps to actively avoid:

- Iterating over `Object.keys()` or a `Set`/`Map` in a way that affects results — insertion
  order is stable in JS but it's easy to build one from an unstable source. Sort explicitly by
  a stable key (entity id) before any iteration that consumes RNG.
- `Array.prototype.sort` without a total-order comparator — ties resolve inconsistently.
  Always tie-break on entity id.
- `Date.now()`, `performance.now()`, or frame delta influencing anything in the simulation.
- Floating-point accumulation in pathfinding costs. Use integers for grid distances and energy.
- Any "shuffle" that isn't a seeded Fisher–Yates.

**Verification gate:** a function `hashRun(seed, depth)` that generates a floor and returns a
hash of the tile grid, item placements, and enemy placements. Test: generate the same seed
twice in the same session and across a page reload, assert identical hashes. Then run 200
seeds and assert 200 distinct hashes (catches a seed that silently isn't being used).

## 3. Map generation

Algorithm: rooms-and-corridors is fine and readable, but do it properly. Place N
non-overlapping rectangular rooms with a margin (rooms sharing a wall create ugly double
walls and confusing corridors), then connect them via a minimum spanning tree over room
centers so every room is reachable, then add ~15% extra edges back in so the dungeon has
loops. A pure MST dungeon is a tree, and tree dungeons feel awful — every dead end is a forced
backtrack and enemies can never flank you. Loops are what make the pathfinding interesting.

Corridors are L-shaped with a seeded choice of which leg goes first. Widen a small fraction of
corridors to 2 tiles for visual variety.

Connectivity is validated, not assumed. After generation, flood-fill from the player's spawn
tile. If any floor tile, item, enemy, or the stairs is unreachable, the floor is invalid. On
invalid, either carve a connection or regenerate with a derived sub-seed — but log which
happened, because silent regeneration hides generator bugs. If a seed needs more than 5
regeneration attempts, that's a generator failure and it should throw loudly in dev mode.

Placement rules that prevent the classic "this run is unplayable" openings:

- Stairs must be at least K tiles of path distance (not euclidean) from player spawn, scaled
  by depth.
- No enemy spawns within line of sight of the player's spawn tile, and none within 6 tiles of it.
- The player's spawn room contains no enemies at all.
- If you add locked doors and keys, validate that the key is reachable without passing through
  the door it opens. This is the single most common softlock in procedural games. Do the
  reachability check before the door exists: generate the layout, flood fill, place the key in
  the region reachable from spawn, then place the door on the boundary.
- Every item is on a walkable tile, not inside a wall, not under the stairs.

**Verification gate:** generate 1000 floors across 1000 seeds at depths 1–10. Assert for every
one: fully connected, stairs reachable, no entity in a wall, no softlock, generation completes
under 50ms. Print a histogram of room count and floor area so I can eyeball that the variety is
real and not five layouts in a trench coat.

## 4. Field of view

Recursive shadowcasting (the standard 8-octant version). Three tile visibility states:
currently visible (lit, entities drawn), remembered (dimmed, terrain drawn but entities are
not — this is what makes the map feel like memory rather than omniscience), and unknown (black).

Enemies get their own FOV check for aggro. Do not let enemies see through walls. This is the
difference between "smart AI" and "cheating AI," and players feel the difference immediately
even when they can't articulate it.

## 5. Enemy AI and pathfinding

This is the part that sells the project, so don't cheap out on it.

Use a Dijkstra map (flow field), not per-enemy A*. Once per player turn, run a single
breadth-first flood from the player across walkable tiles, producing a grid where each cell
holds its step-distance to the player. Every enemy then just moves to the lowest-valued
adjacent cell. One flood serves all enemies, it's O(map size) rather than O(enemies × A*), and
it handles arbitrary numbers of enemies converging from different directions. This is the
classic roguelike technique and it's both faster and better-looking than naive A*.

Cache the flow field and only recompute when the player moves or the terrain changes.

Derived behaviors fall out cheaply:

- Fleeing (low-HP enemies, or a designated coward archetype): move to the highest adjacent
  value, or multiply the field by −1.2 and re-flow so cowards route away intelligently instead
  of backing into dead ends.
- Ranged enemies: seek a tile with line of sight to the player at distance 4–7, then hold.
- Pack behavior: a second flow field seeded from all enemies of a type lets stragglers regroup.

State machine per enemy: `idle → alerted → hunting → searching → idle`. Idle enemies wander on
a slow timer. On seeing the player (their FOV, not distance), they become alerted, and only
then start following the flow field. When the player breaks line of sight, the enemy switches
to searching: it keeps moving toward the player's last known position for N turns, then wanders
near there, then goes idle. This one behavior is what produces the "it followed me around the
corner" reaction — the enemy isn't tracking you, it's tracking where it thinks you went, and it
can be wrong. Preserve that. Do not let a searching enemy re-lock onto your true position
without a fresh line of sight.

Optional and cheap: alerted enemies make noise that alerts other enemies within a radius,
propagated through the flow field so sound travels around corners rather than through walls.

Pitfalls to handle explicitly:

- Clumping. Multiple enemies pathing to the same tile. Enemies must treat other enemies as
  blocking. If an enemy's best move is occupied by an ally, it takes its second-best move, and
  if it's fully blocked it waits. Without this you get conga lines and enemies stacking on one tile.
- Oscillation. An enemy ping-ponging between two equal-cost tiles. Tie-break deterministically
  on a stable key, and add a small penalty for reversing the previous move.
- Corridor deadlock. Two enemies in a 1-wide corridor both wanting to pass. Detect the swap
  case and allow same-team position swaps, or the pair freezes forever.
- Unreachable player. If the player is somewhere the flood can't reach, the field must have a
  sentinel value and enemies must fall back to wander instead of dividing by infinity or
  standing still forever.
- The player standing still. Turn-based games let you wait; make sure waiting still advances
  enemy turns, or the player can freeze the world.

**Verification gate:** a debug overlay that renders the flow field values on each tile and draws
each enemy's intended next move. I want to look at it and see the numbers descending toward me.
Also: a headless test that drops an enemy at a random point on 200 generated maps, gives it 200
turns, and asserts it reaches the player on every connected map.

## 6. Items, loot, and progression

Weighted spawn tables per depth. Each item definition carries
`{ id, name, glyph, tier, weight, depthMin, depthMax, effect }`. Spawn count per floor scales
with depth, drawn from `rng.items`.

Guarantee a floor. Pure weighted rolling will eventually hand a player a run with no weapon and
no healing, and that run isn't hard, it's just broken. Guarantee at least one healing item per
floor and at least one weapon or upgrade every two floors. Roguelikes are about variance within
a survivable band, not unbounded variance.

Keep the item effects orthogonal so combinations are interesting: damage, healing, movement
(blink/dash), area effect, buff-over-time. Six well-chosen items that combine beat twenty that
don't.

Inventory with a hard slot cap — scarcity is where the decisions live. Consumables stack,
equipment doesn't.

Difficulty curve: enemy HP, damage, count, and archetype variety scale with depth, but scale
them on different curves so floor 6 isn't floor 3 with bigger numbers. Introduce each new
archetype alone on the floor it debuts, then combine it with earlier ones on later floors. Cap
enemy count by floor area or a big floor turns into a mosh pit.

## 7. Player-facing features

- Seed entry and display. The current seed is visible on screen and on the death screen, and
  there's an input to start a run from a pasted seed. Also accept `?seed=whatever` in the URL so
  a seed is shareable as a link. This is the whole trick made tangible — my son types in my seed
  and gets my exact dungeon.
- Message log, 3–5 lines, newest at the bottom. Combat results, item pickups, level transitions.
- Death screen with a run summary: floor reached, turns taken, enemies killed, items found, seed,
  and a "retry this seed" button next to a "new seed" button. Retrying the same seed after dying
  is the single most addictive loop in this genre.
- Controls: arrow keys and WASD and vi-keys (hjkl + yubn) all mapped. Space or `.` to wait. `g`
  to pick up. Number keys to use inventory slots. On-screen touch controls too — assume it gets
  played on a tablet.
- No sub-turn input queue bugs. Ignore keypresses while a turn is resolving, or holding a key
  will queue 40 moves and the player will run into a room and die with no chance to react.

## 8. Debug tooling (build this in milestone 1, not at the end)

Behind a `?debug=1` flag:

- Seed input with instant regenerate
- Reveal entire map / toggle FOV
- Flow field overlay with numeric values
- Enemy state labels (idle/alerted/hunting/searching) drawn above each enemy
- Step one turn at a time
- Godmode, teleport-to-stairs, spawn-any-item
- A "generate 500 floors and report stats" button that surfaces the connectivity and timing
  assertions in the UI

I know this feels like scope. It isn't. Every hour spent here pays back triple during the AI
work, because "why did that enemy do that" is otherwise unanswerable.

## 9. Testing

Write these as real assertions in a `runTests()` function callable from the console and from
`?test=1`, printing pass/fail counts.

1. Same seed → identical floor hash, twice in a session and across reload.
2. 200 seeds → 200 distinct hashes.
3. 1000 generated floors → all connected, no entity in a wall, stairs reachable, no key/door softlock.
4. Generation time under 50ms per floor, 95th percentile.
5. Source contains no `Math.random`.
6. Enemy reaches player from a random start on 200 maps within 200 turns.
7. Full 10-floor playthrough simulated headlessly with a scripted "always move toward stairs"
   bot — completes without throwing.
8. Energy system: a 150-speed enemy acts exactly twice as often as a 75-speed one over 1000 ticks.

## 10. Build order

Do not build these in parallel and do not move on until the gate passes. Show me the game
running at the end of each one.

1. ✅ **Skeleton.** Canvas, game loop, grid render, player moves with collision, seeded PRNG with
   split streams, debug overlay scaffolding. Gate: PRNG determinism tests 1, 2, and 5 pass.
2. ✅ **Map generation.** Rooms, MST + loops, corridors, stairs, descend to next floor. Gate: test
   3 and 4 pass, 1000-floor report is clean.
3. ✅ **FOV.** Shadowcasting, three visibility states, remembered terrain. Gate: visually verified,
   no light leaking through wall corners.
4. ✅ **Enemies and pathfinding.** Flow field, state machine, last-known-position searching,
   clumping and oscillation handling. Gate: test 6 passes, flow field overlay looks correct.
5. ✅ **Combat and items.** Energy system, attacks, HP, death, item tables, inventory, guaranteed
   drops. Gate: tests 7 and 8 pass.
6. ✅ **Depth scaling and archetypes.** Spawn tables per depth, 5–6 distinct enemy archetypes,
   difficulty curve. Gate: play floors 1–10, report where it felt flat or unfair.
7. ✅ **Polish.** Death screen with run summary (depth, turns, kills, items, seed) + **retry
   this seed** / **new seed** buttons; on-screen touch D-pad, get/descend buttons, and tappable
   inventory slots (shown on coarse pointers / small screens); movement interpolation; screen
   shake; hit flashes; a damage vignette; and synthesised Web Audio blips with a mute toggle.
   The message log and `?seed=` URL sharing carried over from earlier milestones. Gate: 18/18
   tests still pass, and the whole layer is render-only (see the M7 note above).

## 11. Working agreement

- Stop and ask if a decision would change the architecture rather than guessing.
- If you hit something in this spec that's wrong or that fights the rest of the design, say so
  instead of implementing it badly.
- Keep the file readable — I want to be able to read the map generator and understand it. Comment
  the non-obvious algorithms (shadowcasting octants, flow field, MST) with a line about why, not what.
- No placeholder functions that return fake data. If something isn't built yet, it isn't wired up yet.
- After each milestone, tell me what you'd change about the plan based on what you learned building it.
