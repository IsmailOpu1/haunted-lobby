# Haunted Lobby: Product Requirements Document

**Version 2.0.** Companion to the Game Design Document (`docs/GDD.md`, called "the GDD" below).
The GDD says **how the game works**. This PRD says **what must be built for version 1, in what order, and how we know each part is done.** It is written so that Claude Code (or any developer) can build the game from it one phase at a time.

---

## 1. Summary

| Item | Value |
|---|---|
| Product | Haunted Lobby (working title) |
| One line | A 12-minute co-op horror and social deduction game in the browser. A ghost hunts a group of friends, one of them is secretly possessed, and the ghost hears their real voices |
| Platform | Desktop browsers (Chrome, Edge, Firefox), keyboard and mouse. Join by link |
| Players | 4 to 8 per room |
| Price and accounts | Free. No accounts |
| Owner | Opu (solo developer, part-time, building with Claude Code) |
| Status | Design locked (GDD v2.0). Build not started |

---

## 2. Problem and Opportunity

**Problem.** Friend groups want short, social games for a night in. Most horror and social deduction games need a download, a purchase, a strong PC and everyone owning a copy. That stops spontaneous sessions.

**Opportunity.** A browser game that starts from a link, runs on ordinary laptops, and builds its own stories from betrayal and voice chat. Familiar Among Us rules make it easy to learn. The real-mic ghost, the Spirit Camera and the Ouija board make it different.

**Hypotheses to test in the beta:**

1. Groups play more than one match per session if a match is about 12 minutes and roles rotate.
2. The real-mic ghost creates memorable moments (people whispering in real life, screams getting people caught).
3. The Spirit Camera and Ouija board make catching the possessed feel clever, not lucky.
4. A browser build can look close to a detailed PC horror game (*Invokyr*-inspired) on High quality while staying smooth on ordinary laptops on Low quality.

---

## 3. Target Users

| Persona | Description | What they need |
|---|---|---|
| **The Host** | Organizes the night in a Discord call | One link, fast lobby, presets that make sense, a Rematch button |
| **The Newcomer** | Joins a friend's room, never played | To understand the goal from the intro screen and a short tutorial |
| **The Deceiver** | Loves being the traitor | Powers that matter (Summon), a fair chance not to be caught |
| **The Detective** | Loves catching the traitor | Clear clues, a camera that rewards good timing, meetings that matter |

**Primary audience:** friend groups of 4 to 8 on desktop who already talk on voice chat.

---

## 4. Goals and Non-Goals

**Goals**

- **G1:** A new player reaches a playable match in under 60 seconds from clicking a link.
- **G2:** A match is tense and finishes in about 9 to 12 minutes.
- **G3:** Both sides win about half the time on the Standard preset.
- **G4:** Groups ask for a rematch.
- **G5:** The game looks detailed and atmospheric on High quality, and stays smooth on ordinary laptops on Low quality (Section 9).

**Non-goals for version 1**

- Accounts, progression, monetization, cosmetics shop
- Matchmaking with strangers, ranked play, leaderboards
- Mobile and controller support
- More than one map (the code must support more, but only the Marrow Hotel ships)
- Story campaign, cutscenes, voiced characters
- Solo play beyond the training room

---

## 5. Success Metrics

**Balance** (from GDD Section 24, Standard preset, 4 to 6 players)

| Metric | Target |
|---|---|
| Investigator win rate | 45 to 55% |
| Average match length | 9 to 12 min |
| Ritual started before dawn | At least 70% of matches |
| Votes that remove a possessed | 35 to 55% of removals |
| Matches where a photo caught a possessed | 20 to 40% |
| Deaths per match | 1 to 2.5 on average |

**Product** (measured in the private beta)

| Metric | Target | How measured |
|---|---|---|
| Link click to lobby | Under 30 s | Client timing event |
| Link click to first match start (new player) | Under 60 s | Client timing events |
| Finished matches followed by a rematch | Over 70% | Server log |
| Rooms that play 2 or more matches | At least 60% | Server log |
| Matches ending in a crash or forced disconnect | Under 5% | Server log |
| Players who finish the tutorial | At least 80% | Client event |
| Frame rate on an ordinary laptop (Low quality) | At least 45 FPS, target 60 | Playtest measurement |
| Frame rate on a gaming laptop or desktop (High quality) | 60 FPS | Playtest measurement |

---

## 6. Scope

**In scope for version 1**

- One map: the Marrow Hotel (3 levels, about 20 rooms), built so more maps can be added as data
- Ghost AI with the Bellboy trick
- Items: flashlight, Spirit Camera, salt
- 14 tasks with matching minigames, 3 to 5 relics, the relic door, the ritual
- The possessed: 4 powers, curse glow, fake tasks
- Meetings: bell, body report, evidence, discussion, vote, removal
- Wisps and the Ouija board
- Proximity voice with real-mic loudness and mic calibration (a working mic is required)
- Characters and darkness-hides-identity
- Lobby with all settings and 4 presets, rematch with fair rotation
- End screen with roles, timeline, photos, awards
- Tutorial (about 3 minutes) and a solo Training Room
- Accessibility options
- Server match log

