import type { Room } from "@colyseus/sdk";
import { characterById, config, presetOf, SETTING_OPTIONS, type MatchSettings, type ServerMessages } from "@haunted/shared";

// The room screen and the room settings screen (GDD 5, 20): the players, Ready, the host's
// settings and kick. Characters are dealt at random each night (GDD 26.14), so they show here once
// the night starts. Everything comes from the room state, so every player sees the same thing.

interface Row {
  key: keyof MatchSettings;
  label: string;
  unit?: string;
}

const BASIC: Row[] = [
  { key: "lengthMin", label: "Match length", unit: "min" },
  { key: "possessed", label: "Number of possessed" },
  { key: "difficulty", label: "Ghost difficulty" },
];

const ADVANCED: { group: string; rows: Row[] }[] = [
  {
    group: "Objectives",
    rows: [
      { key: "relics", label: "Relics" },
      { key: "tasksPerPlayer", label: "Tasks per player" },
      { key: "ritualSec", label: "Ritual length", unit: "s" },
      { key: "circle", label: "Players needed in circle" },
      { key: "mystery", label: "Who was the ghost?" },
    ],
  },
  {
    group: "Possessed",
    rows: [
      { key: "knowEachOther", label: "Possessed know each other" },
      { key: "cooldownSpeed", label: "Power cooldown speed" },
      { key: "blackout", label: "Blackout" },
    ],
  },
  {
    group: "Items",
    rows: [
      { key: "cameraShots", label: "Camera shots per player" },
      { key: "saltPerPlayer", label: "Salt per player" },
    ],
  },
  {
    group: "Meetings",
    rows: [
      { key: "bellUses", label: "Bell uses per player" },
      { key: "evidenceSec", label: "Evidence time", unit: "s" },
      { key: "discussionSec", label: "Discussion time", unit: "s" },
      { key: "voteSec", label: "Voting time", unit: "s" },
      { key: "revealRole", label: "Reveal role when removed" },
      { key: "anonymousVoting", label: "Anonymous voting" },
    ],
  },
  { group: "Voice", rows: [{ key: "ghostHearsMic", label: "Ghost hears real mic" }] },
  {
    group: "The dead",
    rows: [
      { key: "wispTasks", label: "Wisps can do tasks" },
      { key: "ouija", label: "Ouija board" },
    ],
  },
];

const PRESETS = [
  { id: "standard", label: "Standard" },
  { id: "beginner", label: "Beginner" },
  { id: "hardcore", label: "Hardcore" },
] as const;

const STAGE_TEXT: Record<string, string> = {
  waiting: "Lobby",
  countdown: "Starting",
  intro: "Starting",
  night: "Night in progress",
};

function optionText(value: unknown, unit?: string): string {
  if (value === true) return "On";
  if (value === false) return "Off";
  if (value === "auto") return "Auto";
  if (typeof value === "string") return value[0]!.toUpperCase() + value.slice(1);
  return unit ? `${value} ${unit}` : String(value);
}

