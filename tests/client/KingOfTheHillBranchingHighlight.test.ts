import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { EventBus } from "@openfront/shared/EventBus";
import { expect, it, vi } from "vitest";
import { KingOfTheHillMapOverlay } from "../../src/client/controllers/KingOfTheHillMapOverlay";
import { kothFiles } from "../util/kothMaps";

it.each([GameMapSize.Normal, GameMapSize.Compact])(
  "does not paint overlapping Branching Paths bounds twice on %s",
  async (size) => {
    const { gameMap: map } = await loadTerrainMap(
      kothFiles(GameMapType.BranchingPaths, size),
    );
    const upload = vi.fn();
    const overlay = new KingOfTheHillMapOverlay(
      Object.assign(map, {
        inSpawnPhase: () => true,
        config: () => ({
          gameConfig: () => ({
            gameMap: GameMapType.BranchingPaths,
            gameMapSize: size,
          }),
        }),
      }) as any,
      { setThroneZones: upload, setThroneZoneVisible: vi.fn() } as any,
      new EventBus(),
    );
    overlay.init();
    const seen = new Set<number>();
    for (const { x, y, w } of upload.mock.calls[0][0]) {
      for (let dx = 0; dx < w; dx++) {
        const tile = map.ref(x + dx, y);
        expect(seen.has(tile)).toBe(false);
        seen.add(tile);
      }
    }
    const scale = size === GameMapSize.Compact ? 2 : 1;
    for (const [x, y] of [
      [1239, 1410],
      [1137, 1378],
      [1319, 1380],
      [1206, 1532],
    ])
      expect(
        seen.has(map.ref(Math.floor(x / scale), Math.floor(y / scale))),
      ).toBe(true);
    overlay.dispose();
  },
);