**Out of scope (later)**

- Additional maps (Bengali Rajbari first) and their ghost tricks
- Cosmetics
- Public matchmaking

---

## 7. Core User Journey

1. A host opens the site and creates a room, getting a code and a link.
2. Friends click the link, type a name, and land in the lobby.
3. Everyone picks a character and does the mic check.
4. The host picks a preset or changes settings. Everyone sees the settings code.
5. Everyone presses Ready. The host presses Start. 5-second countdown.
6. A 10-second intro privately shows each player their role.
7. The team does tasks, finds relics and avoids the ghost. The possessed sabotage quietly.
8. Players report bodies or ring the bell to hold meetings and vote.
9. The basement opens, the task bar fills, and the team runs the ritual.
10. The match ends. The end screen reveals every role, the timeline, photos and awards.
11. The group presses Rematch. Roles rotate. Same settings.

---

## 8. Functional Requirements

Priority: **P0** = must ship in v1. **P1** = should ship in v1. **P2** = later.
The last column points to the GDD section with the detailed rules.

### 8.1 Lobby and Session

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-L1 | Create a room with a 5-letter code and a link | P0 | Room exists in under 2 s. Codes use A to Z without O and I | 5 |
| FR-L2 | Join by code or link with a display name, no account | P0 | A new player reaches the lobby in under 30 s | 5 |
| FR-L3 | Character select, one character per player | P0 | Two players cannot hold the same character. Choice persists through rematch | 22.1 |
| FR-L4 | Mic check that stores each player's normal level on the server | P0 | Calibration takes under 10 s. A player cannot press Ready until it passes. A player with no working mic sees a clear message explaining why they cannot play | 5, 13 |
| FR-L5 | Host edits all settings and presets, synced live | P0 | Changes appear for everyone within 1 s and lock at countdown | 20 |
| FR-L6 | Ready check and 5-second countdown | P0 | Start is blocked until every player is Ready and there are at least 4 players | 5 |
| FR-L7 | Settings code shown in the lobby | P1 | Code shows preset, minutes and possessed count | 5 |
| FR-L8 | Host transfer and kick | P0 | Host leaving passes rights to the longest-waiting player | 5 |
| FR-L9 | Player limits: minimum 4, maximum 8 | P0 | A ninth join attempt is refused with a clear message | 3 |
| FR-L10 | Rematch with fair role rotation | P0 | One click returns everyone to a ready lobby. Over 10 rounds with one possessed, nobody is possessed twice before everyone has been once | 19 |

### 8.2 Movement, Health and Items

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-M1 | First-person movement: walk, run with stamina, crouch | P0 | Speeds and stamina match GDD Section 6 | 6 |
| FR-M2 | Hiding spots and hold breath | P0 | Hidden players cannot be seen. Breath hold 6 s with 12 s cooldown | 6, 12.2 |
| FR-M3 | Downed, revive, death and body | P0 | Timers match GDD Section 7. Body stays until reported | 7 |
| FR-M4 | Flashlight with flicker and ghost-visibility effect | P0 | Flicker at 15 m, dark at 5 m. Ghost sight range changes with flashlight state | 8.1 |
| FR-M5 | Spirit Camera with shot limit, flash, curse-glow check, delayed photo | P0 | A photo of the possessed inside 10 s of a power, in frame, within 10 m, with line of sight shows the demon face. All other photos look normal. Photos appear only at the next meeting | 8.2, 15.2 |
| FR-M6 | Salt lines, ghost freeze, salt jars, carry limit | P0 | Freeze 3 s, line removed. Carry limit 4 | 8.3 |

### 8.3 Objectives

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-O1 | Task assignment in different areas, team task bar | P0 | Every investigator gets the configured number of tasks, no two in the same area. Bar counts only real completions | 9 |
| FR-O2 | 14 task minigames for the Marrow Hotel, each matching its task | P0 | Each takes 10 to 20 s for a normal player. Leaving cancels. Visible tasks leave a visible change. Noisy tasks make ghost-audible noise when done badly | 9 |
| FR-O3 | Fake tasks for the possessed | P0 | Possessed can play the animation at a task. The bar never moves. Visible results never appear | 9 |
| FR-O4 | Relic spawning, whisper, extraction minigame, carry rules | P0 | Spots are random each match, at least 20 m apart, never in Main Hall or basement. Carry slows by 15% and raises ghost hearing by 25% | 10 |
| FR-O5 | Relic status on Tab | P0 | Shows Hidden / Carried by / Dropped (last carried by) / Placed. Never shows positions | 10 |
| FR-O6 | Relic door with slots, basement unlock | P0 | Door opens only when every slot is filled | 10 |
| FR-O7 | Ritual: start conditions, circle, speed bonus, drain, overtime | P0 | Ritual cannot start before door open and bar full. Numbers match GDD Section 11. Overtime up to 30 s | 11, 4.2 |
| FR-O8 | Taint and cleansing | P0 | Needs possessed in circle and progress at least 20%. 5 s window. Cleanse = 2 s hold and 1 salt. Halves progress if not cleansed. Max 2 per match per team | 11 |

