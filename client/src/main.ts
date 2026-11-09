import type { Room } from "@colyseus/sdk";
// The game's two fonts, bundled with it (style.css).
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource-variable/manrope";
import {
  characterById,
  cleanPlayerName,
  config,
  isValidRoomCode,
  normalizeRoomCode,
  type EndReason,
  type PowerStatus,
  type ServerMessages,
  SKIP,
  OUIJA_UNKNOWN,
} from "@haunted/shared";
import { defaultMap } from "@haunted/maps";
import { FloorPlan } from "./floorplan.ts";
import { Game, POWER_NAMES } from "./game.ts";
import { photoCard } from "./photoView.ts";
import { createRoom, joinRoom, reconnectRoom } from "./network.ts";
import { joinErrorText, lobbyView } from "./lobbyView.ts";
import { Screens } from "./screens.ts";

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// The menus: one screen at a time (screens.ts). The start page is home until you join a room.
const screens = new Screens("start");
/** Both name fields (Create and Join) hold the same remembered name. */
const nameInputs = [el<HTMLInputElement>("name"), el<HTMLInputElement>("join-name")];
const codeInput = el<HTMLInputElement>("code");
const createBtn = el<HTMLButtonElement>("create");
const joinBtn = el<HTMLButtonElement>("join");
const errorText = el("error");
const createError = el("create-error");
const joinError = el("join-error");
for (const input of nameInputs) {
  input.addEventListener("input", () => {
    for (const other of nameInputs) if (other !== input) other.value = input.value;
  });
}
// Enter in a field presses that screen's button.
nameInputs[0]!.addEventListener("keydown", (e) => e.key === "Enter" && createBtn.click());
for (const input of [nameInputs[1]!, codeInput]) input.addEventListener("keydown", (e) => e.key === "Enter" && joinBtn.click());
codeInput.addEventListener("input", () => {
  const at = codeInput.selectionStart;
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, "");
  codeInput.setSelectionRange(at, at);
});
const roomCodeText = el("room-code");
const copyCodeBtn = el<HTMLButtonElement>("copy-code");
const copyLinkBtn = el<HTMLButtonElement>("copy-link");
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
const nightBar = el("night-bar");
const nightLeft = el("night-left");
let nightPartShown = "";
const overlay = el("overlay");
const overlayTitle = el("overlay-title");
const overlayText = el("overlay-text");
const actionBox = el("action");
const actionLabel = el("action-label");
const actionFill = el("action-fill");
const banner = el("banner");
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
const micFill = el("mic-fill");
const micStatus = el("mic-status");
const micSentence = el("mic-sentence");
const micCheckBtn = el<HTMLButtonElement>("mic-check");
const micDone = el<HTMLButtonElement>("mic-done");
const optionsMic = el("options-mic");
const optionsMicStatus = el("options-mic-status");
/** The mic screen opens by itself once, the first time a check is needed in a room. */
let micScreenShown = false;
let inRoom = false;
let micNeeded = false;
let nightOn = false;
/** The line at the bottom of the room page: how to get into the hotel, or what is missing first. */
function showLookHint() {
  lookHint.textContent = micNeeded
    ? "Do the mic check before you play."
    : nightOn
      ? "The night goes on while this page is open. Esc brings it back."
      : "Walk around the hotel while you wait. Esc brings this page back.";
  lookHint.classList.toggle("warn", micNeeded);
}
const micLost = el("mic-lost");
const lookHint = el("look-hint");
const itemsBox = el("items");
const viewfinder = el("viewfinder");
const screenFlash = el("screen-flash");
const teamTasks = el("team-tasks");
const teamFill = el("team-fill");
const teamCount = el("team-count");
const endScreen = el("end-screen");
const endTitle = el("end-title");
const endText = el("end-text");
const endRoles = el("end-roles");
el("end-leave").addEventListener("click", () => {
  location.href = location.pathname;
});
const ritualBox = el("ritual");
const ritualFill = el("ritual-fill");
const ritualLabel = el("ritual-label");
const ritualCount = el("ritual-count");
const taskList = el("task-list");
const roomName = el("room-name");
const roomNameRoom = el("room-name-room");
const roomNameFloor = el("room-name-floor");
const soundCues = el("sound-cues");
const workHint = el("work-hint");
const startBtn = el<HTMLButtonElement>("start-night");
const startHint = el("start-hint");
const intro = el("intro");
const introTitle = el("intro-title");
const introText = el("intro-text");
const introExtra = el("intro-extra");
/** Your role once it is dealt (GDD 4.1), or null before. Only you are told it. */
let myRole: ServerMessages["role"] | null = null;
const floorPlan = new FloorPlan(defaultMap);
const powersBar = el("powers-bar");
const meetingBox = el("meeting");
/** The photos that developed last: the meeting's evidence. */
let newPhotos: ServerMessages["photosDeveloped"]["photos"] = [];
/** Which meeting the screen shows (its players and photos are built once, then updated). */
let meetingKey = "";
let meetingPlayers = "";
/** Where the planchette last moved: a name, "" for "I don't know", null before it moves. */
let ouijaTarget: string | null = null;

