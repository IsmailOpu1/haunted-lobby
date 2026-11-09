import type { PowerKind, Role, ServerMessages } from "@haunted/shared";

// What happened in one night, with the night time of each event (GDD 19, PRD 10.6). The end
// screen's timeline and awards and the match log are all built from this one record.
// Players are kept by session id; names are added only for the end screen.

export type DeathCause = "bled out" | "voted out";

export type NightEvent =
  | { t: number; kind: "relicPlaced"; by: string }
  | { t: number; kind: "basementOpen" }
  | { t: number; kind: "tasksFull" }
  | { t: number; kind: "ritualStart" }
  | { t: number; kind: "power"; power: PowerKind; by: string; investigatorNear: boolean }
  | { t: number; kind: "photo"; by: string; caughtPossessed: boolean }
  | { t: number; kind: "meeting"; caller: string; via: "bell" | "body"; votes: { voter: string; target: string }[]; removed: string | null }
  | { t: number; kind: "downed"; who: string }
  | { t: number; kind: "revive"; by: string; who: string }
  | { t: number; kind: "death"; who: string; cause: DeathCause };

/** Everyone who played the night: name and role by session id, including those who left. */
export type Cast = Map<string, { name: string; role: Role }>;

export const SKIP_VOTE = "skip";

export class NightRecord {
  events: NightEvent[] = [];
  /** Seconds each player spent shouting (GDD 19: Loudest Screamer). */
  shoutSec = new Map<string, number>();

  add(event: NightEvent) {
    this.events.push(event);
  }

  /** Adds an event that happens once a night (the basement opening), the first time only. */
  once(event: NightEvent) {
    if (!this.events.some((e) => e.kind === event.kind)) this.events.push(event);
  }

  shout(id: string, sec: number) {
    this.shoutSec.set(id, (this.shoutSec.get(id) ?? 0) + sec);
  }
}

const POWER_TEXT: Record<PowerKind, string> = {
  slamDoor: "slammed a door",
  summon: "summoned the ghost",
  blackout: "caused a blackout",
  taint: "tainted the ritual",
  alterClue: "altered a clue",
};

function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The end screen's timeline (GDD 19): each power, each meeting and its vote, each death. */
export function timeline(record: NightRecord, cast: Cast, anonymousVoting: boolean): ServerMessages["matchEnd"]["timeline"] {
  const name = (id: string) => (id === SKIP_VOTE ? "Skip" : (cast.get(id)?.name ?? "Someone"));
  const lines: { t: number; text: string }[] = [];
  for (const e of record.events) {
    if (e.kind === "power") lines.push({ t: e.t, text: `${name(e.by)} ${POWER_TEXT[e.power]}` });
    else if (e.kind === "death") lines.push({ t: e.t, text: `${name(e.who)} ${e.cause === "bled out" ? "died" : "was voted out"}` });
    else if (e.kind === "meeting") {
      const how = e.via === "bell" ? "rang the bell" : "reported a body";
      let votes: string;
      if (e.votes.length === 0) votes = "nobody voted";
      else if (anonymousVoting) {
        const tally = new Map<string, number>();
        for (const v of e.votes) tally.set(v.target, (tally.get(v.target) ?? 0) + 1);
        votes = [...tally].map(([target, n]) => `${name(target)} ${n}`).join(", ");
      } else votes = e.votes.map((v) => `${name(v.voter)} → ${name(v.target)}`).join(", ");
      const outcome = e.removed ? `${name(e.removed)} removed` : "nobody removed";
      lines.push({ t: e.t, text: `${name(e.caller)} ${how}. Votes: ${votes}. ${outcome}` });
    }
  }
  return lines.map((l) => ({ time: clock(l.t), text: l.text }));
}

/** The players with the highest count above zero (all of them on a tie). */
function most(counts: Map<string, number>): string[] {
  const best = Math.max(0, ...counts.values());
  if (best <= 0) return [];
  return [...counts].filter(([, n]) => n === best).map(([id]) => id);
}

