# Phase 7 plan: lobby, settings and stability

Status: **built 2026-11-09; every step's checks pass (266 tests), waiting for the owner's playtest.** Branch `phase-7-lobby`.

Sources: PRD Section 11 (Phase 7), FR-L1 to FR-L10, FR-E7, FR-E8, FR-D1, PRD 10.4, 10.6 and 10.7; GDD Sections 3, 5, 13, 18, 19, 20 and 22.1.

**Done when (PRD 11):** 8 players can start, finish, rematch and change settings without restarting anything.

---

## 1. What already exists (checked in the code, 2026-11-09)

| Requirement | Today | Gap |
|---|---|---|
| FR-L1 code and link | 5-letter code without O and I (`uniqueRoomCode`), "Copy code" and "Copy invite link" | None. Re-check the 2 s target |
| FR-L2 join with a name | Name 1 to 16 characters, join by code or link | None |
| FR-L3 characters | Nothing | All of it |
| FR-L4 mic check | Mic check exists and stores your normal level on the server. Without it you can't play. Debug servers let you skip it | No Ready button for it to block yet |
| FR-L5 settings | Every number is in `shared/config.ts`, but the server reads the defaults straight from it. No settings screen | All of it. About 20 places in the server read a default that must become the room's setting. Ghost difficulty exists in the ghost but is always Normal |
| FR-L6 ready and countdown | The host's Start button and the 5 s countdown | No Ready check. Start only checks for 4 players |
| FR-L7 settings code | Nothing | All of it |
| FR-L8 host transfer and kick | Host passes to the longest-waiting player | No kick |
| FR-L9 4 to 8 players | `maxClients = 8`; Colyseus refuses the 9th | The message is Colyseus's own text, not a clear one |
| FR-L10 rematch, fair rotation | Fair rotation is built (`timesPossessed`), but a room plays only one night. The end screen only has "Back to the start" | Rematch: the whole night is set up once, when the room is created |
| FR-E7 disconnect and reconnect | `disconnect.holdSec = 60` in config only. Leaving removes you at once | All of it |
| FR-E8 end screen | Roles, photos and who the ghost was | Timeline and awards (P1). "Best photos" means all photos for now |
| FR-D1 match log | Nothing | All of it |

---

## 2. Build order

Each step ends with its tests passing (`npm run typecheck`, `npx vitest run`) and one commit.

### Step 1. Settings and presets (shared)

New `shared/src/settings.ts`:
- One `MatchSettings` object with every GDD 20 setting (Basic and Advanced tabs).
- The 4 presets.
- `settingsCode(settings)`, for example `STD-15-P1` or `CUS-12-PA`.
- `validSettings(raw)`: the server accepts only the options GDD 20 lists, and never more possessed than GDD 3 allows.
- `presetOf(settings)`: any change to a preset turns it into Custom.

The defaults and option lists stay in `config.ts`. The settings file only reads them (rule 10.7).

**Checks:**
- Every preset is valid.
- Standard equals the config defaults.
- Changing one setting turns the preset into Custom.
- The code shows preset, minutes and possessed count.
- Bad values are refused.

### Step 2. The server plays by the room's settings

The room keeps `settings`, which is shared with everyone in the room state (slow state, 5 times a second, PRD 10.4). Every rule that GDD 20 makes a setting reads it instead of the config default:
- Match length, number of possessed and ghost difficulty.
- Relics, tasks per player and ritual length.
- Players needed in the circle.
- Possessed know each other, power cooldown speed and blackout.
- Camera shots, salt and bell uses.
- The meeting times, reveal role and anonymous voting.
- Ghost hears real mic.
- Wisps can do tasks, and the Ouija board.

The match is set up from the settings when the countdown starts, not when the room is made. That also fixes the old note in `onCreate`: salt jars wait until the lobby decides the player count.

**Checks:** a server test per setting proves it changes the night. For example:
- 2 relics means 2 relics hidden.
- 10 minutes means a 600 s night.
- Blackout off means the power is refused.
- Anonymous voting means names are hidden from the vote list.
- Hard ghost means hunts come sooner.

### Step 3. The lobby

**Server:**
- `ready` and `character` messages.
- Host-only `settings` and `kick` messages, refused outside the lobby.
- Ready is refused until your mic check passed. Debug servers skip this.
- Start is refused unless at least 4 players are in the room and every one of them is Ready.
- The countdown is cancelled if someone leaves or un-readies during it. Settings lock when it starts.
- A 9th player and a late joiner get a clear message.

**Client:**
- The lobby panel gets:
  - A character picker. Characters someone has taken are greyed out.
  - Your Ready button. The player list shows each player's character and Ready mark.
  - The settings code.
- The host also gets a settings panel with Basic and Advanced tabs and the 4 preset buttons. Everyone else sees the same panel, read-only.
- A kick button next to each name, for the host only.

**Characters before Phase 8:** the 8 names from GDD 22.1, each with its own colour. The colour shows on your shadow and above your name when lit. The real models come in Phase 8.

