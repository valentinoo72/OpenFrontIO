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
    const within = (ref: TileRef): boolean => {
      const px = map.x(ref),
        py = map.y(ref);
      return px >= left && px < right && py >= top && py < bottom;
    };
    if (x < left || x >= right || y < top || y >= bottom || !within(tile))
      return false;
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
        (_, ref) => within(ref) && map.isLand(ref) && !map.isImpassable(ref),
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
