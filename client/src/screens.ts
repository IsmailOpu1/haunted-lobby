// The menus are separate screens, shown one at a time (start, create, join, options, mic check,
// the room, its settings). Each screen is a <section class="screen" data-screen="name">.
// Moving between them adds a browser history step (#join, #options...), so the browser's Back
// button works like the Back buttons. The "root" screen is the start page before you join and the
// room once you are in one.

export class Screens {
  private readonly all = new Map<string, HTMLElement>();
  private root: string;
  private shown = "";
  private listeners: ((name: string) => void)[] = [];

  constructor(root: string) {
    this.root = root;
    for (const section of document.querySelectorAll<HTMLElement>("section.screen[data-screen]")) {
      this.all.set(section.dataset.screen!, section);
    }
    // Any button with data-go="name" opens that screen; data-back goes back one step.
    document.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-go], [data-back]");
      if (!target || (target as HTMLButtonElement).disabled) return;
      if (target.dataset.go) this.go(target.dataset.go);
      else this.back();
    });
    window.addEventListener("popstate", () => this.show(this.fromHash()));
  }

  get current(): string {
    return this.shown;
  }

  /** Called with the screen's name each time one is shown. */
  onShow(listener: (name: string) => void) {
    this.listeners.push(listener);
  }

  /** Opens a screen, as a new history step. */
  go(name: string) {
    if (!this.all.has(name) || name === this.shown) return;
    if (name === this.root) history.pushState({ screen: name }, "", location.pathname + location.search);
    else history.pushState({ screen: name }, "", `${location.pathname}${location.search}#${name}`);
    this.show(name);
  }

  /** One step back: through the browser history when we made the step, else to the root screen. */
  back() {
    if (history.state?.screen) history.back();
    else this.reset(this.root);
  }

  /** A new root (the room, once joined): shows it and drops any #screen from the address. */
  setRoot(name: string) {
    this.root = name;
    this.reset(name);
  }

  /** Shows a screen without adding a history step. */
  reset(name: string) {
    const hash = name === this.root ? "" : `#${name}`;
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
    this.show(name);
  }

  private fromHash(): string {
    const name = location.hash.slice(1);
    return this.all.has(name) && this.allowed(name) ? name : this.root;
  }

  /** Before joining, the room screens make no sense; once in a room, the start screens don't. */
  private allowed(name: string): boolean {
    const inRoom = this.root === "room";
    const roomOnly = name === "room" || name === "settings" || name === "mic";
    const startOnly = name === "start" || name === "create" || name === "join";
    return inRoom ? !startOnly : !roomOnly;
  }

  private show(name: string) {
    if (!this.allowed(name)) name = this.root;
    this.shown = name;
    for (const [n, section] of this.all) section.classList.toggle("hidden", n !== name);
    const section = this.all.get(name);
    section?.querySelector<HTMLElement>(".screen-body")?.scrollTo(0, 0);
    // Put the keyboard on the screen's first field, so typing works straight away.
    const field = section?.querySelector<HTMLInputElement>("input:not([type=range])");
    if (field && !field.value) field.focus({ preventScroll: true });
    for (const listener of this.listeners) listener(name);
  }
}
