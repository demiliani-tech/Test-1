# Hood Runner — Game Breakdown

A detailed reference of the game's current systems. Paste this into a chatbot and ask it for expansion ideas, new mechanics, balance tweaks, or content additions.

## Concept
**Hood Runner** is a mobile-first HTML5 canvas endless runner set at night in a city block. You play a rapper dodging police to collect cash and chains. The twist is a persistent **home base (the Block)** where chains are invested into buildings that grant run-start bonuses — but chains earned during a run are **lost on death** unless you voluntarily quit at a shop ("cash out").

Built entirely in one `game.js` file (~3900 lines) with procedurally drawn graphics and Web Audio API-synthesized sound. No external assets.

## Game States
`START → BLOCK → PLAYING → SHOP (every ~200m) → DEAD → BLOCK`

- **START** — Title tap screen.
- **BLOCK** — Home city block with 3 upgradable buildings and a START RUN button.
- **PLAYING** — The endless run.
- **SHOP** — Checkpoint store; choose KEEP RUNNING or CASH OUT.
- **DEAD** — Game over; run chains vaporize unless they were cashed out.

## Player Mechanics
- Auto-scrolling runner; character stays fixed on the left.
- **Tap = jump**, **hold = stronger/double jump** (second jump ~0.82x the first).
- Platforms restore jump count on landing.
- Brief invincibility frames after hits.

## Enemies
| Enemy    | Size   | Speed      | Unlocks at | Notes |
|----------|--------|------------|-----------|-------|
| Cop      | 36×58  | 0.5–0.9    | Always    | Walking animation, common |
| SWAT     | 90×62  | 0.3–0.6    | ~8s       | 3-man squad, slow but wide |
| Helicopter | 70×30 | scroll speed | ~7s    | Aerial, siren warning |
| K-9 Unit | 44×28  | 1.2–1.8    | ~10s      | Fastest; barks warn player |
| Sniper (scripted) | — | — | checkpoints | Fires guaranteed-hit tracer bullets |

All enemies despawn off-screen left. Collision kills unless a weapon auto-attacks or the car shield soaks the hit.

## Collectibles
- **Cash** 💵 — +100 score. Spent at the shop this run only.
- **Chains** ⛓️ — the prestige currency. Stack visually on the neck. Worth 500 score. Lost on death; saved permanently only via Cash Out.

## Shop (every 200m)
Three cards + two buttons:
1. **Next Weapon Tier** — see Weapons table.
2. **Car** — $1000, 1-hit shield (multi-hit if Garage unlocked).
3. **Chain** — $300, buy a chain to stack.

Buttons: **KEEP RUNNING** (continue the run) or **CASH OUT** (save all run chains to the Block, end run safely).

## Weapons (Tiers)
| Tier | Name    | Fires / Effect |
|------|---------|----------------|
| 1    | Bat     | Auto-swings on contact every 20s |
| 2    | Pistol  | Auto-fires at nearest enemy every 15s |
| 3    | Pistol+ | Same as pistol, every 10s |
| 4    | Uzi     | 3-round burst every 5s; guaranteed hits |

Bullets are guaranteed hits (visual tracer) — they can't miss on height mismatch.

## Car Shield
- Visible sports car sprite around the player at 1.9x scale.
- Eats N hits depending on source: bought at shop = 1 hit; Chop Shop levels can start the run with 1–3 hits.
- Swaps music to a distinct **trap car track** with 808 sub-bass, claps, and engine rumble.

## The Block (Home Base)
Three buildings, paid for with saved chains. Levels persist in `localStorage`.

| Building     | Theme                                   | Benefit            | Levels |
|--------------|-----------------------------------------|---------------------|--------|
| Trap House   | Peaked roof, boarded windows, graffiti  | Starting weapon tier | 0–4 (None → Bat → Pistol → Pistol+ → Uzi) |
| Chop Shop    | Roll-up door, oil stain, tire stack     | Starting car hits  | 0–3 (None → 1-hit → 2-hit → 3-hit) |
| Nightclub    | Neon trim, velvet rope, searchlights    | Outfit color / drip | 0–4 (Gold / Diamond / Fire / Shadow) |

Tapping a building opens an upgrade panel. The player character idles on the street in the outfit matching the current Nightclub level.

## Economy / Risk Loop
- Runs generate cash + chains.
- Cash is *in-run currency* → spent at shop.
- Chains are *meta currency* → only bankable via Cash Out.
- Death = lose chains. This is the **core tension**: push for more or bail early?

## Difficulty
- Speed starts at 4, ramps +0.003/frame, caps at 11.
- Obstacle gap tightens from 90 → 55 as time passes.
- Rare enemies unlock on time thresholds (SWAT/Heli/K-9).
- No explicit waves or boss fights.

## Music System
- Procedural Web Audio tracks that evolve in **phases every ~85m**.
- Distinct **car-mode music** with 808 sub, claps, darker trap synths, louder engine SFX.
- Phases are distance-based so the change feels intentional, not loopy.

## Sound Effects
808 kicks, claps, hi-hats, gunshots (noise burst + pitched pop), dog barks (formant-filtered noise), helicopter rotor (FM oscillators), tire screech, cash chime, denial buzzer, glass break.

## Scoring & Persistence
- HUD shows 💵 cash, ⛓️ chains, 🏃 distance.
- Final score = chains saved to block (best is persisted in localStorage).
- Persisted keys: `hrSavedChains`, `hrBuildingLevels`, `hrHighScore`.

## Visual Style
Night city: purple-blue sky gradient, crescent moon, parallax buildings with lit windows, dashed street lines. Characters drawn procedurally with body/hoodie/chain layering. Gold-chain + hoodie + street aesthetic.

---

## Seed Questions for Brainstorming
Ask the chatbot things like:
- What new **enemy types** would fit the city/cop theme and create different threats than chasing?
- What new **buildings** or block features could make the home base more alive?
- What **weapon tiers or alt-weapons** (grenades, stun, crew members) could I add past the Uzi?
- How could I introduce **boss fights** at distance milestones without breaking the endless-runner feel?
- What **power-ups** beyond the car would let players feel a temporary spike?
- Ideas for **cosmetic progression** (outfits, tattoos, car paint) that reward chains without affecting balance?
- How can I deepen the **risk/reward cash-out loop** (e.g. escalating shop prices, chain multipliers)?
- What **environments/biomes** (freeway, downtown, projects, highway chase) could swap in at distance milestones?
- Ways to add **light multiplayer or social** features (ghosts of friends, leaderboards tied to chain count)?
- Monetization-friendly ideas that respect the current currency design?
