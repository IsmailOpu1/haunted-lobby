# Phase 8 plan: art, sound and polish

Status: **approved by the owner 2026-11-10 (answers in section 9 and GDD 26.15).** Branch `phase-8-content`. Next: step 1, the Main Hall look test.

Sources: PRD Section 11 (Phase 8), Section 9 (performance and load-time targets), Section 15 (asset plan), FR-T1, FR-A1; GDD Sections 6, 21.2, 22, 23 and 26.

**Done when (PRD 11):** a stranger can join, learn from the tutorial, and finish a match without asking anything.

---

## 1. What already exists (checked in the code, 2026-11-10)

| Part | Today | Gap |
|---|---|---|
| The hotel | Built at load time from map data (`maps/marrow-hotel/greybox.ts` → `client/src/world.ts`): flat-coloured boxes for walls, floors, ceilings, furniture, hiding spots and stairs. Brass door plaques | All the art |
| Lighting | One near-black hemisphere light, black fog, your real-time flashlight, small point lights on candles, fires, relics and Wisps. Blackout darkens the ambient light | Practical lamps, baked light, accent glows |
| Task stations, relics, bell, fuse box | Hands-on 3D parts built in code (`stations.ts`, 1,258 lines), placeholder shapes | Real models that keep the same moving parts |
| Players | A grey capsule with a head, eyes and a flashlight (`remotePlayers.ts`). Characters are a colour | 8 rigged, animated models |
| Your hand | Hands appear only while working a task (`hands/work.ts`) | A hand holding the flashlight all the time, with walk sway |
| Post-processing | None. No anti-aliasing | Bloom, ambient occlusion, film grain, vignette, anti-aliasing |
| Quality settings | None. Pixel ratio capped at 1.5 | Low and High |
| Loading | Everything is built in code, so nothing to load yet | Compressed assets, a loading screen, menus up within 5 s |
| Sound | Every sound is synthesised in Web Audio (`audio.ts`, 722 lines): steps, heartbeat, pre-hunt silence, bell, whispers, task sounds | Recorded, licensed sounds with the same rules |
| Names when lit (GDD 22.2) | Not built | All of it |
| Accessibility (GDD 23) | Volume slider, mic meter, subtitles with arrows for the whisper and the bell | Key remap, sensitivity, FOV, photosensitivity mode, intensity sliders, the rest of the subtitles, first-launch warning |
| Tutorial and Training Room | Nothing | All of it |

**Tools on this PC:** Node 22, an NVIDIA RTX 4060 (good for baking light). **Blender is not installed** (needed for step 2).

---

## 2. What "professional 3D art" means here, honestly

I can't sculpt or paint models by hand the way an artist does. I can do what a technical artist does:

- **Pick** high-quality licensed models and textures (Poly Haven, ambientCG and similar, all free with clear licences).
- **Fix them up** in Blender with scripts: scale, clean-up, a second set of UVs for lightmaps, matching materials.
- **Dress** every room: place furniture, lamps, paintings, rugs and clutter so each room tells a story.
- **Light** the hotel and **bake** the light in Blender, which is where most of the "expensive" look comes from.
- **Write** the shaders, post-effects, quality settings and loading code.

So the quality ceiling comes from how good the source assets are. Environments can look genuinely good with free assets. **Characters are the risk:** free rigged people in a priest's robe or a nurse's cap barely exist. Section 9 asks how to handle that.

Every step ends with screenshots and a short video for you, and you approve the look before I repeat it across the hotel.

---

## 3. Art direction (the look bible)

Inspired by the feel of *Invokyr* (GDD 23): dark, warm, lived-in. We match the feel, never copy assets.

**Palette.** Most of the screen is near-black. Light comes in warm pools (2,700 K amber from lamps and candles, ember orange from fireplaces). The supernatural is the only cold or sick colour: sickly green for relics and the ritual, cold blue-white for Wisps and the ghost's aura. Nothing is saturated except those accents.

**Materials (PBR: colour, roughness, normal and AO maps).**

| Area | Walls | Floor | Details |
|---|---|---|---|
| Ground floor public rooms | Dark wood panelling up to hip height, patterned wallpaper above, peeling in places | Herringbone parquet, worn carpet runners | Brass fittings, picture rails, crown moulding |
| Upper floor | Faded floral wallpaper with water stains | Worn patterned carpet | Numbered brass door plates, wall sconces |
| Kitchen, Laundry, Service Room | Cracked white tile, grimy paint | Stone or chequered tile | Pipes, metal shelves |
| Basement | Rough brick and stone, damp | Flagstones | Cobwebs, rusted iron, wine racks |
| Garden Courtyard | Weathered stone walls, ivy | Gravel and broken paving | Dead fountain, thick fog, moonlight |

**Lighting rules.**
1. Each room has 1 to 3 warm practical lights (a desk lamp, a candle group, a fireplace). The rest of the room falls into darkness, so the flashlight still matters.
2. Corridors have a few dim, far-apart wall sconces. You can see a corridor's shape, never into the rooms.
3. Practical lights are baked. Only the flashlights, the camera flash and supernatural glows are real-time.
4. **Blackout** switches to a second baked set with every lamp off (moonlight only), blended in over about a second.

