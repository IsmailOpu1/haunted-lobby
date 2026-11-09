// The 8 characters (GDD 22.1): looks only, no abilities. Until the Phase 8 models, each shows
// as its colour on the player's shadow and name tag.

export interface CharacterDef {
  id: string;
  name: string;
  /** What you recognise them by (GDD 22.1), shown in the lobby. */
  look: string;
  colour: string;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: "priest", name: "The Priest", look: "Long robe, holds a cross", colour: "#d8d2c0" },
  { id: "journalist", name: "The Journalist", look: "Long coat, notebook", colour: "#8fa7c9" },
  { id: "nurse", name: "The Nurse", look: "Cap, medicine bag", colour: "#e06b6b" },
  { id: "student", name: "The Student", look: "Backpack, school uniform", colour: "#6bb5e0" },
  { id: "detective", name: "The Detective", look: "Hat, trench coat", colour: "#c9a45a" },
  { id: "photographer", name: "The Photographer", look: "Big old camera on the chest", colour: "#a07ad6" },
  { id: "mechanic", name: "The Mechanic", look: "Overalls, toolbox", colour: "#e0913f" },
  { id: "caretaker", name: "The Caretaker", look: "Hunched back, lantern", colour: "#7fc47a" },
];

export function characterById(id: string): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}
