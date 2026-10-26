import type { Room } from "@colyseus/sdk";
import {
  cleanPlayerName,
  config,
  isValidRoomCode,
  normalizeRoomCode,
  type ServerMessages,
} from "@haunted/shared";
import { defaultMap } from "@haunted/maps";
import { Game } from "./game.ts";
import { createRoom, joinRoom } from "./network.ts";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const menu = el("menu");
const lobby = el("lobby");
const nameInput = el<HTMLInputElement>("name");
const codeInput = el<HTMLInputElement>("code");
const createBtn = el<HTMLButtonElement>("create");
const joinBtn = el<HTMLButtonElement>("join");
const errorText = el("error");
const roomCodeText = el("room-code");
const copyCodeBtn = el<HTMLButtonElement>("copy-code");
const copyLinkBtn = el<HTMLButtonElement>("copy-link");
const playerList = el("players");
const log = el("log");

const staminaBar = el("stamina");
const staminaFill = el("stamina-fill");
const prompt = el("prompt");
const carrying = el("carrying");
const statusPanel = el("status-panel");
const relicList = el("relic-list");
const night = el("night");
const nightPartText = el("night-part");
const nightFill = el("night-fill");
const overlay = el("overlay");
const overlayTitle = el("overlay-title");
const overlayText = el("overlay-text");
const actionBox = el("action");
const actionLabel = el("action-label");
const actionFill = el("action-fill");
const banner = el("banner");
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
const micBox = el("mic");
const micFill = el("mic-fill");
const micStatus = el("mic-status");
const micSentence = el("mic-sentence");
const micCheckBtn = el<HTMLButtonElement>("mic-check");
const micLost = el("mic-lost");
const lookHint = el("look-hint");
const itemsBox = el("items");
const viewfinder = el("viewfinder");
const screenFlash = el("screen-flash");
const teamTasks = el("team-tasks");
const teamFill = el("team-fill");
const teamCount = el("team-count");
const ritualBox = el("ritual");
const ritualFill = el("ritual-fill");
const ritualLabel = el("ritual-label");
const ritualCount = el("ritual-count");
const taskList = el("task-list");

const NIGHT_PART_NAMES: Record<string, string> = {
  quiet: "Quiet",
  calm: "Calm",
  restless: "Restless",
  furious: "Furious",
  dawn: "Dawn",
  overtime: "Overtime",
};

