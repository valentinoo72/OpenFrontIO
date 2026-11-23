import {
  Duos,
  GameMapSize,
  GameMapType,
  GameMode,
  HumansVsNations,
  PublicGameModifiers,
  Quads,
  Trios,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { GameConfig } from "@openfront/engine-api/Schemas";
import { PseudoRandom } from "@openfront/engine-lib/PseudoRandom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPlaylist } from "../../src/server/MapPlaylist";

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTiles: async () => 1_000_000,
}));
type Internals = {
  playlists: {
    specialFfa: GameMapType[];
    specialTeam: GameMapType[];
  };
  getSpecialConfig(
    trusted: boolean,
    koth?: boolean,
    mode?: GameMode,
  ): Promise<GameConfig>;
  getRandomSpecialGameModifiers(
    excluded?: string[],
    count?: number,
    reduction?: number,
  ): PublicGameModifiers & { isKingOfTheHill?: boolean };
  getTeamCount(map: GameMapType, kingOfTheHill?: boolean): number | string;
};
const internal = (p: MapPlaylist) => p as unknown as Internals;
afterEach(() => vi.restoreAllMocks());

describe("KOTH public rotation", () => {
  it("uses the ordinary modifier picker with KOTH-specific exclusions", async () => {
    const p = internal(new MapPlaylist());
    const picker = vi.spyOn(p, "getRandomSpecialGameModifiers");
    const random = new PseudoRandom(43);
    vi.spyOn(Math, "random").mockImplementation(() => random.next());
    const modes = new Set<GameMode>();
    const modifiers = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = await p.getSpecialConfig(i % 2 === 0, true);
      modes.add(c.gameMode);
      expect(c.kingOfTheHill).toBe(true);
      expect(c.nations).toBe("disabled");
      expect(c.playerTeams).not.toBe(HumansVsNations);
      expect(c.waterNukes).not.toBe(true);
      expect(c.doomsdayClock).toBeUndefined();
      expect(c.overtime).toBeUndefined();
      expect(c.startingGold).not.toBe(25_000_000);
      for (const u of [
        UnitType.AtomBomb,
        UnitType.HydrogenBomb,
        UnitType.MIRV,
        UnitType.MissileSilo,
      ])
        expect(c.disabledUnits).not.toContain(u);
      expect(c.publicGameModifiers).not.toHaveProperty("isKingOfTheHill");
      const active = Object.entries(c.publicGameModifiers ?? {}).filter(
        ([, v]) => !!v,
      );
      expect(active.length).toBeGreaterThanOrEqual(1);
      expect(active.length).toBeLessThanOrEqual(3);
      for (const [key] of active) modifiers.add(key);
      if (i % 2 === 0) expect(c.maxPlayers).toBeLessThanOrEqual(25);
    }
    expect(modes).toEqual(new Set([GameMode.FFA, GameMode.Team]));
    expect(modifiers).toEqual(
      new Set([
        "goldMultiplier",
        "isAlliancesDisabled",
        "isCompact",
        "isPeaceTime",
        "isRandomSpawn",
        "isSAMsDisabled",
        "startingGold",
      ]),
    );
    for (const [excluded] of picker.mock.calls)
      expect(excluded).toEqual(
        expect.arrayContaining([
          "isKingOfTheHill",
          "isCrowded",
          "isNukesDisabled",
          "isWaterNukes",
          "isHardNations",
          "isDoomsdayClock",
          "startingGold25M",
        ]),
      );
  });

  it("selects KOTH as a mode and rerolls all three modifier slots normally", async () => {
    const p = new MapPlaylist();
    const engine = internal(p);
    engine.playlists.specialFfa = [GameMapType.Luna, GameMapType.Surrounded];
    const picker = vi
      .spyOn(engine, "getRandomSpecialGameModifiers")
      .mockReturnValueOnce({ isKingOfTheHill: true })
      .mockReturnValue({
        isRandomSpawn: true,
        goldMultiplier: 2,
        startingGold: 5_000_000,
      });
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const c = await p.gameConfig("special");
    expect(c).toMatchObject({
      kingOfTheHill: true,
      gameMode: GameMode.FFA,
      randomSpawn: true,
      startingGold: 5_000_000,
      goldMultiplier: 2,
      spawnImmunityDuration: 450,
    });
    expect(Object.values(c.publicGameModifiers!).filter(Boolean)).toHaveLength(
      3,
    );
    expect(picker).toHaveBeenCalledTimes(2);
    expect((await p.gameConfig("special")).gameMap).toBe(GameMapType.Luna);
  });

  it("advances the ordinary Special queue once per overlapping team lobby", async () => {
    const p = new MapPlaylist();
    const engine = internal(p);
    const maps = [GameMapType.Luna, GameMapType.Surrounded];
    engine.playlists.specialTeam = [...maps];
    vi.spyOn(Math, "random").mockReturnValue(0.8);
    vi.spyOn(engine, "getRandomSpecialGameModifiers").mockReturnValue({});

    const configs = await Promise.all([
      p.gameConfig("special"),
      p.gameConfig("special"),
    ]);

    expect(configs.map((config) => config.gameMap)).toEqual(maps);
    expect(engine.playlists.specialTeam).toEqual([]);
  });

  it.each([0.1, 0.4, 0.8])(
    "uses the lowest Normal tier regardless of the roll (%s)",
    async (roll) => {
      const p = internal(new MapPlaylist());
      vi.spyOn(Math, "random").mockReturnValue(roll);
      vi.spyOn(p, "getRandomSpecialGameModifiers").mockReturnValue({
        goldMultiplier: 2,
      });
      vi.spyOn(p, "getTeamCount").mockReturnValue(3);
      const ffa = await p.getSpecialConfig(false, true, GameMode.FFA);
      const team = await p.getSpecialConfig(false, true, GameMode.Team);
      expect(ffa.gameMapSize).toBe(GameMapSize.Normal);
      expect(ffa.maxPlayers).toBe(25);
      expect(team.gameMapSize).toBe(GameMapSize.Normal);
      expect(team.playerTeams).toBe(3);
      expect(team.maxPlayers).toBe(24);
    },
  );

  it.each([
    [0.1, 12, 12],
    [0.4, 10, 12],
    [0.8, 6, 8],
  ])(
    "uses the normal Compact sizing rules at roll %s",
    async (roll, ffaCapacity, teamCapacity) => {
      const p = internal(new MapPlaylist());
      vi.spyOn(Math, "random").mockReturnValue(roll);
      vi.spyOn(p, "getRandomSpecialGameModifiers").mockReturnValue({
        isCompact: true,
      });
      vi.spyOn(p, "getTeamCount").mockReturnValue(2);
      const ffa = await p.getSpecialConfig(false, true, GameMode.FFA);
      const team = await p.getSpecialConfig(false, true, GameMode.Team);
      expect(ffa.gameMapSize).toBe(GameMapSize.Compact);
      expect(ffa.maxPlayers).toBe(ffaCapacity);
      expect(team.gameMapSize).toBe(GameMapSize.Compact);
      expect(team.maxPlayers).toBe(teamCapacity);
    },
  );

  it("uses the default team weights without Humans vs Nations or map overrides", () => {
    const p = internal(new MapPlaylist());
    const random = vi.spyOn(Math, "random");
    const counts = new Map<number | string, number>();
    // Surrounded ordinarily forces four teams on 75% of rolls.
    random.mockReturnValue(0.01);
    expect(p.getTeamCount(GameMapType.Surrounded)).toBe(4);
    for (let i = 0; i < 800; i++) {
      random.mockReturnValue((i + 0.5) / 800);
      const teams = p.getTeamCount(GameMapType.Surrounded, true);
      counts.set(teams, (counts.get(teams) ?? 0) + 1);
    }
    expect(counts).toEqual(
      new Map<number | string, number>([
        [2, 100],
        [3, 100],
        [4, 100],
        [5, 100],
        [6, 100],
        [7, 100],
        [Duos, 50],
        [Trios, 75],
        [Quads, 75],
      ]),
    );
  });
});