**Each room tells a small story** (a one-line brief that guides the dressing):

| Room | Story |
|---|---|
| Main Hall | A grand lobby left mid-evening: a guest book open on the desk, luggage abandoned by the stairs, the clock stopped |
| Reception | Pigeonholes still full of keys and letters; the switchboard tangled |
| Restaurant | Tables still laid, chairs pushed back as if everyone stood up at once |
| Kitchen | Pots on a cold range, a cleaver in the block, a back door chained |
| Ballroom | Chandelier on the floor, a gramophone, a stage with a torn curtain |
| Library | Shelves to the ceiling, a reading chair by a dead fire, the Founder's portrait |
| Service Room | Fuse box, coat hooks, a staff rota pinned to the wall |
| Garden Courtyard | A fountain full of leaves, iron benches, fog hanging low |
| Guest Rooms 1 to 4 | Each a different stay: one packed suitcase, one unmade bed, one smashed mirror, one locked trunk |
| Bridal Suite | A veil on the bed, dried flowers, a wedding portrait face-down |
| Nursery | A rocking horse, a music box, a small bed with a doll |
| Staff Quarters | Bunk beds, the Bellboy's cap on a hook |
| Laundry | Sheets hanging in rows (great cover), tubs, a mangle |
| Basement rooms | Wine racks, crates, and the Ritual Room's altar ringed with old wax |

---

## 4. How it will be built

### 4.1 Maps stay data

The map file keeps the rules: rooms, walls, doors, furniture that blocks, hiding spots, stations. A new **dressing file** per map, `maps/marrow-hotel/dressing.ts`, lists the looks only: each room's materials, each prop (model, place, turn) and each practical light. It is data, like the map. Rules code never reads it.

Two rules keep the game fair:
- **Props never change the game.** Anything that blocks walking or sight must already be furniture in the map data, so the server, physics and ghost pathing still agree. Dressing props go against walls, on tables or in corners, and a test fails if one stands in a walkway, a doorway or a hiding spot.
- **Hiding spots, stations, relic places, the bell and the fuse box keep their exact places and sizes.** Only their look changes.

### 4.2 The asset pipeline

```
assets-src/ (raw downloads, not shipped)        tools/art/ (scripts)                client/public/assets/ (shipped)
  models, textures, sounds  ──►  Blender script: clean, scale, UV2, materials  ──►  .glb  (Meshopt-compressed)
                                 gltf-transform: KTX2 textures, 1K and 2K sets  ──►  .ktx2 (Low = 1K, High = 2K)
  map + dressing data  ──►  export the hotel shell  ──►  Blender: bake lightmaps  ──►  lightmaps per floor, lamps on and off
```

- Every asset's source, author and licence goes in `docs/ASSETS.md`. Nothing goes in without a licence that allows a free online game (CC0 first, CC-BY with credit if needed).
- One command rebuilds everything (`npm run art`), so the art can be redone when the map changes.
- Library versions are pinned and their current APIs checked when the step starts (PRD rule 10).

### 4.3 Rendering

- **Post-processing:** bloom on lights, ambient occlusion, light fog, film grain, vignette, and anti-aliasing. High uses the full set. Low keeps bloom and grain, drops ambient occlusion, renders at 720p and scales up.
- **Quality setting** in Options: Low, High, and Auto (picks one from a short FPS check the first time).
- **Baked lighting on characters:** small light probes per room, so a player standing under a lamp is lit warm and one in a dark corner is a silhouette (which also makes GDD 22.2 work naturally).
- **The FPS check from PRD Section 9** is done after every step on the RTX 4060 with an on-screen counter (FPS, draw calls, triangles), and at Low with the GPU capped to stand in for a laptop. The real low-end laptop test is in Phase 9.

### 4.4 Characters

8 models with walk, run, crouch, crawl, downed and idle, plus hands visible mid-task (GDD 26.5). Each has its silhouette from GDD 22.1 (the Priest's robe and cross, the Caretaker's hunch and lantern...). One shared skeleton and animation set, so the 8 can swap without new animation work. Seen in the dark as a shadow with no name; name and character appear when your flashlight is on them within 10 m, always within 2 m (GDD 22.2). How to source them is question 1.

### 4.5 Your hand and flashlight

A first-person arm and an old metal flashlight, lit by the scene, swaying with your steps (more when running, less when crouching). The beam comes out of the model's lens. The working hands from the interaction rework use the same arm, so they match.

### 4.6 Sound

The rules stay as they are (no music, footsteps are the background, heartbeat, 2 s silence before a hunt). The synthesised sounds are swapped for recorded ones:
- Footsteps per floor surface (wood, carpet, tile, stone, gravel), several takes each so no two steps sound the same. Crouch is quieter, run quicker, crawl a drag.
- The ghost's heavy steps, the hunt sting, a heartbeat, the Bellboy's bell, relic whispers, door creaks and slams, task sounds.
- Quiet room tone per area (the hum of an empty building, wind in the courtyard, drips in the basement). Ambience, not music.
- Every sound is placed in 3D, with walls muffling sounds behind them.
- The synthesised sounds stay as the fallback while files load.

