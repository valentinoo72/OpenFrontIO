import {
  GameMode,
  GameType,
  HumansVsNations,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import {
  isKingOfTheHillMap,
  KING_OF_THE_HILL_MAPS,
} from "@openfront/engine-lib/game/KingOfTheHill";

/** Only KOTH compatibility constraints; ordinary lobby settings keep their behavior. */
export function constrainKingOfTheHillConfig(config: GameConfig): void {
  if (!config.kingOfTheHill) return;
  if (config.gameType === GameType.Singleplayer) {
    config.kingOfTheHill = false;
    return;
  }
  if (!isKingOfTheHillMap(config.gameMap))
    config.gameMap = KING_OF_THE_HILL_MAPS[0];
  config.nations = "disabled";
  config.waterNukes = undefined;
  if (
    config.gameMode === GameMode.Team &&
    config.playerTeams === HumansVsNations
  )
    config.playerTeams = 2;
}
