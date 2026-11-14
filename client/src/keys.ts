// Remappable keys (GDD 23 accessibility): every action's key can be changed in Options and is
// remembered on this computer. The mouse button (flashlight, photo, your hand) and Esc stay fixed.

export type KeyAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "run"
  | "crouch"
  | "use"
  | "drop"
  | "status"
  | "flashlight"
  | "camera"
  | "salt"
  | "powers"
  | "floatUp";

/** The actions in the order Options lists them, with what each does. */
export const KEY_ACTIONS: readonly { action: KeyAction; label: string }[] = [
  { action: "forward", label: "Move forward" },
  { action: "back", label: "Move back" },
  { action: "left", label: "Move left" },
  { action: "right", label: "Move right" },
  { action: "run", label: "Run (5 s of stamina); hold your breath when hidden" },
  { action: "crouch", label: "Crouch (quiet and slow); a Wisp floats down" },
  { action: "use", label: "Use: doors, salt, relics, tasks, searching; hold to revive, hide, report, ring the bell" },
  { action: "drop", label: "Drop the relic you carry" },
  { action: "status", label: "Hold for the map and relic status" },
  { action: "flashlight", label: "Flashlight on / off (also the mouse button)" },
  { action: "camera", label: "Raise the Spirit Camera, then click" },
  { action: "salt", label: "Pour a salt line" },
  { action: "powers", label: "Hold for the possessed's powers" },
  { action: "floatUp", label: "A Wisp floats up" },
];

export const DEFAULT_KEYS: Readonly<Record<KeyAction, string>> = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  run: "ShiftLeft",
  crouch: "KeyC",
  use: "KeyE",
  drop: "KeyG",
  status: "Tab",
  flashlight: "Digit1",
  camera: "Digit2",
  salt: "Digit3",
  powers: "KeyR",
  floatUp: "Space",
};

/** Keys that can never be bound: Esc frees the mouse, and the debug keys stay where they are. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(["Escape", "KeyL", "KeyK", "KeyB"]);

const STORAGE_KEY = "keyBindings";

/** Left and right modifier keys count as the same key. */
function side(code: string): string {
  return code.replace(/(Left|Right)$/, "");
}

export class KeyBindings {
  private map: Record<KeyAction, string>;

  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()) {
    this.map = { ...DEFAULT_KEYS };
    try {
      const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? "{}") as Partial<Record<KeyAction, string>>;
      for (const { action } of KEY_ACTIONS) {
        const code = saved[action];
        if (typeof code === "string" && code && !RESERVED_KEYS.has(code)) this.map[action] = code;
      }
    } catch {
      // A damaged save: keep the defaults.
    }
  }

  /** True if this key code is the one bound to the action. */
  is(code: string, action: KeyAction): boolean {
    return side(code) === side(this.map[action]);
  }

  code(action: KeyAction): string {
    return this.map[action];
  }

  /**
   * Binds a key to an action. A key already used by another action swaps over to this action's old
   * key, so no action is ever left without one. Returns false for a reserved key.
   */
  set(action: KeyAction, code: string): boolean {
    if (RESERVED_KEYS.has(code)) return false;
    const old = this.map[action];
    for (const { action: other } of KEY_ACTIONS) {
      if (other !== action && side(this.map[other]) === side(code)) this.map[other] = old;
    }
    this.map[action] = code;
    this.save();
    return true;
  }

  reset() {
    this.map = { ...DEFAULT_KEYS };
    this.save();
  }

  private save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.map));
    } catch {
      // Storage blocked: the change lasts until the page closes.
    }
  }

  /** What to call the action's key on screen, e.g. "E", "Shift", "Space", "2". */
  name(action: KeyAction): string {
    return keyName(this.map[action]);
  }

  /**
   * Rewrites a hint written with the default keys ("Hold E  Hide", "G to drop") to name the keys
   * this player uses.
   */
  hint(text: string): string {
    // Mark every key first and name them after, so a key renamed to another default key's name
    // (E bound to Shift, say) is not renamed twice.
    const mark = (action: KeyAction) => `\u0001${action}\u0001`;
    return text
      .replace(/^(Hold )?E {2}/, (_m, hold: string | undefined) => `${hold ?? ""}${mark("use")}  `)
      .replace(/\b([Hh]old) E\b/g, (_m, hold: string) => `${hold} ${mark("use")}`)
      .replace(/\b([Hh]old) Shift\b/g, (_m, hold: string) => `${hold} ${mark("run")}`)
      .replace(/\bG to drop\b/g, `${mark("drop")} to drop`)
      .replace(/\b([Hh]old) R\b/g, (_m, hold: string) => `${hold} ${mark("powers")}`)
      .replace(/\u0001(\w+)\u0001/g, (_m, action: string) => this.name(action as KeyAction));
  }
}

export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5)} arrow`;
  const plain = side(code);
  return plain === "Control" ? "Ctrl" : plain === "Meta" ? "Win" : plain;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The one set of bindings the whole page uses. */
export const keys = new KeyBindings();
