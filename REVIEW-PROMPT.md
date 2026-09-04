# Claude Code prompt — Roguelike senior review & remediation

> Copy everything below the line into Claude Code from the repo root.

---

You are working on `roguelike.html` — a single-file, dependency-free, seeded browser
roguelike in this repo. I've had a senior review done. Below is what it found, with
measured evidence. Work through it in priority order.

## Ground rules — do not break these

These are the project's load-bearing invariants. Every change must preserve them:

1. **One self-contained file.** No build step, no CDN, no assets, no npm deps.
   `roguelike.html` opens by double-click and works.
2. **Determinism.** No built-in JS RNG anywhere (test 5 greps for it). All randomness
   flows from the seeded mulberry32 streams. Cosmetic randomness never feeds back
   into the sim.
3. **Strict sim/render split.** Everything above the `typeof document !== "undefined"`
   guard runs headless in Node. The renderer reads sim state and never writes it.
4. **`node test-node.js` stays green** (currently 18/18, ~2.3s). Add tests as you go;
   never delete a failing test to make the suite pass.
5. **Hash pinning.** `EXPECTED_HELLO_D1` is a frozen literal that test 1b checks.
   Anything that changes *floor generation, enemy type selection, or item placement*
   will flip it — that is the test doing its job. When such a change is intentional,
   re-pin it deliberately in the same commit and say so in the commit message.
   Note: enemy **HP/damage scaling** changes do *not* flip the hash (`hashRun` only
   fingerprints x/y/typeId), so pure balance tuning is hash-safe.
6. Commit in small, reviewable steps with a message that says *why*, not *what*.

## Evidence — what I measured (don't re-derive this, build on it)

Run these to reproduce anything:
```
node test-node.js                                  # 18/18 pass, ~2.3s
node -e '...RL.balanceReport(60)...'               # the built-in balance harness
```

**Finding A — the campaign is unwinnable. Clear rate is 0%.**
`balanceReport(60)` with the built-in "competent bot":

```
clear rate (cleared depth 12 alive): 0/60 (0%)
depth | n  | avg enemies | end HP% | min HP% | deaths
    1 | 60 |         2.0 |     92% |     92% |      0
    2 | 60 |         3.0 |     88% |     88% |      0
    3 | 60 |         4.0 |     70% |     68% |      1
    4 | 59 |         2.0 |     43% |     42% |      8   <- Ogre floor
    5 | 51 |         5.0 |     36% |     35% |     12
    6 | 39 |         6.0 |     48% |     43% |      0   <- free floor (imps)
    7 | 39 |         5.8 |     24% |     25% |     17   <- 44% death rate
    8 | 22 |         3.0 |     16% |     27% |     15   <- 68% death rate, Shade floor
    9 |  7 |         4.0 |     28% |     28% |      3
   10 |  4 |         6.5 |     13% |     14% |      2
   11 |  2 |         8.0 |      0% |     16% |      2
```
The README promises "a 12-floor campaign… clear the final boss to win." Nobody clears it.
That's the single most important thing to fix.

**Finding B — the final boss is mathematically unkillable, and the other two are free.**
I duelled a *maxed-out* player (attack 19 = the absolute progression ceiling, full HP)
against each boss **alone, with no escort**, using real pathfinding to charge into melee:

```
ogre  (d4,  26hp): killed 25/25 · player died  0/25
shade (d8,  46hp): killed 25/25 · player died  0/25
lich  (d12, 84hp): killed  0/25 · player died 25/25   (12 of 25 runs: Lich took ZERO damage)
```

Root cause: the Lich has `behavior: "ranged"` with `speed: 100` — **identical to the
player's speed** — and `rangeMin: 3`. `enemyAct` backs a ranged enemy up the flow field
whenever `cheby < rangeMin`, so at equal speed the player can *never* close to melee.
The player has no ranged attack (the firebomb does 8 damage vs 84 HP and auto-targets
the nearest enemy). The Lich kites forever, shooting for 10 into a 52 HP player.
Meanwhile the two melee bosses are pure stat-checks a geared player walks through.

The same bug in miniature: `imp` (`behavior: "flee"`, speed 120 > player 100) can never
be caught either. It isn't a threat, it's an uncatchable time sink that blocks anyone
trying to clear a floor.

