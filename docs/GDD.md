# Haunted Lobby: Game Design Document

**Version 2.0 (locked).** This replaces the old GDD v1.0 and the "Simplified Design" PDF.
Working title: Haunted Lobby. Owner: Opu.

**How to use this document**

- This document says **how the game works**. The PRD (`docs/PRD.md`) says **what to build, in what order, and how we know it is done**.
- Every number here is a default. Every number lives in one config file (`shared/config.ts`), never in game code. Many numbers are also lobby settings (Section 20).
- If something is not covered, use the pillar test (Section 1) and write the answer into Section 26.

---

## 1. Vision and Pillars

**One sentence:** Friends are trapped in a haunted place for one night. They must finish tasks, find relics and perform a ritual before dawn, while a ghost hunts them and one of them is secretly possessed and helping it.

**Pitch:** *Among Us in haunted places, except the ghost hears your real voice, a spirit camera can catch the traitor, and the dead speak through a Ouija board.*

**Pillars.** Every feature must serve at least one, and break none.

1. **Trust is the horror.** The ghost is the pressure. The friend who is secretly helping it is the real fear.
2. **Your voice is a weapon and a risk.** Talking helps the team, but the ghost hears your real voice.
3. **Every sabotage leaves a clue.** The possessed never wins with something that cannot be noticed.
4. **Learn it in one minute.** A new player understands their goal from the intro screen alone.
5. **Short, tense nights.** One match is about 12 minutes. Rematches are instant.

---

## 2. What Makes This Game Different

Familiar from Among Us (so players learn fast): hidden traitor, tasks, meetings, voting, the reveal.

Unique to Haunted Lobby:

| Hook | In one line | Section |
|---|---|---|
| **It hears you** | The ghost reacts to your real microphone volume. Whisper to survive. | 13 |
| **Spirit Camera** | One photo. If you catch the possessed right after a sabotage, their face is a demon. | 15 |
| **Ouija board** | Dead players cannot talk, but in each meeting they can push the planchette at one person. | 17 |
| **Darkness hides identity** | In the dark you see only a shadow. Your flashlight reveals who it is. | 22 |
| **Characters, not colors** | Players are the Priest, the Nurse, the Detective... | 22 |
| **Many haunted places** | Each map has its own ghost with one special trick. Rules never change. | 21 |

---

## 3. Players and Roles

- **4 to 8 players** per room.
- **Investigators:** everyone who is not possessed. They win by completing the ritual.
- **The possessed:** secret traitor(s). They win by stopping the ritual until dawn.
- **The ghost:** controlled by the computer. It attacks everyone, possessed included. The possessed can secretly send it at people.

| Players | Possessed (Auto) | Possessed (max) | Players needed in ritual circle |
|---|---|---|---|
| 4 | 1 | 1 | 2 |
| 5 | 1 | 1 | 2 |
| 6 | 1 | 2 | 2 |
| 7 | 2 | 2 | 3 |
| 8 | 2 | 2 | 3 |

---

## 4. A Match from Start to End

### 4.1 The flow

1. **Intro (10 s).** Each player privately sees their role.
   - Investigators: "INVESTIGATOR. Do your tasks, find the relics, finish the ritual before dawn."
   - Possessed: "YOU ARE POSSESSED. Stop the ritual. Do not get caught." (If *Possessed know each other* is on, they also see the other possessed names.)
2. **Search.** Everyone spreads out, does tasks and looks for relics.
3. **Open the basement.** Relics are placed in the basement door.
4. **Fill the task bar.** When all tasks are done and the basement is open, the ritual can start.
5. **The ritual.** Players stand in the circle at the altar for 45 seconds while the ghost attacks.
6. **Dawn or victory.** The match ends. The end screen reveals all roles.

Meetings can happen at any time (Section 16).

### 4.2 The time limit

- **Default match length: 12 minutes.** The match ends at **dawn**.
- A **rising sun** at the top of the screen shows how much night is left.
- **The clock stops during meetings.**
- The night has 4 parts. Times below are for 12 minutes. For other lengths, Quiet is always the first 60 seconds, and the other parts split at one third and two thirds of the match.

| Time (12 min) | Part | Ghost | Possessed |
|---|---|---|---|
| 0:00 to 1:00 | **Quiet** | Asleep. No hunts. | No powers yet. |
| 1:00 to 4:00 | **Calm** | Wanders. Short, rare hunts. | Slam Door. Summon from 2:00. |
| 4:00 to 8:00 | **Restless** | Hunts more often. | Blackout unlocks. |
| 8:00 to 12:00 | **Furious** | Hunts almost all the time. | Everything. |

- **Overtime:** if the ritual is running at dawn with enough players in the circle, the match continues for up to **30 seconds** to let it finish.

**Target pacing:** basement opened by about 6:00, ritual started by about 8:30, and a typical investigator win between 9:30 and 11:30.

---

## 5. The Lobby

1. A host opens the website and presses **Create Room**. They get a **5-letter room code** (letters A to Z, without O and I) and a **link**.
2. Friends click the link (or type the code) and type a **display name**. No accounts, no downloads.
3. Each player **picks a character** (Section 22). Each character can be taken by only one player.
4. Each player does a **mic check**: they read one short sentence at normal speaking volume. This sets their personal "normal" level (Section 13). **A working microphone is required.** A player cannot press Ready until their mic check passes.
5. The host picks a **preset** or changes **settings** (Section 20). Everyone sees the settings live.
6. Everyone presses **Ready**. The host presses **Start**. A **5-second countdown** begins.

**Lobby rules**

- The host is the room creator. If the host leaves, the player who has waited longest becomes host.
- Only the host can change settings and kick players, and only in the lobby.
- Nobody can join after the countdown starts. Disconnected players can reconnect (Section 18).
- The lobby shows a short **settings code**, for example `STD-12-P1` (preset, minutes, possessed).

---

## 6. Controls and Movement

All keys can be remapped.

| Action | Key | Notes |
|---|---|---|
| Move | W A S D | Walk 2.1 m/s |
| Run | Shift (hold) | 3.3 m/s. Stamina lasts 5 s, starts refilling 3 s after you stop, full again 15 s later |
| Crouch | C (hold) | 1.1 m/s. Very quiet |
| Interact | E (hold) | Tasks, relics, revive, hide, ring the bell, report a body, cleanse |
| Flashlight | 1 or left mouse | On / off |
| Spirit Camera | 2, then left mouse | Raise camera, click to take the photo |
| Salt | 3, then left mouse | Pour a salt line |
| Drop relic | G | Makes a noise |
| Hold breath | Shift while hiding | 6 s, then 12 s cooldown |
| Possessed power wheel | R (hold) | Possessed only. Release on a power to use it |
| Map and status | Tab | Your tasks, task bar, relic status. Never shows player positions |
| Menu | Esc | Does not pause the match |

There are no pings or markers. Voice is how players communicate.

**Hiding spots:** wardrobes, under beds, behind curtains. Entering or leaving takes 1 second. While hidden the ghost cannot see you, but it can hear you. Moving inside a hiding spot makes noise.

---

## 7. Health

- **Downed:** if the ghost catches you, you fall. You can crawl (0.6 m/s) and talk, but you cannot use items, carry a relic or do tasks.
- **Revive:** a teammate holds E on you for **5 seconds**. Moving or being hit cancels it.
- **Dead:** if nobody revives you within **30 seconds**, you die. Your body stays where you fell, and you become a **Wisp** (Section 17).
- **Safe moment:** after being revived, the ghost cannot hit you for **3 seconds**.
- There is no Wounded state. You can be downed and revived many times.

---

## 8. Items

Everyone starts with the same three items.

### 8.1 Flashlight

- Lights a cone **12 m** ahead. Without it you see about **2 m** in the dark.
- **No battery.** It never runs out.
- **Flickers** when the ghost is within **15 m**. Goes dark for **2 seconds** when the ghost is within **5 m**.
- A flashlight that is **on** lets the ghost see you from **20 m**. Off, only from **8 m**. Darkness is a hiding tool.
- Shining it on another player shows their **name and character** (Section 22).

### 8.2 Spirit Camera

- **1 photo per player** by default (setting: 0 to 3).
- Raise the camera (key 2) and click. The **flash** is bright and makes a sound.
- How it catches the possessed is in Section 15.2.

### 8.3 Salt

- **2 handfuls per player** by default (setting: 1 to 4). You can carry at most **4**.
- **Pour a line:** takes 1 second, makes a 2 m wide line on the floor in front of you.
- If the ghost steps on a salt line, it is **frozen for 3 seconds** and the line disappears.
- Lines stay until the ghost steps on them.
- Salt is also used to **cleanse Taint** at the altar (Section 11).
- **Salt jars** around the map give 1 handful each. There is one jar per player on the map.

---

## 9. Tasks and Minigames

