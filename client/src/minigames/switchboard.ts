import { config } from "@haunted/shared";
import { SYMBOLS, dist, drawBackdrop, drawSymbol, shuffle, type Minigame, type PlaySound, type Point, type SymbolKind } from "./types.ts";

// Mend the switchboard (GDD 9): drag each cable to the socket with the same symbol and hold it
// in while it seats. A wrong socket sparks and throws the cable back.

const PLUG_X = 110;
const SOCKET_X = 530;
const REACH = 24;

interface Cable {
  symbol: SymbolKind;
  y: number;
  tip: Point;
  seat: number;
  seated: boolean;
}

export class Switchboard implements Minigame {
  readonly hint = "Drag each cable to the socket with the same symbol and hold it there until it clicks in.";
  private cfg = config.tasks.minigames.switchboard;
  private cables: Cable[] = [];
  private sockets: { symbol: SymbolKind; y: number }[] = [];
  private held: Cable | null = null;

  constructor(private play: PlaySound) {
    const n: number = this.cfg.cables;
    const symbols = shuffle(SYMBOLS).slice(0, n);
    const ys = symbols.map((_, i) => 90 + (n === 1 ? 0 : (i * 230) / (n - 1)));
    symbols.forEach((symbol, i) => this.cables.push({ symbol, y: ys[i]!, tip: { x: PLUG_X, y: ys[i]! }, seat: 0, seated: false }));
    shuffle(symbols).forEach((symbol, i) => this.sockets.push({ symbol, y: ys[i]! }));
  }

  get done(): boolean {
    return this.cables.every((c) => c.seated);
  }

  pointerDown(p: Point) {
    this.held = this.cables.find((c) => !c.seated && dist(p, c.tip) <= REACH) ?? null;
  }

  pointerMove(p: Point) {
    if (this.held) this.held.tip = { ...p };
  }

  pointerUp() {
    if (this.held) this.dropBack(this.held);
  }

  update(dt: number) {
    const c = this.held;
    if (!c) return;
    const socket = this.sockets.find((s) => dist(c.tip, { x: SOCKET_X, y: s.y }) <= REACH);
    if (!socket) {
      c.seat = 0;
      return;
    }
    if (socket.symbol !== c.symbol) {
      this.play("spark");
      return this.dropBack(c);
    }
    c.seat += dt;
    if (c.seat >= this.cfg.seatSec) {
      c.seated = true;
      c.tip = { x: SOCKET_X, y: socket.y };
      this.held = null;
      this.play("click");
    }
  }

  private dropBack(c: Cable) {
    c.tip = { x: PLUG_X, y: c.y };
    c.seat = 0;
    this.held = null;
  }

  draw(g: CanvasRenderingContext2D) {
    drawBackdrop(g);
    // The switchboard panel.
    g.fillStyle = "#2b2218";
    g.fillRect(40, 40, 560, 320);
    g.strokeStyle = "#a07a34";
    g.lineWidth = 4;
    g.strokeRect(40, 40, 560, 320);

    for (const s of this.sockets) {
      g.fillStyle = "#0d0a07";
      g.beginPath();
      g.arc(SOCKET_X, s.y, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = g.strokeStyle = "#e6d3a0";
      drawSymbol(g, s.symbol, SOCKET_X + 40, s.y, 11);
    }
    for (const c of this.cables) {
      // The cable hangs from the bottom of the board up to its plug.
      g.strokeStyle = "#5a1d16";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(70, c.y);
      g.bezierCurveTo(200, 380, c.tip.x - 120, 380, c.tip.x, c.tip.y);
      g.stroke();
      g.fillStyle = c.seated ? "#6fae6a" : "#b8a27a";
      g.beginPath();
      g.arc(c.tip.x, c.tip.y, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = g.strokeStyle = "#e6d3a0";
      drawSymbol(g, c.symbol, 70, c.y - 24, 9);
      if (c.seat > 0 && !c.seated) {
        g.strokeStyle = "#6fae6a";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(c.tip.x, c.tip.y, 18, -Math.PI / 2, -Math.PI / 2 + (c.seat / this.cfg.seatSec) * Math.PI * 2);
        g.stroke();
      }
    }
  }
}
