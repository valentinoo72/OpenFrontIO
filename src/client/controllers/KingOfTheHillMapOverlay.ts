import {
  isThronePlacementTile,
  throneSiteBounds,
} from "@openfront/engine-lib/game/KingOfTheHill";
import { EventBus } from "@openfront/shared/EventBus";
import { Controller } from "../Controller";
import { AlternateViewEvent } from "../InputHandler";
import type { MapRenderer } from "../render/gl";
import type { TerrainRect } from "../render/types";
import { GameView } from "../view";

export class KingOfTheHillMapOverlay implements Controller {
  private alternateView = false;
  constructor(
    private game: GameView,
    private view: MapRenderer,
    private eventBus: EventBus,
  ) {}

  init() {
    const { gameMap, gameMapSize } = this.game.config().gameConfig();
    const zones = throneSiteBounds(gameMap, gameMapSize);
    if (zones.length === 0) return;

    // Merge each row of land into rectangles so the actual island outline is
    // highlighted, including the arms of both Warship Warship islands.
    const segments: TerrainRect[] = [];
    // Neighbouring island bounds can overlap; paint each land tile once.
    const highlighted = new Set<number>();
    for (const [left, top, right, bottom] of zones) {
      for (let y = top; y < bottom; y++) {
        let start = left;
        for (let x = left; x <= right; x++) {
          if (
            x < right &&
            isThronePlacementTile(
              this.game,
              gameMap,
              this.game.ref(x, y),
              gameMapSize,
            ) &&
            !highlighted.has(this.game.ref(x, y))
          ) {
            highlighted.add(this.game.ref(x, y));
            continue;
          }
          if (x > start) {
            segments.push({ x: start, y, w: x - start, h: 1 });
          }
          start = x + 1;
        }
      }
    }

    this.view.setThroneZones(segments);
    this.eventBus.on(AlternateViewEvent, this.onAlternateView);
    this.tick();
  }

  private onAlternateView = (event: AlternateViewEvent): void => {
    this.alternateView = event.alternateView;
    this.tick();
  };

  tick(): void {
    this.view.setThroneZoneVisible(
      this.game.inSpawnPhase() || this.alternateView,
    );
  }

  dispose(): void {
    this.eventBus.off(AlternateViewEvent, this.onAlternateView);
    this.view.setThroneZoneVisible(false);
    this.view.setThroneZones([]);
  }
}