- Each investigator gets **3 tasks** (setting: 2 to 5) from the map's task list.
- A player's tasks are always in **different areas**, so people must spread out.
- Tasks are **dealt like cards**: no task is given twice while another is still free, and a **visible task goes to one player only** (26.5).
- Each task is a **tiny minigame of 10 to 20 seconds** that **matches the task**. Never a random puzzle.
- Leaving a minigame (or getting hit) cancels it. You must restart that task.
- A **team task bar** at the top of the screen fills as tasks are completed. Everyone sees it.
- **The possessed gets a fake task list.** They can stand at a task and pretend, but the bar does not move.
- **Visible tasks:** some tasks leave a change everyone can see (candles stay lit, shutters stay closed). The possessed cannot fake those. This is a clue.
- **Noisy tasks:** some minigames make noise if done badly (the baby cradle cries, the piano plays a wrong note). The ghost can hear it.
- If an investigator dies or is voted out, their unfinished tasks stay on the bar. Wisps can finish them (Section 17). If *Wisps can do tasks* is off, those unfinished tasks are removed from the bar instead.
- Tasks are **never in the basement**.

**Marrow Hotel task list (v1):**

| Task | Room | Minigame | Visible? | Noisy? |
|---|---|---|---|---|
| Light the candelabra | Restaurant | Light 5 wicks with a match. Move too fast and the match goes out | Yes | No |
| Turn the boiler valve | Laundry | Turn the heavy valve wheel until the gauge's needle sits in the safe zone for 5 s | No | No |
| Repair the switchboard | Reception | Plug 4 cables into the sockets of their own colour | No | No |
| Burn the cursed letter | Library | Hold a match under the swaying letter until it catches fire | Yes (fireplace) | No |
| Set the grandfather clock | Main Hall | Puzzle: the guest book on the hall's meeting table says when to wake the house (a different time each match). Grab the clock face and turn the hands to that time | Yes (pendulum, and the hands show the time) | No |
| Clean the mirror | Bridal Suite | Wipe the fog away. Sometimes a face appears behind you (scare only) | No | No |
| Seal the old trunk | Staff Quarters | Press the lid down and turn 3 latches | No | No |
| Tune the piano | Ballroom | Puzzle: the piano plays a short tune, its keys going down and lighting up. Play it back by ear and eye. Three rounds, each a note longer (4, 5, 6). A wrong key is a sour note and the tune plays again | No | Yes |
| Turn off the stove | Kitchen | Turn 3 knobs to the off mark | No | No |
| Fold the bedsheets | Guest Room | Fold the sheet in half three times | No | No |
| Rock the cradle | Nursery | Push the cradle gently in time with its swing. Too hard and the baby cries | No | Yes |
| Water the dead roses | Garden Courtyard | Puzzle: two jugs of different sizes (3 and 5, 5 and 7, or 4 and 9), a pump and a bucket. Get exactly the vase's number of measures into it by filling, pouring between the jugs and emptying. Too much, tip the vase out | No | No |
| Close the shutters | Upper Corridor | Drag 3 shutters closed against the wind | Yes | Yes (a shutter let go too early bangs open) |

---

## 10. Relics and the Basement Door

The Ritual Room is in the **basement**. The basement door is locked and has **one slot for each relic**.

- **3 relics** per match by default (setting: 2 to 5).
- Each map has about **12 relic hiding spots**. Each match picks spots at random, at least **20 m apart**, never in the Main Hall and never in the basement.
- A relic **whispers** when you are within **8 m**. Listening helps.
- **Taking a relic** is a 10 to 15 second minigame that fits its hiding place (unlock a jewellery box, dig in soil, reach into a flooded drain).
- **Anyone can carry a relic**, including the possessed. You can carry **one at a time**.
- Carrying a relic makes you **15% slower**, and the ghost hears you from **25% farther**.
- If you are **downed** while carrying a relic, you **drop it**. You can also drop it on purpose (G), which makes a noise.
- **Relic status on Tab:** everyone can see each relic's state: *Hidden*, *Carried by [name]*, *Dropped (last carried by [name])*, or *Placed*. It never shows where a dropped relic is.
- **Placing** a relic in the basement door takes **3 seconds**. Placed relics cannot be taken out.
- When every slot is full, the **basement door opens** for the rest of the match.

**Marrow Hotel relics:** the Founder's Ring, the Silver Bell, the Music Box, the Wedding Portrait, the Brass Key.

---

## 11. The Ritual

**The ritual can start when both are true:** the basement is open, **and** the task bar is full.

- Players go to the **altar** in the Ritual Room. Around it is a **circle** (4 m radius).
- At least **2 players** (3 players in 7 or 8 player matches) must stand inside the circle. Any living, standing player counts, including the possessed. Downed players and Wisps do not count.
- The ritual takes **45 seconds** (setting: 30, 45 or 60).
- Each player above the minimum makes it **25% faster**, up to **50% faster**.
- If the circle drops below the minimum, **progress slowly drains** (1% per second). It does not reset.
- At **100%** the sun rises and the **investigators win**.
- While the ritual runs, **the ghost always comes to the Ritual Room** and hunts with only short breaks (Section 12.4). The team should pour salt at the two doorways before starting.

**Taint (possessed sabotage at the altar):**

- The possessed must be **inside the circle**, and progress must be **20% or more**.
- **Black flames** appear on the altar. Everyone sees them.
- Anyone within 4 m of the altar can **hold E for 2 seconds and spend 1 salt** to put them out.
- If the flames are not put out within **5 seconds**, ritual progress is **cut in half** (80% becomes 40%).
- At most **2 Taints per match** for the whole possessed team, with **45 seconds** between them.

---

## 12. The Ghost

### 12.1 What it does

| State | Behavior |
|---|---|
| **Asleep** | First 60 seconds. Does nothing. |
| **Wander** | Moves between random rooms, listening. |
| **Investigate** | Goes to the last place it heard or saw something. |
| **Hunt** | Chases one player. A hit downs that player and **ends the hunt**. |
| **Retreat** | Vanishes for a while after a hunt, then returns to Wander. |

- **Warning:** before a natural hunt, all game sound goes silent for **2 seconds**.
- During a hunt, if it loses sight of its target, it checks up to **2 hiding spots** near where it last saw them, **3 seconds** each.
- It never treats the possessed differently. It hunts them too.

### 12.2 How it finds you

| What you do | Ghost notices within |
|---|---|
| Run | 16 m |
| Walk | 8 m |
| Crouch | 3 m |
| Open or slam a door | 12 m |
| Camera flash | 10 m |
| Noisy task done badly | 10 m |
| Drop a relic | 8 m |
| Breathing while hidden | 2 m (not while holding breath) |
| Your voice | See Section 13 |
| See you, flashlight on | 20 m (in front of it) |
| See you, flashlight off | 8 m (in front of it) |

- Walls block sight, not hearing.
- Carrying a relic adds 25% to every hearing distance.

### 12.3 It gets angrier through the night

| Part | Wander speed | Hunt speed | Time between hunts | Hunt length |
|---|---|---|---|---|
| Calm | 1.1 m/s | 1.9 m/s | 75 s | 20 s |
| Restless | 1.4 m/s | 2.2 m/s | 50 s | 25 s |
| Furious | 1.8 m/s | 2.5 m/s | 30 s | 30 s |

- Walking (2.1 m/s) is slower than a Restless or Furious hunt. Running (3.3 m/s) is always faster, but stamina runs out after 5 seconds. Nobody can escape forever. Hide or use salt.
- **Ghost difficulty setting:** Easy = time between hunts ×1.25, speeds ×0.9. Hard = time between hunts ×0.8, speeds ×1.05.
- **Player count:** time between hunts ×1.1 with 4 players, ×1.0 with 5 or 6, ×0.9 with 7 or 8.
- **Blackout:** the ghost is 10% faster while the lights are out.

### 12.4 Special rules

- **During the ritual:** the ghost moves to the Ritual Room and hunts with **15 seconds** between hunts, whatever the part of the night.
- **When every possessed player is gone** (voted out, dead or disconnected): the ghost becomes **Furious** for the rest of the match.
- **After a meeting:** no hunts for **15 seconds**.
- **Summoned hunts** (Section 14) reset the timer for the next natural hunt, so hunts cannot stack.

### 12.5 Each map's ghost has one trick

The rules above are the same on every map. Each map's ghost adds **one** special trick (Section 21). For v1, the Marrow Hotel ghost is **the Bellboy**: every 40 to 60 seconds it rings one of the hotel's service bells in the room it is in (players can learn where it is by listening), and while wandering it sometimes swings doors open on its own.

---

## 13. Your Voice

The game hears your **real microphone volume**. This is the heart of the game.

**Mic check:** in the lobby each player reads one sentence at normal volume. The game remembers that as **your normal**, so a loud mic and a quiet mic are treated fairly.

| How you talk | Compared to your normal | Other players hear you from | Ghost hears you from |
|---|---|---|---|
| **Whisper** | 10 dB or more quieter | 3 m | Does not hear |
| **Normal** | In between | 15 m | 6 m |
| **Shout / scream** | 8 dB or more louder | 25 m | 20 m |