const game = await Game.create(el<HTMLCanvasElement>("scene"), defaultMap, {
  // While the mouse is captured, hide the lobby panel so the 3D view is clear.
  setLooking: (looking) => {
    document.body.classList.toggle("looking", looking);
    if (looking) document.body.classList.remove("resume");
  },
  setStamina: (fraction) => {
    staminaBar.classList.toggle("hidden", fraction >= 1);
    staminaFill.style.width = `${Math.round(fraction * 100)}%`;
  },
  setPrompt: (text) => {
    prompt.classList.toggle("hidden", !text);
    prompt.textContent = text ?? "";
  },
  setNight: (part, fractionLeft) => {
    night.classList.remove("hidden");
    nightPartText.textContent = NIGHT_PART_NAMES[part] ?? part;
    nightFill.style.width = `${Math.round((1 - fractionLeft) * 100)}%`;
  },
  setStatus: (status) => {
    document.body.dataset.status = status.kind;
    overlay.classList.toggle("hidden", status.kind === "alive");
    if (status.kind === "downed") {
      overlayTitle.textContent = "You are down";
      overlayText.textContent = `A friend must hold E on you within ${Math.ceil(status.bleedLeft)} s. You can crawl.`;
    } else if (status.kind === "dead") {
      overlayTitle.textContent = "You died";
      overlayText.textContent = "Dead players will become Wisps in a later update.";
    } else if (status.kind === "hidden") {
      overlayTitle.textContent = "";
      overlayText.textContent = status.holdingBreath
        ? "Holding your breath"
        : status.breathCooldown > 0
          ? `Catching your breath (${Math.ceil(status.breathCooldown)} s)`
          : "Hidden. Hold Shift to hold your breath, hold E to step out.";
    }
  },
  setAction: (label, progress) => {
    actionBox.classList.toggle("hidden", !label);
    actionLabel.textContent = label ?? "";
    actionFill.style.width = `${Math.round(progress * 100)}%`;
  },
  showBanner: (text, seconds) => {
    banner.textContent = text;
    banner.classList.remove("hidden");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.add("hidden"), seconds * 1000);
  },
  setVoice: (state) => {
    micBox.classList.toggle("hidden", state.kind === "off");
    micStatus.classList.remove("error");
    micCheckBtn.classList.add("hidden");
    micSentence.classList.add("hidden");
    let canPlay = state.kind === "off" || state.kind === "ready";
    switch (state.kind) {
      case "connecting":
        micStatus.textContent = "Connecting voice chat...";
        break;
      case "no-mic":
        micStatus.textContent = "A microphone is required. Allow microphone access for this site, then reload the page.";
        micStatus.classList.add("error");
        break;
      case "failed":
        micStatus.textContent = "Voice chat could not connect. You can still play without voice.";
        micStatus.classList.add("error");
        canPlay = true;
        break;
      case "needs-check":
        micStatus.textContent = state.error ?? "Mic check: press the button and read the sentence below.";
        if (state.error) micStatus.classList.add("error");
        micSentence.classList.remove("hidden");
        micCheckBtn.classList.remove("hidden");
        break;
      case "checking":
        micStatus.textContent = "Listening... keep reading at your normal volume.";
        micSentence.classList.remove("hidden");
        break;
      case "ready":
        micStatus.textContent = "Mic check done. Remember: whisper to hide from the ghost.";
        break;
    }
    lookHint.textContent = canPlay ? "Click anywhere outside this box to play." : "Do the mic check before you play.";
  },
  setMicLevel: (level) => {
    micFill.style.width = `${Math.round(level * 100)}%`;
  },
  setMicLost: (lost) => micLost.classList.toggle("hidden", !lost),
  setItems: (salt, shots) => {
    const text = `Salt <strong>&times;${salt}</strong> (3) &nbsp; Camera <strong>&times;${shots}</strong> (2)`;
    if (itemsBox.innerHTML !== text) itemsBox.innerHTML = text;
  },
  setCameraRaised: (raised) => viewfinder.classList.toggle("hidden", !raised),
  flashScreen: () => {
    // Restart the fade: show white instantly, then let the transition fade it out.
    screenFlash.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => screenFlash.classList.remove("on")));
  },
  setTasks: (list) => {
    taskList.classList.toggle("hidden", list.length === 0);
    taskList.replaceChildren(
      ...list.map((t) => {
        const li = document.createElement("li");
        li.classList.toggle("done", t.done);
        const room = document.createElement("span");
        room.className = "room";
        room.textContent = ` (${t.room})`;
        li.append(t.name, room);
        return li;
      }),
    );
  },
  setTeamTasks: (done, total) => {
    teamTasks.classList.toggle("hidden", total === 0);
    teamFill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`;
    teamCount.textContent = `${done} / ${total}`;
  },
  setRitual: (r) => {
    ritualBox.classList.toggle("hidden", !r.ready && !r.started);
    const short = r.inCircle < r.needed;
    ritualBox.classList.toggle("draining", r.started && short && r.progress < 100);
    ritualLabel.textContent = r.started ? "Ritual" : "Ritual ready";
    ritualFill.style.width = `${Math.round(r.progress)}%`;
    ritualCount.textContent = r.started || !short ? `${r.inCircle} / ${r.needed} in the circle` : `Gather ${r.needed} at the altar (${r.inCircle} there)`;
  },
  setTaskMode: (mode) => {
    document.body.classList.toggle("in-task", mode === "in-task");
    document.body.classList.toggle("resume", mode === "resume");
  },
  setRelics: (list) => {
    const key = list.map((r) => `${r.name}|${r.status}`).join(";");
    if (relicList.dataset.key === key) return;
    relicList.dataset.key = key;
    relicList.replaceChildren(
      ...list.map((r) => {
        const li = document.createElement("li");
        const status = document.createElement("span");
        status.className = "relic-status";
        status.textContent = r.status;
        li.append(r.name, status);
        return li;
      }),
    );
  },
  showStatusPanel: (open) => statusPanel.classList.toggle("hidden", !open),
  setCarrying: (name) => {
    carrying.classList.toggle("hidden", !name);
    const text = name ? `Carrying ${name} (G to drop)` : "";
    if (carrying.textContent !== text) carrying.textContent = text;
  },
}, {
  root: el("task-overlay"),
  canvas: el<HTMLCanvasElement>("task-canvas"),
  title: el("task-title"),
  hint: el("task-hint"),
  leave: el<HTMLButtonElement>("task-leave"),
});

// After a task, Esc shows the room panel instead of the "click to keep playing" hint.
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && !e.defaultPrevented) document.body.classList.remove("resume");
});

micCheckBtn.addEventListener("click", () => game.startMicCheck());

// Sound volume, remembered between visits (default 70%).
const DEFAULT_VOLUME = 70;
const volumeInput = el<HTMLInputElement>("volume");
let savedVolume = DEFAULT_VOLUME;
try {
  const stored = Number(localStorage.getItem("volume"));
  if (localStorage.getItem("volume") !== null && Number.isFinite(stored)) savedVolume = stored;
} catch {
  // Storage blocked: use the default.
}
volumeInput.value = String(savedVolume);
game.setVolume(savedVolume / 100);
volumeInput.addEventListener("input", () => {
  const value = Number(volumeInput.value);
  game.setVolume(value / 100);
  try {
    localStorage.setItem("volume", String(value));
  } catch {
    // Storage blocked: the setting lasts for this visit only.
  }
});

// Development only: lets the browser console inspect the game (window.__game). Not in builds.
if (import.meta.env.DEV) Object.assign(window, { __game: game });

// An invite link looks like https://site/?room=KQXRT. Prefill the code from it.
const linkCode = new URLSearchParams(location.search).get("room");
if (linkCode) codeInput.value = normalizeRoomCode(linkCode);

try {
  nameInput.value = localStorage.getItem("playerName") ?? "";
} catch {
  // Storage can be blocked (private windows). The name just isn't remembered.
}

function showError(message: string) {
  errorText.textContent = message;
}

function readName(): string | null {
  const name = cleanPlayerName(nameInput.value);
  if (!name) {
    showError(`Type a name (1 to ${config.room.nameMaxLength} characters).`);
    return null;
  }
  try {
    localStorage.setItem("playerName", name);
  } catch {
    // See above.
  }
  return name;
}

async function enter(connect: () => Promise<Room>) {
  showError("");
  createBtn.disabled = joinBtn.disabled = true;
  try {
    const room = await connect();
    enterLobby(room);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Could not connect to the server.");
  } finally {
    createBtn.disabled = joinBtn.disabled = false;
  }
}

createBtn.addEventListener("click", () => {
  game.unlockSound(); // a button click lets the browser start sound and voice
  const name = readName();
  if (name) enter(() => createRoom({ name }));
});

joinBtn.addEventListener("click", () => {
  game.unlockSound();
  const name = readName();
  if (!name) return;
  const code = normalizeRoomCode(codeInput.value);
  if (!isValidRoomCode(code)) {
    showError("Room codes are 5 letters, like KQXRT.");
    return;
  }
  enter(() => joinRoom(code, { name }));
});

async function copyToButton(button: HTMLButtonElement, text: string, done: string) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = done;
  } catch {
    // Clipboard can be blocked; show the text so it can be copied by hand.
    button.textContent = text;
  }
  setTimeout(() => (button.textContent = original), 2000);
}

function addLogLine(text: string) {
  const li = document.createElement("li");
  li.textContent = text;
  log.append(li);
  log.scrollTop = log.scrollHeight;
}

function enterLobby(room: Room) {
  menu.classList.add("hidden");
  lobby.classList.remove("hidden");
  game.attach(room);
  roomCodeText.textContent = room.roomId;
  history.replaceState(null, "", `?room=${room.roomId}`);

  const link = `${location.origin}${location.pathname}?room=${room.roomId}`;
  copyCodeBtn.onclick = () => copyToButton(copyCodeBtn, room.roomId, "Code copied");
  copyLinkBtn.onclick = () => copyToButton(copyLinkBtn, link, "Link copied");

  // Your own join message can arrive before this listener exists, so say it here.
  addLogLine("You joined the room");
  room.onMessage("system", (msg: ServerMessages["system"]) => {
    if (msg.kind === "join" && msg.name === nameInput.value.trim() && log.childElementCount <= 1) return;
    addLogLine(msg.text);
  });

  // The player list comes from the room state, which always arrives, rather than a message.
  let rosterKey = "";
  room.onStateChange((state: { players?: { forEach(cb: (p: { name: string }, id: string) => void): void } }) => {
    const players: { id: string; name: string }[] = [];
    state.players?.forEach((p, id) => players.push({ id, name: p.name }));
    const key = players.map((p) => p.id).join(",");
    if (key === rosterKey) return;
    rosterKey = key;
    playerList.replaceChildren(
      ...players.map((p) => {
        const li = document.createElement("li");
        li.textContent = p.id === room.sessionId ? `${p.name} (you)` : p.name;
        if (p.id !== room.sessionId) {
          // Mute only changes what you hear (PRD FR-V6).
          const mute = document.createElement("button");
          mute.className = "mute";
          const label = () => (mute.textContent = game.isMuted(p.id) ? "Unmute" : "Mute");
          label();
          mute.onclick = () => {
            game.toggleMute(p.id);
            label();
          };
          li.append(" ", mute);
        }
        return li;
      }),
    );
  });

  room.onLeave(() => {
    addLogLine("Disconnected from the server.");
  });
}