### 8.4 Ghost

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-G1 | Ghost states: Asleep, Wander, Investigate, Hunt, Retreat | P0 | Behavior matches GDD Section 12 in a test scene. No stuck ghost in 20 test matches | 12.1 |
| FR-G2 | Senses: hearing table, sight with flashlight rule, relic bonus | P0 | Each stimulus triggers Investigate at the listed distance in a test scene | 12.2 |
| FR-G3 | Night parts and aggression table, difficulty and player-count modifiers | P0 | Speeds and intervals match GDD Section 12.3 for each setting | 4.2, 12.3 |
| FR-G4 | Pre-hunt silence for natural hunts only | P0 | Natural hunts have 2 s silence. Summoned hunts never do | 12.1, 14.2 |
| FR-G5 | Special rules: ritual hunting, Furious when all possessed gone, post-meeting grace | P0 | Each rule triggers correctly in a test match | 12.4 |
| FR-G6 | Map ghost trick system, with the Bellboy for the hotel | P0 | Trick is defined in map data, not hard-coded in ghost AI | 12.5, 21 |

### 8.5 The Possessed

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-P1 | Secret role assignment with private delivery | P0 | Role data never appears in shared state or another client's network traffic | 14.1 |
| FR-P2 | Power wheel with 4 powers, cooldowns, unlock times | P0 | Costs nothing. Cooldowns and unlocks match GDD Section 14.2 and scale with the cooldown setting | 14.2 |
| FR-P3 | Summon, Slam Door, Blackout, Taint with their clues | P0 | Each power produces its listed clue every time | 14.2, 15.1 |
| FR-P4 | Curse glow 10 s after any power | P0 | Server tracks glow per possessed player and uses it for camera checks | 15.2 |
| FR-P5 | Power rules: blocked times, victim protection, no extra knowledge | P0 | Each rule in GDD 14.3 has a passing test | 14.3 |
| FR-P6 | Possessed know each other setting | P1 | On: names shown at intro. Off: nothing shown | 14.1 |

### 8.6 Meetings, Wisps and End

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-E1 | Bell in Main Hall and body reports | P0 | Blocked in the first 60 s, during any hunt, during overtime, within 30 s of last meeting. Bell uses per player follow settings | 16.1 |
| FR-E2 | Meeting steps: evidence, discussion, vote, with configurable times | P0 | Clock, ghost and cooldowns freeze. Times follow settings | 16.2 |
| FR-E3 | Vote resolution, removal, reveal-role setting, anonymous-voting setting | P0 | Removal only with most votes and more than Skip. Ties remove nobody | 16.3 |
| FR-E4 | Wisps: flying, invisible, tasks, Wisp-only voice | P0 | Living players never see or hear Wisps. Wisp tasks count when the setting is on | 17 |
| FR-E5 | Ouija board during evidence | P0 | Each Wisp can point at one living character or "I don't know". All players see it | 17 |
| FR-E6 | Win and lose evaluation, all special cases | P0 | Each row in GDD Section 18 passes a test | 18 |
| FR-E7 | Disconnect hold and reconnect for 60 s | P0 | A reconnecting player resumes in place with the same role | 18 |
| FR-E8 | End screen: roles, timeline, photos, awards | P0 (roles), P1 (timeline, photos, awards) | All roles visible to everyone at match end | 19 |

### 8.7 Voice

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-V1 | Proximity voice with distance fade and wall muffling | P0 | Volume fades with distance. A wall halves volume | 13 |
| FR-V2 | Loudness levels (whisper, normal, shout) relative to each player's calibration | P0 | Hearing range for players and ghost matches GDD Section 13 for each level | 13 |
| FR-V3 | Ghost hearing driven by server-side audio levels | P0 | Clients cannot hide or lower their own measured loudness | 13 |
| FR-V4 | Meetings: everyone hears everyone at full volume | P0 | No distance fade in meetings | 13, 16 |
| FR-V5 | Mic-lost rule: if a player's mic sends no audio for more than 10 s, show a warning and treat them as talking at normal volume for the ghost until it returns | P0 | Muting or unplugging the mic never reduces what the ghost hears | 13 |
| FR-V6 | Local mute of other players. Open mic only during matches (no push-to-talk, no self-mute) | P0 | Muting another player lasts for the whole session and only affects your own speakers | 13 |
| FR-V7 | Wisp voice channel | P1 | Wisps hear only Wisps | 17 |

