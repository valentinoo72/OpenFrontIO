import { TileRef } from "@openfront/engine-api/game/GameMap";
import { Structures, UnitType } from "@openfront/engine-api/game/GameTypes";
import { isThronePlacementTile } from "@openfront/engine-lib/game/KingOfTheHill";
import { translateText } from "../Utils";
import type { GameView } from "../view";

export function thronePlacementWarning(
  game: GameView,
  unitType: UnitType,
  tile: TileRef,
): string | undefined {
  if (!Structures.has(unitType)) {
    return undefined;
  }
  const config = game.config();
  if (!config.isKingOfTheHill()) return undefined;
  if (unitType === UnitType.Throne) {
    return game.isSpawnImmunityActive()
      ? translateText("king_of_the_hill.immunity_blocked")
      : undefined;
  }
  const { gameMap, gameMapSize } = config.gameConfig();
  if (!isThronePlacementTile(game, gameMap, tile, gameMapSize)) {
    return undefined;
  }
  const player = game.myPlayer();
  if (!player || game.ownerID(tile) !== player.smallID()) return undefined;
  const key = unitType.toLowerCase().replace(/ /g, "_");
  return translateText("king_of_the_hill.structure_blocked", {
    structure: translateText(`unit_type.${key}`).toLocaleLowerCase(),
  });
}