/** Puts the planchette over its name. Called with every meeting update, so it follows any rebuild or resize. */
function placePlanchette() {
  const planchette = el("planchette");
  planchette.classList.toggle("hidden", ouijaTarget === null);
  const slot = [...el("ouija-names").children].find((c) => (c as HTMLElement).dataset.name === ouijaTarget) as HTMLElement | undefined;
  const board = planchette.parentElement!.getBoundingClientRect();
  const at = slot?.getBoundingClientRect();
  // Not laid out yet (the board is hidden): try again on the next update.
  if (!at || at.width === 0) return;
  const left = `${Math.round(at.left - board.left + at.width / 2)}px`;
  const top = `${Math.round(at.top - board.top + at.height / 2)}px`;
  if (planchette.style.left !== left) planchette.style.left = left;
  if (planchette.style.top !== top) planchette.style.top = top;
}
const powerWheel = el("power-wheel");
// How far from the centre the power names sit, in % of the wheel.
const WHEEL_RADIUS_PCT = 33;
el("floor-plan").append(floorPlan.element);

/** How long the room name stays up after you walk into a room. */
const ROOM_NAME_SEC = 3;
let shownRoom = "";
let roomNameTimer: ReturnType<typeof setTimeout> | undefined;

/** End screen wording for each way a match ends (GDD 18). */
const END_TEXT: Record<EndReason, { title: string; why: string }> = {
  ritual: { title: "The sun rises. The investigators win.", why: "The ritual is complete." },
  dawn: { title: "Dawn. The possessed win.", why: "The ritual was not finished before dawn." },
  allDead: { title: "Nobody is left. The possessed win.", why: "Every investigator died." },
  outnumbered: { title: "The possessed win.", why: "The possessed now equal or outnumber the living investigators." },
};

const NIGHT_PART_NAMES: Record<string, string> = {
  quiet: "Quiet",
  calm: "Calm",
  restless: "Restless",
  furious: "Furious",
  dawn: "Dawn",
  overtime: "Overtime",
};

/** Said once as the night moves on, so nobody misses the ghost getting worse. */
const NIGHT_PART_BANNERS: Record<string, string> = {
  calm: "The ghost wakes.",
  restless: "The ghost grows restless. It hunts more often.",
  furious: "The ghost is furious. It hunts fast and often.",
  overtime: "Overtime: hold the circle and finish the ritual.",
};
const NIGHT_BANNER_SEC = 4;

