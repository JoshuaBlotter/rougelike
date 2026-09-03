# Seeded Procedural Roguelike

A browser roguelike where the **entire run is a pure function of a seed**. Same seed,
same dungeon, same loot, same enemy placements — on any machine. Different seed, a run
neither of us has seen before. Enemies hunt intelligently around corners rather than
walking into walls.

**Play it:** open [`roguelike.html`](roguelike.html) in any browser. No build, no server,
no dependencies, no assets — one self-contained file. Everything is drawn procedurally.

## Controls

- **Move:** arrow keys, WASD, or vi-keys (`hjkl` + diagonals `yubn`)
- **Wait:** space or `.`
- **Pick up:** `g` &nbsp;·&nbsp; **Use item:** number keys `1`–`8`
- **Descend:** `>` while standing on the stairs (`>`)
- **Share a run:** the seed shows on screen; append `?seed=YOURSEED` to the URL

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
- **Energy-based turns** for speed variety, six orthogonal item effects, and six enemy
  archetypes on a tuned difficulty curve.

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
