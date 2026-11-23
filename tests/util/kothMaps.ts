import { GameMapSize, GameMapType } from "@openfront/engine-api/game/GameTypes";
import { MapFiles, MapManifest } from "@openfront/engine-api/game/MapFiles";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";

export const kothMaps = [
  [GameMapType.Tourney3, "tourney3", [750, 750]],
  [GameMapType.Tourney4, "tourney4", [751, 746]],
  [GameMapType.Surrounded, "surrounded", [972, 984]],
  [GameMapType.WarshipWarship, "warshipwarship", [740, 685]],
  [GameMapType.BranchingPaths, "branchingpaths", [1239, 1410]],
  [GameMapType.Luna, "luna", [656, 1750]],
  [GameMapType.TradersDream, "tradersdream", [1100, 960]],
  [GameMapType.Sol, "sol", [2216, 1050]],
  [GameMapType.IrishSea, "irishsea", [778, 727]],
  [GameMapType.Sierpinski, "sierpinski", [233, 233]],
  [GameMapType.Conakry, "conakry", [1271, 916]],
  [GameMapType.Levant, "levant", [985, 958]],
] as const;

export function kothFiles(
  map: GameMapType,
  size = GameMapSize.Normal,
): MapFiles {
  const folder = kothMaps.find(([type]) => type === map)![1];
  const root = new NodeURL(`../../resources/maps/${folder}/`, import.meta.url);
  return {
    map,
    mapSize: size,
    manifest: JSON.parse(
      readFileSync(new NodeURL("manifest.json", root), "utf8"),
    ) as MapManifest,
    mapBin: Uint8Array.from(readFileSync(new NodeURL("map.bin", root))),
    map4xBin: Uint8Array.from(readFileSync(new NodeURL("map4x.bin", root))),
    map16xBin:
      size === GameMapSize.Compact
        ? Uint8Array.from(readFileSync(new NodeURL("map16x.bin", root)))
        : undefined,
  };
}
