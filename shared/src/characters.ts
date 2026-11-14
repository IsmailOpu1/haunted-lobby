// The 8 characters (GDD 22.1): looks only, no abilities. Nobody picks: each night everyone is
// dealt one at random (GDD 26.14). Each has a model (client/public/assets/characters, GDD 26.15);
// its colour marks it on the player list and the role reveal.

export interface CharacterDef {
  id: string;
  name: string;
  /** What you recognise them by (GDD 22.1), shown in the lobby. */
  look: string;
  colour: string;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: "priest", name: "The Priest", look: "Dark suit, purple stole, gold cross", colour: "#d8d2c0" },
  { id: "journalist", name: "The Journalist", look: "Striped jumper, satchel, notebook", colour: "#8fa7c9" },
  { id: "nurse", name: "The Nurse", look: "Nurse's cap, doctor's bag", colour: "#e06b6b" },
  { id: "student", name: "The Student", look: "Red T-shirt, backpack", colour: "#6bb5e0" },
  { id: "detective", name: "The Detective", look: "Fedora, magnifying glass", colour: "#c9a45a" },
  { id: "photographer", name: "The Photographer", look: "Big old box camera on the chest", colour: "#a07ad6" },
  { id: "mechanic", name: "The Mechanic", look: "Hard hat, hi-vis vest, toolbox", colour: "#e0913f" },
  { id: "caretaker", name: "The Caretaker", look: "Work apron, lantern", colour: "#7fc47a" },
];

export function characterById(id: string): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/**
 * Deals each player a different character at random (GDD 26.14). There are as many characters
 * as the most players a room holds, so nobody is ever left without one.
 */
export function dealCharacters(playerIds: readonly string[], random: () => number): Map<string, string> {
  const deck = CHARACTERS.map((c) => c.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return new Map(playerIds.map((id, i) => [id, deck[i % deck.length]!]));
}
