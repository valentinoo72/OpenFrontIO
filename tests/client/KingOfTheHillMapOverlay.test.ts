import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { isThronePlacementTile } from "@openfront/engine-lib/game/KingOfTheHill";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { EventBus } from "@openfront/shared/EventBus";
import { describe, expect, it, vi } from "vitest";
import { KingOfTheHillMapOverlay } from "../../src/client/controllers/KingOfTheHillMapOverlay";
import { kothFiles } from "../util/kothMaps";

describe("Throne island highlight geometry", () => {
  it.each([GameMapSize.Normal, GameMapSize.Compact])(
    "uploads only the island's passable tiles on %s",
    async (size) => {
      const { gameMap: map } = await loadTerrainMap(
        kothFiles(GameMapType.Luna, size),
      );
      const game = Object.assign(map, {
        inSpawnPhase: () => true,
        config: () => ({
          gameConfig: () => ({ gameMap: GameMapType.Luna, gameMapSize: size }),
        }),
      });
      const upload = vi.fn();
      const overlay = new KingOfTheHillMapOverlay(
        game as any,
        { setThroneZones: upload, setThroneZoneVisible: vi.fn() } as any,
        new EventBus(),
      );
      overlay.init();
      const segments = upload.mock.calls[0][0] as Array<{
        x: number;
        y: number;
        w: number;
        h: number;
      }>;
      expect(segments.length).toBeGreaterThan(0);
      for (const { x, y, w: width, h: height } of segments) {
        expect(height).toBe(1);
        for (let dx = 0; dx < width; dx++) {
          expect(
            isThronePlacementTile(
              map,
              GameMapType.Luna,
              map.ref(x + dx, y),
              size,
            ),
          ).toBe(true);
        }
      }
      // No DOM layer or site outline can cover structures and countdowns.
      expect(document.body.querySelector("svg")).toBeNull();
      overlay.dispose();
      expect(upload).toHaveBeenLastCalledWith([]);
    },
  );
});
