# Plan: the downloadable version (after Phase 9)

Written 2026-11-15 at the owner's request ("create a plan to download the engine after phase 9"). Status: **approved 2026-11-15** (owner: "Do whatever you prefer. If that's the best you can get, do it."), so the recommended answer to each question in section 7 stands.

## 1. Goal

A Windows game you download and install that plays the same rules as the browser version, with a better look and steadier speed on ordinary laptops. Friends on the browser version and on the downloaded version can't share a room unless both versions are kept up to date; see question 4.

## 2. What stays and what is rebuilt

| Part | What happens |
|---|---|
| Game server (Colyseus, `server/`) | **Stays as it is.** It already decides everything (PRD 10.3). The new game is a new client for the same server |
| Rules and numbers (`shared/config.ts`, `shared/src/*`) | **Stay on the server.** The new client only shows what the server says, as the browser client does |
| Voice (LiveKit) | **Stays.** Same server-side listener and routing; the client uses LiveKit's Unity SDK |
| Map data (`maps/`) | **Stays.** Rooms, tasks, relic spots and doors are data the new client reads (exported to JSON) |
| Art (Blender scripts, Poly Haven textures, Mixamo characters) | **Reused.** The same models go in as glTF; lighting is baked again inside the engine |
| The browser client (`client/`) | **Rebuilt** in the engine: drawing, input, menus, sound, tasks in 3D, voice client |
| Player movement on the client | **Ported** from `shared/src/sim/movement.ts` (about 360 lines) to C#, so your own movement feels instant, as now. A test feeds the same inputs to both versions and checks they end in the same place |

## 3. Engine: Unity 6 (recommended)

