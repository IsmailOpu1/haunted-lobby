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

const NIGHT_PART_NAMES: Record<string, string> = {
  quiet: "Quiet",
  calm: "Calm",
  restless: "Restless",
  furious: "Furious",
  dawn: "Dawn",
};

const game = await Game.create(el<HTMLCanvasElement>("scene"), defaultMap, {
  // While the mouse is captured, hide the lobby panel so the 3D view is clear.
  setLooking: (looking) => document.body.classList.toggle("looking", looking),
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
  const name = readName();
  if (name) enter(() => createRoom({ name }));
});

joinBtn.addEventListener("click", () => {
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

  room.onMessage("system", (msg: ServerMessages["system"]) => addLogLine(msg.text));

  room.onMessage("roster", (msg: ServerMessages["roster"]) => {
    playerList.replaceChildren(
      ...msg.players.map((p) => {
        const li = document.createElement("li");
        li.textContent = p.sessionId === room.sessionId ? `${p.name} (you)` : p.name;
        return li;
      }),
    );
  });

  room.onLeave(() => {
    addLogLine("Disconnected from the server.");
  });
}
