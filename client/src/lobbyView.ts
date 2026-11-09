import type { Room } from "@colyseus/sdk";
import { CHARACTERS, characterById, config, presetOf, SETTING_OPTIONS, type MatchSettings, type ServerMessages } from "@haunted/shared";

// The lobby panel (GDD 5, 20, 22.1): characters, Ready, the host's settings, kick.
// Everything shown comes from the room state, so every player sees the same thing.

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

function optionText(value: unknown, unit?: string): string {
  if (value === true) return "On";
  if (value === false) return "Off";
  if (value === "auto") return "Auto";
  if (typeof value === "string") return value[0]!.toUpperCase() + value.slice(1);
  return unit ? `${value} ${unit}` : String(value);
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface LobbyPlayer {
  name: string;
  character: string;
  ready: boolean;
}

export interface LobbyHooks {
  isMuted(id: string): boolean;
  toggleMute(id: string): void;
}

/** Builds the lobby panel for a joined room and keeps it in step with the room state. */
export function lobbyView(room: Room, hooks: LobbyHooks) {
  const playerList = el("players");
  const characters = el("characters");
  const readyBtn = el<HTMLButtonElement>("ready-btn");
  const readyHint = el("ready-hint");
  const settingsCode = el("settings-code");
  const settingsNote = el("settings-note");
  const presets = el("presets");
  const basic = el("settings-basic");
  const advanced = el("settings-advanced");
  const selects = new Map<keyof MatchSettings, HTMLSelectElement>();

  readyHint.textContent = "";
  room.onMessage("lobbyRefused", (msg: ServerMessages["lobbyRefused"]) => {
    readyHint.textContent = msg.reason;
  });

  // Characters (GDD 22.1): one per player.
  const charButtons = new Map<string, HTMLButtonElement>();
  characters.replaceChildren(
    ...CHARACTERS.map((c) => {
      const b = document.createElement("button");
      b.className = "character small";
      b.title = c.look;
      b.style.setProperty("--colour", c.colour);
      b.textContent = c.name.replace(/^The /, "");
      b.onclick = () => room.send("character", { id: c.id });
      charButtons.set(c.id, b);
      return b;
    }),
  );
  readyBtn.onclick = () => {
    readyHint.textContent = "";
    const me = room.state.players?.get(room.sessionId);
    room.send("ready", { ready: !me?.ready });
  };

  // Settings (GDD 20): one dropdown per setting, enabled for the host in the lobby.
  const row = (r: Row) => {
    const label = document.createElement("label");
    label.className = "setting";
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
    label.append(r.label, select);
    return label;
  };
  const mapLine = document.createElement("p");
  mapLine.className = "setting";
  basic.replaceChildren(mapLine, ...BASIC.map(row));
  advanced.replaceChildren(
    ...ADVANCED.flatMap((g) => {
      const h = document.createElement("h3");
      h.textContent = g.group;
      return [h, ...g.rows.map(row)];
    }),
  );
  const presetButtons = PRESETS.map((p) => {
    const b = document.createElement("button");
    b.className = "small preset";
    b.textContent = p.label;
    b.onclick = () => room.send("settings", { preset: p.id });
    return { id: p.id, b };
  });
  const custom = document.createElement("span");
  custom.className = "preset custom";
  custom.textContent = "Custom";
  presets.replaceChildren(...presetButtons.map((p) => p.b), custom);

  let playersKey = "";
  let settingsKey = "";
  room.onStateChange((state: any) => {
    const lobby = state.stage === "waiting";
    const isHost = state.host === room.sessionId;
    const players: (LobbyPlayer & { id: string })[] = [];
    state.players?.forEach((p: LobbyPlayer, id: string) => players.push({ id, name: p.name, character: p.character, ready: p.ready }));
    const me = players.find((p) => p.id === room.sessionId);

    const key = JSON.stringify([players, state.host, state.stage]);
    if (key !== playersKey) {
      playersKey = key;
      playerList.replaceChildren(...players.map((p) => playerRow(room, p, isHost && lobby, hooks)));
      for (const [id, b] of charButtons) {
        const holder = players.find((p) => p.character === id);
        b.classList.toggle("mine", holder?.id === room.sessionId);
        b.disabled = !lobby || !!me?.ready || (!!holder && holder.id !== room.sessionId);
      }
      readyBtn.textContent = me?.ready ? "Not ready" : "Ready";
      readyBtn.classList.toggle("is-ready", !!me?.ready);
      readyBtn.disabled = state.stage !== "waiting" && state.stage !== "countdown";
    }

    const skey = `${state.settings}|${isHost}|${lobby}`;
    if (state.settings && skey !== settingsKey) {
      settingsKey = skey;
      const s = JSON.parse(state.settings) as MatchSettings;
      settingsCode.textContent = state.settingsCode;
      mapLine.textContent = "Map: Marrow Hotel";
      const preset = presetOf(s);
      for (const p of presetButtons) {
        p.b.classList.toggle("on", p.id === preset);
        p.b.disabled = !isHost || !lobby;
      }
      custom.classList.toggle("on", preset === "custom");
      for (const [k, select] of selects) {
        select.value = String((SETTING_OPTIONS[k] as readonly unknown[]).indexOf(s[k]));
        select.disabled = !isHost || !lobby;
      }
      settingsNote.textContent = isHost ? (lobby ? "You are the host: you choose the settings." : "Settings are locked for this night.") : "Only the host can change the settings.";
    }
  });
}

function playerRow(room: Room, p: LobbyPlayer & { id: string }, canKick: boolean, hooks: LobbyHooks): HTMLLIElement {
  const li = document.createElement("li");
  const character = characterById(p.character);
  const dot = document.createElement("span");
  dot.className = "char-dot";
  dot.style.background = character?.colour ?? "transparent";
  dot.title = character?.name ?? "No character yet";
  const name = document.createElement("span");
  name.textContent = p.id === room.sessionId ? `${p.name} (you)` : p.name;
  const ready = document.createElement("span");
  ready.className = `ready-mark${p.ready ? " on" : ""}`;
  ready.textContent = p.ready ? "Ready" : "Not ready";
  li.append(dot, name, " ", ready);
  if (p.id !== room.sessionId) {
    // Mute only changes what you hear (PRD FR-V6).
    const mute = document.createElement("button");
    mute.className = "mute";
    mute.textContent = hooks.isMuted(p.id) ? "Unmute" : "Mute";
    mute.onclick = () => {
      hooks.toggleMute(p.id);
      mute.textContent = hooks.isMuted(p.id) ? "Unmute" : "Mute";
    };
    li.append(" ", mute);
    if (canKick) {
      // A second click confirms (GDD 26.14).
      const kick = document.createElement("button");
      kick.className = "mute kick";
      kick.textContent = "Remove";
      kick.onclick = () => {
        if (kick.dataset.armed) room.send("kick", { target: p.id });
        else {
          kick.dataset.armed = "1";
          kick.textContent = "Sure?";
        }
      };
      li.append(" ", kick);
    }
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
