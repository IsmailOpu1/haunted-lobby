# Haunted Lobby

A browser-based 3D co-op horror and social deduction game for 4 to 8 friends. A ghost hunts the team, one player is secretly possessed, and the ghost hears players' real microphone volume.

## Documents

- `docs/GDD.md`: how the game works (rules and numbers). Locked at v2.0.
- `docs/PRD.md`: what to build, in what order, and how each part is accepted.

## How to work on this project

- Follow the build plan in PRD Section 11. The next task is the first unfinished item in the current phase. Don't start a new phase until the current phase's "Done when" test passes.
- Follow the working rules in PRD Section 16. The most important ones:
  - Every gameplay number lives in `shared/config.ts` (defaults in PRD Appendix A). No numbers in game code.
  - The server is authoritative. Roles, cooldowns, curse glow, fake tasks and undeveloped photos go only to their owner as private messages.
  - Maps are data in `/maps/<name>/`. No map-specific logic in rules code.
  - If the GDD doesn't cover something, ask the owner and record the answer in GDD Section 26.

## Stack

TypeScript monorepo (`client`, `server`, `shared`, `maps`, `tools`). Client: Three.js + Vite. Server: Colyseus. Voice: LiveKit. Physics: Rapier. Pathfinding: recast-navigation-js. Tests: Vitest.
