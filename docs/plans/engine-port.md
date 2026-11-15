# Plan: the downloadable version (after Phase 9)

Written 2026-11-15 at the owner's request ("create a plan to download the engine after phase 9"). Status: **plan, not approved yet**. The open questions at the end need the owner's answers before work starts.

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
| D. The hotel (2 to 3 weeks) | Dressed rooms from the Blender scripts as glTF, lighting baked in Unity, characters and animations, the held torch, post-processing, sound | Every room matches or beats the browser version's look, checked room by room with screenshots |
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

## 7. Questions for the owner

1. Is Unity 6 the engine? (Recommended above.)
2. Windows only to start? (Mac and Linux builds later are possible.)
3. Build the tutorial and Training Room (Phase 9b) in the Unity version only, not in the browser version first?
4. Once the downloaded version is out, should the browser version stay playable, or be retired?
5. Free download on itch.io first? (Steam costs a $100 fee per game, and code signing costs money each year.)

Sources: Colyseus SDKs (docs.colyseus.io/sdk, docs.colyseus.io/getting-started/unity, docs.colyseus.io/getting-started/godot), LiveKit Unity SDK (docs.livekit.io/transport/sdk-platforms/unity, livekit.com/blog/unity-sdk-production-launch), community Unreal client (github.com/charisma-ai/colyseus-unreal).