### 8.8 Identity, Onboarding and Data

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-I1 | 8 characters with distinct silhouettes | P0 | Each recognizable from shape alone in a playtest | 22.1 |
| FR-I2 | Names shown only when lit within 10 m, or within 2 m, or in meetings | P0 | Unlit players beyond 2 m show no name | 22.2 |
| FR-D1 | Server match log, one record per match | P0 | Every field in Section 10.6 is written | 24 |
| FR-T1 | Tutorial (about 3 min) and solo Training Room | P0 | A stranger finishes a real match without outside help | — |

### 8.9 Accessibility

| ID | Requirement | Pri | Acceptance criteria | GDD |
|---|---|---|---|---|
| FR-A1 | Remappable keys, sensitivity and FOV sliders | P0 | Every control rebindable | 6, 23 |
| FR-A2 | Photosensitivity mode and first-launch warning | P0 | Flicker becomes slow dimming. Camera flash becomes a soft fade. No screen flashes | 23 |
| FR-A3 | Subtitles and direction arrows for key sounds | P1 | Door slams, nearby ghost, relic whisper and bell are shown | 23 |
| FR-A4 | Colorblind-safe UI and minigames | P1 | No information by color alone | 23 |
| FR-A5 | Horror intensity sliders | P1 | Jump-scare volume and screen shake adjustable | 23 |

---

## 9. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance, Low quality | At least 45 FPS (target 60) on an ordinary integrated-graphics laptop at 720p internal resolution. Under 300,000 visible triangles, under 250 draw calls, 1K textures, no real-time shadows except your own flashlight |
| Performance, High quality | 60 FPS on a gaming laptop or desktop with a dedicated graphics card at 1080p. Under 1,500,000 visible triangles, under 600 draw calls, 2K textures, bloom, ambient occlusion and flashlight shadows |
| Load time | Under 30 s on a normal connection the first time (assets compressed: KTX2 textures, Draco or Meshopt meshes); under 10 s afterwards from the browser cache. The menu and lobby appear within 5 s while the map keeps loading |
| Latency | Playable up to 200 ms round trip. Server runs at 20 ticks per second |
| Capacity | One 2 vCPU server holds at least 5 rooms of 8 players |
| Bandwidth | Under 25 KB/s per client at 8 players (game data, not voice) |
| Security and fairness | Server-authoritative. Roles, cooldowns, curse glow and fake tasks never reach other clients. Server validates movement, range and every action |
| Privacy | No accounts, no personal data, **no voice recording**. Only loudness levels are used. Match logs are anonymous |
| Compatibility | Latest two versions of Chrome, Edge and Firefox on desktop. Safari is not a v1 target |
| Reliability | If the server restarts, matches are lost and players see a clear message. Under 5% of matches affected |
| Content | Horror themes, no gore. Content and flicker warning on first launch |

---

## 10. Technical Design

### 10.1 Stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for client, server and shared rules |
| Client | Three.js, built with Vite | Runs in any desktop browser, joins by link |
| Game server | Colyseus (Node.js) | Rooms, state sync and reconnection built in |
| Voice | LiveKit (cloud free tier for beta, self-host later) | WebRTC voice with server control over who hears whom, and server-side audio levels |
| Physics and collision | Rapier (WASM) | Character controller and static colliders, same on client and server |
| Ghost pathfinding | recast-navigation-js | Navmesh baked from the level, works in browser and Node |
| Level art | Blender, exported as glTF with KTX2 textures | Detailed PBR models with baked lightmaps; free licensed sources first (for example Poly Haven CC0 textures and models, Mixamo characters and animations), every license logged |
| Audio | Web Audio API with positional audio | Spatial sound is most of the fear |
| Hosting | One small VPS in Singapore or Mumbai | Closest to Bangladesh. One room uses little CPU |
| Tests | Vitest | Fast unit tests for shared rules and server systems |

Check each library's current version and API when its phase starts, and pin versions in `package.json`.
**Engine plan:** the browser version is finished first. A downloadable version (Unity or Unreal) may follow after release for an even closer match to the *Invokyr*-style look; the server protocol and the GDD rules stay the same, only the client is rebuilt. If the Low quality setting cannot stay smooth on an ordinary laptop, cut effects and detail on Low before considering an earlier port.

### 10.2 Repository layout

```
/client      Three.js game (rendering, input, UI, minigames, audio, voice client)
/server      Colyseus rooms and all game systems (authoritative)
/shared      config.ts (every number), types, message definitions, pure rule functions
/maps        One folder per map: level glTF, navmesh, map data (rooms, spots, tasks, relics, ghost trick)
/docs        GDD.md, PRD.md
/tools       Scripts (navmesh baking, match log analysis)
```

### 10.3 Server authority and private data

