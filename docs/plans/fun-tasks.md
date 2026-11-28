# Plan: make the night fun (tasks, clues, characters, relics, a cure)

Owner, 2026-11-28: doing the tasks is not fun; friends will not keep playing. Make tasks like
Lockdown Protocol's (find things in other rooms, carry them back), dealt at random; make the
clues random; the end screen's "THE NURSE WAS POSSESSED" means nothing when nobody can tell who
the Nurse is; the Music Box relic looks like a modern box, not something ancient; should a
possessed friend be curable? Builds on `interaction-rework.md` (tasks hands-on in the 3D world)
and `mystery-pilot.md` (who was the ghost). Nothing here is built until the owner answers the
questions at the end.

## 1. Tasks you go out and do, not a minigame at one spot (the big one)

Why today's tasks are dull: you walk to one spot, do a 15 s puzzle alone, walk away. Nothing
connects you to the house, the ghost or your friends.

The new shape of a task: a short **errand** across the hotel, with something in your hands.

- **Fetch and fix.** The station needs a thing that lies somewhere else in the hotel (a fuse, a
  key, a lamp oil can, a record). Where it lies changes every night. You carry it back: one thing
  at a time, in your hand, and the ghost hears you better while you carry it (as relics do).
- **Two-person tasks, by voice.** One player reads, the other acts, in different rooms: the
  safe's code is written on the nursery wall (a different code every night), and the safe is in
  the Reception. It uses the game's heart (your voice), and talking draws the ghost.
- **Chains.** One errand opens the next: light the furnace (coal from the cellar), then the
  boiler works, then the drains can be emptied to find the key in one.
- **Tasks that fight back.** Some things are hard to carry: an oil lamp goes out if you run; a
  full bucket spills if you run (go back and refill it); the record breaks if you are caught
  while carrying it.
- **The possessed can poison an errand.** They can carry things too, and can swap one for a
  **cursed** copy (looks the same; when it is delivered, the ghost is summoned at that station),
  or hide it somewhere stupid. A strong clue: who handed you that fuse?
- **Random each night:** which tasks you get, where each needed thing lies, the codes and the
  numbers. You can never learn the route by heart.
- **Short.** Each errand about 40 to 60 s in all, mostly moving through the dark house, with only
  a few seconds of hands-on work at the end (in the 3D world, no 2D windows, as before).

First set to build (8, in the Marrow Hotel's rooms), for example:

| Errand | You fetch | You do | The twist |
|---|---|---|---|
| Restore the power | a fuse (Storage or Wine Cellar) | fit it in the fuse box | a cursed fuse blows: lights out in that wing |
| Light the chapel candles | matches (Kitchen) + candles (Staff Quarters) | light 5 wicks | running blows the match out |
| Feed the furnace | 2 coal buckets (Cellar) | tip them in | heavy: slow and loud |
| Open the safe | the code (read aloud by a friend elsewhere) | turn the dial | two players, by voice |
| Play the gramophone | the record (a guest room) | set the needle | breaks if you are downed carrying it; while it plays, the ghost is calmer for 30 s |
| Wake the clock | the winding key (random room) | wind it to the time in the guest book | as today, with an errand first |
| Water the roses | a bucket from the pump | fill the vase to the number | spills if you run |
| Fix the switchboard | the operator's notes (any office) | plug the cables | the notes say which number to connect |

## 2. Random clues ("who was the ghost?")

- **Recommended: random every night, put together by the game from parts, not written by an AI
  while you play.** A live AI would cost money every night, need the internet, be slow, and could
  say something wrong or unfair. Instead: a large pool of clue pieces (written with AI help now,
  checked once), shuffled every night.
- More suspects (6 to 8, each with a story), and each night's clues come from a mix: the mirror's
  message, a torn diary page, a photo, a name scratched on a door, the gramophone's song.
- Which rooms hold clues changes every night, and some clues come out of the errands (the safe
  holds a letter).

## 3. "THE NURSE WAS POSSESSED": nobody knows who the Nurse is

- **Say the player's name** with the character: "RAFI (THE NURSE) WAS POSSESSED". The same in
  the relic status ("Dropped, last carried by Rafi") and in meetings.
- **Make each character readable at a glance**: a nurse's cap and apron, the priest's collar,
  the photographer's camera on a strap, the mechanic's overalls (Mixamo bodies plus props).

## 4. Relics that look ancient

- Replace the five with things that read old and cursed at once: a **tarnished silver locket**,
  a **cracked porcelain doll's head**, a **bone rosary**, a **black lacquer ring box with a wax
  seal**, a **rusted iron key on a ribbon** (made in Blender by script, free).
- Each glows faintly and whispers, so you also find them by sound.

## 5. Curing a possessed friend: recommended, as a risky gamble

Why: today a caught friend becomes a Wisp and mostly sits out. A cure keeps them playing.

- **The Exorcism:** one **vial of holy water** is hidden in the hotel each night. Bring a suspect
  into the ritual circle and pour it on them (hold E for 5 s while they stand in the circle; they
  can walk away, which is itself suspicious).
- **If they were possessed:** they are freed and become an investigator for the rest of the
  night; their powers are gone, and the ghost becomes Furious (it lost its helper).
- **If they were innocent:** the holy water is wasted, and the ghost is summoned on the circle at
  once.
- One vial per night, so it is a real decision, not a test you run on everyone.

## Order of work

1. Owner answers the questions below; the answers go in GDD 26.
2. Carrying things (pick up, hold in the hand, drop, hand over), on the server and in the game.
3. The first 4 errands, played through by bots; then the other 4.
4. Players' names on the end screen, in meetings and in the relic status (small and quick).
5. Random clues from a pool.
6. Character props, then the new relics (art).
7. The exorcism, if approved.

## Questions for the owner

1. The new tasks change the rules, so the server (shared with the browser version) changes too.
   All right that the browser version falls behind and only the Unity game gets them?
2. Do the 8 errands sound right? Any you want added or dropped?
3. The exorcism as described (one holy water, risky): yes or no?