function showBanner(text: string, seconds: number) {
  banner.textContent = text;
  banner.classList.remove("hidden");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.add("hidden"), seconds * 1000);
}

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
  setNight: (part, fractionLeft, secLeft, marks) => {
    night.classList.remove("hidden");
    night.dataset.part = part;
    nightPartText.textContent = NIGHT_PART_NAMES[part] ?? part;
    nightFill.style.width = `${Math.round((1 - fractionLeft) * 100)}%`;
    const left = Math.max(0, Math.ceil(secLeft));
    nightLeft.textContent = part === "dawn" ? "Dawn" : part === "overtime" ? "Dawn is here" : `Dawn in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (nightBar.querySelectorAll(".night-mark").length !== marks.length) {
      nightBar.querySelectorAll(".night-mark").forEach((m) => m.remove());
      for (const at of marks) {
        const mark = Object.assign(document.createElement("div"), { className: "night-mark" });
        mark.style.left = `${(at * 100).toFixed(1)}%`;
        nightBar.append(mark);
      }
    }
    if (part !== nightPartShown) {
      // Not on joining mid-night: only when the part changes while you watch.
      if (nightPartShown && NIGHT_PART_BANNERS[part]) showBanner(NIGHT_PART_BANNERS[part]!, NIGHT_BANNER_SEC);
      nightPartShown = part;
    }
  },
  setStatus: (status) => {
    document.body.dataset.status = status.kind;
    overlay.classList.toggle("hidden", status.kind === "alive");
    if (status.kind === "downed") {
      overlayTitle.textContent = "You are down";
      overlayText.textContent = `A friend must hold E on you within ${Math.ceil(status.bleedLeft)} s. You can crawl.`;
    } else if (status.kind === "dead") {
      overlayTitle.textContent = "You are a Wisp";
      overlayText.textContent = `Fly with W A S D, through walls. Space and C float up and down a floor.${config.wisps.canDoTasks ? " You can still do your tasks." : ""} Only other Wisps can hear you.`;
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
  setPowers: (list, curseLeft) => {
    powersBar.classList.toggle("hidden", !list);
    if (!list) return;
    const chips = list.map((p) => {
      const chip = document.createElement("span");
      chip.className = `power ${p.state}`;
      chip.textContent = `${POWER_NAMES[p.kind]} ${powerStateText(p)}`;
      return chip;
    });
    if (curseLeft > 0) {
      const curse = document.createElement("span");
      curse.className = "power curse";
      curse.textContent = `Curse glow ${Math.ceil(curseLeft)} s`;
      chips.push(curse);
    }
    powersBar.replaceChildren(...chips);
  },
  addPhotos: (photos) => {
    newPhotos = photos;
    el("meeting-photos").replaceChildren(...photos.map(photoCard));
    el("photos-box").classList.remove("hidden");
    el("photo-list").append(...photos.map(photoCard));
  },
  setMeeting: (m) => {
    document.body.classList.toggle("meeting", !!m);
    meetingBox.classList.toggle("hidden", !m);
    if (!m) {
      meetingKey = "";
      meetingPlayers = "";
      return;
    }
    const key = `${m.caller}|${m.body}`;
    if (key !== meetingKey) {
      meetingKey = key;
      el("meeting-title").textContent = m.body ? `${m.caller} reported ${m.body}'s body` : `${m.caller} rang the bell`;
      el("meeting-result").classList.add("hidden");
      el("ouija-log").textContent = "";
      ouijaTarget = null;
      // The photos shown are the ones that developed as this meeting began.
      if (newPhotos.length === 0) el("meeting-photos").replaceChildren();
      newPhotos = [];
    }
    el("meeting-step").textContent = `${MEETING_STEP_TEXT[m.step] ?? ""}  ${Math.ceil(m.secondsLeft)} s`;
    // Rebuilt only when it changes: the state comes 20 times a second, and a button replaced
    // between press and release loses the click.
    const players = JSON.stringify([m.players, m.canVote, m.ouija, m.canOuija]);
    if (players === meetingPlayers) return placePlanchette();
    meetingPlayers = players;
    // The Ouija board: one slot per living player and "I don't know"; a Wisp clicks one (GDD 17).
    el("ouija").classList.toggle("hidden", !m.ouija);
    el("ouija-names").replaceChildren(
      ...[...m.players.filter((p) => !p.dead).map((p) => ({ id: p.id, label: p.name })), { id: OUIJA_UNKNOWN, label: "I don't know" }].map((slot) => {
        const b = document.createElement("button");
        b.className = "ouija-slot";
        b.dataset.name = slot.id === OUIJA_UNKNOWN ? "" : slot.label;
        b.textContent = slot.label;
        b.disabled = !m.canOuija;
        b.onclick = () => game.pushOuija(slot.id);
        return b;
      }),
    );
    placePlanchette();
    el("meeting-players").replaceChildren(
      ...m.players.map((p) => {
        const li = document.createElement("li");
        li.classList.toggle("dead", p.dead);
        li.textContent = p.me ? `${p.name} (you)` : p.name;
        if (p.voted) li.append(Object.assign(document.createElement("span"), { className: "stamp", textContent: "Voted" }));
        if (m.canVote && !p.dead) {
          const btn = document.createElement("button");
          btn.className = "small";
          btn.textContent = "Vote";
          btn.onclick = () => game.vote(p.id);
          li.append(btn);
        }
        return li;
      }),
    );
    el("meeting-skip").classList.toggle("hidden", !m.canVote);
  },
  ouijaMove: (target) => {
    // The planchette slides onto the name (or "I don't know").
    ouijaTarget = target ?? "";
    placePlanchette();
    const log = el("ouija-log");
    log.textContent = `${log.textContent ? `${log.textContent}  ` : "The planchette moves: "}${target ?? "I don't know"}.`;
  },
  showMeetingResult: (r) => {
    const box = el("meeting-result");
    box.classList.remove("hidden");
    const verdict = document.createElement("strong");
    verdict.className = r.role === "possessed" ? "possessed" : "";
    if (!r.removed) verdict.textContent = r.skip > 0 ? "Nobody was removed." : "Nobody was removed: a tie.";
    else if (r.role) verdict.textContent = `${r.removed.toUpperCase()} WAS ${r.role === "possessed" ? "" : "NOT "}POSSESSED.`;
    else verdict.textContent = `${r.removed} is gone.`;
    const counts = document.createElement("p");
    counts.textContent = [...r.tally.map((t) => `${t.name} ${t.votes}`), `Skip ${r.skip}`].join(" · ");
    const votes = document.createElement("ul");
    for (const v of r.votes ?? []) votes.append(Object.assign(document.createElement("li"), { textContent: `${v.voter} voted ${v.target}` }));
    box.replaceChildren(verdict, counts, votes);
  },
  showPowerWheel: (wheel) => {
    powerWheel.classList.toggle("hidden", !wheel);
    if (!wheel) return;
    powerWheel.replaceChildren(
      ...wheel.powers.map((p, i) => {
        const sector = document.createElement("div");
        sector.className = `sector ${p.state}${wheel.selected === p.kind ? " selected" : ""}`;
        // Clockwise from the top, one equal slice each (game.ts wheelPick).
        const a = (i / wheel.powers.length) * Math.PI * 2;
        sector.style.left = `${50 + Math.sin(a) * WHEEL_RADIUS_PCT}%`;
        sector.style.top = `${50 - Math.cos(a) * WHEEL_RADIUS_PCT}%`;
        const name = document.createElement("strong");
        name.textContent = POWER_NAMES[p.kind];
        const state = document.createElement("span");
        state.textContent = powerStateText(p) || "Ready";
        sector.append(name, state);
        return sector;
      }),
      Object.assign(document.createElement("div"), { className: "wheel-hint", textContent: "Move the mouse, let go of R" }),
    );
  },
  showBanner,
  setVoice: (state) => {
    optionsMic.classList.toggle("hidden", state.kind === "off");
    micStatus.classList.remove("error");
    micCheckBtn.classList.add("hidden");
    micSentence.classList.remove("hidden");
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
        micStatus.textContent = state.error ?? "Press the button, then read the line out loud.";
        if (state.error) micStatus.classList.add("error");
        micCheckBtn.classList.remove("hidden");
        break;
      case "checking":
        micStatus.textContent = "Listening... keep reading at your normal volume.";
        break;
      case "ready":
        micStatus.textContent = "Mic check done. Remember: whisper to hide from the ghost.";
        micSentence.classList.add("hidden");
        break;
    }
    // A debug server lets you play without a mic; the ghost hears you as talking normally.
    if ((state.kind === "no-mic" || state.kind === "needs-check") && state.optional) {
      canPlay = true;
      const note = "This is a test server, so you can play without a mic (the ghost hears you as talking normally).";
      if (state.kind === "no-mic") {
        micStatus.classList.remove("error");
        micStatus.textContent = `No microphone. ${note}`;
      } else micStatus.textContent += ` Or skip it: ${note.charAt(0).toLowerCase()}${note.slice(1)}`;
    }
    micNeeded = !canPlay;
    showLookHint();
    optionsMicStatus.textContent = micStatus.textContent;
    // Done (or not needed): the way on is the main button. Not done yet: you can still come back later.
    micDone.textContent = canPlay ? "Continue to the room" : "Do it later";
    micDone.classList.toggle("primary", canPlay && state.kind !== "needs-check");
    micDone.classList.toggle("quiet", !(canPlay && state.kind !== "needs-check"));
    // The first time a check is needed (or a required mic is missing), the mic screen opens by itself.
    const needsAttention = state.kind === "needs-check" || (state.kind === "no-mic" && !canPlay);
    if (needsAttention && inRoom && !micScreenShown && screens.current === "room") {
      micScreenShown = true;
      screens.go("mic");
    }
  },
  setMicLevel: (level) => {
    micFill.style.width = `${Math.round(level * 100)}%`;
  },
  setMicLost: (lost) => micLost.classList.toggle("hidden", !lost),
  setItems: (salt, shots, bellUses) => {
    const text = `Salt <strong>&times;${salt}</strong> (3) &nbsp; Camera <strong>&times;${shots}</strong> (2) &nbsp; Bell <strong>&times;${bellUses}</strong>`;
    if (itemsBox.innerHTML !== text) itemsBox.innerHTML = text;
  },
  setCameraRaised: (raised) => viewfinder.classList.toggle("hidden", !raised),
  flashScreen: () => {
    // Restart the fade: show white instantly, then let the transition fade it out.
    screenFlash.classList.add("on");
    requestAnimationFrame(() => requestAnimationFrame(() => screenFlash.classList.remove("on")));
  },
  setTasks: (list) => {
    floorPlan.setTaskRooms(list.filter((t) => !t.done).map((t) => t.room));
    taskList.classList.toggle("hidden", list.length === 0);
    // The possessed's list is fake (GDD 9): a reminder that only they see.
    const note = document.createElement("li");
    note.className = "role-note";
    note.textContent = "Fake tasks: pretend to do them";
    taskList.replaceChildren(
      ...(myRole?.role === "possessed" ? [note] : []),
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
    ritualBox.classList.toggle("hidden", !r.ready && !r.started && !r.offering);
    if (r.offering && !r.started) {
      ritualLabel.textContent = "Who was the ghost?";
      ritualFill.style.width = "0%";
      ritualCount.textContent = "Offer the ghost's own belonging on the altar";
      return;
    }
    const short = r.inCircle < r.needed;
    ritualBox.classList.toggle("draining", r.started && short && r.progress < 100);
    ritualLabel.textContent = r.started ? "Ritual" : "Ritual ready";
    ritualFill.style.width = `${Math.round(r.progress)}%`;
    ritualCount.textContent = r.started || !short ? `${r.inCircle} / ${r.needed} in the circle` : `Gather ${r.needed} at the altar (${r.inCircle} there)`;
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
  newNight: () => {
    // A rematch (GDD 19): back to the lobby with a clean slate.
    endScreen.classList.add("hidden");
    document.body.classList.remove("ended");
    myRole = null;
    el("photos-box").classList.add("hidden");
    el("photo-list").replaceChildren();
  },
  showEndScreen: (end) => {
    const text = END_TEXT[end.reason];
    endScreen.classList.remove("hidden");
    document.body.classList.add("ended");
    endScreen.dataset.winner = end.winner;
    endTitle.textContent = text.title;
    endText.textContent = end.ghost ? `${text.why} The ghost was ${end.ghost}.` : text.why;
    endRoles.replaceChildren(
      ...end.roles.map((r) => {
        const li = document.createElement("li");
        const role = document.createElement("span");
        role.className = `end-role ${r.role}`;
        role.textContent = r.role === "possessed" ? "Possessed" : "Investigator";
        li.append(r.name, role);
        return li;
      }),
    );
    // Awards and the timeline (GDD 19).
    el("end-awards-box").classList.toggle("hidden", end.awards.length === 0);
    el("end-awards").replaceChildren(
      ...end.awards.map((a) => {
        const li = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = a.title;
        const why = document.createElement("span");
        why.className = "award-why";
        why.textContent = a.why;
        li.append(title, ` ${a.names.join(", ")} `, why);
        return li;
      }),
    );
    el("end-timeline-box").classList.toggle("hidden", end.timeline.length === 0);
    el("end-timeline").replaceChildren(
      ...end.timeline.map((l) => {
        const li = document.createElement("li");
        const time = document.createElement("span");
        time.className = "timeline-time";
        time.textContent = l.time;
        li.append(time, l.text);
        return li;
      }),
    );
    el("end-photos-box").classList.toggle("hidden", end.photos.length === 0);
    el("end-photos").replaceChildren(...end.photos.map(photoCard));
  },
  showStatusPanel: (open) => statusPanel.classList.toggle("hidden", !open),
  setWorkHint: (text) => {
    workHint.classList.toggle("hidden", !text);
    workHint.textContent = text ?? "";
  },
  setRoom: (room, floor) => {
    // In a doorway or on the stairs, keep the last room.
    if (!room || room === shownRoom) return;
    shownRoom = room;
    roomNameRoom.textContent = room;
    roomNameFloor.textContent = floor;
    roomName.classList.add("on");
    clearTimeout(roomNameTimer);
    roomNameTimer = setTimeout(() => roomName.classList.remove("on"), ROOM_NAME_SEC * 1000);
  },
  setPlanPosition: (x, z, yaw) => {
    if (!statusPanel.classList.contains("hidden")) floorPlan.setYou(x, z, yaw);
  },
  setSoundCues: (cues) => {
    while (soundCues.children.length > cues.length) soundCues.lastElementChild!.remove();
    cues.forEach((cue, i) => {
      let row = soundCues.children[i] as HTMLElement | undefined;
      if (!row) {
        row = document.createElement("div");
        row.className = "cue";
        row.innerHTML = '<svg class="cue-arrow" viewBox="-2 -2 4 4"><polygon points="0,-1.6 1.1,1.2 0,0.5 -1.1,1.2" /></svg><span class="cue-text"></span>';
        soundCues.append(row);
      }
      const text = cue.vertical ? `${cue.text} (${cue.vertical})` : cue.text;
      const label = row.querySelector(".cue-text")!;
      if (label.textContent !== text) label.textContent = text;
      const arrow = row.querySelector(".cue-arrow") as SVGElement;
      arrow.style.display = cue.angle === null ? "none" : "";
      if (cue.angle !== null) arrow.style.transform = `rotate(${cue.angle}rad)`;
    });
  },
  setCarrying: (name) => {
    carrying.classList.toggle("hidden", !name);
    const text = name ? `Carrying ${name} (G to drop)` : "";
    if (carrying.textContent !== text) carrying.textContent = text;
  },
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
const volumeValue = el("volume-value");
volumeInput.value = String(savedVolume);
volumeValue.textContent = `${savedVolume}%`;
game.setVolume(savedVolume / 100);
volumeInput.addEventListener("input", () => {
  const value = Number(volumeInput.value);
  volumeValue.textContent = `${value}%`;
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
  for (const input of nameInputs) input.value = localStorage.getItem("playerName") ?? "";
  // Why you are back on the start page (removed by the host).
  const left = sessionStorage.getItem("leftReason");
  if (left) {
    sessionStorage.removeItem("leftReason");
    errorText.textContent = left;
  }
} catch {
  // Storage can be blocked (private windows). The name just isn't remembered.
}

// A friend's invite link opens the Join screen with the code filled in.
if (linkCode) screens.reset("join");
else screens.reset("start");

/** Errors show on the screen you are on. */
function showError(message: string) {
  const box = screens.current === "create" ? createError : screens.current === "join" ? joinError : errorText;
  for (const b of [createError, joinError, errorText]) b.textContent = b === box ? message : "";
}

function readName(input: HTMLInputElement): string | null {
  const name = cleanPlayerName(input.value);
  if (!name) {
    showError(`Type a name (1 to ${config.room.nameMaxLength} characters).`);
    input.focus();
    return null;
  }
  try {
    localStorage.setItem("playerName", name);
  } catch {
    // See above.
  }
  return name;
}

/** The reconnection pass for this tab's room, kept so a reload gets you back in (GDD 18). */
const TOKEN_KEY = "reconnect";
function saveToken(room: Room | null) {
  try {
    if (room) sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ code: room.roomId, token: room.reconnectionToken }));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: a reload just goes back to the start page.
  }
}

