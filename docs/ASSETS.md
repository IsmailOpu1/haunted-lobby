# Assets and licences

Every file the game ships that was not written for this project: where it came from, who made it, and the licence that lets a free online game use it (Phase 8 plan, Section 4: CC0 first, CC-BY with credit only if needed). Anything new goes in this list in the same change that adds it.

Checked 2026-11-10 against each asset's public page (`https://polyhaven.com/a/<id>`). Poly Haven publishes everything under **CC0** (public domain): no credit required, credited here anyway.

## Models (Poly Haven, CC0)

Source files in `assets-src/models/<id>/`; the game gets them inside the built rooms (`client/public/assets/rooms`, textures in `client/public/assets/textures` and `textures-1k`).

| Id | Name | Authors | Used for |
|---|---|---|---|
| `ArmChair_01` | Arm Chair 01 | Kirill Sannikov | Main Hall |
| `Chandelier_01` | Chandelier 01 | Kirill Sannikov | Main Hall |
| `ClassicConsole_01` | Classic Console 01 | Kirill Sannikov | Main Hall |
| `CoffeeTable_01` | Coffee Table 01 | Fernando Quinn | Main Hall |
| `GothicCabinet_01` | Gothic Cabinet 01 | Kirill Sannikov | Not used yet |
| `GreenChair_01` | Green Chair 01 | Kirill Sannikov | Main Hall |
| `Ottoman_01` | Ottoman 01 | Caspian Fortune | Main Hall |
| `Sofa_01` | Sofa 01 | Kirill Sannikov | Main Hall |
| `antique_ceramic_vase_01` | Antique Ceramic Vase 01 | James Ray Cock | Main Hall |
| `book_encyclopedia_set_01` | Book Encyclopedia Set 01 | John Malcolm | Main Hall |
| `brass_candleholders` | Brass Candleholders | Tina | Main Hall (meeting table) |
| `dining_table` | Dining Table | Aron Łyczek | Not used (replaced by the built banquet table) |
| `fancy_picture_frame_01` | Fancy Picture Frame 01 | Rob Tuytel, Rico Cilliers | Main Hall |
| `fancy_picture_frame_02` | Fancy Picture Frame 02 | Rob Tuytel, Rico Cilliers | Main Hall |
| `gothic_coffee_table` | Gothic Coffee Table | Ulan Cabanilla | Main Hall |
| `mantel_clock_01` | Mantel Clock 01 | Yann Kervran, Rico Cilliers | Main Hall |
| `marble_bust_01` | Marble Bust 01 | Rico Cilliers | Main Hall |
| `ornate_mirror_01` | Ornate Mirror 01 | James Ray Cock | Main Hall |
| `potted_plant_01` | Potted Plant 01 | Rico Cilliers | Main Hall |
| `potted_plant_02` | Potted Plant 02 | Rico Cilliers | Main Hall |
| `side_table_01` | Side Table 01 | James Ray Cock | Main Hall |
| `sofa_03` | Sofa 03 | Fran Calvente | Main Hall |
| `standing_picture_frame_01` | Standing Picture Frame 01 | James Ray Cock | Main Hall |
| `throw_pillows_01` | Throw Pillows 01 | Serhii Khromov | Not used yet |
| `vintage_flashlight` | Vintage Flashlight | Omar M. El-Safy | Not used (the owner wanted a hand torch, not a lantern on a stand) |
| `vintage_grandfather_clock_01` | Vintage Grandfather Clock 01 | Yann Kervran, James Ray Cock | Main Hall: the clock station (case baked into the room; its hands exported on their own) |
| `vintage_oil_lamp` | Vintage Oil Lamp | Monsta3D | Main Hall |
| `vintage_suitcase` | Vintage Suitcase | Maximilian Schuster | Main Hall |
| `wooden_candlestick` | Wooden Candlestick | Josh Dean | Main Hall |

## Textures (Poly Haven, CC0)

Source files in `assets-src/textures/<id>/` (2K JPG).

| Id | Name | Authors | Used for |
|---|---|---|---|
| `dark_paneled_wood` | Dark Paneled Wood | Dimitrios Savva | Main Hall wainscot, wardrobes |
| `dark_wood` | Dark Wood | Dario Barresi, Dimitrios Savva, Rico Cilliers | Banquet table, bell pedestal, stair treads and risers |
| `decrepit_wallpaper` | Decrepit Wallpaper | Rob Tuytel | Main Hall walls |
| `dirty_carpet` | Dirty Carpet | Rohit Seervi | Main Hall rugs, stair runners |
| `herringbone_parquet` | Herringbone Parquet | Jenelle van Heerden, Sergej Majboroda | Main Hall floor |
| `marble_01` | Marble 01 | Rob Tuytel | Not used yet |
| `worn_cracked_plaster` | Worn Cracked Plaster | Amal Kumar | Main Hall ceiling |

## Made for this project

No outside licence; part of this project.

| What | How it is made |
|---|---|
| Hand torch (`assets-src/models/hand_torch`) | Modelled and textured by script: `tools/art/blender/build_torch.py` |
| Your hand and coat sleeve holding the torch (`assets-src/models/held_torch`, `client/public/assets/held/held_torch.glb`) | `tools/art/blender/build_hand.py`: the right hand and forearm of MakeHuman's base human (CC0), made and rigged with the MPFB add-on, posed round the torch's grip by script; the sleeve built by script; skin, nails and wool baked from procedural shaders (nails placed with MPFB's CC0 nail mask) |
| Banquet table, hiding-spot wardrobes, room shells | Built by script in `tools/art/blender/build_room.py` from the map data |
| Meeting bell (brass bell on a turned pedestal) | Built by script in `tools/art/blender/build_room.py` (`meeting_bell`) |
| Stairwells (treads, runner, stair rods, panelling, handrail) | Built by script in `tools/art/blender/build_room.py` (`stairwell`) from the map's stairs |
| Grandfather clock window and hands (`client/public/assets/stations/clock_hands.glb`) | The case's window cut and glazed in `build_room.py` (`grandfather_clock`); the hands taken from the Poly Haven model by `tools/art/blender/build_clock_hands.py` |
| Room lightmaps | Baked in Blender (Cycles) from the room builds |

## Tools used to make assets (not shipped)

| What | Source | Licence |
|---|---|---|
| MPFB 2.0.18 (MakeHuman for Blender), installed only in `assets-src/blender-user` | static.makehumancommunity.org | Code GPL-3.0 (a tool, not shipped); its human mesh, rigs and textures CC0 |

## Fonts and code shipped with the client

| What | Source | Licence |
|---|---|---|
| Instrument Serif | Google Fonts, bundled through `@fontsource/instrument-serif` | SIL Open Font Licence 1.1 |
| Manrope | Google Fonts, bundled through `@fontsource-variable/manrope` | SIL Open Font Licence 1.1 |
| Basis Universal transcoder (`client/public/basis/`) | Binomial, copied from three.js (`examples/jsm/libs/basis`) | Apache 2.0 |
| three.js and its examples | npm `three` | MIT |

## Sounds

None yet (step 3: Sonniss free bundles and CC0 Freesound sounds, each listed here with its link).