- Volume fades with distance. A wall between two players halves the volume and muffles it.
- **Meetings are safe.** Everyone hears everyone at full volume and the ghost is frozen.
- **Downed players** can still talk (Section 7).
- **Wisps** hear only other Wisps (Section 17).
- **Every player must have a microphone.** There is no text chat and no playing without a mic.
- **Open mic only during matches.** There is no push-to-talk and no muting your own mic, because otherwise players could scream in real life and the ghost would never hear it.
- **Mic lost:** if a player's mic stops sending audio (unplugged, browser permission removed, muted in the browser) for more than 10 seconds, they see a warning, "Your mic is off. Turn it back on." Until it comes back, the ghost treats them as **talking at normal volume all the time** (6 m), so turning the mic off never makes you safer.
- Every player can **mute** any other player for themselves.
- The volume is measured by the **server**, not the player's computer, so nobody can cheat by hiding their own noise.

---

## 14. The Possessed

### 14.1 Who they are

- They look and play exactly like an investigator: same character choice, items, health, and they can carry relics and revive people.
- They have a **fake task list**. Pretending to do tasks is their main way to blend in.
- They **cannot hurt anyone directly**. Only the ghost can.
- The ghost hunts them like anyone else. If they die, they become a Wisp (Section 17).
- If *Possessed know each other* is on, they see each other's names at the intro. There is no private voice or text channel between them.

### 14.2 The four powers

Hold **R** to open the power wheel, release on a power. Each power has a **cooldown timer** shown only to the possessed. There is no energy meter.

| Power | Unlocks (12 min) | Cooldown | What it does | Clue it leaves |
|---|---|---|---|---|
| **Slam Door** | 1:00 | 30 s | A door within **6 m** slams and locks for **15 s**. Two players pushing together for 2 s can break it open. | Loud (ghost hears it from 12 m). You had to be close to the door. |
| **Summon** | 2:00 | 60 s | Pick a player you can see within **15 m**. The ghost appears **6 to 10 m** from them (behind them if possible) and hunts them. | **No 2-second silence** before it, a **whisper** sound within 5 m of you, and your eyes glow for 1 s if someone's light is on you. |
| **Blackout** | 4:00 | **Once per match** | Every light on the map goes out until someone holds E on the **fuse box** (Service Room) for **5 s**, or **60 s** pass. Flashlights still work. Ghost is 10% faster in the dark. Cannot be used during the ritual. | Everyone asks "Where were you?" |
| **Taint** | During the ritual | 45 s, max 2 per match (team) | Black flames on the altar (Section 11). Progress is cut in half if not put out in 5 s. | You must be **standing in the circle**. |

**Every power also starts the 10-second curse glow** (Section 15.2).

### 14.3 Power rules

- No powers in the first 60 seconds, while downed, or during a meeting.
- **Cooldown speed setting:** Slow = cooldowns ×1.25, Fast = cooldowns ×0.75.
- **No targeting the same victim over and over:** a player cannot be Summoned on within 30 seconds of being hit, and cannot be trapped by Slam Door more than once per 60 seconds.
- **No extra knowledge:** the possessed never see the ghost's position, relic locations or other players through walls.
- With two possessed, each has their own cooldowns. The Taint limit is shared.

---

## 15. How to Catch the Possessed

### 15.1 Nobody is told when a sabotage happens

There are no notifications and no map markers. Every power is disguised as ghost activity:

| Power | What players experience | Can they tell it was the possessed? |
|---|---|---|
| Slam Door | A door slams nearby | No. The ghost slams doors too. |
| Summon | The ghost attacks someone | Only if they notice: no silence before it, and a whisper. |
| Blackout | Every light dies | Suspicious, but it might be the ghost. |
| Taint | Black flames on the altar | Yes, but anyone in the circle could have done it. |

Ways to catch them:

1. **Where people were.** Every power needs the possessed to be close: near the door, within sight of the victim, inside the circle.
2. **Tasks.** "I did the candelabra." Then why are the candles not lit? Why did the bar not move?
3. **Relic status.** "Dropped, last carried by the Nurse." Why did the Nurse drop it?
4. **The Spirit Camera** (15.2).
5. **The Ouija board** (Section 17).

### 15.2 The Spirit Camera

- After using **any** power, the possessed carries an invisible **curse glow for 10 seconds**.
- A photo taken during those 10 seconds, with the possessed **in the frame**, **within 10 m** and **not behind a wall**, shows a **demon face** on them.
- At any other time the possessed looks completely normal in photos.
- **The photo develops slowly.** Nobody sees it until the **next meeting**, where it is shown to everyone with the photographer's name and the time it was taken.
- The **flash** is visible to everyone within 15 m, so the possessed knows they were photographed and can prepare a story ("that was the ghost behind me!").
- The flash makes noise (ghost notices within 10 m).
- If the photographer dies, the photo still develops and is shown at the next meeting.
- A photo of the ghost just shows the ghost (scary, but no information about roles).

**Why it is not too easy:** one shot each, a 10-second window, you must guess *when* and *who*, and you have to tell a natural hunt (silence first) from a Summoned one (whisper, no silence).

---

## 16. Meetings

### 16.1 Calling a meeting

- **Report a body:** stand within 3 m of a dead body and hold E. Works anywhere on the map.
- **Ring the bell:** the bell stands in the **Main Hall**. Hold E for 2 seconds. Each player can ring it **once per match** (setting: 0 to 3).
- **A meeting cannot start:**
  - in the first 60 seconds,
  - **while the ghost is hunting** (the bell will not ring and the report button is greyed out until the hunt ends),
  - during overtime,
  - within **30 seconds** after the last meeting.
- If a meeting is called during the ritual, ritual progress **freezes** (it does not drain).

### 16.2 How a meeting runs

Everyone (living players) is pulled to the table in the Main Hall. The clock, the ghost and all cooldowns freeze.

| Step | Default time | Setting | What happens |
|---|---|---|---|
| **Evidence** | 30 s | 15, 30, 45, 60 | New photos are shown. Wisps push the Ouija planchette. |
| **Discussion** | 60 s | 30, 60, 90, 120 | Everyone talks freely at full volume. |
| **Vote** | 20 s | 15, 20, 30 | Each living player votes for a player or **Skip**. |

### 16.3 The result

- The player with the most votes is **removed** only if they have **more votes than Skip**. A tie means nobody is removed.
- **Anonymous voting** (setting, default off): when off, everyone sees who voted for whom.
- The removed player is dragged into the candles and **becomes a Wisp**, whatever their role.
- **Reveal role** (setting, default on): the screen says **"THE NURSE WAS POSSESSED"** or **"THE NURSE WAS NOT POSSESSED."** When off, it only says "The Nurse is gone."
- After the meeting, players return to where they were. No hunts for 15 seconds.
- A body that was reported disappears.

---

## 17. Wisps and the Ouija Board

When you die or are voted out, you become a **Wisp**: a small floating light.

- **Invisible to the living.** You fly through walls at 3 m/s.
- **You can still do tasks** (setting, default on). Your completed tasks fill the bar. You cannot touch relics, salt, doors or players.
- **You cannot talk to the living.** You hear only other Wisps.
- **You do not see roles.** You know only what you saw before you died. All roles are shown at the end.
- **A possessed Wisp** is still on the possessed team. They do no real tasks, but they can use the Ouija board to mislead.
- **Ouija board:** during the Evidence step of every meeting, each Wisp can push the planchette onto **one living character** or **"I don't know"**. Everyone sees where it moves.

---

## 18. Winning, Losing and Special Cases

**Investigators win:** the ritual reaches 100%. A ritual that finishes at the exact moment of dawn counts as a win.

**The possessed win if any of these happen:**

- Dawn arrives (after any overtime) and the ritual is not complete.
- The number of living possessed is **equal to or greater than** the number of living investigators.
- Every investigator is dead.

| Situation | Rule |
|---|---|
| Every possessed player is gone | The ghost becomes Furious. The investigators must still finish the ritual before dawn. |
| A player disconnects | Their character freezes in place and the ghost can still hit it. Their slot is held for **60 seconds**. If they return, they continue. If not, they become a Wisp, any relic they held drops, and their unfinished tasks follow the normal rule. |
| The host disconnects mid-match | The match continues (the server runs it). Host rights pass to the longest-connected player for the end screen. |
| A possessed player disconnects for good | Treated like being removed. Their role is shown on the end screen. |
| The server restarts | The match is lost. Players see a clear message and return to the home page. |

---

## 19. End Screen and Rematch

- **Every role is revealed.**
- **Timeline:** when each power was used, each meeting and its vote, each death.
- **Best photos** of the match.
- **Awards:** Best Liar (possessed who was never voted for), Sharp Eye (photo that caught a possessed), Hero (most revives), Relic Runner (most relics placed), Loudest Screamer (most time shouting), Ghost Bait (downed the most).
- **Rematch** button: everyone returns to the lobby with the same settings and characters.
- **Fair rotation:** the possessed are picked with weight 1 ÷ (1 + times already possessed this session). With one possessed, nobody is possessed twice before everyone has been possessed once.

There is no points scoreboard in v1.

