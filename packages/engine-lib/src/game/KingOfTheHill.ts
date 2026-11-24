import { GameMap, TileRef } from "@openfront/engine-api/game/GameMap";
import {
  GameMapId,
  GameMapSize,
  GameMapType,
} from "@openfront/engine-api/game/GameTypes";
import { ReadonlyTileSet } from "@openfront/engine-api/game/ReadViews";

export const THRONE_COST = 2_000_000n;
export const THRONE_BUILD_TICKS = 300;

export const KING_OF_THE_HILL_MAPS = [
  GameMapType.Tourney3,
  GameMapType.Tourney4,
  GameMapType.Surrounded,
  GameMapType.WarshipWarship,
  GameMapType.BranchingPaths,
  GameMapType.Luna,
  GameMapType.TradersDream,
  GameMapType.Sol,
  GameMapType.IrishSea,
  GameMapType.Sierpinski,
  GameMapType.Conakry,
  GameMapType.Levant,
] as const;

type Point = readonly [x: number, y: number];
export type ThroneSiteBounds = readonly [
  left: number,
  top: number,
  right: number,
  bottom: number,
];
type Site = { bounds: ThroneSiteBounds; seed: Point };

// All coordinates use the normal map assets; compact maps scale them by 1/2.
// Island seeds select connected passable land, excluding water and impassable terrain.
const sites: Partial<Record<GameMapId, readonly Site[]>> = {
  [GameMapType.Tourney3]: [{ bounds: [690, 686, 815, 812], seed: [750, 750] }],
  [GameMapType.Tourney4]: [{ bounds: [689, 683, 815, 809], seed: [751, 746] }],
  [GameMapType.Surrounded]: [
    { bounds: [844, 858, 1109, 1119], seed: [972, 984] },
  ],
  [GameMapType.WarshipWarship]: [
    { bounds: [573, 518, 908, 854], seed: [740, 685] },
    { bounds: [2073, 522, 2408, 856], seed: [2240, 688] },
  ],
  [GameMapType.BranchingPaths]: [
    { bounds: [1141, 1318, 1338, 1489], seed: [1239, 1410] },
    { bounds: [1118, 1320, 1212, 1453], seed: [1137, 1378] },
    { bounds: [1278, 1320, 1358, 1461], seed: [1319, 1380] },
    { bounds: [1160, 1508, 1316, 1552], seed: [1206, 1532] },
  ],
  [GameMapType.Luna]: [{ bounds: [646, 1742, 667, 1763], seed: [656, 1750] }],
  [GameMapType.TradersDream]: [
    { bounds: [966, 823, 1237, 1081], seed: [1100, 960] },
  ],
  [GameMapType.Sol]: [{ bounds: [1937, 987, 2496, 1546], seed: [2216, 1050] }],
  [GameMapType.IrishSea]: [{ bounds: [668, 642, 837, 859], seed: [778, 727] }],
  // The eight medium islands surrounding the large central island.
  [GameMapType.Sierpinski]: [
    { bounds: [156, 156, 311, 311], seed: [233, 233] },
    { bounds: [622, 156, 778, 311], seed: [699, 233] },
    { bounds: [1089, 156, 1244, 311], seed: [1166, 233] },
    { bounds: [156, 622, 311, 778], seed: [233, 699] },
    { bounds: [1089, 622, 1244, 778], seed: [1166, 699] },
    { bounds: [156, 1089, 311, 1244], seed: [233, 1166] },
    { bounds: [622, 1089, 778, 1244], seed: [699, 1166] },
    { bounds: [1089, 1089, 1244, 1244], seed: [1166, 1166] },
  ],
  [GameMapType.Conakry]: [
    { bounds: [1244, 803, 1364, 881], seed: [1259, 815] },
    { bounds: [1178, 844, 1249, 985], seed: [1193, 882] },
    { bounds: [1262, 890, 1288, 927], seed: [1271, 916] },
    { bounds: [1352, 890, 1358, 916], seed: [1355, 905] },
  ],
  [GameMapType.Levant]: [{ bounds: [762, 775, 1299, 1092], seed: [985, 958] }],
};

export function isKingOfTheHillMap(
  type: GameMapId,
): type is (typeof KING_OF_THE_HILL_MAPS)[number] {
  return sites[type] !== undefined;
}

function siteBounds(site: Site, scale: number): ThroneSiteBounds {
  const [left, top, right, bottom] = site.bounds;
  return [
    Math.floor(left / scale),
    Math.floor(top / scale),
    Math.ceil(right / scale),
    Math.ceil(bottom / scale),
  ];
}

export function throneSiteBounds(
  type: GameMapId,
  size = GameMapSize.Normal,
): readonly ThroneSiteBounds[] {
  return (sites[type] ?? []).map((site) =>
    siteBounds(site, size === GameMapSize.Compact ? 2 : 1),
  );
}

const components = new WeakMap<GameMap, Map<Site, ReadonlyTileSet>>();

export function isThronePlacementTile(
  map: GameMap,
  type: GameMapId,
  tile: TileRef,
  size = GameMapSize.Normal,
): boolean {
  if (!map.isValidRef(tile) || !map.isLand(tile) || map.isImpassable(tile))
    return false;
  const scale = size === GameMapSize.Compact ? 2 : 1;
  const x = map.x(tile),
    y = map.y(tile);
  return (sites[type] ?? []).some((site) => {
    const [left, top, right, bottom] = siteBounds(site, scale);
    const within = (px: number, py: number) =>
      px >= left && px < right && py >= top && py < bottom;
    if (!within(x, y)) return false;
    let cached = components.get(map);
    if (!cached) {
      cached = new Map();
      components.set(map, cached);
    }
    let component = cached.get(site);
    if (!component) {
      const start = map.ref(
        Math.floor(site.seed[0] / scale),
        Math.floor(site.seed[1] / scale),
      );
      component = map.bfs(
        start,
        (_, ref) =>
          within(map.x(ref), map.y(ref)) &&
          map.isLand(ref) &&
          !map.isImpassable(ref),
      );
      cached.set(site, component);
    }
    return component.has(tile);
  });
}

export function rollKingOfTheHillMap(roll: number): GameMapType {
  return KING_OF_THE_HILL_MAPS[
    Math.min(
      KING_OF_THE_HILL_MAPS.length - 1,
      Math.max(0, Math.floor(roll * KING_OF_THE_HILL_MAPS.length)),
    )
  ];
}