function countBy(events: NightEvent[], key: (e: NightEvent) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    const k = key(e);
    if (k !== null) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** The awards (GDD 19). An award nobody earned is left out. */
export function awards(record: NightRecord, cast: Cast): ServerMessages["matchEnd"]["awards"] {
  const ev = record.events;
  const names = (ids: string[]) => ids.map((id) => cast.get(id)?.name ?? "Someone");
  const out: ServerMessages["matchEnd"]["awards"] = [];
  const add = (title: string, why: string, ids: string[]) => {
    if (ids.length) out.push({ title, why, names: names(ids) });
  };
  const votedFor = new Set(ev.flatMap((e) => (e.kind === "meeting" ? e.votes.map((v) => v.target) : [])));
  add(
    "Best Liar",
    "Possessed, and never voted for",
    [...cast].filter(([id, p]) => p.role === "possessed" && !votedFor.has(id)).map(([id]) => id),
  );
  add("Sharp Eye", "Photographed a possessed player", [...new Set(ev.flatMap((e) => (e.kind === "photo" && e.caughtPossessed ? [e.by] : [])))]);
  add("Hero", "Most revives", most(countBy(ev, (e) => (e.kind === "revive" ? e.by : null))));
  add("Relic Runner", "Most relics placed", most(countBy(ev, (e) => (e.kind === "relicPlaced" ? e.by : null))));
  add("Loudest Screamer", "Most time shouting", most(new Map([...record.shoutSec].filter(([, s]) => s >= 1))));
  add("Ghost Bait", "Downed the most", most(countBy(ev, (e) => (e.kind === "downed" ? e.who : null))));
  return out;
}

export interface MatchLogInput {
  settingsCode: string;
  settings: object;
  map: string;
  winner: string;
  reason: string;
  durationSec: number;
  ritualProgress: number;
}

/**
 * One match log record (PRD 10.6). No names or IPs: players appear as "investigator 1",
 * "possessed 1" and so on. rematch is known only once the room's next step is.
 */
export function matchLog(record: NightRecord, cast: Cast, input: MatchLogInput, rematch: boolean) {
  const label = new Map<string, string>();
  const seen = { investigator: 0, possessed: 0 };
  for (const [id, p] of cast) label.set(id, `${p.role} ${++seen[p.role]}`);
  const who = (id: string) => (id === SKIP_VOTE ? "skip" : (label.get(id) ?? "unknown"));
  const role = (id: string) => cast.get(id)?.role ?? "investigator";
  const at = (kind: NightEvent["kind"]) => record.events.find((e) => e.kind === kind)?.t ?? null;
  const ev = record.events;
  return {
    ...input,
    players: cast.size,
    possessed: seen.possessed,
    relicsPlacedAt: ev.flatMap((e) => (e.kind === "relicPlaced" ? [e.t] : [])),
    basementOpenAt: at("basementOpen"),
    tasksFullAt: at("tasksFull"),
    ritualStartAt: at("ritualStart"),
    powers: ev.flatMap((e) => (e.kind === "power" ? [{ type: e.power, t: e.t, investigatorWithin15m: e.investigatorNear }] : [])),
    photos: ev.flatMap((e) => (e.kind === "photo" ? [{ t: e.t, caughtPossessed: e.caughtPossessed }] : [])),
    meetings: ev.flatMap((e) =>
      e.kind === "meeting"
        ? [
            {
              t: e.t,
              callerRole: role(e.caller),
              via: e.via,
              votes: e.votes.map((v) => ({ voter: who(v.voter), target: who(v.target) })),
              outcome: e.removed ? `removed ${role(e.removed)}` : "nobody removed",
            },
          ]
        : [],
    ),
    deaths: ev.flatMap((e) => (e.kind === "death" ? [{ t: e.t, cause: e.cause, role: role(e.who) }] : [])),
    rematch,
  };
}