- The server owns all game state. Clients send **inputs and action requests** only. The server decides what happens and sends state back.
- **Shared state** (everyone receives): player positions and animations, doors, lights, salt lines, task bar, relic status, ritual progress, ghost position (only when visible or audible to that client, see below), meeting state.
- **Private messages** (only the owner receives): your role, your tasks, your cooldowns, your curse glow, your photos until they develop, the names of other possessed (if the setting is on).
- **Interest management:** a client receives the ghost's position only when it is within that client's possible sight or hearing range. This prevents wall-hack cheats.
- Every action (interact, power, photo, vote) is validated on the server for range, line of sight, timing and cooldowns.

### 10.4 Networking

- Server simulation at **20 ticks per second**. Slow state (task bar, relic status, settings) updates **5 times per second**.
- Clients predict their own movement and correct from the server. Remote players are interpolated with a **100 ms** delay.
- The ghost runs only on the server.
- Target: playable up to 200 ms round trip.

### 10.5 Voice pipeline

1. Each client joins the LiveKit room for its game room.
2. **Mic calibration:** during the lobby mic check, the server records the player's average speaking level from LiveKit's server-side audio level data and stores it as their "normal".
3. **Every 250 ms** during a match, the server:
   - reads each speaking player's current audio level from LiveKit,
   - classifies it as whisper (normal − 10 dB or lower), normal, or shout (normal + 8 dB or higher),
   - sets each listener's subscriptions and volumes based on distance, walls and the speaker's level (GDD Section 13),
   - sends a noise event to the ghost if the level and distance are inside the ghost's hearing range.
4. Clients never decide who hears whom and never report their own loudness.
5. Meetings switch everyone to full-volume all-hear. Wisps are in a separate channel.
6. **No audio is recorded or stored.** Only levels are read.

### 10.6 Match log

The server writes one JSON record per match. No personal data (no names, no IPs).

Fields: settings code and full settings, map, player count, possessed count, winner, win reason, duration, time each relic was placed, time the basement opened, time the task bar filled, ritual start time, ritual progress at the end, every power used (type, time, whether a living investigator was within 15 m), every photo (time, whether it caught a possessed), every meeting (caller type, time, votes, outcome), every death (cause, time), and whether the room pressed Rematch.

### 10.7 Single source of truth for numbers

`shared/config.ts` holds **every** gameplay number. No gameplay number appears anywhere else. Lobby settings override config values at match start. See Appendix A for the full default list.

### 10.8 Maps as data

Everything map-specific lives in `/maps/<map-name>/` and is loaded by the same code: level model, navmesh, room list, hiding spots, relic spots, task list (with which minigame each uses), bell position, fuse box, salt jar spots, relic door, ritual circle, spawn points, and the ghost trick name and parameters. Adding a new map must not require changes to game rules code.

---

## 11. Build Plan

Work one phase at a time. **A phase is finished only when its "Done when" test passes.** Estimates assume 10 to 15 hours per week.

**Phase 0: Foundations (about 1 week)**
- Monorepo with `client`, `server`, `shared`, `maps`, all TypeScript
- `shared/config.ts` with every default from Appendix A
- Three.js scene with a first-person camera and a grey floor
- Colyseus room that two browser tabs can join by room code
- ~~Deploy the server to a VPS~~ Moved to the end of Phase 1 (decided 2026-10-24: an online test is only useful once players can see each other move)
- **Done when:** two players join the same room by code and see each other's join message. (Done 2026-10-24, tested in separate browser tabs.)

**Phase 1: Grey-box movement (2 to 3 weeks)**
- First-person controller: walk, run with stamina, crouch (GDD 6)
- Rapier collision with walls and doors
- Grey-box Main Hall, Restaurant, Kitchen and one corridor
- Flashlight, near-zero ambient light, fog
- Server-authoritative movement with prediction and 100 ms interpolation
- Put the game online: the client as a website (for example Vercel) and the game server on a host that supports long-lived WebSocket connections with `wss://` (for example Railway, Render, or the VPS from Section 10.1). See `docs/DEPLOY.md`
- **Done when:** two friends on different networks join by link, walk around, and see each other's flashlights move smoothly.

**Phase 2: The ghost (about 3 weeks)**
- Bake a navmesh from the grey-box level
- Ghost states, senses and the aggression table (GDD 12)
- Downed, revive, death and bodies (GDD 7)
- Hiding spots and hold breath
- Night parts driven by match length (GDD 4.2)
- **Done when:** the ghost hunts, loses players who hide, and never gets stuck in 20 test runs.

**Phase 3: Voice and the real-mic ghost (about 2 weeks). GO / NO-GO.**
- LiveKit rooms from the client, proximity voice with distance and wall falloff
- Mic calibration and whisper / normal / shout levels on the server (PRD 10.5)
- Ghost hearing from voice
- Local mute of other players, the mic-lost rule, mic check required before Ready
- **Done when:** three or four friends play in grey boxes, whisper to stay safe, and feel real tension. The client holds 60 FPS. **If this is not fun, fix it before adding anything else.**
- **Passed 2026-10-26** (M1 go): owner's friend test online. Whispers sound low and distant talk fades, as designed; voice clear. Voice quality can be tuned later from `shared/config.ts` (git tag `phase-3-voice` marks this state).

