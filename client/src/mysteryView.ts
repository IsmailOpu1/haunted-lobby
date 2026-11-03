import * as THREE from "three";
import { altarStands, clueLabel, clueStations, type MapData } from "@haunted/shared";
import { liftToFloor } from "./place.ts";

// Who was the ghost? (GDD 26.13). A finished clue task shows a picture over its station, for
// everyone, and the placed relics wait on the altar for the offering. A grey-box look until
// the Phase 8 art pass makes the mirror, the portrait and the switchboard lamp show it themselves.

const CARD_HEIGHT_M = 2.65;
const CARD_W_M = 1.4;
const CARD_H_M = 0.79;
const ALTAR_TOP_M = 1;
const RELIC_SIZE_M = 0.18;
const DUST_RADIUS_M = 0.14;

interface Card {
  sprite: THREE.Sprite;
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  shown: string;
}

export class MysteryView {
  private cards = new Map<string, Card>();
  private altarRelics: { box: THREE.Mesh; dust: THREE.Mesh; glow: THREE.PointLight }[] = [];

  constructor(scene: THREE.Scene, private map: MapData) {
    for (const def of clueStations(map)) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 288;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
      sprite.scale.set(CARD_W_M, CARD_H_M, 1);
      sprite.position.set(def.x, CARD_HEIGHT_M, def.z);
      liftToFloor(map, sprite);
      sprite.visible = false;
      scene.add(sprite);
      this.cards.set(def.id, { sprite, g: canvas.getContext("2d")!, texture, shown: "" });
    }
    const altar = map.altar;
    if (!altar || !map.suspects?.length) return;
    const boxGeo = new THREE.BoxGeometry(RELIC_SIZE_M, RELIC_SIZE_M, RELIC_SIZE_M);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0xe0b24a });
    const dustGeo = new THREE.CircleGeometry(DUST_RADIUS_M, 16);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0x5a5650 });
    for (const stand of altarStands(altar, 3)) {
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.set(stand.x, ALTAR_TOP_M + RELIC_SIZE_M / 2, stand.z);
      liftToFloor(map, box);
      const dust = new THREE.Mesh(dustGeo, dustMat);
      dust.rotation.x = -Math.PI / 2;
      dust.position.set(stand.x, ALTAR_TOP_M + 0.01, stand.z);
      liftToFloor(map, dust);
      const glow = new THREE.PointLight(0xffc860, 2, 3, 2);
      glow.position.copy(box.position);
      glow.position.y += 0.3;
      for (const o of [box, dust, glow]) {
        o.visible = false;
        scene.add(o);
      }
      this.altarRelics.push({ box, dust, glow });
    }
  }

  /** The server's state: each station's clue, and each relic's status (the altar shows them once the basement is open). */
  update(state: any, relicIds: string[], basementOpen: boolean, ghostNamed: string) {
    state.stations?.forEach((s: { clue?: string }, id: string) => {
      const card = this.cards.get(id);
      if (!card || (s.clue ?? "") === card.shown) return;
      card.shown = s.clue ?? "";
      card.sprite.visible = !!card.shown;
      if (card.shown) this.draw(card, id, card.shown);
    });
    relicIds.forEach((id, i) => {
      const view = this.altarRelics[i];
      const relic = state.relics?.get(id);
      if (!view || !relic) return;
      const named = !!ghostNamed && this.map.suspects?.some((s) => s.name === ghostNamed && s.belonging === relic.name);
      view.box.visible = basementOpen && relic.status === "placed";
      view.dust.visible = basementOpen && relic.status === "crumbled";
      // The right relic glows once it names the ghost.
      view.glow.visible = view.box.visible && !!named;
    });
  }

  /** The clue's picture: the suspect's sign, and what the task shows in a few words. */
  private draw(card: Card, stationId: string, suspectId: string) {
    const { g } = card;
    const suspect = this.map.suspects?.find((s) => s.id === suspectId);
    g.clearRect(0, 0, 512, 288);
    g.fillStyle = "rgba(20, 14, 10, 0.86)";
    g.fillRect(8, 8, 496, 272);
    g.strokeStyle = "#c9a45a";
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 272);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "150px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    g.fillText(suspect?.icon ?? "?", 256, 118);
    g.fillStyle = "#efe2c4";
    g.font = "bold 40px Georgia, serif";
    g.fillText(clueLabel(this.map, stationId, suspectId) ?? "", 256, 240, 470);
    card.texture.needsUpdate = true;
  }
}