**Checks:**
- Two players can't hold the same character.
- Ready is refused before the mic check.
- Start is refused with 3 players, and refused with one player not Ready.
- A 9th player sees "This room is full (8 players)."
- A settings change reaches every client within 1 s.
- Settings can't be changed during the countdown.
- A kicked player is out, and their character is free again.

### Step 4. Rematch

The night's setup moves out of `onCreate` into one `newNight()` that resets every per-night value. That covers:
- Relics, the ghost and the clock.
- Stations and clues.
- Meetings, powers, salt and photos.

What stays across nights:
- The room code and the players.
- Characters, mic checks and settings.
- The times each player was possessed (fair rotation).

**Server:** a `rematch` message. Who may press it: see open question 3.

**Client:** a Rematch button on the end screen takes everyone back to the lobby with Ready cleared.

**Checks:**
- One test room plays two nights in a row. The second night has fresh relics, a fresh ghost and fresh tasks.
- Over 10 rematches with one possessed, nobody is possessed twice before everyone has been once.
- Characters and settings are the same after a rematch.

### Step 5. Disconnect and reconnect (GDD 18)

**Server:**
- Colyseus 0.18's `onDrop` and `allowReconnection(client, 60)` handle a dropped connection.
- In the lobby, a dropped player is removed at once.
- During the night, their character freezes in place, and the ghost can still hit it.
- If they return within 60 s, they carry on with the same role, tasks and items. Their private messages (role, tasks, cooldowns) are sent again.
- If they don't return:
  - They become a Wisp.
  - A relic they held drops.
  - Their unfinished tasks leave the bar.
  - A possessed player gone for good counts as removed, so the ghost turns Furious if they were the last.
- If the host drops, host rights pass on as before.

**Client:**
- The SDK's automatic reconnection.
- A reconnection token kept for this tab, so reloading the page also gets you back in.
- "Reconnecting…" on screen.
- If the server restarted, a clear message and the way back to the home page.

**Checks:** a server test drops a possessed player and reconnects them at 30 s, and they have the same role. A second test drops a player for 61 s, and they become a Wisp and their relic drops.

### Step 6. The night's record

The server notes each event of the night with its time:
- Each relic placed, the basement opening and the task bar filling.
- The ritual start.
- Every power: its type, and whether a living investigator was within 15 m.
- Every photo, and whether it caught a possessed.
- Every meeting: who called it, the votes and the outcome.
- Every death and its cause.
- Time spent shouting, revives and times downed.

The end screen's timeline and awards and the match log (Step 7) are both built from this one record.

**Checks:** a scripted night produces the expected events in order.

### Step 7. End screen and match log

**End screen:**
- The roles and who the ghost was (already there).
- The timeline: powers, meetings with their votes, and deaths.
- The photos.
- The 6 awards from GDD 19. An award with no winner is hidden.
- The Rematch and Leave buttons.

**Match log:** one JSON record per night, with every PRD 10.6 field, and no names or IPs. Players are listed as "investigator 1", "possessed 1" and so on.

Where it goes: one line in the server's output starting with `MATCHLOG`, which Render keeps in its logs, and also a file `server/logs/matches.jsonl` when running locally. Render's disk is wiped on every deploy, so a file alone would be lost. Whether Rematch was pressed is written when the room closes or the next night starts.

**Checks:**
- The log has every PRD 10.6 field.
- It contains no player name.
- The awards are right for a scripted night, for example the player who placed the most relics gets Relic Runner.

### Step 8. Done-when test

**Automated:** 8 test clients join one room, pick 8 different characters, do the mic check and press Ready. Then:
1. The host starts, and the night is ended.
2. The host presses Rematch, changes the preset to Hardcore, and starts again.
3. The second night uses the Hardcore settings: a 10-minute night, 4 tasks each, and so on.

Nothing is restarted between the two nights.

**In the browser:** 4 to 8 tabs on a debug server. Create a room, pick characters, Ready, Start, end the night, check the end screen, Rematch, change settings, and play again. Also drop a tab and come back.

**Then the owner's playtest (PRD 12):** with friends, on the hosted game.

---

## 3. Rules the GDD doesn't cover (I will choose these unless you say otherwise; recorded in GDD 26 when built)

- A countdown is cancelled if anyone leaves or un-readies during it.
- Changing a setting doesn't clear everyone's Ready.
- Players marked Ready see a short "Settings changed" line in the log.
- A player who joins mid-lobby starts not Ready.
- The host's own Ready counts too.
- The kick button needs one confirm click.
- The kicked player sees "The host removed you from the room."
- Settings stay through a rematch. The host can change them in the lobby before the next Start.

## 4. The owner's answers (2026-11-09, recorded in GDD 26.14)

1. **Beginner preset length:** 20 minutes.
2. **Who was the ghost?:** an Advanced setting, On or Off, default On.
3. **Rematch:** only the host presses it.
4. **Kicked players:** they can join the same room again. The kick itself stays (FR-L8 needs it).