**Phase 4: Items, tasks and relics (about 3 weeks)**
- Spirit Camera (shots, flash, photo capture; curse-glow check can be stubbed until Phase 6), salt and salt jars
- Task system, team task bar, the first 4 minigames, then the rest
- Relics: spawning, whisper, extraction minigame, carry, drop, Tab status
- **Done when:** every item and task matches the GDD numbers in a test scene.

**Phase 5: Objective and the full map in grey boxes (about 3 weeks)**
- Full Marrow Hotel layout in grey boxes (3 levels, about 20 rooms, GDD 21.2)
- Relic door, basement, ritual, overtime, win and lose (GDD 10, 11, 18)
- Map data format (PRD 10.8) and the Bellboy trick
- **Done when:** a full match with no possessed can be won and lost on the full grey-box map.

**Phase 6: The possessed, meetings and Wisps (about 4 weeks)**
- Role assignment, private role messages, 10 s intro, fair rotation
- Power wheel, 4 powers, cooldowns, clues, curse glow, power rules (GDD 14)
- Camera curse-glow check and delayed photos (GDD 15.2)
- Fake tasks, Taint and cleansing
- Bell, body reports, meeting steps, voting, removal (GDD 16)
- Wisps, Wisp voice, Ouija board (GDD 17)
- **Done when:** a possessed player can sabotage, a careful team can catch them with clues or a photo, and a vote removes them.

**Phase 7: Lobby, settings and stability (about 3 weeks)**
- Lobby: code, link, characters, mic check, ready, host controls (GDD 5)
- All settings and 4 presets (GDD 20), settings code
- Reconnect and disconnect rules (GDD 18)
- End screen: roles, timeline, photos, awards, rematch (GDD 19)
- Match log (PRD 10.6), kick tool
- **Done when:** 8 players can start, finish, rematch and change settings without restarting anything.

**Phase 8: Content and polish (about 6 weeks)**
- Detailed hotel art in the *Invokyr*-inspired style (GDD 23): PBR materials, furnished rooms, baked lightmaps, warm practical lights and coloured accent glows
- First-person hand holding the flashlight, with walk sway
- 8 detailed, rigged and animated character models (walk, run, crouch, crawl, downed)
- Post-processing: bloom, ambient occlusion, fog, film grain, vignette
- Low and High quality settings meeting the targets in Section 9
- Asset compression (KTX2 textures, compressed meshes) and a loading screen
- Start with one fully dressed room as a look test before dressing the whole map
- Audio pass: ambience, footsteps, heartbeat, pre-hunt silence, relic whispers, the Bellboy's bell
- Names shown only when lit (GDD 22.2)
- Accessibility options (GDD 23)
- Tutorial and solo Training Room
- **Done when:** a stranger can join, learn from the tutorial, and finish a match without asking anything.

**Phase 9: Playtest and balance (about 4 weeks)**
- Play 20 Standard matches with 4 to 6 players and review the match log
- Compare against GDD 24 and apply the tuning order
- Repeat in batches of 10 until the investigator win rate is 45 to 55%
- Test 8 players on the server, a low-end laptop, and 200 ms artificial latency
- Fix the top 10 bugs from playtests
- **Done when:** every balance target is inside its range.

**Phase 10: Release (1 to 2 weeks)**
- Production server and a domain
- Share the link with 10 friends, collect feedback with a simple form
- Plan the second map
- **Done when:** the public link is shared.

**Milestones**

| Milestone | After phase | Proof |
|---|---|---|
| M0 Foundation | 0 | Two players join one room by code |
| M1 Playable fear | 3 | Friends whisper and feel tension in grey boxes at 60 FPS. Go / no-go for the project. **Passed 2026-10-26: go** |
| M2 Core loop | 5 | A full match without possessed can be won and lost |
| M3 Social layer | 6 | The possessed can sabotage and be caught. Private alpha |
| M4 Beta ready | 7 | Lobby, settings and rematch work for 8 players. Private beta |
| M5 Release candidate | 9 | Release criteria met |
| M6 Release | 10 | Public link shared |

---

## 12. Testing Strategy

- **Unit tests (Vitest)** for every pure rule in `shared`: night part timing, ghost hearing distances, voice level classification, vote resolution, win/lose evaluation, role rotation, relic spot selection, ritual progress math.
- **Server system tests:** simulate a room with fake clients and check each GDD edge case (Section 18 table, meeting blocks, power rules).
- **Privacy test:** a test client records all messages it receives during a match and fails if it ever sees another player's role, cooldown, curse glow or undeveloped photo.
- **Ghost soak test:** run 20 headless matches with bot players and fail if the ghost is stuck for more than 10 seconds.
- **Manual playtests** at the end of Phases 3, 5, 6, 7 and 9.