---

## 20. Settings and Presets

### 20.1 Presets

| Preset | Changes from Standard | For |
|---|---|---|
| **Standard** | None | Normal play. The only preset counted in balance statistics |
| **Beginner** | 15 min, ghost Easy, 2 tasks each, 2 camera shots, 3 salt, discussion 90 s | First-time groups |
| **Hardcore** | 10 min, ghost Hard, 4 tasks each, 1 salt, reveal role off, anonymous voting on | Experienced groups |
| **Custom** | Anything | Any change to a preset turns it into Custom |

### 20.2 Basic tab

| Setting | Options | Default |
|---|---|---|
| Map | Available maps | Marrow Hotel |
| Match length | 10, 12, 15, 20 min | 12 |
| Number of possessed | Auto, 1, 2 (never above the Section 3 max) | Auto |
| Ghost difficulty | Easy, Normal, Hard | Normal |

### 20.3 Advanced tab

| Group | Setting | Options | Default |
|---|---|---|---|
| Objectives | Relics | 2, 3, 4, 5 | 3 |
| | Tasks per player | 2, 3, 4, 5 | 3 |
| | Ritual length | 30, 45, 60 s | 45 |
| | Players needed in circle | Auto, 2, 3 | Auto |
| Possessed | Possessed know each other | On, Off | On |
| | Power cooldown speed | Slow, Normal, Fast | Normal |
| | Blackout | On, Off | On |
| Items | Camera shots per player | 0, 1, 2, 3 | 1 |
| | Salt per player | 1, 2, 3, 4 | 2 |
| Meetings | Bell uses per player | 0, 1, 2, 3 | 1 |
| | Evidence time | 15, 30, 45, 60 s | 30 |
| | Discussion time | 30, 60, 90, 120 s | 60 |
| | Voting time | 15, 20, 30 s | 20 |
| | Reveal role when removed | On, Off | On |
| | Anonymous voting | On, Off | Off |
| Voice | Ghost hears real mic | On, Off | On |
| The dead | Wisps can do tasks | On, Off | On |
| | Ouija board | On, Off | On |

Settings are visible to everyone, change live, and lock when the countdown starts.

---

## 21. Maps

**Rule:** game rules are the same on every map. A map changes only three things: **the place**, **the ghost's one trick**, and **the task and relic names and minigames**.

### 21.1 Size rules (every map)

- **3 levels** (for example ground, upper and basement), about **20 rooms**.
- About **45 to 60 seconds** to walk from one end to the other.
- **At least 2 routes** between major areas so the ghost cannot block one corridor.
- Every room has **at least 2 hiding spots**, every corridor segment has 1.
- Corridors about 2.5 m wide. Rooms at least 4 m × 4 m.
- The **Ritual Room** is in the locked area, reachable by **2 doorways** (so defending it is a team job).
- About **12 relic hiding spots**, **14 tasks**, **1 bell**, **1 fuse box**, one **salt jar** spot per possible player (8).

### 21.2 v1 map: the Marrow Hotel

An abandoned 1920s hotel. Heavy fog, peeling wallpaper, slow-opening doors.

| Level | Rooms |
|---|---|
| **Ground** | Main Hall (spawn, bell, meeting table, clock), Reception, Restaurant, Kitchen, Ballroom, Library, Service Room (fuse box), Garden Courtyard (outdoor, foggy) |
| **Upper** | Guest Corridor, Guest Rooms (4), Bridal Suite, Laundry, Staff Quarters, Nursery, Upper Corridor |
| **Basement** (locked by the relic door) | Stairwell, Wine Cellar, Storage, Ritual Room |

The relic door is at the bottom of the main stairs to the basement.

### 21.3 Future maps

| Map | Ghost | Its trick |
|---|---|---|
| **Bengali Rajbari** (ruined landlord mansion, courtyard, pond, banyan tree) | The Nishi | Calls a random player's name in a whisper from a dark room. The legend: never answer the Nishi |
| **Old Hospital** | The Nurse Ghost | Freezes while a flashlight is on her, moves fast in the dark |
| **Village School** | The Student | Writes on chalkboards. The writing hints where it is going next |

---

## 22. Characters and Darkness

### 22.1 Characters

Each player picks one of 8 characters. **Looks only, no special abilities.** Each has a shape you can recognize from its silhouette.

| Character | Recognized by |
|---|---|
| The Priest | Long robe, holds a cross |
| The Journalist | Long coat, notebook |
| The Nurse | Cap, medicine bag |
| The Student | Backpack, school uniform |
| The Detective | Hat, trench coat |
| The Photographer | Big old camera on the chest |
| The Mechanic | Overalls, toolbox |
| The Caretaker | Hunched back, lantern |

Cosmetics (outfits, hats, flashlight styles) can come later.

### 22.2 Darkness hides who you are

- In the dark, other players look like a **shadow** with no name.
- When your flashlight shines on someone within **10 m**, their **character and name** appear above them.
- Within **2 m** you can always see who it is, even in the dark.
- In meetings, everyone's name is always shown.

---

## 23. Atmosphere, Audio and Accessibility

**Look:** detailed, stylized-realistic 3D inspired by *Invokyr* (Ludogram, 2026): dark, warm, lived-in interiors where lighting carries the mood. We match the feel with our own or licensed assets only, never copied ones.

- **First person with a visible hand holding the flashlight.** The beam and the hand sway slightly as you walk.
- **Materials:** physically based textures (aged wood panelling, patterned wallpaper, worn carpet, stone, brass) instead of flat colours.
- **Lighting:** mostly darkness. Warm practical lights (table lamps, candles, fireplaces) and the flashlight, with coloured accent glows for the supernatural (sickly green, ember orange). Lighting is baked in Blender where possible; flashlights are real-time.
- **Furnished rooms:** bookshelves, tables, paintings, rugs, clutter. Each room tells a small story.
- **Characters:** stylized, detailed people with readable 1970s-flavoured outfits, one look per character (Section 22).
- **Effects:** soft bloom on lights, ambient occlusion, light fog, subtle film grain and vignette.
- **Quality settings:** Low and High. Low keeps the game smooth on ordinary laptops (fewer lights, simpler effects, lower resolution); High is for gaming laptops and desktops.
- **Future:** a downloadable version (Unity or Unreal) may follow after the browser version ships, using the same rules and server.

**Sound (most of the fear):**

- Spatial 3D sound for everything.
- **No background music: footsteps are the background.** Your own steps (quieter when crouching, quicker when running, a drag when crawling), your friends' steps from where they are, the ghost's heavy steps during hunts, and every 30 to 60 seconds a few distant steps that belong to no one. Creaks come with the audio pass.
- A sound volume slider in the room panel.
- A heartbeat that speeds up as the ghost gets closer.
- **Silence for 2 seconds before a natural hunt.**
- Relics whisper. The map's ghost has its own sound (the Bellboy's bell).

**Accessibility (required in v1):**

- Remap every key. Mouse sensitivity and field of view (70 to 100) sliders.
- **Photosensitivity mode:** flicker becomes slow dimming, no screen flashes (the camera flash becomes a soft fade). Warning on first launch.
- **Subtitles and direction arrows** for important sounds: door slams, the ghost nearby, the relic whisper, the bell.
- **Colorblind-safe:** no information by color alone. Minigames use symbols.
- **Horror intensity:** jump-scare volume and screen shake sliders.
- A **live mic meter** in the settings menu so players can check their mic at any time.

---

## 24. Fairness and Balance

Both sides should win about half the time on the Standard preset. A win should come from good play, not luck.

**Targets (Standard preset, 4 to 6 players):**

| Measure | Target | Alarm |
|---|---|---|
| Investigator win rate | 45 to 55% | Below 40% or above 60% |
| Average match length | 9 to 12 min | Below 7 or reaching dawn most matches |
| Basement opened by 50% of match time | At least 60% of matches | Below 40% |
| Ritual started before dawn | At least 70% of matches | Below 50% |
| Votes that remove a possessed | 35 to 55% of removals | Below 20% or above 70% |
| Matches where a camera photo caught a possessed | 20 to 40% | Above 60% |
| Deaths per match | 1 to 2.5 on average | Above 3.5 |
| Groups that rematch | Over 70% | Below 40% |

**Time budget (12 minutes = 720 s):** the investigators need roughly 60 s (Quiet) + about 250 s of tasks and relic work spread across the team + about 75 s to gather and run the ritual. That leaves about **330 seconds of slack** that the ghost and the possessed must burn to win.

**Tuning order:** change one thing, then play 10 more matches.

| Problem | Change first | Then | Last |
|---|---|---|---|
| Investigators win too often | Power cooldowns −10% | Time between hunts −5 s (Restless, Furious) | Ritual +10 s |
| Investigators lose too often | Salt +1 | Power cooldowns +10% | Ritual −10 s |
| Camera catches too often | Curse glow 10 → 8 s | Camera range 10 → 8 m | Default shots 1 → 0 |
| Relics take too long | Whisper range +2 m | Relic minigame shorter | Relics 3 → 2 |
| Matches end too fast | Tasks per player +1 | Ritual +10 s | |