| | Unity 6 | Godot 4 | Unreal 5 |
|---|---|---|---|
| Cost | Free (Personal) | Free, open source | Free until a game earns $1M |
| Talks to our server (Colyseus) | Official SDK | Official SDK | Community SDK, not updated since 2024 |
| Voice (LiveKit) | Official SDK, desktop and mobile | None | None official |
| Look for the *Invokyr* style | Very good (URP with baked light, or HDRP) | Good | Best, but heavy on laptops |
| Runs on ordinary laptops | Good with URP | Good | Weak with its best lighting |
| Claude can build it by script | Yes (C#, editor scripts, command-line builds) | Yes | Harder (C++/Blueprints, big editor) |

Unity is the only one with official support for both the game server and voice, so nothing in `server/` has to change. Use URP (the lighter render pipeline) with baked lightmaps, light probes and reflection probes: High and Low both run well, and ordinary laptops stay smooth.

## 4. Steps

Each step ends with a test, like the PRD's phases. The browser version keeps working the whole time and stays the one friends play until step F passes.

| Step | What | Done when |
|---|---|---|
| A. Spike (1 week) | Unity project in `engine/`, Colyseus SDK, schema code made from `server/src/state.ts`, grey-box hotel from map data, walk and look | One Unity player and one browser player see each other walk in the same room |
| B. Movement and voice (1 week) | Movement ported to C# with the matching test; LiveKit voice with proximity routing from the server | The movement test passes; two players hear each other only when near |
| C. The night (2 to 3 weeks) | Tasks and relic spots hands-on in 3D (as the owner wants: no 2D windows), items, hunts, meetings, ritual, mystery, end screen | The scripted bots (`tools/playtest.ts`) and a Unity player finish a night together, every ending |
| D. The hotel (2 to 3 weeks) | Dressed rooms from the Blender scripts as glTF (doorway arch posts start 1 cm under the floor, ending the browser version's flicker where an arch meets the Nursery floor), lighting baked in Unity, characters and animations, the held torch, post-processing, sound | Every room matches or beats the browser version's look, checked room by room with screenshots |
| E. Menus and settings (1 week) | Start, Create, Join, Options, Mic check, Room, Room settings, the same font pair, accessibility options | Every menu screen from Phase 7 works; the speed test runs |
| F. Release build (1 week) | Windows installer, auto-update check against the server's version, upload to itch.io (free) | A friend downloads it, installs it and plays a match with no help |

About 8 to 10 weeks in all. The tutorial and Training Room (Phase 9b) are best built once, in the Unity version, rather than twice (question 3).

## 5. Working rules carried over

- Every gameplay number still lives in `shared/config.ts`; the client receives what it needs from the server.
- The server stays authoritative; private things (roles, cooldowns, curse glow, fake tasks, undeveloped photos) still go only to their owner.
- Maps stay data; no map-specific logic in client code.
- Free assets only, every license logged; Claude does the Blender and Unity work by script.
- Never trade quality for speed; nothing placeholder-looking in dressed rooms.

## 6. Risks

| Risk | What we do |
|---|---|
| Movement on client and server drift apart | The shared-input test from step B runs with every change |
| Two clients to keep in step while both exist | The server sends a protocol version; an old client is told to update |
| Unity licence terms change | Personal is free under its revenue limit; the code is ours, the server is engine-free |
| Download size | Baked lighting and compressed textures; target under 2 GB |
| Windows warns about an unsigned download | Expected for a free indie game; signing costs money (question 5) |

## 7. Questions for the owner (answered 2026-11-15: the recommended answer to each)

1. Is Unity 6 the engine? (Recommended above.)
2. Windows only to start? (Mac and Linux builds later are possible.)
3. Build the tutorial and Training Room (Phase 9b) in the Unity version only, not in the browser version first?
4. Once the downloaded version is out, should the browser version stay playable, or be retired?
5. Free download on itch.io first? (Steam costs a $100 fee per game, and code signing costs money each year.)

Sources: Colyseus SDKs (docs.colyseus.io/sdk, docs.colyseus.io/getting-started/unity, docs.colyseus.io/getting-started/godot), LiveKit Unity SDK (docs.livekit.io/transport/sdk-platforms/unity, livekit.com/blog/unity-sdk-production-launch), community Unreal client (github.com/charisma-ai/colyseus-unreal).

### Answers (owner left them to Claude, 2026-11-15)

1. Unity 6, URP.
2. Windows first.
3. The tutorial and Training Room are built once, in the Unity version.
4. The browser version stays playable until the Unity version passes step F, then the owner decides.
5. Free on itch.io first; no paid signing yet.

### Before step A can start

The owner installs Unity Hub and Unity 6 (LTS) and signs in to a free Unity account (Claude never types passwords). Everything after that Claude does by script. Groundwork that needs no Unity is done (2026-11-15): `npx tsx tools/engine-export.ts` writes `engine-data/map.json`, `config.json` and `movement-cases.json` (10 cases, 780 steps the C# movement must match), and `npx schema-codegen server/src/state.ts --csharp --output engine-data/schema/` writes the server's state as C# classes. Run both again after changing the map, the config, movement or the state. The movement port (`engine/Assets/Scripts/Sim/Movement.cs`) is written and matches the TypeScript on all 780 steps (largest difference 3.6e-15 m); `engine/Tools/check-movement.ps1` checks it with Windows' own C# compiler.

### Step A: passed (2026-11-15)

One Unity player (the Windows build) and one browser player saw each other walk in the same room on the local server: `step-a/unity-sees-browser.png` and `step-a/browser-sees-unity.jpg`.

- **Install.** Unity 6.3 LTS (6000.3.28f1) lives in `E:\Games\Unity\6000.3.28f1`, added to Unity Hub with Locate. The free Personal license is on.
- **The license works only in an editor started from Unity Hub.** Batch mode from Claude's shell can't reach the Hub's sign-in. So open `engine/` from the Hub, and drive the open editor through `Assets/Editor/CommandRunner.cs`: write `Setup`, `Refresh`, `Resolve` or `BuildWindows` to `engine/Temp/command.txt`, and the result appears in `engine/Temp/command-result.txt`.
- **The build** lands in `engine/Build/Windows/Haunted Lobby.exe`. It uses Mono until Visual Studio's C++ tools are installed for IL2CPP (step F). The simulation checks run with `engine/Tools/check-sim.ps1`.
- **Test run:** `"Haunted Lobby.exe" -server ws://localhost:2567 -create -codeFile code.txt -script walk -shot unity.png -shotAt 75 -quitAt 150`, then join that code from the browser.
- **Packages:** `com.unity.modules.textrendering` does not exist in 6.3 and was dropped from the manifest. Unity's default template packages (IAP, analytics and the like) were removed.
- **Left for later steps:** the Unity client ignores the server messages it does not use yet (`system`, `roster`, `relicsNear`); step C handles them. The browser version now loads every room and texture before you can enter (owner); the Unity version ships its art in the download, so it never shows grey stand-ins.

### Step B: passed (2026-11-15)

- **Movement:** `engine/Tools/check-sim.ps1` passes: 780 movement steps match the TypeScript (largest difference 3.6e-15 m), and floors, stairs and collision match Rapier (largest 1.6 cm, none over 5 cm).
- **Voice:** two Unity players, each playing a test tone instead of a mic (`-voiceTone 440` and `-voiceTone 660`). Standing near each other at the spawn, each heard the other at a steady level of about 0.18. When the second player was moved to the Ballroom (`-teleportAt 50 -20 -17`, over 25 m away), the voice server dropped both feeds within a second and both heard 0 until the end.
- **How voice works in Unity** (`Assets/Scripts/Game/Voice.cs`, LiveKit Unity SDK 2.1.1, pinned in the manifest; it needs git-lfs to install): as in the browser, the game server chooses who you receive and sends the volume, the wall muffle and the quiet-mic boost ("voiceMix"). Each voice plays from where that player's head is, with Unity's 3D direction only (the server's numbers set the loudness).
- **Testing without the paid minutes:** the official LiveKit server runs on this PC only: `E:\Games\livekit\v1.13.11\livekit-server.exe --dev --bind 127.0.0.1` (launch entry `livekit-local`), with the game server started as `server-voice-local`. Cloud minutes are not touched.
- **Note:** when the voice server cuts a feed, one of the two Unity players kept its (now silent) voice player around until the other player left. It is silent because the server's volume for a far player is 0, and it is replaced when that player comes near again. Step C can tidy it up when it builds the voice HUD.

### Step C: the plan (2026-11-15)

Step C is the biggest step, so it is done in five parts, each tested before the next. The Unity version talks to the same server with the same messages (`shared/src/protocol.ts`), so every rule stays on the server; Unity only shows the night and sends what the player does. The on-screen text matches the browser's wording. The HUD is drawn simply for now; step E gives it the real menus' look and fonts.

| Part | What | Tested by |
|---|---|---|
| C1 | The night's flow: lobby (Ready, host Start), countdown, role card, night clock and parts, task bar and your task list, down / Wisp / hidden states, held actions (E) with progress, prompts, the end screen and Rematch | A Unity host and bots in one room reach the end screen |
| C2 | Items and relics: salt, Spirit Camera and flashes, the relic music box, dropped relics, dropping (G), the altar and offerings | Salt poured and picked up, a photo taken, the music box heard near a hidden relic; carrying and offering a relic are tested in C3, once searching works |
| C3 | Tasks hands-on in 3D, ported from `client/src/stations.ts` (no 2D windows) | A Unity player does every kind of task |
| C4 | The ghost and hunts, the bell, meetings (bell, body report, photos, vote, result), the possessed's powers, Wisps and the Ouija board, the mystery | Each one tried with bots on a debug server |
| C5 | The done-when test | `tools/playtest.ts` bots and a Unity player finish a night together, every ending |

**C1 passed (2026-11-15).** A Unity host and two bots (`tools/playtest.ts lose-dawn CODE` and `lose-dead CODE`) played to the end screen: lobby, start, role, the night clock and its parts, the task bar, being down (`step-c/c1-night-hud-down.png`), dawn and everyone-dead endings (`step-c/c1-end-screen.png`), and Rematch back to the lobby (`step-c/c1-rematch-lobby.png`). New test options: `-startWith 3` (host starts a debug night once 3 are in), `-ready`, `-debugAtNight 30 '{"down":true}'`, `-rematchAfter 3`. The ritual ending waits for C3: the task bar counts the Unity player's tasks too. `tools/engine-export.ts` now also writes `characters.json` for the intro's character names.

**C2 passed (2026-11-15).** One Unity player on a debug server (`-startWith 1`, test sends with `-sendAtNight` and `-debugAtNight`, screenshots with `-shotAtNight`): pouring salt (key 3) took salt 2 to 1, the salt jar's prompt showed and E took the salt back to 2 (`step-c/c2-salt-jar-prompt.png`), the photo (key 2, then click) gave the browser's banner, and near a hidden relic the music box played with the subtitle "A music box plays close by" (`step-c/c2-music-box-cue.png`). The music box is made in Unity from the browser's tune, notes and echo. Keys now match the browser's defaults: 1 or a click for the flashlight, 2 for the camera, 3 for salt, G to drop. The salt crocks, salt lines and dropped relics are the browser's simple shapes until step D.

**C3 passed (2026-11-15).** A Unity player did every kind of task by hand in 3D, with no 2D windows. The robot test (`-handsTest all -handsShots DIR`) aims the crosshair, grabs and drags like a person. It did all 14 tasks, the lockbox, the dig and the drain, and the server accepted each one. After each search it carried the relic to the basement door and held E until the relic was placed ("Locked: 3 of 3"). Screenshots of each station when opened, when done, carrying and placed are in `step-c/c3/`. The task rules and the browser's logic tests are ported to C#, and `check-sim` runs them. The task sounds are made in Unity from the browser's recipes. Fixes found on the way:
- The hotel's grey furniture boxes covered the station models, so they are left out where a station stands. They still block movement.
- World text now hides behind objects.
- The glow materials keep their emission variant in the build.

The stations are the browser's plain models until step D. A search cannot open while you carry a relic, which is the server's rule.

**C4 passed (2026-11-16).** Tried with bots on a debug server (`tools/playtest.ts c4 CODE`: a bot is the possessed; `c4u CODE`: the Unity player is, with `-possessed`). Screenshots in `step-c/c4/`.
- The ghost: a bot's Summon brought it behind the Unity player, it hunted (the sting, the pulse, heavy steps, the heartbeat cue) and knocked the player down (`summoned-ghost.png`, `downed.png`).
- Sounds from the house: the summon whisper and a slammed door, heard where they happened.
- The possessed's eyes glow red in your flashlight for a second after Summon (`red-eyes.png`).
- Meetings: the bell, new photos developed as evidence, the dead push the Ouija planchette, the vote and its result, then the end screen with every photo (`evidence.png`, `ouija.png`, `vote-result.png`, `end-screen.png`).
- The Unity player as the possessed: the powers bar, the R wheel (`power-wheel.png`), Summon on the player in the crosshair, Slam Door on the door looked at, the curse glow time (`curse-glow.png`), and Taint in the ritual: the circle turns purple and the black-flames banner shows (`taint.png`).
- Dead: You are a Wisp, and other Wisps are seen (`wisp.png`).
- The mystery's "Who was the ghost?" bar shows once the basement opens. Naming the ghost at the altar is played in C5's full nights.
- Fixed: the camera now clears to black like the browser, so no daytime sky shows over rooms without a ceiling.
- New test options: `-possessed`, and the test sends `_wheel {"kind":…}`, `_turn`, `_vote {"name":…}` and `_ouija {"name":…}`.

**C5 passed (2026-11-16): step C is done.** The Unity host and three `tools/playtest.ts` bots finished a night together with every ending. Unity's end screens are in `step-c/c5/`.
- Ritual (`win`, with `POSSESSED_BOT=1`): the Unity player did its own 3 tasks by hand (`-handsTest mine`: its dealt tasks, with the ghost and the clock running), the bots did theirs, found the relics and named the ghost at the altar, and the ritual reached 100% through a hunt. The investigators win.
- Dawn (`lose-dawn`): the possessed win.
- Everyone dead (`lose-dead`, the Unity player downed with `-debugAtNight`): the possessed win.
- Outnumbered (`lose-dead` with `DIE=2`, the Unity player possessed): the possessed win.
- After each ending the clock stopped and the players froze. New test option: `-shotAtEnd path`.

### Step D: the plan (2026-11-17)

Step D gives the Unity version the browser's dressed hotel. It is done in five parts, each tested before the next. The rule for the whole step: the first goal is the same look as the browser, room by room; anything better comes after, and only where it is clearly better.

How the rooms come across: the browser's room files (`client/public/assets/rooms/*.gltf`, shared textures in `assets/textures`) are imported in the Unity editor with Unity's own glTF importer (glTFast, with its KTX and meshopt packages), by an editor script, not by hand. Textures shared between rooms are saved once. The Blender-baked lightmaps are reused as Unity lightmaps (the same light the owner approved), so nothing is rebaked in Unity unless a room needs it. The doorway arch fix (posts start 1 cm under the floor, ending the Nursery flicker) is made in the Blender builder and that room rebuilt.

| Part | What | Tested by |
|---|---|---|
| D1 | Rooms: every dressed room imported, placed in the hotel, lit by its lightmap, bulbs and flames glowing; the grey boxes they replace are hidden (the browser's `drawn` lists); collision unchanged | A screenshot of each room from the same spot in Unity and in the browser |
| D2 | Light and look: the torch (beam, range, softness from `shared/config.ts`), tone mapping, exposure, bloom and the browser's other post effects, reflections, fog; doors, station models, salt crocks and relics as the browser draws them | The same screenshots with the torch on, plus each station and door |
| D3 | People: the eight characters and their animations (walk, run, crouch, down, crawl), the Low copies, the held torch in the character's own hand, recognition tint | Bots walking, crouching and downed, seen from Unity, next to the browser |
| D4 | Sound: room tone, rumble, wind, random creaks, the subtitles that go with them | Heard in a night; levels match the browser |
| D5 | The done-when test | Every room matches or beats the browser's look, checked room by room with screenshots, on Low and High |

### Step D1: results (2026-11-17)

How the rooms come across, as built (it differs from the plan above in one way: the KTX and meshopt packages are not used):

1. `npx tsx tools/engine-rooms.ts` reads each browser room file, unpacks its meshes (meshopt, quantization) and its KTX2 textures (to PNG, with KTX-Software's `ktx extract`, two at a time), and writes plain glTF files to `engine/Assets/Hotel` (447 shared textures, 22 builds, about 1.2 GB; never committed, `engine/.gitignore`). It also writes `texture-roles.json`: which textures are normal maps and which hold data, not colour.
2. In the editor, `Haunted/Import dressed hotel` (CommandRunner `ImportHotel`, `engine/Assets/Editor/HotelImport.cs`) sets each texture up as it first imports (normal map, sRGB or not, at most 2K), turns each Blender lightmap into a Unity lightmap (an EXR holding linear(png) × the room's lightmapScale), and lists every build in `Assets/Hotel/Resources/HotelArt.asset`. It also keeps the lightmap and linear-fog shader versions in the build, which the scene alone would strip.
3. In the game, `DressedRooms` places every build (turned half a circle: glTFast's axes against the game's), gives each mesh its room's lightmap (bulbs excepted, as in the browser), and `Hotel` leaves out the grey floors, furniture, hiding spots and stairs that a dressed room draws itself, from the browser's `drawn` lists. `Game.SetUpLight` gives dressed rooms the browser's faint fill and no sky to reflect.

The test: `-roomShots DIR` (`RoomTour.cs`) and the browser's `roomTour` (dev, `window.__game`) each take every room from its middle at eye height, looking four ways, 60° view, torch off: 108 pictures each, same names.

What it showed:

- Every room lines up with the browser: same builds in the same places, the same baked lamp light on the walls.
- Fixed on the way: Unity reflected its bright built-in sky on every shiny surface (the rooms came out grey and bright); and the black fog was missing, because the build had stripped the fog shaders.
- Left for D2, as planned: Unity has no tone mapping or bloom yet, so bulbs and flames are flat orange where the browser's are white-hot with a glow, and bright and dark parts sit a little differently; the browser's rooms also reflect their own light (dressedRooms.ts probes), which makes a few (the Staff Quarters) a touch brighter.

### Step D2: light and look, first part (2026-11-17)

Done so far: the browser's picture finish, the rooms' reflections and the torch. Doors, stations, salt crocks and relics come next.

1. **Picture finish** (`engine/Assets/Scripts/Game/HauntedPost.cs`, `engine/Assets/Shaders/HauntedPost.shader`).
   - It is a renderer feature in place of Unity's own post effects, doing what `client/src/post.ts` does on High, with the same numbers.
   - Bloom: three's UnrealBloomPass (bright pass over 2.5, five blurred levels, mixed by radius 0.45 at strength 0.55).
   - Then AgX tone mapping (three's matrices), exposure 1, film grain 0.035 and the vignette.
   - `-bloomOnly` shows only what glows.
2. **Glow**: glTFast ignores `KHR_materials_emissive_strength`, so bulbs did not glow. `tools/engine-rooms.ts` now folds the strength into each emissive colour.
3. **Reflections** (`DressedRooms`).
   - One realtime probe per build, as `dressedRooms.ts` places them: the dressing's `probes` spots, or the build's middle, 1.6 m over its floor. 256 px, near 0.05, far 50.
   - Each probe is taken once the hotel stands, with the fog off and every other probe's light off. Each piece reflects its nearest probe; bulbs reflect none.
4. **Patched URP**: `engine/Packages/com.unity.render-pipelines.universal` is URP 17.3.0 copied in, with three changes listed in its `HAUNTED-PATCHES.md`.
   - Per-light decay as three's (the torch 1.2, the camera flash 1.5).
   - Lightmapped surfaces also take light from their probe, as three's envMap gives. This is what lit the Staff Quarters, which was almost black.
   - The spot's edge is three's smoothstep.
5. **Normal maps are now plain linear textures**, not Unity normal maps. glTFast's shaders read x and y from red and green, and Unity's normal-map packing had turned every wall's surface sideways.
   - Unnoticed under lightmaps alone. Under the torch it lit only one side of the beam, with a hard, ragged edge.
   - `HotelImport` re-imports any texture still set up the old way.
6. **The torch** (`Torch.cs`).
   - It matches `flashlight.ts`: colour fff2d6, 30/π (three's lights are π brighter), `coneM` 12 m and `coneHalfAngleDeg` 26 from config, penumbra 0.5, decay 1.2, no shadows.
   - It starts at the held torch's lens, as the browser's does. The live browser light sits at (0.18, −0.225, −0.54) from the eyes, not at the eyes.
   - It dims near walls as `BeamAdaptation` does: within 2.5 m, to no less than 0.2, at 6/s. Simple pieces are tested exactly, detailed ones by their box.
   - Remote players' torches use the same light and have a lens.
   - The camera flash is 60/π with decay 1.5.

The test: `-roomShots DIR` with `-torch`, and the browser's `roomTour(save, only, true)`. Both take every picture by the torch at full strength.
- The browser's tour now keeps its 60° view through window resizes. A resize mid-tour had brought back the game's own view.
- Its shots must be taken with the browser pane showing: hidden, the page gets no frames.

What it showed (mean brightness per view, browser vs Unity):
- Torch off: every room within about 1.5 of the browser in every view. The Staff Quarters went from 86 to 88 (browser 89).
- Torch on: within about 2 in almost every view. Three views stand out:
  - The Stairwell's relic door, which the browser draws and Unity lacks for now.
  - The Restaurant's bar: glass bottles glare in Unity, where the browser bends light through them.
  - The Restaurant door's round fitting.
  The first two belong to the next part.

### Step D2: doors, stations, salt crocks and relics (2026-11-17)

1. **Doors** (`engine/Assets/Scripts/Game/Doors.cs`, from `world.ts` DoorView and buildDoorSigns).
   - `tools/engine-rooms.ts --models` converts `assets/doors/doors.gltf` and the station models (clock hands, cradle, trunk) into `engine/Assets/Hotel/Models/`, with `door-styles.json` (map, door: style and number).
   - Leaves hinge and swing at 4 rad/s as the browser's; a door with no model is a box.
   - Lintels and room-name plaques, written in Georgia bold on the CPU (`Shapes.TextPainter`) as the browser's canvas does.
   - The relic door's slots fill gold as relics are placed.
   - Doors are lit by their nearest room probe, as moving pieces now can be (`DressedRooms.LightMovable`, plus a fourth URP patch: rendering layer 7 takes the probe's light).
   - `Hotel.cs` no longer draws its grey door panels; it keeps their collision.
2. **Stations** (`Stations.cs`): the dressed versions the browser draws over the baked rooms, from the candelabra to the sheets, plus the clock's hands and glowing face, the cradle and the trunk from their models, and the dressed lockbox, dig and drain search places. The portraits are painted on the CPU as the browser's canvas paints them.
3. **Salt crocks and relics** (`Items.cs`): the crock is the browser's lathe with its glaze, lid and SALT label; the relic is unlit with its light at 1.2/π.
4. **Materials**: three's Lambert has no shine, but URP Lit always adds some. GreyBox and Glow now have specular highlights and reflections off (the relic door's empty slots had come out grey, not near-black). New `Standard`, `StandardGlow` and `SpecularGlow` materials stand for three's MeshStandardMaterial and the mirror's Phong glass.
5. **Unlit where the browser is**: the piano's card and the roses' number tags are MeshBasicMaterial in the browser and are now unlit in Unity too.

The test: the room tours as before, plus close-ups. `-roomShots DIR -closeUps` (with or without `-torch`) and the browser's `roomTour(save, only, torch, true)` take each task station, relic search place and salt jar from 1.6 m in front, looking a little down, and each door from 2 m on both sides: 108 pictures each, same names (`RoomTour.CloseUpViews`, `game.ts closeUpViews`).
- The browser pane must be 1280 × 720 for its shots. A narrower pane gives a narrower picture.

What it showed (mean brightness, browser vs Unity):
- Room tours, torch off: every view within about 2.
- Room tours, torch on: within about 2, except four views that were the same before this step (the first part's tour gives the same numbers). These are the Restaurant's bar (glass bottles, +25), the Laundry (+7) and the Kitchen stove (+5), where Unity's bloom spreads further round the brightest spots, and the Nursery's last view (−6).
- Close-ups, torch off: all 108 within 3 after the fixes above. The Nursery's salt jar is 3 darker because of its oil lamp's glass chimney.
- Close-ups, torch on: within about 4, with Unity a little darker round the beam (less bloom spread at 2 m). The mirror is the exception: its glass now shines as the browser's Phong does (−22 went to −18, and −1 with the torch off), but the browser's glow round the reflected beam is wider. That goes with the bloom item below.

### Step D2: glass (2026-11-17)

The rooms' glass (`KHR_materials_transmission`: the bar's wine bottles, the lamp chimneys, the chandeliers, the spectacles, the magnifier) is drawn as three.js draws it.

1. **What lies behind** (`engine/Assets/Scripts/Game/HauntedTransmission.cs`, a renderer feature).
   - As three's `renderTransmissionPass`: before the see-through things, URP's copy of the opaque world (full size; ProjectSetup turns its downsampling off) goes into a mipmapped half-float picture; the glass's back faces are drawn into a copy of it; both get mip levels.
   - Cameras other than the game's (the reflection probes) see glass over black.
2. **The glass** (`engine/Assets/Resources/Shaders/HauntedGlass.shader`).
   - Lit by URP's own light functions, kept apart into diffuse and shine. The diffuse is swapped, by the transmission (and its map's red), for the picture behind at the same spot: blurred by three's bicubic mip read at log2(width) × roughness, tinted by the colour, less what the surface reflects (three's DFGApprox). Shine and glow stay on top.
   - Double-sided as three: back faces first, then front faces. BLEND glass blends by its alpha without writing depth.
3. **Where it comes from.** glTFast keeps nothing of transmission, so `HotelImport` reads each glass material from the glTF files into `HotelArt.glass` (factor, map, colour, blend), and `DressedRooms` gives those materials HauntedGlass with glTFast's own properties copied over. `tools/engine-rooms.ts` marks the transmission maps as data.
4. **three's roughness** for every lit surface (URP patch 4 in `HAUNTED-PATCHES.md`): at least 0.0525, plus the geometry's own curve, as three does.
5. **Result** (room tour and close-ups, torch on and off). With the torch off, every room is within 3 of the browser; the Restaurant bar is 99.5 against 100.5 (the bottles on the bar are see-through as in the browser). With the torch on, the bar's view stays +25: not the glass but bloom round the torch's glints on the shelf's smooth (opaque) bottles, which spread wider in Unity. That, the ballroom doors from close by (−6) and the mirror (−18) are the bloom item below.

### Step D2: shine, quality levels and blackout (2026-11-17)

1. **three's direct shine** (URP patch 5): the torch's glints use three's GGX, not URP's "minimalist" version, which is twice as bright looking along the light. The Restaurant bar by torchlight went from +25 to +5.5.
2. **three's diffuse colour** (URP patch 6): albedo × (1 − metalness), without URP's extra 4% off.
3. **Quality levels** (`HauntedQuality`; `-quality low` until the menus of step E). Each does what the browser's does:
   - **High:** full size, with ambient occlusion (`HauntedAO`: three's GTAOPass, its normal pass, 16-sample GTAO, Poisson denoise and blend, at half size). `-aoOnly` shows the occlusion alone; `-noAO` turns it off for a test.
   - **Low:** at most 720 lines, scaled up; no occlusion; plain glass.
   - **Low's textures:** textures over 1024 pixels drop a size (the "Large" mipmap group, which HotelImport puts them in).
   - **Low's lighter meshes:** the lighter copies of detailed pieces, made by `tools/engine-rooms.ts` with the browser's settings (`client/src/lighter.ts`). There are 547 pieces; the restaurant's 538,240 triangles become 183,507.
4. **Blackout** (URP patch 7): the lamps fade at 4 a second, as dressedRooms.ts does. The baked light (`_HauntedLamps`), the bulbs' glow and the rooms' reflection probes fade together, and the fill drops to game.ts's 0.005. It is driven by the server's `blackout`; `-blackout` forces it for a test.
5. **Result.**
   - **Room tours, High:** torch off, every room within 2 of the browser; torch on, within 2.5 except the Restaurant bar (+5.5).
   - **Low against High:** within 2 everywhere.
   - **Blackout tour:** black but for the torch, as the browser.
   - **Close-ups:** the browser's close-up pictures turn out to have been taken without ambient occlusion and its room pictures with it (checked in the browser: AO off gives the same pictures). So the close-ups compare with `-noAO`: all within 4 of the browser except the ballroom doors (−6), the Kitchen relic (−7) and the mirror (−16).
   - **AO itself:** the AO-only pictures of the two match (178.9 against 178.5 on the Kitchen). Turning AO on changes both alike: −15 in the browser and −17 in Unity on the stove close-up, about −10% in the Ballroom.

### Step D2: the glow round the torch up close (2026-11-18)

The bloom itself was right (with no threshold the two glow alike). What fed it was a little darker in Unity, and at three's threshold of 2.5 a torch-lit wall sits just under it (1.6 to 2.2), so a few percent changed the glow by 40%. Measured on the light before bloom and tone mapping (`-hdrOut` writes it into the picture):

1. **64-bit HDR.** URP's default 32-bit picture (R11G11B10) keeps 5 or 6 bits a colour; the browser draws in half floats. Torch-lit surfaces came out 3% darker. `ProjectSetup` now sets 64 bits.
2. **The night fill on lightmapped surfaces** (URP patch 8). three adds its 0.04 hemisphere fill to everything; URP gave lightmapped surfaces no ambient, so dark corners were 7 to 14% darker. Now within 2%.
3. **The mirror's fog** was made as an sRGB texture; three reads its DataTexture as linear, so the fog was a quarter darker. The mirror close-up went from −17 to −4.6, its glow from 13,457 to 19,467 against the browser's 20,800.
4. **Ruled out:** the torch (position, strength, colour, cone, fall-off all identical), AO, mipmaps, normal maps, MSAA. Using three's lower least roughness for the shine made no measured difference except pushing the Restaurant bar to −6.5, so it was left out.
5. **Result** (mean difference from the browser, last commit → now): rooms 0.45 → 0.26 (none over 2); close-ups 0.48 → 0.19; close-ups by torch 1.86 → 0.53; rooms by torch 0.89 → 0.71; Low against High 0.33 → 0.10. Blackout still black but for the torch.
6. **Test aids kept:** `-hdrOut` (the light before bloom, as an exact 8-bit code), `-exposure X`, `-bloomScale X`, `-bloomThreshold X`.

Left for D2:
- The Restaurant bar by torchlight is +6.4 (the bottles' central glint glows a little wider than the browser's), and a few torch-lit walls +2 to +3.6. Small; to look at again in D5 with every room on Low and High.

### Step D3: people (2026-11-18)

1. **Bringing them across.** `npx tsx tools/engine-rooms.ts --characters` writes the eight characters, their Low copies, the shared animations and the torch in each hand (`held_<character>`, `held_torch` before one is dealt) to `engine/Assets/Hotel/Characters` (textures inside the files are saved once each, named by content). `Haunted/Import characters` (CommandRunner `ImportCharacters`, `CharacterImport.cs`) makes the clips Unity's Animation plays and lists everything in `CharacterArt.asset`.
2. **Bodies** (`RemotePlayers.cs`, as remotePlayers.ts and characterModels.ts): each player's character, scaled to `config.body.heightM`, the hips' movement scaled to its legs, clips chosen as `chooseClip` does (idle, walk, run, crouch, creep, knocked down, crawl, downed, dying) and blended over 0.25 s; the Low copy on Low quality. Lit only by the torches and the night fill (no room reflection, no shadows). A nameless shadow until you can tell who it is (GDD 22.2), using the sim's new `World.LineOfSight` (physics.ts lineOfSight).
3. **The torch in your hand** (`HeldTorch.cs`, `HauntedHeld.cs`, as heldFlashlight.ts and post.ts): your character's hand, drawn in its own pass after the world and before the bloom, through the browser's 75° held camera, against a depth of its own. Lit by its own bounce light (rendering layer 1, "Held torch"), the night fill, and the soft studio three makes from RoomEnvironment, rebuilt at a thirtieth of its size far below the hotel. The studio's picture shines in the metal through a tiny probe just in front of the eye, and is read back once into spherical harmonics for the hand and sleeve's diffuse light. The lens glows with the beam.
4. **Names** over heads: the browser's size, hidden by what is nearer (`Haunted/Label`; Unity's own text shader drew them through walls). The browser's font (Manrope) and its soft shadow come with the menus' font pair in step E.
5. **Things found on the way** (each cost a wrong picture):
   - URP drops a light's rendering layer if the project hasn't named it (`ProjectSetup.NameRenderingLayers`).
   - In Forward, Unity uses only the reflection probes in view; a probe far below the hotel never reached the torch.
   - Unity takes a reflection probe's intensity, and an Unlit `_BaseColor`, as sRGB in a linear project: 0.25 came out 0.25^2.2 (the metal at a fifth of the browser's), and the studio's panels at 100 came out 100^2.2.
   - `SphericalHarmonicsL2` coefficients carry the basis constants (the shader adds c0 + c1 y + ...).
   - glTFast's glowing (`_EMISSIVE`) shader variant is in the build only if a material asset uses it (`held_lens.mat`).
   - three puts `scene.environmentIntensity` in place of a material's own `envMapIntensity` whenever the scene's environment lights it, so the browser's hand takes the whole studio, not the quarter heldFlashlight.ts asks for.
   - heldFlashlight.ts tints a skin material once for every mesh wearing it, and three's meshes share one material per glTF material: the nurse's hand and coat are tinted twice. Unity gives each piece its own copy, so it applies the tint as often as the browser does.
   - three draws a see-through two-sided material in two passes, back faces and then front faces; URP draws it once, so the detective (BLEND skin and hair) showed the inside of his head. `Characters.BackThenFront` draws each such part twice in that order (a mesh copy with the part listed twice).
6. **Result**, with `tools/playtest.ts d3` (four bots in front of you: standing, walking and running, crouching and creeping, knocked down then crawling) against the same night in the browser:
   - The held torch, on its own, in linear light before the bloom (head, body, grip, hand, sleeve): 0.097/0.052/0.017/0.018/0.046 against the browser's 0.097/0.053/0.017/0.016/0.042. In the finished picture, within 2 levels (head +3.7).
   - The bodies, within 1 to 6 levels, as the wall behind them (−3).
   - Poses and timing match, as does Low (with its Low copies) against High.
7. **Test aids kept:** `-heldTest <character>` (the hand alone, straight ahead, as the browser's held scene) and `-cast Rafi=detective,...` (draw players as these characters, to set beside a browser night that was dealt otherwise).

### Step D4: sound (2026-11-18)

1. **The recordings come across.** `npx tsx tools/engine-rooms.ts --sounds` (and every full run) copies the browser's room tone, rumble, wind and five creaks to `engine/Assets/Hotel/Resources/Sounds`. `HotelImport.HotelSounds` keeps them as plain PCM at their own rate, decoded on load, as the browser's decodeAudioData does. Unity's default (Vorbis) would change the quiet loops' level and put a seam in the loops.
2. **The house** (`HouseSounds.cs`, as audio.ts):
   - The three loops at the browser's gains (0.05, 0.05, 0.035), each from a random point, fading in over 4 s, and dropping out with everything else in the pre-hunt silence (gliding as the browser's master gain does).
   - A creak every 12 to 35 s, 3 to 9 m from your ears, gain 0.25 to 0.55, rate 0.85 to 1.12, never in the silence.
   - A few distant steps every 30 to 60 s, 10 to 16 m away, never in a hunt or the silence.
3. **Footsteps**, the game's real background, were missing from Unity until now.
   - Yours, in your ears, and others' from where they are drawn (`Footsteps.cs`, as footsteps.ts: one step per stride, walk, run, crouch or crawl from speed and state, none while hidden or dead).
   - The ghost's steps use the same tracker now.
   - The sounds are audio.ts's recipes (`TaskSounds.MakeStep`): a falling sine and a band-passed tap, each step a little different (nine clips per kind, the browser's 0.85 to 1.15 spread).
4. **3D steps through the browser's own HRTF** (`HrtfSteps.cs`). The browser places steps with Web Audio's HRTF panner; Unity has none, and its left-right panning made other people's and the ghost's steps 12 to 17 dB quieter than the browser's.
   - `tools/engine-hrtf.js`, run in the dev client's console, takes the panner's response from 1,368 directions at 48 kHz (every 5° round, every 7.5° from −45° to 90° up) into `Resources/Data/hrtf.bytes`.
   - Each step is convolved with the response for where it is (the four nearest, blended) and played at the panner's distance gain (inverse from 1.5 m, factor 1.3).
   - The browser's listener faces where you look round, never up or down, and so does this.
5. **Fixes found by measuring:**
   - **The master level.** Every game sound goes through audio.ts's master gain of 0.8 in the browser; Unity had none (all 25% loud). `TaskSounds.MasterLevel` now applies to everything but the voices, the music box included.
   - **Mono in both ears.** Unity plays a mono clip in 2D at −3 dB on each side; the browser plays it at full level in both. The sounds in your ears (ambience, your steps, task sounds, the heartbeat, the hunt pulse) are now given to Unity as two channels.
   - **The start of a sound.** Unity fades every voice in over its first ~64 samples, which ate a third of a tick (its loudness is in its first millisecond). Each made sound now starts with 5 ms of silence.
   - **The heartbeat** goes through a 110 Hz low-pass in the browser (Web Audio's default Q of 1 dB lifts 34 to 52 Hz a little); Unity's had none.
   - Unity's placed sounds used Web Audio's inverse distance model with factor 1 only; it takes the factor now (steps 1.3).
   - The ghost's subtitle range was 15 m in Unity; game.ts's is 12.
6. **Subtitles** (`Hud.SoundCues`, as game.ts updateWhereabouts and main.ts):
   - All of them at once now, in the browser's order: the music box, the bell (4 s), a slammed door (3 s), the ghost ("Heavy footsteps" while it hunts near you, "Your heart pounds" otherwise).
   - Each has its arrow (cues.ts directionTo; the music box's in eight steps and none up close) and "(above)" or "(below)" on another floor.
   - They sit where the browser puts them (a column 22% up from the bottom), and are hidden in meetings and at the end.
   - The ambience and creaks have none in the browser either.
7. **The test**, a fixed list played in both and recorded as it leaves each (`-soundTest DIR`, and the same list from the browser console).
   - The list: 12 s of ambience, then alone and 2 s apart, your walk, run and crouch steps; others' steps 3 m ahead, 3 m right and 8 m ahead; the ghost 5 m ahead; three creaks; the bell; a tick; a heartbeat.
   - Against the browser at 48 kHz, every sound is within 0.5 dB on each side, except steps at up to ±1.3 dB, from their random noise.
   - **This PC's sound runs at 192 kHz.** At that rate Chrome's HRTF is about 10 dB louder than at 48 kHz (a Chrome quirk; a 48 kHz offline render shows the panner's true levels), so the browser's steps are louder here than on most computers. Unity follows the 48 kHz levels.
8. **Heard in a night** (`-recordSound DIR`, the C4 bots: a Summon, a hunt, a slammed door, a bot bleeding out), 150 s:
   - The ambience held at about −44 dB, under everything else.
   - Four creaks and three sets of distant steps came at the browser's spacing.
   - The hunt's silence, sting and heavy steps played, with "Heavy footsteps" behind you and "A door slams" with its arrow (`step-d/d4-door-slam-cue.png`).
9. **Found, not from D4:** the Windows build crashes (segmentation fault) as it quits after a night with bots. The D3 build does the same. A plain quit from the lobby is clean.
10. **Test aids kept:** `-soundTest DIR` (the list above, written to `unity-sound.wav` and `.txt`, then quits), `-recordSound DIR` (the whole run, `night-sound.wav`).

### Step D5: every room against the browser (2026-11-18)

The done-when test for step D: every room matches or beats the browser's look, room by room, on Low and High.

1. **How it was checked.**
   - Both versions toured the same 27 places (rooms, halls, outside) from the same spots at four headings, and the task and relic close-ups. Each set ran with and without the torch, on High and on Low: 864 views in each version.
   - The browser's views come from game.ts's `roomTour`, driven from the console at 1280×720. The pane runs hidden here, so its size and animation frames are set from the console, and the tour turns the torch on and off itself.
   - Unity's come from `-roomShots DIR [-torch] [-closeUps] [-quality low] [-noAO]`.
   - Each pair is compared by mean difference per view and per pixel. A view fails if its mean is off by more than 2 levels or a large part of it differs by more than 6. The browser's own repeat shots differ by about 0.5 a pixel.
2. **Fixed by measuring:**
   - **three's fog is a curve** (URP patch 9). three's `Fog` keeps `1 - smoothstep(1, 18, depth)` of each colour; Unity's linear fog is a straight line, and counts from the camera's near plane. At 3 to 8 m Unity's rooms were too dark and the bulbs inside lanterns went dull. The patch uses three's curve per pixel, and `Game.SetUpLight` moves the fog's start and end back by the near plane (0.05 m, now `Game.CameraNearM` for both cameras). Storage's lantern: 2.587 against the browser's 2.589.
   - **Shine takes from the diffuse** (URP patch 10). three 0.186 multiplies the torch's diffuse light by `1 - F` (Schlick of 0.04 at the half-angle), so a surface lit edge-on is darker than plain Lambert. Unity added the shine on top of the full diffuse. Torch-lit walls were 2 to 4 levels too bright. Materials without shine (three's Lambert, the grey box, glow) keep the full diffuse, as in three. three's matching cut to the indirect light is left out: with the torch off every room already matches.
3. **Result** (mean difference from the browser, out of 255):

   | Set | Rooms | Rooms by torch | Close-ups | Close-ups by torch |
   |---|---|---|---|---|
   | High | 0.25 | 0.31 | 0.22 | 0.29 |
   | Low | 0.25 | 0.34 | 0.22 | 0.28 |

   Four of the 864 views fail: the Restaurant bar by torch on High and Low, and the mirror close-up by torch on High and Low. The sheets show every room, browser on the left and Unity on the right, brightened 2.5× to see into the dark (`step-d/d5-high-rooms-1.jpg` and `-2`, `d5-high-rooms-torch-1.jpg` and `-2`, `d5-low-rooms-1.jpg` and `-2`).
4. **Blackout** is black in both, except the torch and the ritual candles.
5. **Left, both small:**
   - **The Restaurant bar by torch** (+7.8 High, +9.4 Low). The light before bloom matches to within 2% on the lit surfaces. Above the glow threshold the total light matches within 3.5% (14,488 against 15,006). Unity's bottle glints are spread over about twice the pixels (459 against 239 over 8), so they glow wider. This is how the glass's highlights land on the curved bottles, not a level error.
   - **The mirror close-up by torch** (−4.6): the mirror's fogged-glass glow, left from D2.
6. **Test aid added:** `-hdrRange X` sets the range `-hdrOut` writes (4 by default), for measuring glints far over 4.

### Step D: the crash on quitting, looked into (2026-11-18; fixed below)

1. **What it is.** The Windows build crashes as it quits after a night with others in it: an access violation in `D3D12Core.dll` (Event Viewer, Application Error 1000), after the Input System has shut down. Windows writes a dump to `%LOCALAPPDATA%\CrashDumps` each time; Unity's own crash handler writes nothing. It does not happen every time: 11 of 19 nights with the hotel's art crashed (the C4 bots, quitting at 20 or 60 s).
2. **What it needs**, each tried in the same build:
   - **D3D12.** With `-force-d3d11` it quit cleanly; with `-force-gfx-direct` (no render thread) it still crashed.
   - **Others' character bodies.** A build without the hotel's art (in a fresh worktree, `engine/Assets/Hotel` is not in git) never crashed in five nights, with the hunt, the red eyes and the end screen all happening. Alone in a night it quit cleanly.
   - It is not the ending: quitting mid-night crashed too.
3. **What did not fix it:**
   - Freeing everyone's bodies, labels and torches in `OnApplicationQuit`.
   - Freeing them a few frames earlier (cancelling the first quit in `Application.wantsToQuit`), with the room's updates stopped so they stayed gone.
   - No particular character. Which pipeline cache file was there (`%TEMP%\Haunted Lobby\Haunted Lobby\dx12_pso_cache_lib.bin`) did not decide it either: the same file gave a crash and a clean quit. `-force-d3d12-single-pso-disk-cache` gave one clean quit, the same switch in `boot.config` a crash (it is not read from there).
4. **The way to judge a fix** (it does not crash every time): against a control from the same build and the same cache files that still crashes, with the art in the build. The stack, in the next section, showed the cause.
5. **Tidy-ups on the way** (neither is the fix):
   - `TextPainter` restored the wrong active texture (`Releasing render texture that is set to be RenderTexture.active!` in every log).
   - Quitting with `-quitAt` left the room twice.

### Step D: the crash on quitting, fixed (2026-11-18)

1. **The stack.** Read from Windows' dumps (`%LOCALAPPDATA%\CrashDumps`) with Windows' own `dbgeng.dll` driven from Python, with Unity's and Microsoft's symbols. All four dumps read stop at the same place, on the main thread:
   `D3D12Core!CLibrary::Serialize` (inside `memcpy` or `DXBCGetSizeAssumingValidPointer`), called from `UnityPlayer!GfxDeviceD3D12::~GfxDeviceD3D12`, called from `DestroyGfxDevice` and `Shutdown`.
   So it happens while Unity, tearing the D3D12 device down, saves its pipeline library (`%TEMP%\Haunted Lobby\Haunted Lobby\dx12_pso_cache_lib.bin`). It is not in the game's code.
2. **Why, unverified.** D3D12 reads memory that is no longer there. The likeliest explanation is that the library still points into the file Unity loaded at the start and has since freed. The library is saved when new pipelines were made in the run (others' bodies lit by torches), and a crash then depends on what has become of that memory. Nothing in the game decides this.
3. **The fix** (`Game.OnApplicationQuit`). On D3D12 the game ends its own process (exit code 0) once its own quit work is done: voice off, the room left, `-recordSound`'s file saved. Unity's device teardown never runs.
   - **Every quit leaves the room and waits for it** (`Application.wantsToQuit`, up to 2 s), so the server sees a player go, not lose their connection. That includes closing the window.
   - **The cost:** pipelines made in a run are no longer saved for the next launch, so they are built again each time (the driver's own shader cache may soften this; not measured). The alternative is a launcher that starts the game with `-force-d3d12-single-pso-disk-cache` (Unity's single-file cache, which does not crash); the owner's call.
   - **`-unityShutdown`** leaves the teardown to Unity, to show the crash.
   - **Unity's own switch** `-force-d3d12-single-pso-disk-cache` avoids the library too, but only on the command line. `boot.config` does not pass switches (`force-d3d11=1` there was ignored too).
4. **The test.** The cache folder as it was when the game crashed was put back before every run (the C4 bots, quit 20 s into the night).
   - With `-unityShutdown`: 3 of 3 crashed.
   - With the fix: 5 of 5 quit cleanly (exit code 0, no Application Error, no dump).
   - Also clean with the fix: a full 60 s night to the end screen, and the window closed during a night (the room left, code 4000).
5. **Found on the way:** a worktree has no `engine/Assets/Hotel` (not in git). A build there draws no rooms or people, and quits cleanly for that reason. Copy the folder in before testing.

### Step E: the plan (2026-11-18)

The menus of PRD Phase 7 (Start, Create, Join, Options, Mic check, Room, Room settings) in the Unity version, with the browser's wording, look and font pair, every option taking effect, and the speed test. Built with Unity's UI Toolkit, whose style sheets (USS) follow `client/src/style.css` nearly rule for rule; the menus keep a constant pixel size, as the browser's do. Every existing test flag (`-create`, `-join`, `-name`, `-startWith`, `-roomShots` ...) still skips the menus.

| Part | What | Done when |
|---|---|---|
| E1 | The font pair (Instrument Serif and Manrope, static weights 400/500/600/700, made from the browser's files with fontTools, with their licence); UI Toolkit set up; Start, Create and Join | Start, Create and Join match the browser at 1280×720 (wording exact; places, sizes and colours measured), and typing a name or code joins a room |
| E2 | Options: sound, jump-scare volume, screen shake, photosensitivity, mouse sensitivity (the browser's Counter-Strike scale), field of view, quality (replacing `-quality low`), FPS counter, key rebinding (keys.ts), kept between runs | Each option changes the night as it does in the browser; keys.ts's tests pass in C# |
| E3 | Room and Room settings: players, Ready and Start, the host's settings (Basic, Advanced, presets, the settings code, from `SETTING_OPTIONS` exported by `tools/engine-export.ts`), kick, photos, room log, Leave, walking round the hotel with the menu at the side, Esc | A host changes settings, bots and a browser player see them, the host kicks one |
| E4 | Mic check, as main.ts and voice.ts (tested only with the local voice server or `-voiceTone`; no cloud minutes) | Ready needs the mic check, as in the browser |
| E5 | The night's HUD, the end screen, the meeting and the name labels in the font pair and the browser's look (left plain since step C) | Each matches the browser's, screen by screen |
| E6 | The speed test (speedTest.ts) and Phase 7's done-when: 8 players start, finish, rematch and change settings without restarting anything | The speed test runs and gives its result; the 8-player story passes with a Unity host |

Things that are browser-only are decided as they come up and recorded in GDD 26.

### Step E1: fonts, Start, Create and Join (2026-11-18)

- **Fonts.** `tools/engine-fonts.py` (fontTools) cuts static Manrope 400/500/600/700 and Instrument Serif Regular and Italic from the browser's font files, Latin and Latin-Ext merged, into `engine/Assets/UI/Fonts/` with their OFL licences.
- **UI Toolkit.** `Menus.cs` builds the screens in code from `index.html`'s structure, styled by `Menus.uss`, which follows `client/src/style.css` rule for rule. What USS lacks is done in C#:
  - `gap`: Regap puts the gap between the shown parts only, as CSS does. It runs from the menus' Tick, because a panel's scheduler drops work queued before the elements join it. The first-launch warning showed this: its screen had no gaps.
  - `line-height`: a rich-text tag spaces the lines after the first. Half the leading goes above and below, as the browser centres a line in its box (since E2 by making the label as tall as its lines and centring the text; see Step E2).
  - `text-transform`: done in C#.
  - Letter spacing: Unity's unit is a hundredth of an em, so the USS value is the browser's px ÷ font px × 100.
- **Light text drawn as in Chrome.** Unity blends UI in linear light, which makes light text on the dark menus heavier and the film grain brighter than in the browser.
  - The menus draw into a texture in gamma space (`PanelSettings.forceGammaRendering`).
  - A URP feature, `HauntedUi`, lays that texture over the finished picture in sRGB, as a browser lays a page over its canvas.
  - The panel's screen-to-panel function is the identity: the texture is the window's size, and UI Toolkit hands it positions already measured from the top.
- **Against the browser at 1280×720** (headless Chrome over CDP; each element's box, font, size and colour dumped from both):
  - Start, Create and Join match within 1 px in place and size. Text widths match within 1 px, the Back button within 4 px (Chrome counts the trailing letter space).
  - Colours, the grain and the backdrop (#050507) match.
  - Placeholders are dim, as in the browser.
  - The first-launch warning overflows 720 lines in both. Unity shows its thin scrollbar, as Chrome does on Windows.
- **Wording** is the browser's except the start screen's foot line (GDD 26.16).
- **Input test** (`-menuInput`): the menus driven as a player drives them.
  - Mouse: queued Input System mouse events.
  - Typing: the window's own key and character messages, which is how keyboard text reaches UI Toolkit (queued Input System keyboard events never do).
  - It answers the warning (scrolled to, below the fold), opens Join and types a code (upper-cased), clicks into the name field and types a name, then presses Enter. It gets the browser's "No room has that code" error, goes Back, opens Create (the name kept) and creates a room on the local server. The menus hide in the room.
  - All 15 checks pass from a fresh start.
- **Test aids:**
  - `-menuShots DIR`: each screen as `unity-NAME.png` plus a JSON dump of every element's box.
  - `-menuInput`.
- Comparison sheet: `docs/plans/step-e/e1-menus.jpg` (browser, Unity, differences ×4; Start, Create, Join, the warning).

### Step E2: Options (2026-11-18)

- **Kept between runs** (`Game/Options.cs`): every choice is stored in PlayerPrefs under the name the browser uses in localStorage (`volume`, `scareVolume`, `screenShake`, `photosensitive`, `mouseSensitivityCs`, `fieldOfView`, `quality`, `autoQuality`, `showFps`, `keyBindings`, `photoWarningSeen`), as text, with the browser's defaults and limits.
- **Keys** (`Sim/Keys.cs`, keys.ts line for line): keys are named by the browser's `KeyboardEvent.code`, so a binding means the same key in both versions. `Game/KeyInput.cs` turns a code into the Input System's key (both sides of Shift, Ctrl, Alt and Win count) and a pressed key back into a code. keys.test.ts's 5 tests pass in C# (`engine/Tools/KeysCheck.cs`, run by `check-sim.ps1`). The night reads every action through the bindings (walking, run, crouch, use, drop, the map, torch, camera, salt, powers), and the hints name the player's keys. A Wisp's float keys (up, and the crouch key for down: `wispFloor`) were missing in Unity and are sent now.
- **Each option in the night**, as the browser does it:
  - Sound volume: every sound, voices too (`AudioListener.volume`, the browser's volume node).
  - Jump-scare volume: the hunt sting and slammed doors (audio.ts's scare bus).
  - Screen shake: 0.6 s at 0.012 rad when a hunt starts, 0.8 s at 0.03 rad when you are knocked down, scaled by the slider, on game.ts's three sine waves.
  - Photosensitivity mode: the torch near the ghost dims slowly toward 0.35 instead of flickering (flicker.ts); another player's camera flash is a 1.2 s glow at 0.3 of its brightness; your own photo whitens the screen to 0.25 over 0.5 s and fades over 1.4 s (style.css's transitions, their cubic-bezier curves solved in C#) instead of 0.9 fading over 0.6 s.
  - Mouse sensitivity (the Counter-Strike scale) and field of view: at once.
  - Quality: Auto, High or Low; `-quality` still overrides it for a test run. Unity changes texture detail at once, so the browser's "Texture detail changes the next time you open the game" is never shown (GDD 26.16). Auto lets the hotel settle 2 s, counts frames for 5 s and keeps High at 55 frames a second or more, then remembers its choice (on this PC: 94.6, High).
  - FPS counter: frames a second, draw calls and triangles every 0.5 s, top left, in the menus' font, over the night and the menus. Unity's draw calls count every pass (shadows, ambient occlusion), so they read higher than three's for the same view (4,639 in the first corridor on High). Test aid `-showFps`. Until step E5 redoes the night's HUD it overlaps the plain HUD's night bar.
- **The screen** (`Menus.cs`, `Menus.uss`) is built from index.html's `#screen-options`: Chrome's range input (8 px track, 16 px brass thumb, the 2 px margins), its checkbox (white with a grey line; ticked in brass, GDD 26.16), the select (a box with the chevron; its list opens below, or above where the window ends), the typed sensitivity box, the key table with "Press a key" and "Not that key", and Reset all keys. The speed test comes in E6, the microphone group in E4. The scrollbar is 10 px wide, as Chrome's thin one.
- **Line boxes:** Unity's first line of text is about 1.47 of the font size, taller than some of the browser's line heights. A label with a line height is now made as tall as its lines at the browser's line height, with the text centred in it, so the first line sits in the middle of its box as in CSS. Start, Create, Join and the warning still match within 1 px.
- **Against the browser at 1280×720:** every element's place and size within 0.5 px down the Controls group, the key rows within 1 px. One difference left: Chrome on Windows rounds each letter's advance to a whole pixel and Unity does not (both kern), so some lines measure up to 1% apart. "The same scale as Counter-Strike … by 3.18." fits Chrome's 290.8 px column (290 px) but not Unity's (292 px) and takes a third line; the Esc row's description breaks one word earlier.
- **Input test** (`-menuInput`) now opens Options first: presses the volume slider at 30 %, drags it to 50 % (the sound follows), ticks and unticks photosensitivity, types 3.18 into the sensitivity box, picks Low then High from the list (the picture's level follows), clicks the use key, presses L (refused: "Not that key"), presses F (bound; the hints say F), resets the keys and goes Back. It puts back what the player had. All 39 checks pass.
- Comparison sheet: `docs/plans/step-e/e2-options.jpg` (browser, Unity, differences ×4; the top of Options and the end of its scroll).
