# Seeded Procedural Roguelike

A browser roguelike where the **entire run is a pure function of a seed**. Same seed,
same dungeon, same loot, same enemy placements — on any machine. Different seed, a run
neither of us has seen before. Enemies hunt intelligently around corners rather than
walking into walls.

**Beat the dungeon:** a **12-floor campaign** with a **boss every 4 floors** (Ogre → Shade →
Lich). Clear the final boss to win — then **Continue into Endless mode**, where the dungeon
keeps escalating and the only score is how deep you get. Since a run is fixed by its seed,
"can you clear *this* seed?" is a shareable challenge.

**Play it online:** <https://joshuablotter.github.io/rougelike/>

**Or run it locally:** open [`roguelike.html`](roguelike.html) in any browser. No build, no
server, no dependencies, no assets — one self-contained file. Everything is drawn procedurally.

## Controls

- **Move:** arrow keys, WASD, or vi-keys (`hjkl` + diagonals `yubn`)
- **Wait:** space or `.`
- **Pick up:** `g` &nbsp;·&nbsp; **Use item:** number keys `1`–`8` (or tap an inventory slot)
- **Weapons evolve:** each weapon you pick up upgrades the one you carry, up a ladder from a
  Rusty Axe to a Pristine Greataxe — no slot used, no duplicates to manage
- **Descend:** `>` while standing on the stairs (`>`)
- **Touch:** an on-screen D-pad and action buttons appear on tablets/phones
- **Share a run:** the seed shows on screen and the death screen; append `?seed=YOURSEED` to
  the URL so someone else gets your exact dungeon. Died? **Retry this seed** replays it.

## Design highlights

- **Determinism first.** One PRNG (mulberry32) seeded via FNV-1a; no `Math.random()`
  anywhere. RNG is split into independent streams (`map`, `items`, `spawns`, `combat`,
  `cosmetic`, `ai`) each salted by floor depth, so the map for floor 5 is identical
  whether you sprinted there or cleared every room.
- **Strict sim/render split.** The simulation is a plain data object with zero DOM or
  canvas references; the renderer only reads it. The full sim runs headless in Node.
- **Rooms + corridors** via a minimum spanning tree over room centers plus ~15% loop
  edges, with validated connectivity.
- **Symmetric shadowcasting** FOV (integer-fraction slopes, no float drift, no light
  leaking through wall corners), with three visibility states (visible / remembered / unknown).
- **Flow-field (Dijkstra map) pathfinding** with an `idle → alerted → hunting → searching`
  state machine — enemies chase your *last-known position* around corners and can be wrong.
- **Energy-based turns** for speed variety, six orthogonal item effects, six enemy
  archetypes plus three bosses, on a tuned difficulty curve.
- **A campaign with a finish line.** Twelve floors, bosses at 4/8/12, a win screen, then an
  optional endless mode. Enemy HP/damage/count scale (on separate curves) while the player's
  power is capped, so late floors actually threaten a geared-up hero instead of melting.
- **Locked vaults.** Some floors seal a room of strong loot behind a locked door; the key is
  hidden elsewhere on the floor (never behind the door it opens). A few rooms become real
  treasure destinations without every room carrying loot.
- **Pack hunters.** Hounds run as a pack — aggro one and the whole pack howls and converges on
  your last-known position, so it can still be led astray around a corner.
- **Cosmetic-only juice** layered strictly on top of the resolved sim: smooth movement
  interpolation, screen shake, hit flashes, a damage vignette, and synthesised Web Audio
  blips — none of it ever writes back into game state, so determinism is untouched.

## Debug & tests

- `?debug=1` — flow-field overlay, enemy state labels, reveal map, step a turn, and a
  "generate 1000 floors" report button.
- `?test=1` — runs the determinism / generation / FOV / pathfinding / energy test suite
  in-browser (pass/fail in the tab title).
- `node test-node.js` — runs the same suite headlessly (proving the sim needs no DOM).

## Files

| File | Purpose |
|------|---------|
| `roguelike.html` | The game. The whole deliverable. |
| `test-node.js` | Headless test runner (tooling, not shipped in the page). |
| `SPEC.md` | The original build spec, annotated with implementation status. |