async function tryReconnect() {
  let saved: { code: string; token: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (!saved || !linkCode || normalizeRoomCode(linkCode) !== saved.code) return;
  createBtn.disabled = joinBtn.disabled = true;
  try {
    enterLobby(await reconnectRoom(saved.token));
  } catch {
    saveToken(null);
  } finally {
    createBtn.disabled = joinBtn.disabled = false;
  }
}

async function enter(connect: () => Promise<Room>) {
  showError("");
  createBtn.disabled = joinBtn.disabled = true;
  try {
    const room = await connect();
    enterLobby(room);
  } catch (err) {
    showError(joinErrorText(err));
  } finally {
    createBtn.disabled = joinBtn.disabled = false;
  }
}

createBtn.addEventListener("click", () => {
  game.unlockSound(); // a button click lets the browser start sound and voice
  const name = readName(nameInputs[0]!);
  if (name) enter(() => createRoom({ name }));
});

joinBtn.addEventListener("click", () => {
  game.unlockSound();
  const name = readName(nameInputs[1]!);
  if (!name) return;
  const code = normalizeRoomCode(codeInput.value);
  if (!isValidRoomCode(code)) {
    showError("Room codes are 5 letters, like KQXRT.");
    codeInput.focus();
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
  game.attach(room);
  saveToken(room);
  roomCodeText.textContent = room.roomId;
  history.replaceState(null, "", `?room=${room.roomId}`);
  // From here the room is home: the menus sit at the side and the hotel stays in view.
  inRoom = true;
  document.body.classList.add("in-room");
  screens.setRoot("room");

  const link = `${location.origin}${location.pathname}?room=${room.roomId}`;
  copyCodeBtn.onclick = () => copyToButton(copyCodeBtn, room.roomId, "Code copied");
  copyLinkBtn.onclick = () => copyToButton(copyLinkBtn, link, "Link copied");

  // Your own join message can arrive before this listener exists, so say it here.
  addLogLine("You joined the room");
  room.onMessage("system", (msg: ServerMessages["system"]) => {
    if (msg.kind === "join" && msg.name === nameInputs[0]!.value.trim() && log.childElementCount <= 1) return;
    addLogLine(msg.text);
  });

  // The player list, characters, Ready and settings come from the room state (GDD 5, 20).
  lobbyView(room, { isMuted: (id) => game.isMuted(id), toggleMute: (id) => game.toggleMute(id) });

  let kickedReason = "";
  room.onMessage("kicked", (msg: ServerMessages["kicked"]) => (kickedReason = msg.reason));
  // A lost connection (GDD 18): the game keeps trying for a while; the server holds your slot.
  room.onDrop(() => showBanner("Connection lost. Reconnecting…", 60));
  room.onReconnect(() => {
    saveToken(room);
    showBanner("Reconnected.", 3);
  });
  room.onLeave((code) => {
    saveToken(null);
    // 4000: you left yourself.
    if (!kickedReason && code !== 4000) kickedReason = "Lost the connection to the room. If the server restarted, that night is lost.";
    if (kickedReason) {
      // Back to the start page, saying why.
      try {
        sessionStorage.setItem("leftReason", kickedReason);
      } catch {
        // Storage blocked: the page just opens without the reason.
      }
      location.href = location.pathname;
      return;
    }
    addLogLine("Disconnected from the server.");
  });

  // Rematch (GDD 19): only the host presses it; everyone else waits for them.
  const rematchBtn = el<HTMLButtonElement>("end-rematch");
  rematchBtn.onclick = () => room.send("rematch");
  // Leaving on purpose frees your slot at once (no 60 s hold).
  const leave = async () => {
    saveToken(null);
    await room.leave().catch(() => {});
    location.href = location.pathname;
  };
  el("end-leave").onclick = leave;
  // From the room menu, a second click confirms, like Remove.
  const leaveBtn = el<HTMLButtonElement>("leave-room");
  leaveBtn.onclick = () => {
    if (leaveBtn.dataset.armed) return void leave();
    leaveBtn.dataset.armed = "1";
    leaveBtn.textContent = "Click again to leave";
    setTimeout(() => {
      delete leaveBtn.dataset.armed;
      leaveBtn.textContent = "Leave room";
    }, 3000);
  };

  // The room page covers the hotel: this button lets you walk around it (Esc comes back).
  el("walk").onclick = () => {
    game.unlockSound();
    Promise.resolve(el<HTMLCanvasElement>("scene").requestPointerLock()).catch(() => {});
  };

  // Starting the night: the host's button, the countdown, then your role (GDD 4.1 and 5).
  startBtn.onclick = () => room.send("start");
  let refusedShown = false;
  room.onMessage("startRefused", (msg: ServerMessages["startRefused"]) => {
    startHint.textContent = msg.reason;
    refusedShown = true;
    setTimeout(() => (refusedShown = false), 4000);
  });
  room.onMessage("role", (msg: ServerMessages["role"]) => {
    myRole = msg;
    game.setRole(msg.role);
    // Your task list now shows whether it is real.
    room.send("tasksRequest");
  });
  room.onStateChange((state: { stage?: string; stageLeft?: number; host?: string; players?: { get(id: string): { character?: string } | undefined } }) => {
    const waiting = state.stage === "waiting";
    const isHost = state.host === room.sessionId;
    el("start-box").classList.toggle("hidden", !waiting);
    startBtn.classList.toggle("hidden", !isHost);
    rematchBtn.classList.toggle("hidden", !isHost);
    el("end-wait").textContent = isHost
      ? "Rematch takes everyone back to the lobby with the same settings. Everyone gets a new character."
      : "Waiting for the host to start a rematch.";
    if (waiting && !refusedShown) {
      startHint.textContent = isHost
        ? `You are the host. Start when everyone else is Ready (${config.players.min} to ${config.players.max} players). Pressing Start counts as your Ready.`
        : "Do the mic check and press Ready. The host starts the night.";
    }
    if (!waiting) refusedShown = false;
    // Once the night is on, the page is a pause menu: the button takes you back into it.
    const playing = state.stage === "night" || state.stage === "intro";
    el("walk").textContent = playing ? "Back to the night" : "Walk around the hotel";
    el("walk").classList.toggle("go", playing);
    if (playing !== nightOn) {
      nightOn = playing;
      showLookHint();
    }
    showIntro(state.stage ?? "", state.stageLeft ?? 0, characterById(state.players?.get(room.sessionId)?.character ?? "")?.name);
  });
}

const MEETING_STEP_TEXT: Record<string, string> = {
  evidence: "Evidence: look at the new photos.",
  discussion: "Discussion: talk it over.",
  vote: "Vote: pick a player, or skip.",
  result: "The vote is in.",
};

el("meeting-skip").onclick = () => game.vote(SKIP);

/** A power's state in a few words: "" when ready. */
function powerStateText(p: PowerStatus): string {
  if (p.state === "cooldown") return `${Math.ceil(p.cooldownLeft)} s`;
  if (p.state === "locked") return p.kind === "taint" ? "(ritual)" : "(not yet)";
  if (p.state === "used") return "(used)";
  return "";
}

/** The countdown, then your role and character for the intro's 10 seconds (GDD 4.1, 26.14). */
function showIntro(stage: string, secondsLeft: number, character?: string) {
  intro.classList.toggle("hidden", stage !== "countdown" && stage !== "intro");
  // The role reveal gets the whole screen; the menu page waits behind it.
  document.body.classList.toggle("revealing", stage === "intro");
  if (stage === "countdown") {
    delete intro.dataset.role;
    introTitle.textContent = String(Math.max(1, Math.ceil(secondsLeft)));
    introText.textContent = "The night begins";
    introExtra.textContent = "";
  } else if (stage === "intro" && myRole) {
    intro.dataset.role = myRole.role;
    if (myRole.role === "possessed") {
      introTitle.textContent = "YOU ARE POSSESSED";
      introText.textContent = "Stop the ritual. Do not get caught.";
      const partners = myRole.partners.length ? `Also possessed: ${myRole.partners.join(", ")}. ` : "";
      // Only the possessed know who the ghost was (GDD 26.13): lie about the clues.
      const ghost = myRole.ghost ? `The ghost was ${myRole.ghost}. Lead the team to the wrong relic. ` : "";
      introExtra.textContent = `${character ? `You are ${character}. ` : ""}${partners}${ghost}Hold R for your powers.`;
    } else {
      introTitle.textContent = "INVESTIGATOR";
      introText.textContent = "Do your tasks, find the relics, finish the ritual before dawn.";
      introExtra.textContent = character ? `Tonight you are ${character}.` : "";
    }
  }
}
void tryReconnect();