**Finding C — the win condition doesn't match the promise.**
`doDescend()` triggers `winRun()` when the player *stands on the depth-12 stairs*. It
never checks whether the Lich is dead, and `placeEnemies` puts the boss on the farthest
*floor* tile (the stairs tile is excluded from candidates), so you can walk right past it.
The README says "Clear the final boss to win." Pick one and make code and docs agree.

**Finding D — exploring beats diving, but nothing tells the player that.**
A bot that fully loots each floor before descending reaches depth 10–12 (median 10) and
peaks at attack 15.4/19. The built-in "competent" bot dives for the stairs and dies at
7–8 with attack ~5. So thorough play is correct play — but the game never signals it,
and the stairs are always the farthest room, which *reads* as "go here."

**Finding E — the difficulty curve is a staircase of walls, not a curve.**
Deaths cluster hard at d4, d5, d7, d8 and vanish at d6. `threatBudget(12)` = 16.75 but
`enemyCountCap` hard-caps at 11, so past ~depth 9 the budget knob stops doing anything
and the two tuning dials fight each other.

---

## P0 — Make the game winnable and the promise true

1. **Fix the ranged-kiting exploit.** A ranged enemy at equal-or-higher speed than the
   player is uncatchable. Fix it properly — pick one and justify it in a comment:
   - give ranged enemies a retreat cost (they can shoot *or* reposition, not both), or
   - cap total retreats before they must stand and fight, or
   - drop boss speed below the player's so closing is possible but expensive.
   Apply the same reasoning to `flee` behaviour (`imp`) so it can be cornered/caught.
2. **Rebuild the boss fights so all three are actual fights.** Target: a well-played,
   well-geared run beats each boss with a real HP cost. Ogre and Shade need a mechanic,
   not just more HP — e.g. Ogre telegraphs a heavy slam, Shade blinks or splits, Lich
   summons and must be closed on. Keep each mechanic deterministic and on the existing
   RNG streams.
3. **Decide the win condition and make it real.** I'd make killing the Lich the win
   trigger (`won` fires on the boss's death, and the depth-12 stairs are locked until
   then) — that matches the README and gives the campaign an ending you *earn*.
   Update README.md and SPEC.md to match whatever you choose.
4. **Target a clear rate of 15–30%** for the reference bot on the full campaign — hard,
   but a finish line real players reach. Report before/after `balanceReport(60)` numbers.

## P1 — Reshape the difficulty curve

5. **Fix the two-dial conflict.** `threatBudget` and `enemyCountCap` currently
   contradict each other past depth 9. Make one the master and derive the other, or
   let the budget buy *quality* once the count cap is hit.
6. **Smooth the spikes.** Floors 1–3 are a no-tension tutorial (88–92% HP retained);
   d6 is free; d4/5/7/8 are walls. Aim for a monotonic rise in "min HP%" with bosses
   as the only real peaks. Use `balanceReport` to verify, not vibes.
7. **Close the power gap.** The player's ceiling is additive and capped (attack 19,
   HP 52 at depth 12); enemies scale multiplicatively *and* in count. Either raise the
   ceiling, or make late floors about positioning and consumables rather than raw stats
   — but say explicitly in a comment which one the design chose.
8. **Add a balance regression test with teeth.** The current guard only asserts "bot
   reaches depth 5 on ≥75% of seeds" — it passed at a 0% clear rate. Add an assertion
   on end-to-end clear rate landing inside an intended band, so a tuning change that
   makes the game unwinnable fails CI.

## P2 — Usability and feel

9. **Show enemy health.** The core decision in a roguelike is fight-or-flee, and right
   now the player can't tell a full-HP Brute from one on its last point. Add a small
   HP pip/bar under damaged enemies.
10. **Surface the AI.** The `idle → alerted → hunting → searching` state machine is the
    best thing in this codebase and it is *completely invisible* outside `?debug=1`.
    Give the player a readable tell — an `!` on alert, a `?` while searching. It makes
    the enemies legible and makes outsmarting them feel deliberate.
11. **Persist things.** There is zero `localStorage` use. Save: sound on/off, best depth
    reached per seed, and ideally a resumable run (the whole sim is a plain data object
    plus a seed — serializing it is nearly free). A refresh currently destroys a run.