---

## 25. Example: a 5-Player Match (12 minutes)

Players: Rafi (the Detective), Mim (the Nurse), Sam (the Mechanic), Nila (the Student) and Tuhin (the Priest). **Tuhin is secretly possessed.** One possessed, 3 relics, 3 tasks each (12 on the bar).

- **0:00, intro.** The doors slam. Four players read "INVESTIGATOR". Tuhin reads "YOU ARE POSSESSED".
- **0:00 to 1:00, quiet.** The ghost sleeps. Everyone splits. Tuhin goes upstairs with Nila and "folds bedsheets" (fake task).
- **1:30.** Mim hears a whisper in the Library and finds the **Music Box** in a locked case. She unlocks it (minigame) and carries it slowly toward the basement stairs. Tab shows "Music Box: carried by Mim".
- **2:40, the first hunt.** Sound goes silent for two seconds. The Bellboy's bell rings in the Ballroom. Sam runs, shouting, and the ghost hears him and downs him. Rafi revives him in 5 seconds.
- **3:30, Summon.** Tuhin sees Nila alone at the cradle and uses **Summon**. There is no silence, just a whisper near Tuhin. The ghost appears behind Nila and downs her. Tuhin "rushes to help" and revives her, playing the hero.
- **4:30.** Mim places the Music Box. Rafi places the **Brass Key**. One slot left.
- **5:10, Blackout.** Every light dies. Sam heads to the fuse box. In the dark, Rafi sees a shadow near the stairs. He shines his light: it's Tuhin. Rafi thinks "the lights just went out, and Tuhin is here alone" and **takes his one photo**. The flash goes off. Tuhin saw it.
- **5:40.** Sam fixes the fuse box. Nila, upstairs, is caught by the ghost in the dark, and nobody reaches her in 30 seconds. **Nila dies** and becomes a Wisp. She finishes her last task as a Wisp.
- **6:20, meeting.** Mim finds Nila's body and reports it.
  - **Evidence:** Rafi's photo appears. Tuhin's face is a **demon**. Nila's Wisp pushes the planchette to... the Mechanic (she wasn't sure).
  - **Discussion:** Tuhin says "That was the ghost behind me in the dark!" Sam is confused by the Ouija.
  - **Vote:** Rafi and Mim vote Tuhin. Sam votes Skip. Tuhin votes Sam. Tuhin gets 2, Skip 1, Sam 1. **Tuhin is removed. "THE PRIEST WAS POSSESSED."**
- **6:40.** All possessed are gone, so the ghost becomes **Furious**. Sam finds the last relic, the **Silver Bell**, and places it. The basement opens.
- **8:10.** The last task finishes. Rafi, Mim and Sam go down, pour salt at both doorways and start the ritual. With 3 players (one above the minimum of 2) it runs 25% faster.
- **8:30.** The ghost hits a salt line and freezes, then attacks again. Mim is downed in the circle. Sam revives her while Rafi holds the circle.
- **9:10.** The ritual reaches 100%. The sun rises. **The investigators win.**
- **End screen:** all roles shown. Awards: Sharp Eye (Rafi), Hero (Sam), Loudest Screamer (Sam). Everyone presses **Rematch**, and someone new is possessed.

---

## 26. Locked Decisions and Change Log

### 26.1 Locked decisions

| Decision | Locked value | Change only if |
|---|---|---|
| Players | 4 to 8 | The server or the client cannot hold 60 FPS and 20 ticks per second with 8 players |
| Match length | 12 min default (10, 12, 15, 20) | Fewer than 70% of groups want a rematch |
| Engine | Browser 3D: Three.js client, Colyseus server, LiveKit voice. A downloadable version (Unity or Unreal) may come after the browser version ships | The Low quality setting cannot stay smooth on an ordinary laptop |
| Art style | Detailed, stylized-realistic, inspired by *Invokyr*; own or licensed assets only; Low and High quality settings (Section 23) | Never in the browser version |
| Maps | Same rules on every map. v1 ships 1 map (Marrow Hotel) | Never for the rule; more maps after v1 |
| Identity | Characters (no colors), names shown only when lit | Never in v1 |
| Microphone | Required for every player. Open mic during matches, no push-to-talk | Never in v1 |
| Ghost hears real mic | On by default, server-measured | Playtests show it is unfair or frustrating |
| Role reveal | Every role revealed on the end screen | Never |
| Possessed knowledge | No map knowledge, no relic locations, no ghost position | Never |
| Accounts / matchmaking | None. Join by code or link | After release, if players ask |
| Platforms | Desktop browsers, keyboard and mouse | Version 2 |

### 26.2 Removed from the old design (v1.0)

EMF reader, radio and location tags, charms, flashlight battery and battery pickups, lore notes, the Influence meter, the 10 old abilities, possession stages, the Wounded and Marked states, the seance "second" rule, the points scoreboard, the old 14 settings and 6 presets.

### 26.3 Added in v2.0

Real-mic ghost hearing with mic calibration, the Spirit Camera, Wisps with the Ouija board, characters instead of colors, darkness hides identity, task minigames, the relic door, the bell and body reports, the 4 new possessed powers, multiple maps with one ghost trick each, the bigger map size, awards on the end screen.

### 26.4 Open decisions

| Item | Needed by | Default if undecided |
|---|---|---|
| Final game name | Release | Keep "Haunted Lobby" |
| Second map choice | After v1 release | Bengali Rajbari |
| Character art style details | Content phase | Stylized, detailed characters (Section 23), recognizable by outfit and silhouette |

### 26.5 Changes after v2.0

