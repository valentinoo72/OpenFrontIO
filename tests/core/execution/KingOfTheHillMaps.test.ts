import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import {
  isThronePlacementTile,
  KING_OF_THE_HILL_MAPS,
  isKingOfTheHillMap,
  rollKingOfTheHillMap,
} from "@openfront/engine-lib/game/KingOfTheHill";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { describe, expect, it } from "vitest";
import { kothFiles, kothMaps } from "../../util/kothMaps";

describe("KOTH map sites", () => {
  it("gives exactly eight maps equal 12.5-percent intervals", () => {
    expect(KING_OF_THE_HILL_MAPS).toHaveLength(8);
    for (let i = 0; i < 8; i++) {
      expect(rollKingOfTheHillMap((i + 0.001) / 8)).toBe(
        KING_OF_THE_HILL_MAPS[i],
      );
      expect(rollKingOfTheHillMap((i + 0.999) / 8)).toBe(
        KING_OF_THE_HILL_MAPS[i],
      );
    }
    expect(KING_OF_THE_HILL_MAPS).not.toContain("Tourney16");
  });
  for (const size of [GameMapSize.Normal, GameMapSize.Compact]) {
    it.each(kothMaps)(
      "marks the intended site on %s, " + size,
      async (type, _folder, point) => {
        const { gameMap: map } = await loadTerrainMap(kothFiles(type, size));
        const s = size === GameMapSize.Compact ? 2 : 1;
        expect(
          isThronePlacementTile(
            map,
            type,
            map.ref(Math.floor(point[0] / s), Math.floor(point[1] / s)),
            size,
          ),
        ).toBe(true);
        expect(isThronePlacementTile(map, type, map.ref(0, 0), size)).toBe(
          false,
        );
        if (type === GameMapType.Sol)
          expect(
            isThronePlacementTile(
              map,
              type,
              map.ref(Math.floor(2216 / s), Math.floor(1264 / s)),
              size,
            ),
          ).toBe(false);
        if (type === GameMapType.WarshipWarship)
          expect(
            isThronePlacementTile(
              map,
              type,
              map.ref(Math.floor(2240 / s), Math.floor(688 / s)),
              size,
            ),
          ).toBe(true);
      },
    );
  }
});

it.each([GameMapType.MoreThanLuck, GameMapType.MilkyWay])(
  "excludes %s from KOTH",
  (map) => {
    expect(isKingOfTheHillMap(map)).toBe(false);
    expect(KING_OF_THE_HILL_MAPS).not.toContain(map);
  },
);