12. **Make seed sharing one click.** The README tells players to hand-edit the URL.
    Use `history.replaceState` to keep `?seed=` current, and add a "copy link" button
    on the HUD and the death screen.
13. **Keyboard on the end screen.** `keydown` returns early when `game.gameOver`, so a
    dead player must reach for the mouse. Bind Enter = retry seed, N = new seed.
14. **Let the player aim.** `doFirebomb` auto-targets the nearest enemy and `doBlink`
    auto-picks the safest tile. Both are the only tactical items in the game and neither
    involves a decision. Add a simple target/direction selection step.
15. **Mobile readability.** The whole 44×44 map is squeezed into a `74vh` square, so
    cells get tiny on a phone. Consider a camera that follows the player at a larger
    cell size, with the full map on a held button. Also add swipe-to-move alongside the
    d-pad.
16. **Colour-blind safety.** Enemies are distinguished by colour plus a single letter,
    and grunt `#ff6b6b` vs brute `#c92a2a` is one hue. Differentiate the glyphs more,
    and add a high-contrast toggle.
17. **Tension in the early game.** Passive regen to 50% max means floors 1–3 have no
    attrition pressure — you can always wait back to half. Either shorten the tutorial
    stretch or give early floors a reason to hurry.

## P3 — Code health

18. **Delete or finish the locked-vault feature.** `TILE.DOOR`, `iron_key`, `VAULT_LOOT`
    and `tilePassableOpen` all exist; **nothing ever places a door or a key**, and
    `applyItem` has no `case "key"`. `SPEC.md:74` admits it. Either implement locked
    vaults (they'd add a genuinely good risk/reward beat, and the door/sight/pathing
    plumbing is already written) or delete the stubs and the comments that describe
    them as if they work. Half-shipped features are worse than absent ones.
19. **Remove dead code.** `stepPlayer()` is a Milestone-1 leftover, never called, and
    its turn handling now contradicts `playerMove`. `tilePassableOpen` is never invoked.
20. **Kill the duplicated attack formula.** `renderHud` hardcodes
    `4 + p.weaponBonus + p.attackBonus`; the sim has `playerAttackPower(g)`. Export the
    function and use it — two sources of truth for a displayed stat is a future bug.
21. **Fix the messages aliasing bug.** `descend()` does `next.messages = g.messages` —
    both game objects then share one array. Copy it.
22. **Bound `_sfCache`.** It's a `Map` keyed by target tile, never cleared, and each
    entry is a 1936-cell `Int32Array` (~7.7 KB). Cap it (LRU of ~8) or clear it per turn.
23. **Fix stale test naming.** Test 7 is called "headless 10-floor playthrough" but
    `FINAL_DEPTH` is 12. The comment block above `hashRun` still describes what "M4/M5
    will append" — that work is done. Sweep the file for milestone-era comments that
    describe the past rather than the present.
24. **`competentBot` reaches for `RL.isBossFloor`** (the module's own global) instead of
    the local `isBossFloor` in scope. Call the local one.
25. **Add a table-of-contents comment block** at the top of the script with line-anchored
    sections. At 2362 lines the single-file constraint is starting to cost navigability,
    and a TOC is the cheapest fix that doesn't break the no-build promise.

## P4 — If there's room

26. **Make floors look different.** Every floor is the same palette and the same room
    shapes. Add depth-banded palettes, occasional cave-like or vault rooms, and simple
    props. The generator already supports it; this is the highest visual return for the
    least code.
27. **Run history.** With seeds being the whole pitch, a local list of "seeds you've
    beaten / deepest run" turns the game into something to come back to.
28. **A daily seed.** Derive today's date into a seed and show a "Daily run" button —
    the natural payoff of the determinism work, and the single best shareability feature
    this design can have.

---

## How to work

- Do **P0 first and stop**, then show me the before/after `balanceReport(60)` output so
  we can agree the game is winnable before touching anything cosmetic.
- After each priority block: run `node test-node.js`, run the balance harness, and commit.
- If you change generation, re-pin `EXPECTED_HELLO_D1` in the same commit and say why.
- If a suggestion above is wrong for the design, say so and argue the case rather than
  implementing it — this is a review, not a spec.