---

## 13. Release Criteria for Version 1.0

Version 1.0 ships only when all of these are true:

- Every P0 requirement in Section 8 passes its acceptance criteria
- 20 consecutive Standard matches with no crash and no stuck ghost
- All balance targets in Section 5 are inside their ranges
- A first-time player finishes the tutorial and a match without asking for help
- Section 9 frame-rate targets confirmed for Low (ordinary laptop) and High (gaming PC), playable at 200 ms latency
- Mute and kick work
- Photosensitivity mode and warning are in
- Every third-party asset has a recorded license

---

## 14. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope: solo 3D multiplayer is large | High | High | Hard go/no-go at M1. Cut P1 items before slipping P0 |
| Real-mic hearing feels unfair (different mics, rooms) | Medium | High | Per-player calibration, relative levels, a setting to turn it off, tested early in Phase 3 |
| Detailed art is too slow on ordinary laptops | Medium | High | Separate Low and High budgets (Section 9); test Low on a low-end laptop after every art step |
| Detailed art takes too long for one person | High | High | Free licensed asset packs first, one look-test room before the full map, reuse props across rooms |
| Voice cost or complexity | Medium | High | Build voice in Phase 3. Check LiveKit free-tier limits before beta |
| Required mic keeps some players out | Medium | Medium | Clear "a mic is required" message on the home page and in the lobby. The target audience already uses voice chat |
| Camera or Summon makes one side too strong | Medium | Medium | All numbers in config, match log, tuning order in GDD 24 |
| Bigger map is too much art for one person | High | Medium | Full map in grey boxes first (Phase 5). Modular wall, floor and furniture pieces reused across rooms |
| Cheating through the client | Medium | Medium | Server authority, private messages, interest management, server-side voice levels |
| The core is not fun | Medium | High | M1 test with real friends before adding content |
| Asset licensing problems | Low | Medium | Make or use clearly licensed assets. Log every license |
| Burnout | Medium | High | Part-time plan with buffer. Ship the smallest version first |

---

## 15. Decisions Still Needed

| Item | Needed by | Default if undecided |
|---|---|---|
| Hosting provider and region | Phase 0 | One VPS in Singapore or Mumbai |
| LiveKit plan and limits | Phase 3 | LiveKit Cloud free tier for the beta |
| Asset plan | Phase 8 | Free licensed detailed assets (Poly Haven, Mixamo and similar) adjusted in Blender to the GDD 23 look, free licensed audio; buy asset packs only if needed |
| Final game name and domain | Phase 10 | Keep "Haunted Lobby" |

---

## 16. Working Rules for Claude Code

These rules apply to every coding session on this project.

1. **Read before building.** Before starting a phase, read that phase in Section 11 and every GDD section it references.
2. **The next task is the first unfinished item** in the current phase. Do not start the next phase until the current phase's "Done when" test passes.
3. **No gameplay number in code.** Every number comes from `shared/config.ts`. If a needed number is missing, add it to the config with the GDD value.
4. **The server decides.** Clients send inputs. All game rules run on the server. Shared pure rule functions live in `/shared`.
5. **Never leak secrets.** Roles, cooldowns, curse glow, fake tasks and undeveloped photos are sent only as private messages to their owner.
6. **Maps are data.** Nothing map-specific goes into rules code.
7. **Write tests** for every rule function and edge case as it is built.
8. **When the GDD does not cover something,** stop and ask the owner. Record the answer in GDD Section 26.
9. **Keep to the performance budget** (Section 9). Check FPS after any rendering change.
10. **Pin library versions** and check current APIs when a phase begins.

---

## Appendix A: Config Defaults (`shared/config.ts`)

All times in seconds, distances in meters, speeds in meters per second unless noted. Lobby settings override these at match start.

