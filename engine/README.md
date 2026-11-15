# Haunted Lobby: the downloadable version (Unity 6)

Plan: `docs/plans/engine-port.md`. The game server, rules and voice stay as they are; this folder is a new client for them.

- `Assets/Scripts/Sim/`: plain C# with no Unity parts, so it can be checked without Unity. `Movement.cs` is `shared/src/sim/movement.ts` line for line.
- `Tools/MovementCheck.cs`: checks the port against `engine-data/movement-cases.json` (780 steps from the TypeScript code). Run it with Windows' built-in compiler:

```
powershell -File engine/Tools/check-movement.ps1
```

- Data from the TypeScript side lives in `../engine-data/` (made by `tools/engine-export.ts` and Colyseus's `schema-codegen`).

Unity itself (Unity Hub, Unity 6 LTS, a free Unity account) has to be installed and signed in by the owner before the rest of step A.
