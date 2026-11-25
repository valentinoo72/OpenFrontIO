import { TileRef } from "@openfront/engine-api/game/GameMap";
import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import {
  isThronePlacementTile,
  KING_OF_THE_HILL_MAPS,
  isKingOfTheHillMap,
  rollKingOfTheHillMap,
  throneSiteBounds,
} from "@openfront/engine-lib/game/KingOfTheHill";
import { loadTerrainMap } from "@openfront/engine-lib/game/TerrainMapLoader";
import { describe, expect, it } from "vitest";
import { kothFiles, kothMaps } from "../../util/kothMaps";

const newIslandSites = [
  [GameMapType.IrishSea, [[778, 727]], [[254, 514]]],
  [
    GameMapType.Sierpinski,
    [
      [233, 233],
      [699, 233],
      [1166, 233],
      [233, 699],
      [1166, 699],
      [233, 1166],
      [699, 1166],
      [1166, 1166],
    ],
    [
      [699, 699],
      [78, 78],
    ],
  ],
  [
    GameMapType.Conakry,
    [
      [1259, 815],
      [1193, 882],
      [1271, 916],
      [1355, 905],
    ],
    [
      [1271, 221],
      [1271, 760],
    ],
  ],
  [GameMapType.Levant, [[985, 958]], [[1100, 242]]],
  [
    GameMapType.GulfOfGuinea,
    [
      [1806, 756],
      [1469, 1248],
      [1275, 1578],
      [1036, 1989],
    ],
    [[1900, 612]],
  ],
  [
    GameMapType.ClearwaterLakes,
    [
      [441, 577],
      [468, 521],
      [524, 487],
    ],
    [
      [832, 486],
      [915, 589],
      [704, 868],
    ],
  ],
  [GameMapType.Hawaii, [[300, 270]], [[615, 197]]],
  [GameMapType.Svalmel, [[913, 845]], [[812, 697]]],
  [
    GameMapType.ChannelIslands,
    [[2316, 1516]],
    [
      [3719, 738],
      [4203, 1645],
    ],
  ],
  [
    GameMapType.BeringStrait,
    [
      [708, 373],
      [772, 420],
    ],
    [
      [186, 427],
      [1297, 287],
    ],
  ],
  [
    GameMapType.China,
    [
      [2021, 1609],
      [1572, 1936],
    ],
    [[1737, 1732]],
  ],
  [GameMapType.IndianSubcontinent, [[1086, 1735]], [[1073, 1634]]],
] as const;

describe("KOTH map sites", () => {
  it("gives all twenty maps equal intervals in the public rotation", () => {
    const count = KING_OF_THE_HILL_MAPS.length;
    expect(count).toBe(20);
    expect(new Set(KING_OF_THE_HILL_MAPS).size).toBe(count);
    for (let i = 0; i < count; i++) {
      expect(rollKingOfTheHillMap((i + 0.001) / count)).toBe(
        KING_OF_THE_HILL_MAPS[i],
      );
      expect(rollKingOfTheHillMap((i + 0.999) / count)).toBe(
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
    it.each(newIslandSites)(
      "includes the whole intended islands on %s, " + size,
      async (type, seeds, excluded) => {
        const { gameMap: map } = await loadTerrainMap(kothFiles(type, size));
        const scale = size === GameMapSize.Compact ? 2 : 1;
        const ref = (x: number, y: number) =>
          map.ref(Math.floor(x / scale), Math.floor(y / scale));
        const expected = new Set<TileRef>();
        for (const [x, y] of seeds) {
          const island = map.bfs(
            ref(x, y),
            (_, tile) => map.isLand(tile) && !map.isImpassable(tile),
          );
          expect(island.size).toBeGreaterThan(0);
          for (const tile of island) expected.add(tile);
        }
        const bounds = throneSiteBounds(type, size);
        expect(bounds).toHaveLength(seeds.length);
        const marked = new Set<TileRef>();
        for (const [left, top, right, bottom] of bounds) {
          for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
              const tile = map.ref(x, y);
              if (isThronePlacementTile(map, type, tile, size))
                marked.add(tile);
            }
          }
        }
        expect(marked.size).toBe(expected.size);
        expect([...expected].every((tile) => marked.has(tile))).toBe(true);
        for (const [x, y] of excluded) {
          expect(isThronePlacementTile(map, type, ref(x, y), size)).toBe(false);
        }
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
