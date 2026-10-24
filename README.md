# Haunted Lobby

A browser-based 3D co-op horror and social deduction game for 4 to 8 friends.

Friends are trapped in a haunted place for one night. They must finish tasks, find relics and perform a ritual before dawn, while a ghost hunts them and one of them is secretly possessed and helping it.

**What makes it different**

- **It hears you.** The ghost reacts to your real microphone volume. Whisper to survive.
- **Spirit Camera.** One photo. Catch the possessed right after a sabotage and their face is a demon.
- **Ouija board.** Dead players can't talk, but in each meeting they push the planchette at one person.
- **Darkness hides identity.** In the dark you see only a shadow. Your flashlight reveals who it is.

**Status:** design locked, build not started.

## Documents

- [Game Design Document](docs/GDD.md): how the game works
- [Product Requirements Document](docs/PRD.md): what to build and in what order

## Planned stack

TypeScript, Three.js + Vite (client), Colyseus (server), LiveKit (voice), Rapier (physics), recast-navigation-js (ghost pathfinding).