### 4.7 Accessibility (GDD 23, FR-A1)

All in Options: remap every key, mouse sensitivity, field of view 70 to 100, photosensitivity mode (flicker becomes slow dimming, the flash becomes a soft fade), jump-scare volume and screen-shake sliders, subtitles with arrows for door slams, the ghost nearby, the whisper and the bell. A content and flicker warning on first launch. A pass to check that no information is shown by colour alone.

### 4.8 Tutorial and Training Room (FR-T1)

- **Tutorial (about 3 minutes):** you alone on the real hotel's ground floor, guided by short steps on screen: walk, crouch, flashlight, open a door, do a task, find and carry a relic, hide in a wardrobe while a slow ghost passes, take a photo, pour salt. Then a few cards explain the possessed, meetings and the ritual.
- **Training Room:** the same solo night without the steps, to practise freely, with a slow ghost you can turn off.
- Both run on the server as a one-player room type, so they use the real rules. Offered from the Start screen and suggested the first time someone plays.

---

## 5. Steps

Each step has its own check, and steps 1 and 3 have an **owner check before going on**.

| # | Step | What you get | Check | Estimate |
|---|---|---|---|---|
| 1 | **Look test: the Main Hall fully dressed** | Pipeline working end to end, PBR materials, baked light (lamps on and off), post-processing, the hand and flashlight, quality setting, FPS counter | **Owner check:** screenshots, a walk-through video, and you walk it yourself. Nothing else is dressed until you like it | 1.5 weeks |
| 2 | Dress the ground floor, then upper, then basement | Every room to its story, doors, stairs, courtyard; station, relic, bell and fuse box models | Props test passes, FPS within budget on each floor, screenshots per room | 2 weeks |
| 3 | **Characters** | 8 models, animations, shadows in the dark, names when lit, hands mid-task | **Owner check:** a lineup video and a 4-player test | 1 week |
| 4 | Sound pass | Recorded sounds for everything in 4.6 | You play a night with headphones | 0.5 week |
| 5 | Compression and loading | KTX2 and Meshopt, Low and High asset sets, loading screen, menus up in 5 s, first load under 30 s | Measured on a throttled connection | 0.5 week |
| 6 | Accessibility | Everything in 4.7 | Every option works and is saved | 0.5 week |
| 7 | Tutorial and Training Room | Everything in 4.8 | A test plays the tutorial from start to end | 1 week |
| 8 | **"Done when" test** | A stranger (a friend who has never played) joins, takes the tutorial and finishes a match with no help | You watch and note every question they ask | — |

About 7 weeks of part-time work in the PRD's terms. Phase 9 (balance) needs the finished look, so nothing here is skipped.

---

## 6. Performance budget (PRD Section 9)

| | Low | High |
|---|---|---|
| FPS | At least 45 (target 60) on integrated graphics at 720p | 60 at 1080p |
| Visible triangles | Under 300,000 | Under 1,500,000 |
| Draw calls | Under 250 | Under 600 |
| Textures | 1K | 2K |
| Shadows | Your flashlight only | Flashlight shadows |
| Effects | Bloom, grain, vignette | Plus ambient occlusion |

How we stay inside it: props merged per room and drawn as instances, only your floor drawn (plus the stairwell), lightmaps instead of lamps, texture atlases for small clutter.

---

## 7. Risks

| Risk | Plan |
|---|---|
| Characters look cheap next to good rooms | Decide the source first (question 1). Show the lineup before animating all 8 |
| The look test misses the mood | It's one room, so changing course costs a week, not the phase |
| Too slow on laptops | FPS counter from day one, Low built alongside High, not after |
| Downloads get big | Two texture sizes, KTX2, only the current floor's lightmaps at full size |
| A prop changes the game by accident | The props test (4.1) runs with the other tests |
| Licence problems | `docs/ASSETS.md` lists every file. CC0 first |

---

## 8. What stays the same

Game rules, numbers (`shared/config.ts`), the server, the map's rooms and walls, and every station's moving parts. If a step seems to need a rule change, I stop and ask, and record the answer in GDD Section 26.

---

## 9. Owner's answers (2026-11-10)

| Question | Answer |
|---|---|
| 1. Characters | **A free base character with free animations; each character's outfit and props built in Blender.** One shared skeleton. I show the lineup before animating all 8 |
| 2. Blender | **I install it** (free, blender.org) and drive it with scripts |
| 3. Sounds | **Sonniss's free bundles and CC0 Freesound sounds.** For Freesound I give you a list and you download them |
| 4. Tutorial | **The real hotel's ground floor**, with a slow ghost |
| 5. Look test room | **The Main Hall** |

Downloads: before each download I name the file, where it's from and its size, as with every download.