/** The settings in one line, for the room screen: "Standard · 15 min · Auto possessed · Normal ghost". */
function settingsSummary(s: MatchSettings): string {
  const preset = presetOf(s);
  const name = PRESETS.find((p) => p.id === preset)?.label ?? "Custom";
  const possessed = s.possessed === "auto" ? "Possessed: auto" : `${s.possessed} possessed`;
  return `${name} · ${s.lengthMin} min · ${possessed} · ${optionText(s.difficulty)} ghost`;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface LobbyPlayer {
  name: string;
  character: string;
  ready: boolean;
  connected: boolean;
}

export interface LobbyHooks {
  isMuted(id: string): boolean;
  toggleMute(id: string): void;
}

/** Builds the room and settings screens for a joined room and keeps them in step with the room state. */
export function lobbyView(room: Room, hooks: LobbyHooks) {
  const playerList = el("players");
  const playerCount = el("player-count");
  const stageChip = el("stage-chip");
  const youBox = el("you-box");
  const readyBtn = el<HTMLButtonElement>("ready-btn");
  const readyHint = el("ready-hint");
  const settingsCodes = [el("settings-code"), el("settings-code-2")];
  const summary = el("settings-summary");
  const openSettings = el<HTMLButtonElement>("open-settings");
  const settingsNote = el("settings-note");
  const presets = el("presets");
  const basic = el("settings-basic");
  const advanced = el("settings-advanced");
  const selects = new Map<keyof MatchSettings, HTMLSelectElement>();

  readyHint.textContent = "";
  room.onMessage("lobbyRefused", (msg: ServerMessages["lobbyRefused"]) => {
    readyHint.textContent = msg.reason;
  });
  readyBtn.onclick = () => {
    readyHint.textContent = "";
    const me = room.state.players?.get(room.sessionId);
    room.send("ready", { ready: !me?.ready });
  };

  // Basic and Advanced tabs.
  const tabs = [
    { tab: el<HTMLButtonElement>("tab-basic"), panel: basic },
    { tab: el<HTMLButtonElement>("tab-advanced"), panel: advanced },
  ];
  for (const t of tabs) {
    t.tab.onclick = () => {
      for (const other of tabs) {
        const on = other === t;
        other.tab.classList.toggle("on", on);
        other.tab.setAttribute("aria-selected", String(on));
        other.panel.classList.toggle("hidden", !on);
      }
    };
  }

  // Settings (GDD 20): one dropdown per setting, enabled for the host in the lobby.
  const row = (r: Row) => {
    const label = document.createElement("label");
    label.className = "setting";
    const name = document.createElement("span");
    name.textContent = r.label;
    const select = document.createElement("select");
    (SETTING_OPTIONS[r.key] as readonly unknown[]).forEach((value, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = optionText(value, r.unit);
      select.append(o);
    });
    select.onchange = () => {
      const value = (SETTING_OPTIONS[r.key] as readonly unknown[])[Number(select.value)];
      room.send("settings", { change: { [r.key]: value } });
    };
    selects.set(r.key, select);
    label.append(name, select);
    return label;
  };
  const mapLine = document.createElement("p");
  mapLine.className = "setting map-line";
  basic.replaceChildren(mapLine, ...BASIC.map(row));
  // One block per group, side by side on a wide page.
  advanced.replaceChildren(
    ...ADVANCED.map((g) => {
      const block = document.createElement("div");
      block.className = "set-group";
      const h = document.createElement("h4");
      h.textContent = g.group;
      block.append(h, ...g.rows.map(row));
      return block;
    }),
  );
  const presetButtons = PRESETS.map((p) => {
    const b = document.createElement("button");
    b.className = "seg";
    b.textContent = p.label;
    b.onclick = () => room.send("settings", { preset: p.id });
    return { id: p.id, b };
  });
  const custom = document.createElement("span");
  custom.className = "seg custom";
  custom.textContent = "Custom";
  custom.title = "Shown when the settings match no preset";
  presets.replaceChildren(...presetButtons.map((p) => p.b), custom);

  let playersKey = "";
  let settingsKey = "";
  room.onStateChange((state: any) => {
    const lobby = state.stage === "waiting";
    const isHost = state.host === room.sessionId;
    const players: (LobbyPlayer & { id: string })[] = [];
    state.players?.forEach((p: LobbyPlayer, id: string) =>
      players.push({ id, name: p.name, character: p.character, ready: p.ready, connected: p.connected }),
    );
    const me = players.find((p) => p.id === room.sessionId);

    const key = JSON.stringify([players, state.host, state.stage, state.winner]);
    if (key !== playersKey) {
      playersKey = key;
      stageChip.textContent = state.winner ? "Night over" : (STAGE_TEXT[state.stage] ?? "");
      stageChip.dataset.stage = state.winner ? "over" : state.stage;
      playerCount.textContent = `${players.length} / ${config.players.max}`;
      playerList.replaceChildren(...players.map((p) => playerRow(room, p, { canKick: isHost && lobby, lobby, host: state.host }, hooks)));
      // The host's Start counts as their Ready (GDD 26.14), so only guests get the button.
      youBox.classList.toggle("hidden", isHost || (state.stage !== "waiting" && state.stage !== "countdown"));
      readyBtn.textContent = me?.ready ? "Ready ✓  (press to cancel)" : "I'm ready";
      readyBtn.classList.toggle("is-ready", !!me?.ready);
    }

    const skey = `${state.settings}|${isHost}|${lobby}`;
    if (state.settings && skey !== settingsKey) {
      settingsKey = skey;
      const s = JSON.parse(state.settings) as MatchSettings;
      for (const c of settingsCodes) c.textContent = state.settingsCode;
      summary.textContent = settingsSummary(s);
      mapLine.replaceChildren(Object.assign(document.createElement("span"), { textContent: "Map" }), Object.assign(document.createElement("strong"), { textContent: "Marrow Hotel" }));
      const canEdit = isHost && lobby;
      openSettings.textContent = canEdit ? "Change settings" : "See all settings";
      const preset = presetOf(s);
      for (const p of presetButtons) {
        p.b.classList.toggle("on", p.id === preset);
        p.b.setAttribute("aria-pressed", String(p.id === preset));
        p.b.disabled = !canEdit;
      }
      custom.classList.toggle("on", preset === "custom");
      for (const [k, select] of selects) {
        select.value = String((SETTING_OPTIONS[k] as readonly unknown[]).indexOf(s[k]));
        select.disabled = !canEdit;
      }
      settingsNote.textContent = isHost
        ? lobby
          ? "You are the host. Pick a preset, or change anything: everyone sees it at once."
          : "Settings are locked for this night."
        : "Only the host can change the settings. You see them as they change.";
    }
  });
}

function playerRow(
  room: Room,
  p: LobbyPlayer & { id: string },
  where: { canKick: boolean; lobby: boolean; host: string },
  hooks: LobbyHooks,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "player";
  li.classList.toggle("away", !p.connected);
  const character = characterById(p.character);
  // A round badge with the first letter; the character's colour once one is dealt.
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = (p.name.trim()[0] ?? "?").toUpperCase();
  if (character) avatar.style.setProperty("--colour", character.colour);
  avatar.title = character?.name ?? "Character dealt when the night starts";
  const who = document.createElement("span");
  who.className = "who";
  const name = document.createElement("span");
  name.className = "player-name";
  name.textContent = p.name;
  const tags = document.createElement("span");
  tags.className = "tags";
  const tag = (text: string, cls = "") => tags.append(Object.assign(document.createElement("span"), { className: `tag ${cls}`, textContent: text }));
  if (p.id === room.sessionId) tag("You");
  if (p.id === where.host) tag("Host");
  if (!p.connected) tag("Reconnecting…", "warn");
  if (character) tag(character.name.replace(/^The /, ""), "char");
  who.append(name, tags);
  li.append(avatar, who);
  if (where.lobby && p.id !== where.host) {
    const ready = document.createElement("span");
    ready.className = `ready-mark${p.ready ? " on" : ""}`;
    ready.textContent = p.ready ? "Ready" : "Not ready";
    li.append(ready);
  }
  if (p.id !== room.sessionId) {
    const actions = document.createElement("span");
    actions.className = "row-actions";
    // Mute only changes what you hear (PRD FR-V6).
    const mute = document.createElement("button");
    mute.className = "row-btn";
    mute.textContent = hooks.isMuted(p.id) ? "Unmute" : "Mute";
    mute.onclick = () => {
      hooks.toggleMute(p.id);
      mute.textContent = hooks.isMuted(p.id) ? "Unmute" : "Mute";
    };
    actions.append(mute);
    if (where.canKick) {
      // A second click confirms (GDD 26.14).
      const kick = document.createElement("button");
      kick.className = "row-btn kick";
      kick.textContent = "Remove";
      kick.onclick = () => {
        if (kick.dataset.armed) room.send("kick", { target: p.id });
        else {
          kick.dataset.armed = "1";
          kick.textContent = "Sure?";
        }
      };
      actions.append(kick);
    }
    li.append(actions);
  }
  return li;
}

/** A join error in words a player understands (FR-L9). */
export function joinErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : "";
  if (/full|locked|maxClients/i.test(text)) return `This room is full (${config.players.max} players) or its night has started.`;
  if (/not found|invalid|no rooms/i.test(text)) return "No room has that code. Check the code and try again.";
  return text || "Could not connect to the server.";
}
