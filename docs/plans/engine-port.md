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