| Date | Change | Why |
|---|---|---|
| 2026-10-24 | All player and ghost speeds ×0.6: walk 3.5 → 2.1, run 5.5 → 3.3, crouch 1.8 → 1.1, crawl 1.0 → 0.6 m/s; ghost wander and hunt speeds scaled the same (Section 12.3); Wisps 5 → 3 m/s | Owner playtest (Phase 1): movement felt too fast, so a map felt small. Scaling the ghost by the same factor keeps every chase rule in Section 12.3 true |
| 2026-10-24 | Stamina refills after 3 s (was 2 s) and takes 15 s to fill (was 5 s) | Owner playtest: running could be chained too easily |
| 2026-10-25 | Art style changed from low-poly PS1 to a detailed, stylized-realistic look inspired by *Invokyr*, with Low and High quality settings (Sections 23 and 26.1) | Owner decision: the game should look as close to *Invokyr* as possible, accepting more art time and higher hardware needs on High |
| 2026-10-25 | Finish the browser version first; a downloadable version (Unity or Unreal) may follow | Owner decision: keep join-by-link now, consider a native release later |
| 2026-10-25 | No background music or drone; footsteps are the background sound (Section 23). Volume slider added | Owner playtest: the drone caused headaches over a night; footsteps suit the game better |
| 2026-10-26 | "Hang the room keys" removed from the task list (Section 9). The Guest Corridor gets a new task, still to be chosen | Owner playtest (Phase 4): it did not feel like a task and was not fun |
| 2026-10-26 | Tasks and relic taking become **interactions in the 3D world**, not 2D minigame windows: you handle the real object in first person (dig the soil with a trowel, light the real candles with the match in your hand, pour into the real vases, push the real shutters shut, straighten the real paintings). Relics are found by following the whisper, which grows louder and clearer up close, among searchable spots that are mostly empty; no prompt gives a relic away. Interactions ask for skill and reading sounds and objects, not busywork. You stay in the room while you work, so the ghost can hear and reach you. The rework comes after Phase 5, on the full map's real furniture; Phase 5 builds that furniture as separate objects the interactions can attach to | Owner playtest (Phase 4): the 2D minigames were flat, too easy and not fun ("it feels stupid because it's so easy") |
| 2026-10-27 | Owner approved the hands-on plan (`docs/plans/interaction-rework.md`). The left mouse button is your hand while you work, and the flashlight moves to key 1 only. Others see your hands mid-task only with the Phase 8 character models. Each relic spot becomes a group of 3 or 4 places to search; an empty place takes about 3 s and makes a small noise. The whisper subtitle says faint, close or very close, and its arrow (8 directions) shows only beyond 3 m. Close the shutters becomes a noisy task (Section 9) | Owner approval of the plan's four questions |
| 2026-10-28 | Pilot of puzzle tasks: the clock, the piano and the roses become small brain games instead of hand skill (Section 9 table). A steady player takes about 8 to 25 s (more than the 20 s target in Section 9 for the piano and roses, allowed for the pilot). The rest stay as they are until the owner has tried these | Owner playtest: the hands-on tasks were too simple ("not a mind or brain game") and it was not clear how to finish them |
| 2026-10-28 | A hidden relic now calls with a music box: a short, eerie tune on a bell-like celesta, from where the relic is. Far off it plays every few seconds, quietly; close by, more often and louder. Replaces the breathy whisper. Each task's how-to line now stays on screen the whole time you work on it, not just the first time | Owner playtest: the whisper was annoying (asked for something magical, like a film theme), and he could not tell how to finish a task |
| 2026-10-27 | Third batch of hands-on tasks built in the 3D world: switchboard, mirror, trunk, piano, sheets, cradle, and the jewellery box and drain relic spots (details in `docs/plans/interaction-rework.md`). Every task and relic spot is now hands-on, and the 2D minigame window is removed. This replaces the earlier 2D rules for these (the cradle's pale guide, the jewellery box's 5 lifted pins, the drain's 3 s grip): the jewellery box is now a dial lock with 4 pins, and the drain grips after 2.5 s held still | Owner: build the last batch |
| 2026-10-27 | Second batch of hands-on tasks built in the 3D world, as in the approved plan's Part 5: burn the letter, wind the clock, turn the boiler valve, straighten the portraits, water the roses (details in `docs/plans/interaction-rework.md`). The boiler holds 5 s in the safe zone (was 3 s) because its wheel is now heavy and slow | Owner: keep building before the playtest |
| 2026-10-27 | Tasks are dealt like cards: no task is given to a second player while another is still free, and a visible task never goes to two players (unless nothing else is left). With 14 tasks, 4 of them visible, 8 players × 3 tasks fits exactly | Owner playtest: asked whether players share tasks. Two players with the same visible task would confuse the "who did it" clue |
| 2026-10-27 | The relic whisper falls quiet once the server tells you the relic is in the place you're searching, and is softer up close | Owner playtest: the whisper kept sounding at full strength while digging out a relic already found |
| 2026-10-27 | Fewer doors and signs over every doorway (Section 26.11) | Owner playtest: rooms with 3 or 4 doors made the hotel "a living maze" |
| 2026-10-26 | **(Awaiting owner confirmation)** The Guest Corridor's new task is **Straighten the portraits** (visible): grab each of 3 crooked portraits and drag sideways to level it; one is haunted and swings crooked again once | The owner asked for a new Corridor task without naming one. Visible, so everyone sees the portraits hang straight |

### 26.6 Phase 2 build choices (awaiting owner confirmation)

Rules the GDD did not specify, chosen while building the ghost. Numbers live in `shared/config.ts` and are easy to tune.

| Choice | Value | Why |
|---|---|---|
| When the ghost can be seen | Only while it hunts. Outside hunts it is invisible, but flashlights still flicker near it and the heartbeat still plays | Keeps hunts as the big scare; the flicker and heartbeat warn that it is near |
| Doors and the ghost | Closed doors never stop the ghost; it swings open any closed door it reaches | Matches the Bellboy opening doors (12.5) and Slam Door trapping players (14.2); a closed door is not a safe room |
| Catch distance | 0.8 m | Close enough to feel like a grab |
| Ghost field of view | 140° in front of it | "In front of it" in 12.2 |
| After investigating a spot | Looks around 3 s, then ignores new clues within 4 m of that spot for 8 s | Without it, the ghost stood on top of a noisy player outside hunts |
| Retreat after a hunt | Vanishes for 8 s, then reappears at least 12 m from every player; the next hunt is counted from the end of the last one | "Vanishes for a while" in 12.1 |
| Hiding spot search | Checks up to 2 spots within 6 m of where it last saw its target, 3 s each | 12.2 says "up to 2 hiding spots near the last place it saw its target" |
| Range for ghost position updates | A player's game learns where the ghost is only within 25 m | Anti-cheat (PRD 10.3); covers sight (20 m) and flicker (15 m) |
| When the night starts | When the first player joins the room | Until the lobby Start button exists (Phase 7) |
| Dead players | Watch the room, cannot move or act | Until Wisps exist (Phase 6). Replaced by Wisps (26.12) |

### 26.7 Phase 3 build choices (awaiting owner confirmation)

| Choice | Value | Why |
|---|---|---|
| Mic check | Read one sentence for 4 s; at least 1 s must be talking; your "normal" is the middle value of what was heard | One loud word or a pause does not throw it off |
| Before the mic check | Playing is blocked (GDD 5: a working mic is required). A server without voice keys skips the mic check | Until the Ready button exists (Phase 7) |
| Voice volume curve | Full volume up to 3 m (1.5 m for a whisper), then fades evenly to silence at the edge of the range (3 / 15 / 25 m); a wall halves it and muffles it | GDD 13 ranges |
| Pre-hunt silence | Silences game sounds only, not voices | Friends can still warn each other |
| Pauses between words | Your talking level is kept for 1.5 s after you go quiet (the ghost still uses your loudness right now) | Owner playtest: the start of sentences was cut off |
| Quiet microphones | Boosted for others toward a common level, up to 4×, based on the mic check; whispers stay quieter than talk | Owner playtest: voices did not sound full |
| Heartbeat | Deep, soft and muffled, within 12 m of the ghost; footsteps are crisp wooden taps | Owner playtest: the two blurred into one annoying sound |
| Mic processing | Echo cancellation on; noise suppression and automatic gain off; steady stream with no gaps in quiet moments | Owner playtest: voices sounded broken and whispers disappeared |
| Voice direction | Simple left/right panning with smooth movement, not the full 3D (HRTF) effect | The 3D effect made speech sound crackly while people moved |
| Whisper volume | Full volume up to 2 m, fading to silence at 3 m | Owner playtest: whispers were hard to hear even up close |
| Dead players | Hear only other dead players | Early version of the Wisp channel (GDD 17) |
| Known limit | The server decides who hears whom, but a modified, cheating game could ask LiveKit for voices out of range. Normal players cannot | Fully blocking it needs more work on LiveKit permissions; revisit before public release |

### 26.8 Phase 4 build choices (awaiting owner confirmation)

| Choice | Value | Why |
|---|---|---|
| Item keys | 2 raises or lowers the camera, click takes the photo; 3 pours salt straight away | One key per item, nothing to hold |
| Salt jars | Every jar is full at the start of the night | Until match settings exist (Phase 7) |
| What E does | One thing at a time, in this order: revive, pick up a dropped relic, pick up salt, start a task, search a relic spot, hide, door. Things you can use are kept more than 1.5 m apart on the map (checked by a test) | Pressing E never does something you did not expect |
| Starting a task | Stand within 1.5 m of the station and press E. The mouse is freed for the minigame | |
| What cancels a task | Leave or Esc, walking more than 1.5 m from the station, or being downed | GDD 9: leaving or getting hit cancels it |
| Fastest finish the server accepts | 7 s | A little under the 10 s minimum, so quick players are not refused, but a cheat cannot finish tasks instantly |
| Grey-box tasks | Restaurant: candelabra, cursed letter, mirror, roses. Kitchen: stove, boiler valve, trunk. Main Hall: grandfather clock, piano, cradle, switchboard, sheets, shutters. Corridor: portraits. Each player gets one task in each of 3 rooms | Until the full map (Phase 5) gives each task its own room |
| Candelabra | Strike a match on the box (0.8 s), hold it to each of 5 wicks for 1.6 s; a fast flick puts the match out | GDD 9 |
| Stove | 3 knobs, each starting about half a turn from off; hold one and circle the mouse; they turn at most 55° a second | GDD 9 |
| Clock | One tick every 0.75 s; click or Space within 0.16 s of a tick to turn the key; 14 turns; off the beat slips back one | GDD 9. Owner playtest: hard but good, kept as is |
| Cursed letter | The letter sways in the draught; keep a lit match under it for 6 s in total (heat fades slowly when you lose it), then it burns. The fireplace stays lit | GDD 9 |
| Cradle | Rock the cradle along with a pale guide for 11 s; rocking too fast makes the baby cry, costs 2 s and can be heard | GDD 9 |
| Piano | 8 keys with painted symbols; play 3 lines of 5 symbols; a wrong note can be heard and restarts the line | GDD 9 |
| Boiler valve | Each valve position gives a steady pressure, with draughts nudging the needle; turn the stiff wheel (at most 30° a second) until the needle stays in the green for 3 s | GDD 9. A first version where the pressure kept climbing took over 20 s and never settled |
| Ghost look (until the art pass) | A pale, faintly glowing figure with bright eyes and a cold light around it, so it can be seen in the dark and when your flashlight cuts out near it | Owner playtest: the black ghost could not be seen, even with lights |
| Minigame tests | Every minigame is played by a scripted player in the tests; a good run must finish between 7.5 s and 25 s | Catches a minigame that cannot be finished or is too slow before anyone plays it |
| Noisy fails | The baby crying or a wrong note can be heard by the ghost within 10 m, and by players within 10 m. At most once a second per player | GDD 9 noisy tasks. Known limit: a cheating game could skip sending the noise |
| Interactive things and doors | Salt jars and task stations sit more than 3.5 m from doors, so E can still open the door | E prefers jars and tasks over doors (checked by a test) |
| Team bar | Shows done / total under the night bar; a player who leaves takes their unfinished tasks off the bar | GDD 9 |
| Visible results | The candelabra stays lit with a warm light; the clock's pendulum swings; the shutters close; the portraits hang straight | GDD 9 visible tasks |
| Switchboard | Drag each of 4 cables to the socket with its symbol and hold it in for 1.4 s; a wrong socket sparks and throws the cable back | GDD 9 |
| Mirror | Hold and wipe the fog until 90% is clear; wiping faster than 300 units a second only smears. Half the time a face appears for 0.9 s halfway through (a scare only) | GDD 9 |
| Trunk | Hold the lid down for 2 s, then turn 3 latches a quarter turn each (circle the mouse, at most 45° a second). Leave the latches untouched for 5 s and the lid bursts open and everything resets | GDD 9 |
| Bed sheets | Fold the sheet in half 3 times by dragging the corner onto a mark; wet linen follows the mouse at most 110 units a second; letting go short drops the corner back | GDD 9 |
| Roses | Hold over a vase to pour (3.5 s to fill); water runs on 0.35 s after you stop; fill 3 vases to the line; overflowing empties the vase | GDD 9 |
| Shutters | Drag each of 3 shutters shut against gusting wind and hold it for 1.5 s while the latch catches | GDD 9 |
| Portraits | 3 portraits tilted 20° to 35°; they turn at most 15° a second; level means within 2° for 0.6 s after you let go; one swings back 25° once | New Corridor task (26.5) |
| Relic spots (grey box) | 5 spots: planter and jewellery box (Restaurant), drain and shelf box (Kitchen), plant pot (Corridor). 3 relics hide in random spots each match | GDD 10 asks for about 12 spots 20 m apart; the grey box is too small for that, so relics go as far apart as it allows. The full map (Phase 5) adds the 12 |
| Finding a relic | Within 8 m you hear a whisper from the nearest hidden relic. The server only tells you where a relic is when you are within 8 m (hidden) or 15 m (dropped). Only spots you can hear show the E prompt | GDD 10; relic positions stay secret (PRD 10.3) |
| Taking a relic | Stand within 1.5 m and press E. Jewellery box: lift 5 pins and let go in the gold band (a tick tells you). Planter: drag the trowel back and forth (frantic strokes do not dig faster). Drain: feel slowly through murky water (bubbles mean close), hold still 3 s to grip, then pull it up. The server refuses a finish under 6 s | GDD 10: 10 to 15 s minigames. Same window and rules as tasks |
| Carrying | One relic at a time; 15% slower; the ghost hears you 25% farther. "Carrying X (G to drop)" shows on screen | GDD 10 |
| Dropping | G drops it where you stand; the ghost and players within 8 m hear it. Downed or leaving: it falls silently. Anyone can pick a dropped relic up with E straight away | GDD 10. A dropped relic glows faintly so it can be found |
| Tab | Hold Tab to see every relic: Hidden, Carried by X, Dropped (last carried by X), Placed. Never where | GDD 10 |
| Placing relics | Hold E within 2 m of the relic door while carrying a relic (3 s, moving cancels). It comes right after picking up a relic in what E does. The door shows one slot per relic, lit gold when filled; Tab shows the relic as Placed. Until every slot is full, nobody can open the door, and the ghost cannot pass it either (it can still reach the Stairwell in front of it). The last relic opens it for good: E no longer works it | GDD 10; the Stairwell is outside the lock so carriers can be chased right up to the door |

### 26.9 Phase 5 build choices (awaiting owner confirmation)

| Choice | Value | Why |
|---|---|---|
| Hotel layout | A ring of corridors around the open-air Garden Courtyard on the ground floor, with the Main Hall south of it, the Reception, Library and Ballroom on the west and the Restaurant, Kitchen and Service Room on the east. The upper floor repeats the ring around the open courtyard. The basement lies under the west side. Plan: `docs/maps/marrow-hotel.svg` | The ring gives at least 2 routes everywhere (21.1); the courtyard is in the middle so you cross or skirt it often |
| Stairs | Grand stairs up and cellar stairs down, both inside the Main Hall; back stairs up in the Service Room, landing in the Laundry. Floors are 3 m apart | Two ways between ground and upper floors (21.1); the relic door is at the bottom of the main stairs to the basement (21.2) |
| Corridor names | Ground: Front, West, East and North Corridor. Upper: Upper Corridor (front and east, plus the landing) and Guest Corridor (west and north). Basement: Cellar Passage | The GDD names only the upper corridors |
| Basement | Stairwell, then the relic door, then the Cellar Passage between the Wine Cellar and Storage; the Ritual Room is beyond them with one doorway from each | 21.1: the Ritual Room has 2 doorways, so defending it is a team job |
| One task per room | Main Hall clock, Reception switchboard, Library letter, Ballroom piano, Courtyard roses, Restaurant candelabra, Kitchen stove; upstairs Upper Corridor shutters, Guest Corridor portraits, Bridal Suite mirror, Nursery cradle, Guest Room 1 sheets, Staff Quarters trunk, Laundry boiler | The GDD 9 table, one room each |
| Relic spots (12) | Library, Ballroom, Restaurant (jewellery boxes); Courtyard (flower bed); Kitchen, Service Room (drains); Bridal Suite, Guest Rooms 2 and 4 (jewellery boxes); Nursery and Guest Corridor (plant pots); Laundry (drain) | Never the Main Hall or basement (10). The 20 m spacing is now measured as the real distance, through floors |
| Salt jars (8) | Main Hall (beside the cellar stairs), Reception, Restaurant, Service Room; Nursery, Guest Room 1, Staff Quarters, Laundry | One per possible player, spread over both floors, none in the locked basement |
| Where the ghost sleeps | The Ballroom, out of the 25 m range of the spawn | It used to sleep in the last room listed, which is now the locked Ritual Room |
| Walking end to end | About 46 s at walking speed (96 m, Guest Room 3 to the Ritual Room, middle to middle). Without the basement, about 39 s | 21.1 asks 45 to 60 s; checked by a test |
| Furniture | Separate pieces with their own ids (tables, beds, counters, shelves, a stage, the fountain, wine racks, crates, the altar). They block walking; low ones do not block sight | 26.5: the 3D interaction rework attaches to real furniture |
| Hiding spots and doors | A hiding spot's exit is at least 2 m from any door | Otherwise E at that door hides you instead of opening it |
| Starting the ritual | No button: it starts by itself the moment it is ready (basement open, task bar full) and enough living, standing players are in the circle. Players hidden in furniture do not count | The GDD says when it *can* start, not how; standing in the circle is the commitment |
| Once started | It stays started for the rest of the match, even if it drains back to 0. The ghost keeps coming to the Ritual Room and hunting every 15 s | Avoids starting and stopping the ghost's ritual behaviour each time someone steps out |
| Ghost during the ritual | With nothing noticed it walks to the altar and lingers there; anything it sees or hears still draws it off. The next hunt comes at most 15 s away the moment the ritual starts | GDD 11 and 12.4 |
| Ritual bar | Under the task bar once the ritual is ready: "Gather 2 at the altar (1 there)", then progress with "n / m in the circle", red while draining. The circle on the floor turns brighter red when ready and gold while it runs | Everyone needs to see it is time to go down |
| Overtime | At dawn, if the ritual is running with enough players in the circle, the clock shows Overtime and the ghost stays Furious, for up to 30 s. The moment the circle drops below the minimum, dawn comes | GDD 4: "with enough players in the circle" |
| Who counts as living | Alive and downed players; only dead ones are out. With no possessed yet (Phase 6), the possessed win early only if every player is dead | GDD 18 says "living"; a downed player can still be revived |
| When the match ends | Everything stops at once except voice, so people can talk it over: no moving, no clock, no ghost, no E | The end screen should be a calm moment after the panic |
| End screen for now | Who won and why, and every player's role, then a "Back to the start" button. Rematch, timeline, photos and awards come with the lobby (Phase 7) and later phases | GDD 19 roles are P0; the rest is P1 (PRD FR-E8) |
| The Bellboy's bell | Every 40 to 60 s (at random) a service bell rings twice. Everyone hears it, from the middle of the room the ghost is in (not its exact spot), quieter with distance and through floors. It does not ring while the ghost sleeps, and never in the 2 s of silence before a hunt: it waits and rings as the hunt starts | GDD 12.5 and the 2:40 example in GDD 24 |
| The Bellboy's doors | While wandering, every 25 to 45 s it swings open the nearest closed door within 6 m of it (the next one it passes, if none is near). Never the relic door. Every door that opens or shuts now makes a sound, so players hear it | GDD 12.5 says "sometimes"; these numbers live in the hotel's map data |

### 26.10 Grey-box readability (awaiting owner confirmation)

After the Phase 5 playtest the owner found the grey map a maze where every room looks the same, and missed a relic close by. These help until the Phase 8 art.

| Choice | Value | Why |
|---|---|---|
| Room colours | Every room has its own colour in the map data: its walls, and darker shades on its floor and ceiling. Warm on the ground floor, softer upstairs, cold and dark in the basement. Rooms next to each other never share a colour | Grey walls everywhere gave nothing to remember a place by |
| Room name | Walking into a room shows its name and floor for 3 s in the middle of the screen | Players can say where they are on voice ("I'm in the Kitchen") |
| Tab map | Holding Tab shows every floor side by side: rooms in their colours with names, walls and doorways, stairs, your unfinished tasks' rooms outlined in gold, and you as an arrow. It never shows other players, the ghost or relics | GDD 6 calls Tab "Map and status" and says it never shows player positions; GDD 10 keeps relic places secret |
| Sound subtitles | While you can hear a relic whisper, "A relic whispers nearby" shows with an arrow toward it. When the Bellboy's bell rings, "The bell rings" shows for 4 s with an arrow toward the room it rang in. Both say "(above)" or "(below)" when the sound is on another floor | GDD 23 asks for subtitles and direction arrows for important sounds; brought forward from Phase 8 because the whisper alone was too easy to miss |

### 26.11 Doors and signs (owner approved the direction, 2026-10-27)

The owner found the hotel a maze: several rooms had 3 or 4 doors, many of them straight into the next room. Cutting every room to one door would make every room a dead end, which is deadly with a ghost in the doorway. So the rule is:

| Choice | Value | Why |
|---|---|---|
| Corridors join rooms | Rooms open onto corridors, never into each other. The only exceptions are where real buildings do it: the Kitchen into its Restaurant, and the Ritual Room's two doorways (21.1) | One clear idea of the building: the corridor ring, with rooms off it |
| One or two doors | A small room has one door (a risky dead end with good hiding spots). A big room has two, onto different corridors, so a chase can loop through it: the Ballroom, Restaurant and Kitchen, and the Laundry upstairs. No room has more than two, or two into the same place | Loops keep chases alive; dead ends make hiding a gamble |
| Main Hall | One wide double door, facing the courtyard across the Front Corridor. The stairs up and down are inside it. The bell moves to 4 m inside the door | The hub you always come back to |
| Courtyard | Doors north and south only, a shortcut across the middle of the ring | Two ways round the ring, plus one risky way through |
| Count | 37 doors became 25. Checked by a test: at most 2 ways into any room, no room-to-room doors except the ones above, at least 3 loop rooms, and still 2 routes between areas | 21.1 |
| Signs | Over every doorway, a brass plaque on each side names the room beyond it. On the corridor side a second plaque sticks out from the wall, so it reads from down the corridor. They are lit like everything else, so you read them by flashlight | Real hotels sign their rooms; until the Phase 8 art, signs are the strongest landmark |

### 26.12 Phase 6 build choices (awaiting owner confirmation)

| Choice | Value | Why |
|---|---|---|
| A Start button now | The room waits until the host presses **Start the night** in the room panel. Then a 5 s countdown, the 10 s role reveal (4.1), and the night. Nobody can join after the countdown starts. The full lobby (presets, settings, Ready, characters) still comes in Phase 7 | Roles must be dealt to a fixed group at one moment. Before, the night began when the first player arrived |
| Before the night | You can walk around and open doors, and do the mic check. Tasks, relics, salt, the camera and hiding wait for the night | Friends gather and test their mics without using up items |
| Host | The room's creator. If they leave, whoever has waited longest (5) | |
| Fair rotation | Players possessed the fewest times this session are picked first, each with the 1 / (1 + times) weight (19) | The weight alone can pick the same player twice in a row. This keeps 19's promise that nobody is possessed twice before everyone has been once |
| The possessed's tasks | The tasks they were dealt become their fake list. They leave the team bar, and doing them moves nothing (9). Their task list shows "Fake tasks: pretend to do them" | They must blend in, but must not be able to hold the bar back |
| Testing alone | On debug servers the host can start with fewer than 4 players. Below 4 nobody is possessed unless a tester asks to be (a debug message). A night where everyone is possessed never ends by counting the living | So one person can try both roles |
| The power wheel | Hold R: the mouse picks a power (Slam Door up, then Summon, Blackout, Taint clockwise), and letting go of R uses it. Cooldowns are also shown along the bottom of the screen, to the possessed only | 14.2 gives the key but not the layout |
| Slam Door's target | The door you look at, within 6 m. "Trapped" means living players within 6 m of that door; the slam is refused if any of them was trapped in the last 60 s (14.3). Two players must hold E on it together for 2 s to break it open | 14.2 and 14.3 do not say who counts as the victim |
| The ghost and a slammed door | The ghost can open a slammed door. That clears the lock | A lock that stopped the ghost would make the door a safe room |
| Summon's target | The player you look at, within 15 m, in line of sight, standing (not hidden). Refused if the ghost is hunting or retreating, or cannot reach them | 14.2 says the ghost "appears", not what happens if it is busy |
| The eye glow | Players whose lit flashlight points at the Summoner (12 m, 26° half-angle) see their eyes glow red for 1 s | 14.2 says "in light"; the beam is the only light that moves |
| Blackout | Once per match for the whole possessed team, not once each | One blackout per possessed player would make it common with 2 possessed |
| Taint | Only from inside the circle, once the ritual is 20% done; 2 per match for the team, 45 s apart. The flames last 5 s. Any player in the circle with salt can hold E for 2 s to put them out, using 1 salt. Not put out: progress halves | 11 gives the numbers; these are how they meet |
| Curse glow | Tracked on the server for 10 s after any power, and shown privately to the possessed | 15.2 |
| The demon face | Decided the moment the shutter clicks: a possessed player in the frame (60°), within 10 m, not behind a wall, with curse glow left. The photo keeps names, so it still develops if the photographer or the subject dies or leaves | 15.2 |
| What a photo shows | A drawn print: each player in the frame as a dark figure with their name under it (everyone looks alike until characters come), the demon face on a cursed one, the ghost as a pale shape. Caption: the photographer and the clock time | Every body is the same grey shape for now, so a name is the only way to tell who is in it |
| Where photos are seen | They develop as a meeting starts: the prints are on the meeting screen, and also stay in the room panel (Esc) for the rest of the night. Every photo, developed or not, is on the end screen | |
| The table | Everyone living, downed players too, is pulled to the map's start spots (the 8 places around the Main Hall table). The dead stay where they fell. Hidden players come out and go back into their spot afterwards | 16.2 says "pulled to the table" but not where each one stands |
| Reporting | Hold E on a body for 1 s, within 3 m. The ghost hunting (or the silence just before a hunt) blocks it, and the bell, with a message saying why | 16.1 says "hold E" without a time |
| What freezes | The clock, the ghost, the ritual, the Bellboy, every cooldown and curse glow, the blackout's and the black flames' timers, and bleeding out. Everyone stays still. Tasks and held actions stop | 16.2 lists the clock, ghost and cooldowns; the rest freeze for the same reason |
| Voting | One vote each, which cannot be changed. The step ends early once every living player has voted. While voting, everyone sees who has voted but not for whom | 16.2 does not say whether a vote can be changed |
| The result | Shown for 6 s: the verdict ("MIM WAS POSSESSED." / "NOT POSSESSED." / "Nobody was removed"), the count, and who voted for whom (unless voting is anonymous). Players go back to where they were when it ends, and the removed player is out then | 16.3 gives no time for the result |
| Voted out | The removed player becomes a Wisp at their seat, with no body to report. Removing the last possessed does not end the match: the investigators still have to finish the ritual (GDD 24, 6:40) | 17 |
| Meeting voice | During a meeting everyone living hears everyone living at full volume; the dead still hear only the dead | 12.6 and 17 |
| Body and Wisp | When you bleed out, your body stays where you fell (that is what gets reported) and your Wisp starts there and floats free | 16.1 reports a body; 17 says you become a light, so they are two things |
| How a Wisp moves | WASD at 3 m/s through walls and furniture, never running or crouching, making no noise. Space floats up a floor and C down, to the same spot on the next floor. A Wisp cannot leave its floor's area | 17 says Wisps fly through walls but not how they change floor |
| What a Wisp can do | Only its own tasks (if the setting is on). E does nothing else: no doors, relics, salt, hiding, reviving, bell or reports. A possessed Wisp's tasks stay fake | 17 |
| What a Wisp sees | Itself as a soft blue light around the camera, other Wisps as floating lights, and every body. The living never see Wisps, and Wisps never show in photos | 17: invisible to the living |
| The Ouija board | On the meeting screen whenever anyone is dead: one slot per living player plus "I don't know". During Evidence each Wisp can push it once; everyone sees it move and a line "The planchette moves: Mim." It never says which Wisp pushed it. Later pushes move it again | 17 says everyone sees where it moves, not who moved it, so it is anonymous like a real board |
| Wisp voice | The dead hear only the dead, in meetings too, at full volume regardless of distance | 17. Already built in Phase 3 (26.7) |
| Every possessed gone | Once every player dealt the possessed role is dead (voted out, bled out) or has left, the ghost is Furious for the rest of the night, and the night bar says so. Not at dawn | 18 says the ghost becomes Furious but not for how long |
| Known limit | Wisp positions travel in the shared room state, so a modified game could show Wisps to the living. Normal players cannot see them | Hiding them per player needs state filtering; revisit with the other anti-cheat work before public release (PRD 10.3) |

