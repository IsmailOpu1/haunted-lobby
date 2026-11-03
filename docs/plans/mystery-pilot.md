# Mystery pilot: who was the ghost?

**Status:** approved by the owner with the suggested answers, and built on 2026-11-04 (branch `mystery-pilot`). What was built, and where it differs from this plan, is in GDD 26.13. Next: the owner plays it with friends.

## Why

The owner's playtest on 2026-10-29: "It works, but it isn't fun. It feels scattered." Tasks, relics, the ritual and the possessed are four separate loops that never touch, so the night feels like a checklist.

The pilot ties them together with **one mystery per night**. Every action then serves all three parts of the game:

- **Investigate** (Phasmophobia): tasks reveal clues about who the ghost was.
- **Teamwork** (Lethal Company): the clues are spread over the hotel and the players, so nobody can solve it alone.
- **Suspicion** (Among Us): the possessed knows the answer and lies.

It is a **small test**, about a week of work. If friends argue on voice about who the ghost was, it works and we grow it. If they don't, we learn why and change course.

## A night, as players see it

1. The night starts as now. Secretly, the ghost is one of **4 people who died in the hotel**. Tonight it is the Bride.
2. Mim cleans the mirror in the Bridal Suite. As the fog clears, a face in a **veil** looks back, and it stays there.
3. Nila straightens the portraits in the Guest Corridor. One portrait, now straight, shows **a woman in a wedding dress**.
4. Rafi connects the switchboard in Reception. One lamp stays lit: a call from the **Bridal Suite**.
5. On voice: "veil, wedding dress, Bridal Suite... it's the Bride." Ghoul, the possessed, says: "The portrait I saw was a boy in uniform. It's the Bellboy." Who is lying?
6. The team finds the 3 relics and opens the basement as now. One of them is the Bride's own belonging, the **Wedding Portrait**.
7. In the Ritual Room, someone lays a relic on the altar. That is the team's answer. The Wedding Portrait is right, so the ritual runs. A wrong relic would have cost them dearly (see below).

## The 4 suspects (pilot)

| Suspect | Their belonging (relic) | Mirror: the face | Portrait: who it shows | Switchboard: the call comes from |
|---|---|---|---|---|
| The Bride | the Wedding Portrait | a face in a veil | a woman in a wedding dress | Bridal Suite |
| The Bellboy | the Silver Bell | a face under a pillbox cap | a boy in a bellboy's uniform | Staff Quarters |
| The Founder | the Founder's Ring | a face under a top hat | an old man with a ring | Library |
| The Child | the Music Box | a small face with ribbons | a girl holding a music box | Nursery |

- The ghost's own belonging is **always** one of the 3 relics hidden that night. The other 2 come from the other suspects. (The Brass Key sits out the pilot.)
- Suspects, clues and belongings live in the map data (`/maps/marrow-hotel/`), not in the rules code. Another map can have its own people.

## The clues

- **3 clue tasks:** the mirror (Bridal Suite), the portraits (Guest Corridor) and the switchboard (Reception). They play exactly as now. Only what you see when you finish them is new.
- **The clue stays.** After the task is done, anyone who walks up sees the same clue: the face stays in the mirror, the portrait hangs straight, the lamp stays lit. So a lie can be checked, but checking costs time with a ghost about.
- **Every night, all 3 clue tasks are dealt**, each to a different player where possible. The other tasks stay ordinary.
- **Clues are pictures, not reading.** Nobody stops to read a letter while the ghost hunts. In the grey box they are simple drawn pictures, like the photo prints. Phase 8 makes them real.

## The possessed lies

The possessed knows who the ghost is. They have two ways to lie:

1. **Talk.** They can claim any clue they like in a meeting. Others can go and check.
2. **Alter a clue** (a new power, once per match): at a clue that is already showing, hold E for 3 s and it changes to point at another suspect. It starts the curse glow like every power. Anyone who saw the true clue before will now disagree with anyone who sees it after. That makes an argument, which is the point.

If a clue task is on the possessed's (fake) list, finishing it shows a clue of **their** choice.

## The altar: the team's answer

- When the basement opens, the 3 placed relics move from the door to the altar.
- Before the ritual can start, a player in the circle **holds E on one relic for 3 s** to offer it. Everyone sees who offered which.
- **Right relic:** it glows, and the ritual starts as now.
- **Wrong relic:** the ghost screams and hunts **at once**, the relic crumbles to dust, and the altar takes no other offering for **30 s**. The team can then try one of the 2 left.
- The offering is a choice everyone can watch, so a possessed who offers the wrong relic on purpose has just given themselves away. Or have they?

## What stays the same

Tasks still fill the bar. Relics still open the basement. The ghost, the night, meetings, the camera, Wisps and the Ouija board work as now. The pilot adds a layer on top. It replaces nothing.

## The test with friends

Play at least 3 nights with 4 or more friends on voice. Watch for:

- Do people talk about **who the ghost was**, without being told to?
- Does anyone **go and check** a clue someone else reported?
- When the offering is wrong, is it a **"no way!" moment** or just annoying?
- Does the possessed **enjoy lying**, and does anyone catch them?

If most answers are yes, it works: more suspects, more clue tasks, maybe the acts. If not, we write down why and decide together.

## Questions for the owner

My suggested answer is in brackets. Change any of them.

1. Are these 4 suspects right, or do you want other people from the hotel's past? *(Keep these 4 for the pilot.)*
2. Wrong relic on the altar: how harsh? *(Instant hunt, the relic is lost, 30 s wait. Not game over.)*
3. The possessed's "Alter a clue" power: yes or no? *(Yes. Without it, lying is only talk.)*
4. Should a clue stay for everyone to see, or only for whoever finished the task? *(Stay for everyone, so lies can be checked.)*
5. Should the ghost act differently depending on who it was, for example the Bellboy rings his bell? *(Not in the pilot. Later, if the pilot works.)*

## Build steps, once approved

1. Map data: suspects, their belongings and each clue station's 4 pictures.
2. Server: pick the ghost secretly each night, always deal the 3 clue tasks, show the clue when a task is done, the altar offering, and the "Alter a clue" power. Tests for each.
3. Client: draw the clue pictures on the mirror, the portrait and the switchboard lamp, and the altar's relics and offering.
4. GDD: record the rules in the change log, and in 26.12 or a new 26.13.
5. Check it in the browser with 3 players, then the owner plays it with friends.

**Done when:** in a scripted match the 3 clues point at the ghost, the possessed alters one, a wrong offering triggers the hunt and the 30 s wait, and the right one starts the ritual.
