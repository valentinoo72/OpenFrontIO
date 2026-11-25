import {
  BuildMenus,
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { GameConfig, GameStartInfo } from "@openfront/engine-api/Schemas";
import {
  isThronePlacementTile,
  THRONE_BUILD_TICKS,
  THRONE_COST,
} from "@openfront/engine-lib/game/KingOfTheHill";
import {
  packUnitUpdates,
  unpackUnitUpdates,
} from "@openfront/engine-lib/game/PackedUnitUpdates";
import { ConstructionExecution } from "@openfront/engine/execution/ConstructionExecution";
import { NukeExecution } from "@openfront/engine/execution/NukeExecution";
import { SpawnExecution } from "@openfront/engine/execution/SpawnExecution";
import {
  createGameRunner,
  createGameRunnerFromSnapshot,
} from "@openfront/engine/GameRunner";
import {
  snapshotGame,
  snapshotGameData,
} from "@openfront/engine/snapshot/GameSnapshot";
import { describe, expect, it, vi } from "vitest";
import { applyGameConfigPatch } from "../../../src/server/ConfigPatch";
import { kothFiles } from "../../util/kothMaps";

type KothTestConfig = GameConfig & { gameMap: GameMapType };

function config(overrides: Partial<KothTestConfig> = {}): KothTestConfig {
  return {
    gameMap: GameMapType.Tourney4,
    gameMapSize: GameMapSize.Normal,
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    kingOfTheHill: true,
    difficulty: Difficulty.Medium,
    nations: "disabled",
    bots: 0,
    donateGold: false,
    donateTroops: false,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: true,
    spawnImmunityDuration: 0,
    disableNavMesh: true,
    maxPlayers: 50,
    ...overrides,
  };
}

async function makeGame(count = 2, overrides: Partial<KothTestConfig> = {}) {
  const c = config(overrides);
  const start: GameStartInfo = {
    gameID: "koth-test",
    lobbyCreatedAt: 0,
    config: c,
    players: Array.from({ length: count }, (_, i) => ({
      clientID: `test-${i}`,
      username: `Player ${i}`,
      clanTag: null,
    })),
  };
  const runner = await createGameRunner(
    start,
    undefined,
    kothFiles(c.gameMap, c.gameMapSize),
    () => {},
  );
  runner.game.executeNextTick();
  runner.game.executeNextTick();
  return runner.game;
}

describe("KOTH core", () => {
  it("offers the original buildable units outside King of the Hill", async () => {
    const game = await makeGame(1, { kingOfTheHill: false });
    expect(
      game
        .allPlayers()[0]
        .buildableUnits(null)
        .map(({ type }) => type),
    ).toEqual([...BuildMenus.types, UnitType.TransportShip]);
  });

  it("writes the original unit snapshot record in ordinary games", async () => {
    const game = await makeGame(1, { kingOfTheHill: false });
    const player = game.allPlayers()[0];
    const city = player.buildUnit(UnitType.City, player.spawnTile()!, {});
    expect(snapshotGameData(game).units).toContainEqual({
      v: 1,
      d: expect.objectContaining({ id: city.id(), type: UnitType.City }),
    });
  });

  it.each([GameMapSize.Normal, GameMapSize.Compact])(
    "randomly spawns more players than the old preset capacity on %s",
    async (size) => {
      const game = await makeGame(30, { gameMapSize: size });
      expect(game.players()).toHaveLength(30);
      const refs = game.players().map((p) => p.spawnTile()!);
      expect(new Set(refs).size).toBe(30);
      for (const ref of refs)
        expect(
          isThronePlacementTile(game, GameMapType.Tourney4, ref, size),
        ).toBe(false);
      expect(game.config().spawnNations()).toBe(false);
    },
  );

  it("allows manual spawn choices outside the site and rejects site clicks without losing existing land", async () => {
    const game = await makeGame(1, { randomSpawn: false });
    const player = game.allPlayers()[0];
    const outside = game.ref(568, 307),
      site = game.ref(751, 746);
    game.addExecution(
      new SpawnExecution("koth-test", player.info(), outside, true),
    );
    game.executeNextTick();
    game.executeNextTick();
    expect(player.spawnTile()).toBe(outside);
    const land = player.numTilesOwned();
    game.addExecution(
      new SpawnExecution("koth-test", player.info(), site, true),
    );
    game.executeNextTick();
    game.executeNextTick();
    expect(player.spawnTile()).toBe(outside);
    expect(player.numTilesOwned()).toBe(land);
  });

  describe.each([GameMode.FFA, GameMode.Team])(
    "land wins in %s",
    (gameMode) => {
      it.each([
        {
          description:
            "public rotation stays throne-only even with land options present",
          gameType: GameType.Public,
          overtime: true,
          threshold: 650,
          ownedTiles: 400,
          winAt: null,
        },
        {
          description: "hosted defaults require a throne",
          gameType: GameType.Private,
          overtime: false,
          threshold: null,
          ownedTiles: 400,
          winAt: null,
        },
        {
          description: "hosted Overtime unlocks a land win when it starts",
          gameType: GameType.Private,
          overtime: true,
          threshold: null,
          ownedTiles: 400,
          winAt: "overtime",
        },
        {
          description: "a host can enable a custom land win before Overtime",
          gameType: GameType.Private,
          overtime: false,
          threshold: 650,
          ownedTiles: 280,
          winAt: "land",
        },
        {
          description:
            "the sim time cutoff does not award a hosted win below the host's land percentage",
          gameType: GameType.Private,
          overtime: false,
          threshold: 900,
          ownedTiles: 280,
          winAt: null,
        },
      ] as const)(
        "$description",
        async ({ gameType, overtime, threshold, ownedTiles, winAt }) => {
          const c = config({
            gameType,
            gameMode,
            playerTeams: gameMode === GameMode.Team ? 2 : undefined,
            overtime: { enabled: overtime, startMinutes: 1 },
            winThresholdTenths: threshold,
          });
          const files = kothFiles(c.gameMap);
          files.manifest.map = {
            ...files.manifest.map,
            width: 20,
            height: 20,
            num_land_tiles: 400,
          };
          files.manifest.map4x = {
            ...files.manifest.map4x,
            width: 10,
            height: 10,
            num_land_tiles: 100,
          };
          files.mapBin = new Uint8Array(400).fill(0x80);
          files.map4xBin = new Uint8Array(100).fill(0x80);
          const start: GameStartInfo = {
            gameID: "koth-land",
            lobbyCreatedAt: 0,
            config: c,
            listed: gameType === GameType.Private || undefined,
            players: [{ clientID: "human", username: "Human", clanTag: null }],
          };
          const { game } = await createGameRunner(
            start,
            undefined,
            files,
            () => {},
          );
          game.executeNextTick();
          game.executeNextTick();
          game.endSpawnPhase();
          const player = game.allPlayers()[0];
          for (let tile = 0; tile < ownedTiles; tile++) player.conquer(tile);
          for (let i = 0; i < 30; i++) game.executeNextTick();
          const winner = gameMode === GameMode.Team ? player.team() : player;
          if (winAt === "land") {
            expect(game.getWinner()).toBe(winner);
            return;
          }
          expect(game.getWinner()).toBeNull();
          while (game.elapsedGameSeconds() < 59) game.executeNextTick();
          expect(game.getWinner()).toBeNull();
          for (let i = 0; i < 40; i++) game.executeNextTick();
          expect(game.getWinner()).toBe(winAt === "overtime" ? winner : null);
          if (winAt === null) {
            const clock = vi
              .spyOn(game, "elapsedGameSeconds")
              .mockReturnValue(170 * 60);
            for (let i = 0; i < 10; i++) game.executeNextTick();
            clock.mockRestore();
            expect(game.getWinner()).toBeNull();
          }
        },
      );
    },
  );

  it("keeps every throne at 2M/30s, preserves capture time, and breaks other unfinished thrones on victory", async () => {
    const game = await makeGame();
    game.endSpawnPhase();
    const [a, b] = game.players();
    const first = game.ref(716, 740),
      captured = game.ref(751, 746),
      later = game.ref(788, 748);
    a.addGold(5_000_000n);
    b.addGold(5_000_000n);
    a.conquer(first);
    a.conquer(captured);
    b.conquer(later);
    expect(a.canBuild(UnitType.Throne, a.spawnTile()!)).toBe(false);
    game.addExecution(
      new ConstructionExecution(a, UnitType.Throne, first),
      new ConstructionExecution(a, UnitType.Throne, captured),
    );
    game.executeNextTick();
    const builtAt = game.ticks();
    game.executeNextTick();
    const owned = a.units(UnitType.Throne);
    expect(owned).toHaveLength(2);
    expect(game.unitInfo(UnitType.Throne).cost(game, a)).toBe(THRONE_COST);
    expect(game.config().unitInfo(UnitType.Throne).constructionDuration).toBe(
      THRONE_BUILD_TICKS,
    );
    expect(a.canBuild(UnitType.City, first)).toBe(false);
    const deadline = builtAt + THRONE_BUILD_TICKS;
    expect(owned.map((t) => t.toUpdate().constructionEndsAt)).toEqual([
      deadline,
      deadline,
    ]);
    expect(
      unpackUnitUpdates(
        packUnitUpdates(owned.map((t) => t.toUpdate())).packedUnitUpdates,
      )[0].constructionEndsAt,
    ).toBe(deadline);
    expect(snapshotGameData(game).units).toContainEqual({
      v: 2,
      d: expect.objectContaining({
        id: owned[0].id(),
        type: UnitType.Throne,
        constructionEndsAt: deadline,
      }),
    });
    game.addExecution(new ConstructionExecution(b, UnitType.Throne, later));
    game.executeNextTick();
    game.executeNextTick();
    const laterThrone = b.units(UnitType.Throne)[0];
    const silo = game.ref(699, 743);
    b.conquer(silo);
    b.buildUnit(UnitType.MissileSilo, silo, {});
    game.addExecution(new NukeExecution(UnitType.AtomBomb, b, first));
    for (let i = 0; i < 60 && owned[0].isActive(); i++) game.executeNextTick();
    expect(owned[0].isActive()).toBe(false);
    b.conquer(captured);
    game.executeNextTick();
    expect(owned[1].owner()).toBe(b);
    expect(owned[1].toUpdate().constructionEndsAt).toBe(deadline);
    expect(game.unitInfo(UnitType.Throne).cost(game, a)).toBe(THRONE_COST);
    while (game.ticks() < deadline) game.executeNextTick();
    expect(game.getWinner()).toBeNull();
    game.executeNextTick();
    expect(game.getWinner()).toBe(b);
    expect(laterThrone.isActive()).toBe(false);
    expect(b.canBuild(UnitType.Throne, later)).toBe(false);
  });

  it("awards the entire owner's team, and temporary alliances do not change teams", async () => {
    const game = await makeGame(4, { gameMode: GameMode.Team, playerTeams: 2 });
    game.endSpawnPhase();
    const player = game.players()[0],
      tile = game.ref(751, 746);
    player.addGold(3_000_000n);
    player.conquer(tile);
    game.addExecution(new ConstructionExecution(player, UnitType.Throne, tile));
    for (let i = 0; i < THRONE_BUILD_TICKS + 4; i++) game.executeNextTick();
    expect(game.getWinner()).toBe(player.team());
  });

  it("rejects throne placement by a bot", async () => {
    const game = await makeGame(1);
    game.endSpawnPhase();
    const bot = game.addPlayer(
      new PlayerInfo("Bot", PlayerType.Bot, null, "bot"),
    );
    const tile = game.ref(751, 746);
    bot.conquer(tile);
    bot.addGold(THRONE_COST);
    expect(bot.canBuild(UnitType.Throne, tile)).toBe(false);
    const gold = bot.gold();
    game.addExecution(new ConstructionExecution(bot, UnitType.Throne, tile));
    game.executeNextTick();
    game.executeNextTick();
    expect(bot.units(UnitType.Throne)).toHaveLength(0);
    expect(bot.gold()).toBe(gold);
  });

  it.each([GameMode.FFA, GameMode.Team])(
    "reverses the captured throne to zero progress in %s",
    async (gameMode) => {
      const game = await makeGame(2, { gameMode, playerTeams: 2 });
      game.endSpawnPhase();
      const [player] = game.players();
      const bot = game.addPlayer(
        new PlayerInfo("Bot", PlayerType.Bot, null, "bot"),
      );
      const tile = game.ref(751, 746);
      player.conquer(tile);
      player.addGold(THRONE_COST);
      game.addExecution(
        new ConstructionExecution(player, UnitType.Throne, tile),
      );
      game.executeNextTick();
      game.executeNextTick();
      const [throne] = player.units(UnitType.Throne);
      const deadline = throne.constructionEndsAt()!;
      while (game.ticks() < deadline - 150) game.executeNextTick();
      bot.conquer(tile);

      for (let i = 0; i < 149; i++) game.executeNextTick();
      expect(throne.owner()).toBe(bot);
      expect(throne.isUnderConstruction()).toBe(true);
      expect(throne.constructionEndsAt()! - game.ticks()).toBe(299);
      expect(game.getWinner()).toBeNull();

      const updates = game.executeNextTick();
      expect(throne.isActive()).toBe(false);
      expect(updates[GameUpdateType.Win]).toHaveLength(0);
      expect(game.getWinner()).toBeNull();
    },
  );

  it("resumes a decaying throne at its remaining build time after a save and recapture", async () => {
    const game = await makeGame(2);
    game.endSpawnPhase();
    const [player] = game.players();
    const bot = game.addPlayer(
      new PlayerInfo("Bot", PlayerType.Bot, null, "bot"),
    );
    const tile = game.ref(751, 746);
    player.conquer(tile);
    player.addGold(THRONE_COST);
    game.addExecution(new ConstructionExecution(player, UnitType.Throne, tile));
    game.executeNextTick();
    game.executeNextTick();
    const [throne] = player.units(UnitType.Throne);
    // A capture on the original completion tick must reverse construction too.
    while (game.ticks() < throne.constructionEndsAt()!) game.executeNextTick();
    bot.conquer(tile);
    for (let i = 0; i < 70; i++) game.executeNextTick();
    expect(throne.constructionEndsAt()! - game.ticks()).toBe(70);
    expect(game.getWinner()).toBeNull();

    const { game: restored } = await createGameRunnerFromSnapshot(
      {
        gameID: "koth-restore",
        lobbyCreatedAt: 0,
        config: game.config().gameConfig(),
        players: [],
      },
      snapshotGame(game),
      undefined,
      kothFiles(GameMapType.Tourney4),
      () => {},
    );
    const captured = restored.unit(throne.id())!;
    const deadline = captured.constructionEndsAt()!;
    expect(deadline - restored.ticks()).toBe(70);
    const captor = restored.player(player.id());
    captor.conquer(tile);
    while (restored.ticks() < deadline) restored.executeNextTick();

    expect(captured.owner()).toBe(captor);
    expect(restored.getWinner()).toBeNull();
    restored.executeNextTick();
    expect(restored.getWinner()).toBe(captor);
  });

  it("ends a timed hosted game with the normal loss result and prevents a later throne win", async () => {
    const game = await makeGame(1, {
      gameType: GameType.Private,
      maxTimerValue: 1,
    });
    game.endSpawnPhase();
    const player = game.players()[0],
      tile = game.ref(751, 746);
    while (game.elapsedGameSeconds() < 58) game.executeNextTick();
    player.addGold(3_000_000n);
    player.conquer(tile);
    game.addExecution(new ConstructionExecution(player, UnitType.Throne, tile));
    game.executeNextTick();
    game.executeNextTick();
    const throne = player.units(UnitType.Throne)[0];
    let loss = false;
    for (let i = 0; i < 400; i++) {
      const updates = game.executeNextTick();
      for (const win of updates[GameUpdateType.Win]) {
        expect(win.winner).toBeUndefined();
        loss = true;
      }
    }
    expect(loss).toBe(true);
    expect(game.getWinner()).toBeNull();
    expect(throne.isActive()).toBe(false);
    expect(player.canBuild(UnitType.Throne, tile)).toBe(false);
  });

  it.each([5_000_000, 25_000_000])(
    "blocks thrones during high-gold PvP immunity (%s)",
    async (gold) => {
      const game = await makeGame(1, {
        startingGold: gold,
        spawnImmunityDuration: undefined,
      });
      game.endSpawnPhase();
      const player = game.players()[0],
        tile = game.ref(751, 746);
      player.addGold(3_000_000n);
      player.conquer(tile);
      expect(game.config().spawnImmunityDuration()).toBe(
        gold === 5_000_000 ? 450 : 1500,
      );
      expect(player.canBuild(UnitType.Throne, tile)).toBe(false);
    },
  );

  it("keeps ordinary cap, team and compact choices while enforcing only KOTH compatibility", () => {
    const lobby = config();
    applyGameConfigPatch(lobby, {
      gameMode: GameMode.Team,
      playerTeams: 4,
      gameMapSize: GameMapSize.Compact,
      maxPlayers: 200,
      nations: "default",
      waterNukes: true,
      bots: 12,
      goldMultiplier: 2,
      disabledUnits: [UnitType.AtomBomb],
    });
    expect(lobby).toMatchObject({
      gameMode: GameMode.Team,
      playerTeams: 4,
      gameMapSize: GameMapSize.Compact,
      maxPlayers: 200,
      nations: "disabled",
      bots: 12,
      goldMultiplier: 2,
      disabledUnits: [UnitType.AtomBomb],
    });
    expect(lobby.waterNukes).toBeUndefined();
    applyGameConfigPatch(lobby, { playerTeams: HumansVsNations });
    expect(lobby.playerTeams).not.toBe(HumansVsNations);
  });
});

it("preserves clocks chosen by a KOTH host", async () => {
  const c = config({ gameType: GameType.Private });
  applyGameConfigPatch(c, {
    overtime: { enabled: true, startMinutes: 3 },
    doomsdayClock: { enabled: true, speed: "fast" },
  });
  const game = await makeGame(2, c);
  expect(game.config().overtimeConfig()).toMatchObject({
    enabled: true,
    startMinutes: 3,
  });
  expect(game.config().doomsdayClockConfig()).toMatchObject({
    enabled: true,
    speed: "fast",
  });
});

it("does not enable KOTH for Solo games", async () => {
  const game = await makeGame(2, { gameType: GameType.Singleplayer });
  expect(game.config().isKingOfTheHill()).toBe(false);
  expect(game.config().isUnitDisabled(UnitType.Throne)).toBe(true);
});
