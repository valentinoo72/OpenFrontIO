import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { isThronePlacementTile } from "@openfront/engine-lib/game/KingOfTheHill";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { expect, it } from "vitest";
import { kothFiles } from "../../util/kothMaps";

it.each([GameMapSize.Normal, GameMapSize.Compact])(
  "includes all four Branching Paths islands and excludes the sea on %s",
  async (size) => {
    const { gameMap: map } = await loadTerrainMap(
      kothFiles(GameMapType.BranchingPaths, size),
    );
    const scale = size === GameMapSize.Compact ? 2 : 1;
    for (const [x, y] of [
      [1239, 1410],
      [1137, 1378],
      [1319, 1380],
      [1206, 1532],
    ]) {
      const tile = map.ref(Math.floor(x / scale), Math.floor(y / scale));
      expect(
        isThronePlacementTile(map, GameMapType.BranchingPaths, tile, size),
      ).toBe(true);
      const island = map.bfs(
        tile,
        (_, ref) => map.isLand(ref) && !map.isImpassable(ref),
      );
      for (const ref of island)
        expect(
          isThronePlacementTile(map, GameMapType.BranchingPaths, ref, size),
        ).toBe(true);
    }
    for (const [x, y] of [
      [1239, 1500],
      [1100, 1400],
      [1239, 1300],
    ]) {
      expect(
        isThronePlacementTile(
          map,
          GameMapType.BranchingPaths,
          map.ref(Math.floor(x / scale), Math.floor(y / scale)),
          size,
        ),
      ).toBe(false);
    }
  },
);
