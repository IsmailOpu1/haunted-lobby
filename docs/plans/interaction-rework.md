# Plan: hands-on tasks and relic searching

**Status: approved by the owner on 2026-10-27, with the suggested answers to the four questions (see the end). First batch built; awaiting the owner's playtest.** Branch `interaction-rework`. Follows the owner's decision in GDD 26.5 (2026-10-26): tasks and taking relics happen in the 3D world with the real objects, not in 2D windows.

## Goal

Doing a task should feel like handling a real thing in a dark room, with the ghost able to find you while you work. It must ask for a steady hand, careful timing and listening, not busywork. A task still takes **10 to 20 seconds** (GDD 9), and taking a relic **10 to 15 seconds** (GDD 10).

## Part 1: how working with your hands feels (all tasks)

1. **Start.** Walk up to the object and press **E**. You stay where you are. The view eases a little closer to the object, but you can still **look around freely**, so you can glance at the doorway behind you.
2. **Your hand is the crosshair.** Point at a part of the object (a wick, a knob, a shutter's handle). The part you can use glows faintly. Nothing else on screen tells you what to do. A short hint shows only the first time you ever do each task.
3. **Hold the left mouse button to grab.** While you hold it, the mouse moves the thing you're holding, not your view. Let go and you can look around again.
   - **Drag:** pull a shutter, a sheet corner or a cable.
   - **Turn:** move the mouse in a circle (or sideways) to turn a knob, a valve or a key.
4. **Tools in your hand.** Some tasks put a tool in your hand: a match, a trowel, a watering can, a cloth. It follows your aim, so you use it by moving your view. Turning too fast has a cost: the match blows out, the can spills.
5. **Stop.** Walk away or press **E** again. A half-done task is lost, as now. If the ghost hits you, it's lost too.
6. **While you work:** the flashlight stays on key **1** (left click is your hand now). You can't carry or use items. Salt and the camera wait until you stop.
7. **Others see the result, not your hands.** Visible tasks (candles lit, shutters shut) show for everyone when finished, as now. Seeing someone's hands mid-task comes with the character models in Phase 8.

**The server stays in charge.** It still decides when a task can start, cancels it if you move or get hit, and refuses one finished impossibly fast. The work itself runs on your computer, as the minigames do now.

## Part 2: the first three tasks to build

These three test the three kinds of handling: a tool (match), dragging and turning.

**Light the candelabra** (Restaurant, visible). A match is in your hand.
- Flick the mouse down sharply to strike it (a weak flick only sparks).
- Bring the flame to each of the 5 wicks by aiming, and hold it there about 1.5 s until the wick catches.
- Swing your view too fast and the match blows out; strike another (it costs a second).
- Each match burns for about 8 s, so plan your path along the wicks.
- **Skill:** a steady, unhurried hand and a sensible path.

**Close the shutters** (Upper Corridor, visible). 3 tall shutters bang in the wind.
- Grab a shutter's handle and drag it shut. The wind pushes back in gusts you can hear coming (a rising whistle).
- Hold it shut about 1.5 s until the latch clicks. Let go too early and it swings back open with a bang the ghost can hear (it becomes a noisy task).
- **Skill:** pull between gusts and hold through them.

**Turn off the stove** (Kitchen). 3 knobs, each somewhere between on and off, with flames under the pots.
- Grab a knob and turn it.
- The "off" notch is only a few degrees wide: you feel it as a soft click sound, and the flame dies.
- Turn past it and the gas hisses back on. Turn it slowly for the last part.
- **Skill:** listening for the click and turning carefully.

## Part 3: finding and taking relics

The aim (GDD 26.5): you find a relic by following its whisper, among places to search that are mostly empty. No prompt gives it away.

1. **Each relic hiding spot becomes a group of 3 or 4 places to search** in that room. For example, the Library's spot becomes 3 drawers of the writing desk and a box on the shelf. At the start of a match the server picks the relic spots as now, then one place in each spot's group. Only you ever learn which place it is, by searching.
2. **The whisper grows clearer up close.**
   - **From 8 m:** a faint breath.
   - **Within about 3 m:** a murmur.
   - **Within about 1 m:** words you can almost make out.
   - It comes from the exact place, so turning your head tells you which drawer.
3. **Searching an empty place is quick but not free.** It takes about 3 s of handling (pull the drawer out, dig a little, feel in the drain) and makes a small noise. Search the wrong ones and you lose time, and the ghost may hear you.
4. **The right place** carries on into the full taking (10 to 15 s):
   - **Dig** (flower bed, plant pots): a trowel in your hand. Scoop by dragging down and back. Scooping too hard throws soil and makes noise. The relic shows up as a glint in the soil.
   - **Lockbox** and **drain** are reworked later (Part 5).
5. **The whisper subtitle changes.** It says "faint", "close" or "very close", but the arrow only shows from afar (rounded to one of 8 directions). Within 3 m there's no arrow: you must listen and search.
6. **The "E Search the planter" prompt** shows at every searchable place, empty or not, so it no longer gives anything away.

**The first relic test:** digging in the Garden Courtyard flower bed, the Nursery plant pot and the Guest Corridor plant pot. That's 3 groups of 3 or 4 places to dig, plus the full dig.

## Part 4: how the first batch is checked

- Automated tests, as now: the rules of each new interaction (strike, catch, blow out; gusts and latch; notch and click; search groups, picking a place, whisper levels), and the server still refusing finishes that are too fast or too far.
- A test scene I play in the browser before handing it to you.
- **Your playtest decides.** If these three tasks and digging feel right, I do the rest in the same style (Part 5). If not, we change the feel before building more.

## Part 5: the rest, later (for approval of direction only)

| Task | In the world |
|---|---|
| Burn the cursed letter | Match in hand; hold the flame under the letter as the draught sways it |
| Wind the grandfather clock | Grab the key and turn it a quarter on each tick you hear |
| Repair the switchboard | Drag each cable from its hook to the matching socket and push it in |
| Clean the mirror | Cloth in hand; wipe in slow strokes, fast ones smear. A face may show behind you in the glass |
| Seal the old trunk | Push the lid down and hold it; turn each latch while holding |
| Tune the piano | Press the real keys in the order the tuning card on the stand shows; a wrong note is loud |
| Fold the bedsheets | Grab corners of the real sheet on the bed and bring them together |
| Rock the cradle | Grab the cradle's rim and rock it gently in rhythm; too hard and the baby cries |
| Water the dead roses | Watering can in hand; tilt by aiming down, stop at the line, water keeps coming a moment |
| Turn the boiler valve | Grab the wheel and turn it, watching the real needle on the gauge |
| Straighten the portraits | Grab each frame's edge and level it; one swings crooked again |
| Lockbox relic | Hold the box, turn the dial by ear: each pin clicks when the dial passes it |
| Drain relic | Reach into the dark water and feel by sound and a faint ripple, then pull up |

The old 2D windows stay working for these until each is replaced, then they are removed.

## Questions for the owner

1. Is left mouse button as the hand, with the flashlight only on key 1 while you work, all right?
2. Should others see your hands working mid-task now (more work) or with the Phase 8 character models (planned)?
3. Searching an empty place: is about 3 s plus a small noise the right cost?
4. Whisper arrow only from afar, none within 3 m: agreed?

**Answers (owner, 2026-10-27):** all four as suggested. 1: the left mouse button is your hand; the flashlight is on key 1 only while working. 2: others see your hands mid-task with the Phase 8 character models. 3: an empty search costs about 3 s plus a small noise. 4: the whisper arrow shows only from afar, none within 3 m.

## First batch: as built

- Numbers are in `shared/config.ts` under `tasks.hands` and `relics.search` / `relics.hands.dig`.
- The shutters latch after **2.2 s** held shut (not 1.5 s), so a steady player still takes at least 10 s for the three (GDD 9).
- An empty dig takes about **2.6 s** at the steadiest fast pace and about 4 s at a calm one. Digging is judged over 0.2 s, so mouse events bunching up between frames don't count as frantic.
- Checked in the browser: candelabra (two matches for 5 wicks), shutters (8.8 s), stove (about 7 s), digging (empty place gives "Nothing here."; the right place gives "Something is down there", then the relic at about 13 s).

## Second batch: as built (2026-10-27)

The owner asked to keep building before playtesting the first batch. These five reuse the first batch's controls (a match, turning, dragging, a tool in hand):

| Task | In the world | Steady player, in the browser |
|---|---|---|
| Burn the cursed letter | The letter hangs on a string under the mantel and sways in the draught. Strike a match and keep the flame just under it for 6 s of heat (it cools when the flame slips away), then it burns and drops into the grate | 8 s |
| Wind the grandfather clock | Grab the key on the clock face and drag it round a quarter turn on each tick (12 quarters). Off the beat, or two on one tick, it slips back 2 | 9.9 s |
| Turn the boiler valve | Grab the heavy wheel (it turns at most 60° a second) and watch the real gauge: bring the needle into the green band and keep it there 5 s. The needle lags and wobbles | 10.7 s |
| Straighten the portraits | Grab a crooked frame and drag sideways to level it (heavy: 18° a second at most), then let go; it settles after 1 s. One is haunted and swings crooked once more | 15.6 s |
| Water the dead roses | A watering can in your hand: aim at a vase and hold the button to tip it. The can rights itself slowly, so stop a little before the painted line; past the rim it overflows and empties | 13.9 s |

- The match is shared by the candelabra and the letter (`tasks.hands.match`).
- Their old 2D windows are removed. Still in 2D windows: switchboard, mirror, trunk, piano, sheets, cradle, and the lockbox and drain relic spots (the third batch).

