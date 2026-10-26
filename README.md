# Haunted Lobby

A browser-based 3D co-op horror and social deduction game for 4 to 8 friends.

Friends are trapped in a haunted place for one night. They must finish tasks, find relics and perform a ritual before dawn, while a ghost hunts them and one of them is secretly possessed and helping it.

**What makes it different**

- **It hears you.** The ghost reacts to your real microphone volume. Whisper to survive.
- **Spirit Camera.** One photo. Catch the possessed right after a sabotage and their face is a demon.
- **Ouija board.** Dead players can't talk, but in each meeting they push the planchette at one person.
- **Darkness hides identity.** In the dark you see only a shadow. Your flashlight reveals who it is.

**Status:** Phase 3 (proximity voice) done and friend-tested; Phase 4 (items, tasks, relics) next. Voice: the ghost hears your real microphone; whisper to stay hidden. Phase 2 (the ghost) built. Join by code or link and survive a 12-minute night in the grey-box Marrow Hotel: the ghost sleeps for the first minute, then wanders, hears your footsteps and sees your flashlight, and hunts more often as the night goes on. Hide in wardrobes and curtains and hold your breath, get downed, crawl, and revive friends. Movement is server-authoritative with client-side prediction.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. See [docs/DEPLOY.md](docs/DEPLOY.md) for testing with a second computer and putting the game online.

**Controls:** mouse to look, WASD to move, Shift to run, C to crouch, E to open doors, hold E to revive a friend or hide (and to step out), Shift while hidden to hold your breath, click or 1 for the flashlight, L for test lights, Esc for the room panel.

## Documents

- [Game Design Document](docs/GDD.md): how the game works
- [Product Requirements Document](docs/PRD.md): what to build and in what order
- [Running and deploying](docs/DEPLOY.md)

## Planned stack

TypeScript, Three.js + Vite (client), Colyseus (server), LiveKit (voice), Rapier (physics), recast-navigation-js (ghost pathfinding).