```ts
export const config = {
  players: { min: 4, max: 8 },
  possessed: {
    autoByPlayers: { 4: 1, 5: 1, 6: 1, 7: 2, 8: 2 },
    maxByPlayers:  { 4: 1, 5: 1, 6: 2, 7: 2, 8: 2 },
    knowEachOther: true,
  },
  match: {
    lengthMin: 12, lengthOptionsMin: [10, 12, 15, 20],
    introSec: 10, countdownSec: 5,
    quietSec: 60,                 // ghost asleep, no powers, no meetings
    partSplitsPct: [33.3, 66.7],  // Calm | Restless | Furious after Quiet
    overtimeSec: 30,
  },
  movement: {
    walk: 2.1, run: 3.3, crouch: 1.1, crawl: 0.6,
    staminaSec: 5, staminaRegenDelaySec: 3, staminaRefillSec: 15,
    relicSlowPct: 15,
    hideEnterExitSec: 1, breathHoldSec: 6, breathCooldownSec: 12,
  },
  health: { reviveSec: 5, bleedOutSec: 30, postReviveImmunitySec: 3 },
  flashlight: { coneM: 12, darkVisionM: 2, flickerGhostM: 15, deadGhostM: 5, deadSec: 2 },
  camera: {
    shotsPerPlayer: 1, shotOptions: [0, 1, 2, 3],
    curseGlowSec: 10, captureRangeM: 10,
    flashVisibleM: 15, flashGhostHearM: 10,
  },
  salt: { perPlayer: 2, options: [1, 2, 3, 4], carryMax: 4, placeSec: 1, lineWidthM: 2, ghostFreezeSec: 3, jarsPerPlayerSlot: 1 },
  tasks: { perPlayer: 3, options: [2, 3, 4, 5], minSec: 10, maxSec: 20, noisyFailGhostHearM: 10 },
  relics: {
    count: 3, options: [2, 3, 4, 5], minSpacingM: 20,
    whisperM: 8, extractMinSec: 10, extractMaxSec: 15,
    placeSec: 3, carryHearingBonusPct: 25, dropGhostHearM: 8,
  },
  ritual: {
    baseSec: 45, options: [30, 45, 60], circleRadiusM: 4,
    circleMinByPlayers: { 4: 2, 5: 2, 6: 2, 7: 3, 8: 3 },
    extraPlayerSpeedPct: 25, maxSpeedBonusPct: 50,
    drainPctPerSec: 1,
  },
  taint: { minProgressPct: 20, windowSec: 5, cleanseSec: 2, cleanseSaltCost: 1, progressMultiplier: 0.5, maxPerMatch: 2, cooldownSec: 45 },
  ghost: {
    hearingM: { run: 16, walk: 8, crouch: 3, door: 12, hiddenBreath: 2 },
    sightM: { flashlightOn: 20, flashlightOff: 8 },
    preHuntSilenceSec: 2,
    hidingChecks: 2, hidingCheckSec: 3,
    parts: {
      calm:     { wander: 1.1, hunt: 1.9, betweenHuntsSec: 75, huntSec: 20 },
      restless: { wander: 1.4, hunt: 2.2, betweenHuntsSec: 50, huntSec: 25 },
      furious:  { wander: 1.8, hunt: 2.5, betweenHuntsSec: 30, huntSec: 30 },
    },
    difficulty: {
      easy:   { intervalMult: 1.25, speedMult: 0.9 },
      normal: { intervalMult: 1.0,  speedMult: 1.0 },
      hard:   { intervalMult: 0.8,  speedMult: 1.05 },
    },
    playerCountIntervalMult: { 4: 1.1, 5: 1.0, 6: 1.0, 7: 0.9, 8: 0.9 },
    ritualBetweenHuntsSec: 15,
    postMeetingGraceSec: 15,
    blackoutSpeedMult: 1.1,
  },
  voice: {
    whisperBelowNormalDb: 10, shoutAboveNormalDb: 8,
    playerHearM: { whisper: 3, normal: 15, shout: 25 },
    ghostHearM: { whisper: 0, normal: 6, shout: 20 },
    fullVolumeWithinM: 3, wallVolumeMult: 0.5,
    subscriptionRefreshMs: 250,
    micRequired: true, openMicOnly: true,
    micLostAfterSec: 10, micLostCountsAs: "normal",
  },
  powers: {
    slamDoor: { unlockSec: 60,  cooldownSec: 30, rangeM: 6, lockSec: 15, breakPushers: 2, breakSec: 2, ghostHearM: 12, sameVictimSec: 60 },
    summon:   { unlockSec: 120, cooldownSec: 60, targetRangeM: 15, spawnMinM: 6, spawnMaxM: 10, whisperM: 5, eyeGlowSec: 1, protectAfterHitSec: 30 },
    blackout: { unlockAtPart: "restless", usesPerMatch: 1, fuseFixSec: 5, autoRestoreSec: 60 },
    cooldownSpeed: { slow: 1.25, normal: 1.0, fast: 0.75 },
  },
  meetings: {
    bellUsesPerPlayer: 1, bellOptions: [0, 1, 2, 3], bellHoldSec: 2,
    reportRangeM: 3, minGapSec: 30,
    evidenceSec: 30, evidenceOptions: [15, 30, 45, 60],
    discussionSec: 60, discussionOptions: [30, 60, 90, 120],
    voteSec: 20, voteOptions: [15, 20, 30],
    revealRole: true, anonymousVoting: false,
  },
  wisps: { speed: 3, canDoTasks: true, ouija: true },
  identity: { nameLitRangeM: 10, nameAlwaysWithinM: 2 },
  disconnect: { holdSec: 60 },
  rotation: { weight: "1 / (1 + timesPossessed)" },
  net: { tickRate: 20, slowStateRate: 5, interpolationMs: 100 },
  room: { codeLength: 5, codeAlphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ" },
} as const;
```
